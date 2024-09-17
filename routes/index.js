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
  const cookie = "SID=g.a000oAj2ZEBsKYu8PiNfdOJrqku1wOqy0uaVV9Mn8WC0qVGKSbNcLEBbIAaeOcvRiVgfvrdWLQACgYKASUSARQSFQHGX2MiY7k9wpkg690zFZ42fGMlMxoVAUF8yKp-74tndRm_ClX8vVYoKd_-0076; __Secure-1PSID=g.a000oAj2ZEBsKYu8PiNfdOJrqku1wOqy0uaVV9Mn8WC0qVGKSbNcGvFFcYJ-w33K8yL3GiG58AACgYKAYkSARQSFQHGX2MiPAoL-T39KCyDGde60v_ZJxoVAUF8yKoxuhVE34GUaCaYfmNK0Jt10076; __Secure-3PSID=g.a000oAj2ZEBsKYu8PiNfdOJrqku1wOqy0uaVV9Mn8WC0qVGKSbNclZscsV28A_A4WODH-zl99gACgYKARcSARQSFQHGX2MiKUZfAHvEX252c_5WLUZrBhoVAUF8yKo0erxLfEqDgGAzemfAPn5C0076; HSID=At0nFZP20pzR2O0Vy; SSID=ALPSQMMtCngD3DjRe; APISID=_tqtJraCzhbSxLKs/AO-S_mGFU7In8vbxk; SAPISID=dBFwRulJjfwihxmR/AQr1A1Rum0nk6jZSx; __Secure-1PAPISID=dBFwRulJjfwihxmR/AQr1A1Rum0nk6jZSx; __Secure-3PAPISID=dBFwRulJjfwihxmR/AQr1A1Rum0nk6jZSx; VISITOR_INFO1_LIVE=Jm37A2d_OGU; VISITOR_PRIVACY_METADATA=CgJJThIEGgAgDQ%3D%3D; LOGIN_INFO=AFmmF2swRAIgDJoK4pRFUBLtj38-iab_oyYSM5KE4iqD82Dcm2j9i2ICIC0hxQfX_JjkB-F8E2etSEDmQ1LGO685yEw32hlNLu84:QUQ3MjNmelBjdzdPbS16cFJlaS1vdDlEcnZmeE13VnlPUVh5QXphSEtlVmhQVnlkQnBfSjJyY056LVlyeHh1TFVOOE04bV9iRmxiSmUwU2VwM3loRUJ5aWo5QnhteTBKWG43M2hLbVVwYVcyWVNuRHVnZHdGX1UwMWlsNmZFOVBIUnhUeWRLS0FEVTRXTzFVRUItT2xfTEZJdF83bENZTTdn; OTZ=7735227_34_34__34_; NID=517=w5AhclVP6HP7zPbhrOUa_l4VpW8G1uPy0E1oS3mIa2A19CNKUJJwU_UKL53YRqSoy2HxvidlCpWCTh5mhcUsoimwT5SMCSOSvb9o62s1LL6lCap9oIrAsrRl3Mt--pM_ynzaNO9HLekGmHgHz-Av7WYjhaQHcv8qcPb4tu-HnpsMkTeHOR7S85myKDxPBZJ5LHQTTKSYniz2sjpqHKU_EJl7f81QaMOb9CepiqzJ200kDqJvbxHVjdlrbawYhM8VF1QK6DyyeYA3v1wdjw; YSC=YQLACkwq3Aw; PREF=f4=4000000&f6=40000000&tz=Asia.Calcutta&f7=100&f5=30000; __Secure-1PSIDTS=sidts-CjEBQlrA-CHDqojuxPvIkT4pTQ_m_LzDb4dEBjlGnXXJXyOLiD4Zcc4xC70D_-uIi0-9EAA; __Secure-3PSIDTS=sidts-CjEBQlrA-CHDqojuxPvIkT4pTQ_m_LzDb4dEBjlGnXXJXyOLiD4Zcc4xC70D_-uIi0-9EAA; SIDCC=AKEyXzVvuoxsn96CitEZWFk5LQF71wOYRo8q6E3Qknd8jOqwoEwp0PBtu9axAMHzXQBIxMHAP-0; __Secure-1PSIDCC=AKEyXzVDpqerqeNBYufFuTSKJVY_kZwogqqHickA1c-fMt1CmQ30bXkx1PtFeHVdwWNRyNFWL5M; __Secure-3PSIDCC=AKEyXzWVJUD2fbAOtHTbnPjKX1JD4iJEodYc2tXAB8D-HZIdW3mxVmU4YVBvHfwf3vkMTVEWjA";

  url = req.body.url;
  if (!url || !ytdl.validateURL(url)) {
    return res.redirect('/');
  }

  try {
    const info = await ytdl.getInfo(url ,{
      requestOptions: {
        headers: {
          Cookie: cookie, // Add the extracted cookie here
          proxy: "https://youtubedownloader-1-8es3.onrender.com"
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
  const cookie = "SID=g.a000oAj2ZEBsKYu8PiNfdOJrqku1wOqy0uaVV9Mn8WC0qVGKSbNcLEBbIAaeOcvRiVgfvrdWLQACgYKASUSARQSFQHGX2MiY7k9wpkg690zFZ42fGMlMxoVAUF8yKp-74tndRm_ClX8vVYoKd_-0076; __Secure-1PSID=g.a000oAj2ZEBsKYu8PiNfdOJrqku1wOqy0uaVV9Mn8WC0qVGKSbNcGvFFcYJ-w33K8yL3GiG58AACgYKAYkSARQSFQHGX2MiPAoL-T39KCyDGde60v_ZJxoVAUF8yKoxuhVE34GUaCaYfmNK0Jt10076; __Secure-3PSID=g.a000oAj2ZEBsKYu8PiNfdOJrqku1wOqy0uaVV9Mn8WC0qVGKSbNclZscsV28A_A4WODH-zl99gACgYKARcSARQSFQHGX2MiKUZfAHvEX252c_5WLUZrBhoVAUF8yKo0erxLfEqDgGAzemfAPn5C0076; HSID=At0nFZP20pzR2O0Vy; SSID=ALPSQMMtCngD3DjRe; APISID=_tqtJraCzhbSxLKs/AO-S_mGFU7In8vbxk; SAPISID=dBFwRulJjfwihxmR/AQr1A1Rum0nk6jZSx; __Secure-1PAPISID=dBFwRulJjfwihxmR/AQr1A1Rum0nk6jZSx; __Secure-3PAPISID=dBFwRulJjfwihxmR/AQr1A1Rum0nk6jZSx; VISITOR_INFO1_LIVE=Jm37A2d_OGU; VISITOR_PRIVACY_METADATA=CgJJThIEGgAgDQ%3D%3D; LOGIN_INFO=AFmmF2swRAIgDJoK4pRFUBLtj38-iab_oyYSM5KE4iqD82Dcm2j9i2ICIC0hxQfX_JjkB-F8E2etSEDmQ1LGO685yEw32hlNLu84:QUQ3MjNmelBjdzdPbS16cFJlaS1vdDlEcnZmeE13VnlPUVh5QXphSEtlVmhQVnlkQnBfSjJyY056LVlyeHh1TFVOOE04bV9iRmxiSmUwU2VwM3loRUJ5aWo5QnhteTBKWG43M2hLbVVwYVcyWVNuRHVnZHdGX1UwMWlsNmZFOVBIUnhUeWRLS0FEVTRXTzFVRUItT2xfTEZJdF83bENZTTdn; OTZ=7735227_34_34__34_; NID=517=w5AhclVP6HP7zPbhrOUa_l4VpW8G1uPy0E1oS3mIa2A19CNKUJJwU_UKL53YRqSoy2HxvidlCpWCTh5mhcUsoimwT5SMCSOSvb9o62s1LL6lCap9oIrAsrRl3Mt--pM_ynzaNO9HLekGmHgHz-Av7WYjhaQHcv8qcPb4tu-HnpsMkTeHOR7S85myKDxPBZJ5LHQTTKSYniz2sjpqHKU_EJl7f81QaMOb9CepiqzJ200kDqJvbxHVjdlrbawYhM8VF1QK6DyyeYA3v1wdjw; YSC=YQLACkwq3Aw; PREF=f4=4000000&f6=40000000&tz=Asia.Calcutta&f7=100&f5=30000; __Secure-1PSIDTS=sidts-CjEBQlrA-CHDqojuxPvIkT4pTQ_m_LzDb4dEBjlGnXXJXyOLiD4Zcc4xC70D_-uIi0-9EAA; __Secure-3PSIDTS=sidts-CjEBQlrA-CHDqojuxPvIkT4pTQ_m_LzDb4dEBjlGnXXJXyOLiD4Zcc4xC70D_-uIi0-9EAA; SIDCC=AKEyXzVvuoxsn96CitEZWFk5LQF71wOYRo8q6E3Qknd8jOqwoEwp0PBtu9axAMHzXQBIxMHAP-0; __Secure-1PSIDCC=AKEyXzVDpqerqeNBYufFuTSKJVY_kZwogqqHickA1c-fMt1CmQ30bXkx1PtFeHVdwWNRyNFWL5M; __Secure-3PSIDCC=AKEyXzWVJUD2fbAOtHTbnPjKX1JD4iJEodYc2tXAB8D-HZIdW3mxVmU4YVBvHfwf3vkMTVEWjA";

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
    const info = await ytdl.getInfo(url ,{
      requestOptions: {
        headers: {
          Cookie: cookie, // Add the extracted cookie here
          proxy: "https://youtubedownloader-1-8es3.onrender.com"
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
          Cookie: cookie, // Add the extracted cookie here
          proxy: "https://youtubedownloader-1-8es3.onrender.com"
        }
      }
    });

    const audioStream = ytdl(url, {
      quality: 'highestaudio',
      requestOptions: {
        headers: {
          Cookie: cookie, // Add the extracted cookie here
          proxy: "https://youtubedownloader-1-8es3.onrender.com"
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










