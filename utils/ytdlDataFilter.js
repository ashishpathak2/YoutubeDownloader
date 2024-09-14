//filters large set of data given by ytdl 
function dataFilter(data) {
    return data.formats.map((item) => {
        return {
            hasAudio: item.hasAudio,
            quality: item.quality,
            qualityLabel: item.qualityLabel
        };
    });
}

//removes unwanted,repeated and null values 
function removeDuplicatesByQualityLabel(details) {
    const uniqueQualityLabels = new Set();
    return details.filter(item => {
      if (item.qualityLabel != null && uniqueQualityLabels.has(item.qualityLabel)) {
        return false;
      } else if (item.qualityLabel != null) {
        uniqueQualityLabels.add(item.qualityLabel);
        return true;
      } else {
        return false;
      }
    });
  }

  function sanitizeFileName(name) {
    return name.replace(/[^a-zA-Z0-9_\-\.]/g, '_'); // Replace invalid characters with underscores
}

  module.exports={
    removeDuplicatesByQualityLabel,dataFilter,sanitizeFileName
  }