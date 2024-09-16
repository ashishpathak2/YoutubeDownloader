const express = require('express');
const router = express.Router();
const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const { dataFilter, sanitizeFileName, removeDuplicatesByQualityLabel } = require('../utils/ytdlDataFilter');
const fs = require('fs');
const path = require('path');

let url = String;

// Ensure the temp directory exists
const tempDir = path.resolve(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/* GET home page. */
router.get('/', function (req, res) {
  res.render('index', { uniqueVideoDetails: [], videoInfo: null });
});

router.post('/link', async function (req, res) {
  url = req.body.url;
  if (!url || !ytdl.validateURL(url)) {
    return res.redirect('/');
  }

  try {
    const info = await ytdl.getInfo(url);
    const qualityLabel = dataFilter(info);
    const uniqueVideoDetails = removeDuplicatesByQualityLabel(qualityLabel);

    const videoInfo = {
      channelName: info.videoDetails.author.name,
      title: info.videoDetails.title,
      videoLength: Math.floor(info.videoDetails.lengthSeconds / 60),
      thumbnail: info.videoDetails.thumbnails[0].url
    };

    res.render('index', { uniqueVideoDetails, videoInfo });
  } catch (error) {
    console.error('Error fetching video info:', error);
    res.redirect('/');
  }
});

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
    '480p': '135',
  };

  const itag = itagMap[qualityLabel];

  try {
    const info = await ytdl.getInfo(url);
    const sanitizedTitle = sanitizeFileName(info.videoDetails.title).replace(/[<>:"\/\\|?*]+/g, '_').substring(0, 100);

    // Create temporary file paths
    const videoPath = path.resolve(tempDir, `${sanitizedTitle}_video.mp4`);
    const audioPath = path.resolve(tempDir, `${sanitizedTitle}_audio.mp4`);
    const outputFile = path.resolve(tempDir, `${sanitizedTitle}_merged.mp4`);

    // Download video and audio separately to temp files
    const videoStream = ytdl(url, { quality: itag , requestOptions: { proxy: 'http://localhost:3000'} });
    const audioStream = ytdl(url, { quality: 'highestaudio' , requestOptions: { proxy: 'http://localhost:3000'}});

    // Pipe video and audio to files
    const videoWriteStream = fs.createWriteStream(videoPath);
    const audioWriteStream = fs.createWriteStream(audioPath);

    videoStream.pipe(videoWriteStream);
    audioStream.pipe(audioWriteStream);

    let videoFinished = false;
    let audioFinished = false;

    videoWriteStream.on('finish', () => {
      console.log('Video download finished');
      videoFinished = true;
      if (audioFinished) checkMerge(res, videoPath, audioPath, outputFile);
    });

    audioWriteStream.on('finish', () => {
      console.log('Audio download finished');
      audioFinished = true;
      if (videoFinished) checkMerge(res, videoPath, audioPath, outputFile);
    });

    videoWriteStream.on('error', (err) => {
      console.error('Video stream error:', err);
      handleError(res, 'Video stream error');
    });

    audioWriteStream.on('error', (err) => {
      console.error('Audio stream error:', err);
      handleError(res, 'Audio stream error');
    });

  } catch (error) {
    console.error('Download failed:', error);
    handleError(res, 'Download failed');
  }
});

// Function to check if both video and audio have finished downloading, then merge them
function checkMerge(res, videoPath, audioPath, outputFile) {
  if (fs.existsSync(videoPath) && fs.existsSync(audioPath)) {
    console.log('Both video and audio files are ready for merging.');

    res.header('Content-Disposition', `attachment; filename="${path.basename(outputFile)}"`);
    res.header('Content-Type', 'video/mp4');

    // Now use ffmpeg to merge the video and audio
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .videoCodec('copy')
      .audioCodec('aac')
      .format('mp4')
      .output(outputFile)
      .on('start', (commandLine) => {
        console.log('Merging started');
        console.log('FFmpeg command:', commandLine); // Log the ffmpeg command
      })
      .on('stderr', (stderrLine) => {
        console.log('FFmpeg stderr:', stderrLine); // Log ffmpeg errors and warnings
      })
      .on('end', () => {
        console.log('Merging finished');
        // Ensure the file is not locked before sending it
        setTimeout(() => {
          res.download(outputFile, (err) => {
            if (err) {
              console.error('Error sending the file:', err);
            }
            // Clean up the temporary files
            fs.unlink(videoPath, (unlinkErr) => {
              if (unlinkErr) console.error('Error deleting video file:', unlinkErr);
            });
            fs.unlink(audioPath, (unlinkErr) => {
              if (unlinkErr) console.error('Error deleting audio file:', unlinkErr);
            });
            fs.unlink(outputFile, (unlinkErr) => {
              if (unlinkErr) console.error('Error deleting merged file:', unlinkErr);
            });
          });
        }, 1000); // Delay added to ensure all processes are finished
      })
      .on('error', (err, stdout, stderr) => {
        console.error('Merging failed:', err);
        console.log('FFmpeg stdout:', stdout);
        console.log('FFmpeg stderr:', stderr);
        // Clean up files even on error with a delay to avoid EBUSY error
        setTimeout(() => {
          fs.unlink(videoPath, (unlinkErr) => {
            if (unlinkErr) console.error('Error deleting video file:', unlinkErr);
          });
          fs.unlink(audioPath, (unlinkErr) => {
            if (unlinkErr) console.error('Error deleting audio file:', unlinkErr);
          });
          fs.unlink(outputFile, (unlinkErr) => {
            if (unlinkErr) console.error('Error deleting merged file:', unlinkErr);
          });
        }, 1000);
        handleError(res, 'Merging failed');
      })
      .run();
  }
}

// Handle errors and avoid multiple header responses
function handleError(res, errorMessage) {
  if (!res.headersSent) {
    res.status(500).send(errorMessage);
  } else {
    console.error('Error after headers were sent:', errorMessage);
  }
}

module.exports = router;
