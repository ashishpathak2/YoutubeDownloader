const express = require('express');
const router = express.Router();
const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const puppeteer = require('puppeteer'); // Import puppeteer
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

// Puppeteer function to get YouTube page content
async function getYouTubePageContent(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  // Set a user agent to simulate a real browser
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3');
  
  await page.goto(url, {
    waitUntil: 'networkidle2',
  });

  // Extract video URL if needed or bypass restrictions
  const cookies = await page.cookies();
  const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  
  await browser.close();
  return cookieString;
}

router.post('/link', async function (req, res) {
  url = req.body.url;
  if (!url || !ytdl.validateURL(url)) {
    return res.redirect('/');
  }

  try {
    // Get cookies using Puppeteer
    const cookie = await getYouTubePageContent(url);

    const info = await ytdl.getInfo(url, {
      requestOptions: {
        headers: {
          Cookie: cookie, // Add Puppeteer-extracted cookies here
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
        }
      }
    });

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
    const cookie = await getYouTubePageContent(url); // Use Puppeteer to get cookies

    const info = await ytdl.getInfo(url, {
      requestOptions: {
        headers: {
          Cookie: cookie, // Add Puppeteer-extracted cookies here
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
        }
      }
    });

    const sanitizedTitle = sanitizeFileName(info.videoDetails.title).replace(/[<>:"\/\\|?*]+/g, '_').substring(0, 100);

    // Create temporary file paths
    const videoPath = path.resolve(tempDir, `${sanitizedTitle}_video.mp4`);
    const audioPath = path.resolve(tempDir, `${sanitizedTitle}_audio.mp4`);
    const outputFile = path.resolve(tempDir, `${sanitizedTitle}_merged.mp4`);

    // Download video and audio separately to temp files
    const videoStream = ytdl(url, {
      quality: itag,
      requestOptions: {
        headers: {
          Cookie: cookie, // Add Puppeteer-extracted cookies here
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
        }
      }
    });

    const audioStream = ytdl(url, {
      quality: 'highestaudio',
      requestOptions: {
        headers: {
          Cookie: cookie, // Add Puppeteer-extracted cookies here
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
        }
      }
    });

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
            fs.unlink(videoPath, () => {});
            fs.unlink(audioPath, () => {});
            fs.unlink(outputFile, () => {});
          });
        }, 500);
      })
      .run();
  }
}

function handleError(res, errorMessage) {
  res.status(500).send(errorMessage);
}

module.exports = router;
