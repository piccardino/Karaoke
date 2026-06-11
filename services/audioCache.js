const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'cache');

class AudioCache {
  constructor() {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  }

  getCachedPath(videoId) {
    return path.join(CACHE_DIR, `${videoId}.mp3`);
  }

  isCached(videoId) {
    return fs.existsSync(this.getCachedPath(videoId));
  }

  async downloadAudio(videoId) {
    return new Promise((resolve, reject) => {
      const outputPath = this.getCachedPath(videoId);
      if (this.isCached(videoId)) {
        return resolve(outputPath);
      }

      const stream = ytdl(`https://www.youtube.com/watch?v=${videoId}`, {
        quality: 'lowestaudio',
        filter: 'audioonly',
      });

      const writeStream = fs.createWriteStream(outputPath);
      stream.pipe(writeStream);

      writeStream.on('finish', () => resolve(outputPath));
      writeStream.on('error', reject);
      stream.on('error', reject);
    });
  }

  getAudioUrl(videoId) {
    return `/api/audio/${videoId}`;
  }

  cleanCache(maxAgeMs = 24 * 60 * 60 * 1000) {
    const files = fs.readdirSync(CACHE_DIR);
    const now = Date.now();
    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
      }
    }
  }
}

module.exports = new AudioCache();
