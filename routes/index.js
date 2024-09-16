var express = require('express');
var router = express.Router();
const ytdl = require("@distube/ytdl-core");
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const os = require('os');
const { removeDuplicatesByQualityLabel, dataFilter, sanitizeFileName } = require("../utils/ytdlDataFilter");
let url = ""; // Ensuring URL is initialized as an empty string

/* Helper function for delay */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* Retry logic with increased retries and delay */
async function fetchVideoInfoWithRetry(url, retries = 5, delayMs = 5000) {
  if (typeof url !== 'string') {
    throw new TypeError('URL must be a string'); // Validate URL type
  }

  try {
    return await ytdl.getInfo(url);
  } catch (error) {
    if (retries === 0 || error.statusCode !== 429) {
      throw error; // Exit if no retries left or error is not 429
    }
    console.log(`Retrying due to 429 error... Attempts left: ${retries}, waiting ${delayMs / 1000} seconds`);
    await delay(delayMs);
    return fetchVideoInfoWithRetry(url, retries - 1, delayMs * 2); // Exponentially increase delay
  }
}

/* GET home page */
router.get('/', function (req, res) {
  res.render('index', { uniqueVideoDetails: [], videoInfo: null });
});

/* Handle video info retrieval */
router.post('/link', async function (req, res) {
  url = String(req.body.url).trim(); // Ensure URL is a string and trimmed
  if (!url || !ytdl.validateURL(url)) {
    return res.redirect("/"); // Or send an appropriate error message
  }

  try {
    const info = await fetchVideoInfoWithRetry(url);
    const qualityLabel = dataFilter(info);
    const uniqueVideoDetails = removeDuplicatesByQualityLabel(qualityLabel);

    const videoInfo = {
      channelName: info.videoDetails.author.name,
      title: info.videoDetails.title,
      videoLength: Math.floor(info.videoDetails.lengthSeconds / 60),
      thumbnail: info.videoDetails.thumbnails[0].url
    };

    res.render("index", { uniqueVideoDetails, videoInfo });
  } catch (error) {
    console.error('Error fetching video info:', error);
    res.redirect("/"); // Or send an appropriate error message
  }
});

/* Handle video download and merging */
router.post('/download', async function (req, res) {
  const qualityLabel = req.body.quality;
  if (!qualityLabel) {
    return res.redirect('/'); // Or send an appropriate error message
  }

  const itagMap = {
    '360p': '18',
    '1080p': '137',
    '2160p': '137',
    '1440p': '137',
    '720p': '136',
    '480p': '135'
  };

  const itag = itagMap[qualityLabel];

  try {
    const info = await fetchVideoInfoWithRetry(url);
    const sanitizedTitle = sanitizeFileName(info.videoDetails.title)
      .replace(/[<>:"\/\\|?*]+/g, '_')
      .substring(0, 100);

    // Temporary file paths for video and audio
    const videoPath = path.join(os.tmpdir(), `${sanitizedTitle}_video.mp4`);
    const audioPath = path.join(os.tmpdir(), `${sanitizedTitle}_audio.mp3`);
    const mergedPath = path.join(os.tmpdir(), `${sanitizedTitle}_merged.mp4`);

    console.log(`Video Path: ${videoPath}`);
    console.log(`Audio Path: ${audioPath}`);
    console.log(`Merged Path: ${mergedPath}`);

    // Streams to temporary files
    const videoStream = ytdl(url, { quality: itag }).pipe(fs.createWriteStream(videoPath));
    const audioStream = ytdl(url, { quality: 'highestaudio' }).pipe(fs.createWriteStream(audioPath));

    // Wait until both video and audio streams finish writing to files
    await new Promise((resolve, reject) => {
      videoStream.on('finish', () => {
        console.log('Video stream finished.');
        resolve();
      }).on('error', (err) => {
        console.error('Video stream error:', err);
        reject(err);
      });
    });

    await new Promise((resolve, reject) => {
      audioStream.on('finish', () => {
        console.log('Audio stream finished.');
        resolve();
      }).on('error', (err) => {
        console.error('Audio stream error:', err);
        reject(err);
      });
    });

    // Merge video and audio with FFmpeg
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .videoCodec('copy')
      .audioCodec('aac')
      .format('mp4')
      .on('start', (commandLine) => {
        console.log(`Spawned FFmpeg with command: ${commandLine}`);
      })
      .on('progress', (progress) => {
        console.log(`Merging progress: ${progress.percent}% done`);
      })
      .on('end', () => {
        console.log('Merging complete.');

        // Set headers for the download
        res.header('Content-Disposition', `attachment; filename="${sanitizedTitle}_merged.mp4"`);
        res.header('Content-Type', 'video/mp4');

        // Pipe the merged file to the response
        const readStream = fs.createReadStream(mergedPath);
        readStream.pipe(res);

        // Clean up the temporary files after streaming
        readStream.on('close', () => {
          fs.unlinkSync(videoPath);
          fs.unlinkSync(audioPath);
          fs.unlinkSync(mergedPath);
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        if (!res.headersSent) {
          res.redirect('/'); // Or send an appropriate error message
        }
      })
      .save(mergedPath); // Save the merged video to a temporary file

  } catch (error) {
    console.error('Download failed:', error);
    if (!res.headersSent) {
      res.redirect('/'); // Or send an appropriate error message
    }
  }
});

module.exports = router;
