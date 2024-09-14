var express = require('express');
var router = express.Router();
const ytdl = require("@distube/ytdl-core");
const ffmpeg = require('fluent-ffmpeg');
const { PassThrough } = require('stream');
const concat = require('concat-stream'); // To handle buffers in memory
const { removeDuplicatesByQualityLabel, dataFilter, sanitizeFileName } = require("../utils/ytdlDataFilter");
let url = String;
const fs = require('fs');
const path = require('path');
const { tmpdir } = require('os');
const { pipeline } = require('stream/promises');
const { createWriteStream } = require('fs');


/* GET home page. */
router.get('/', function (req, res) {
  res.render('index', { uniqueVideoDetails: [], videoInfo: null });
});

router.post('/link', async function (req, res) {
  url = req.body.url;
  if (!url || !ytdl.validateURL(url)) {
    return res.redirect("/");
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

    res.render("index", { uniqueVideoDetails, videoInfo });
  } catch (error) {
    console.error('Error fetching video info:', error);
    res.redirect("/");
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
    '480p': '135'
  };

  const itag = itagMap[qualityLabel];

  try {
    const info = await ytdl.getInfo(url);
    const sanitizedTitle = sanitizeFileName(info.videoDetails.title)
      .replace(/[<>:"\/\\|?*]+/g, '_')
      .substring(0, 100);

    const videoFormat = ytdl.chooseFormat(info.formats, { quality: itag });
    const audioFormat = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });

    const videoPath = path.join(__dirname, `${sanitizedTitle}_video.mp4`);
    const audioPath = path.join(__dirname, `${sanitizedTitle}_audio.mp3`);
    const mergedPath = path.join(__dirname, `${sanitizedTitle}_merged.mp4`);

    const videoWriteStream = createWriteStream(videoPath);
    const audioWriteStream = createWriteStream(audioPath);

    const videoStream = ytdl(url, { format: videoFormat });
    const audioStream = ytdl(url, { format: audioFormat });

    videoStream.pipe(videoWriteStream);
    audioStream.pipe(audioWriteStream);

    await Promise.all([
      new Promise((resolve, reject) => videoWriteStream.on('finish', resolve).on('error', reject)),
      new Promise((resolve, reject) => audioWriteStream.on('finish', resolve).on('error', reject))
    ]);

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .videoCodec('copy')
        .audioCodec('aac')
        .format('mp4')
        .outputOptions(['-preset fast'])
        .on('end', resolve)
        .on('error', reject)
        .save(mergedPath);
    });

    res.header('Content-Disposition', `attachment; filename="${sanitizedTitle}_merged.mp4"`);
    res.header('Content-Type', 'video/mp4');
    
    const readStream = fs.createReadStream(mergedPath);
    readStream.pipe(res);

    readStream.on('end', () => {
      fs.unlinkSync(videoPath);
      fs.unlinkSync(audioPath);
      fs.unlinkSync(mergedPath);
    });

    readStream.on('error', (err) => {
      console.error('Error streaming the file:', err);
      if (!res.headersSent) {
        res.redirect('/');
      }
    });

  } catch (error) {
    console.error('Download failed:', error);
    if (!res.headersSent) {
      res.redirect('/');
    }
  }
});

module.exports = router;
