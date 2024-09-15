var express = require('express');
var router = express.Router();
const ytdl = require("@distube/ytdl-core");
const ffmpeg = require('fluent-ffmpeg');
const { PassThrough } = require('stream');
const { removeDuplicatesByQualityLabel, dataFilter, sanitizeFileName } = require("../utils/ytdlDataFilter");
let url = String;

/* Helper function for delay */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* Retry logic with exponential backoff */
async function fetchVideoInfoWithRetry(url, retries = 3, delayMs = 1000) {
  try {
    return await ytdl.getInfo(url);
  } catch (error) {
    if (retries === 0 || error.statusCode !== 429) {
      throw error;
    }
    console.log(`Retrying due to 429 error... Attempts left: ${retries}`);
    await delay(delayMs);
    return fetchVideoInfoWithRetry(url, retries - 1, delayMs * 2); // Exponential backoff
  }
}

/* GET home page */
router.get('/', function (req, res) {
  res.render('index', { uniqueVideoDetails: [], videoInfo: null });
});

/* Handle video info retrieval */
router.post('/link', async function (req, res) {
  url = req.body.url;
  if (!url || !ytdl.validateURL(url)) {
    return res.redirect("/");
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
    res.redirect("/");
  }
});

/* Handle download request */
router.post('/download', async function (req, res) {
  const qualityLabel = req.body.quality;
  if (!qualityLabel) {
    return res.redirect('/');
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

    const videoFormat = ytdl.chooseFormat(info.formats, { quality: itag });
    const audioFormat = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });

    const videoStream = ytdl(url, { format: videoFormat });
    const audioStream = ytdl(url, { format: audioFormat });

    // Create in-memory streams
    const videoPassThrough = new PassThrough();
    const audioPassThrough = new PassThrough();

    // Pipe the video and audio streams to the PassThrough objects
    videoStream.pipe(videoPassThrough);
    audioStream.pipe(audioPassThrough);

    // Merging video and audio using fluent-ffmpeg
    const mergedStream = new PassThrough();
    ffmpeg()
      .input(videoPassThrough)
      .input(audioPassThrough)
      .videoCodec('copy')
      .audioCodec('aac')
      .format('mp4')
      .on('start', () => {
        console.log('Merging video and audio...');
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        if (!res.headersSent) {
          res.redirect('/');
        }
      })
      .on('end', () => {
        console.log('Merging complete.');
      })
      .pipe(mergedStream); // Output directly to the response

    // Set headers for the download
    res.header('Content-Disposition', `attachment; filename="${sanitizedTitle}_merged.mp4"`);
    res.header('Content-Type', 'video/mp4');

    // Send the merged video to the response
    mergedStream.pipe(res);

  } catch (error) {
    console.error('Download failed:', error);
    if (!res.headersSent) {
      res.redirect('/');
    }
  }
});

module.exports = router;
