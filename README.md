# 🎤 Karaoke Night - Web App

A beautiful, dynamic karaoke web app powered by Three.js visualizations and YouTube integration.

## Features

✨ **Stunning 3D Visualizations**
- Dynamic particle systems with additive blending
- Real-time wave animations that react to music
- Beautiful color palette with neon glow effects

🎵 **YouTube Integration**
- Search for any song on YouTube
- Embedded video player with full controls
- Seamless playback experience

🎶 **Karaoke Experience**
- Lyrics display with animated highlighting
- Now playing information
- Simple playback controls

## Quick Start

### Option 1: Demo Mode (No Setup Required)

The app works out of the box in **demo mode** with sample data:

1. Open `index.html` in your browser
2. Search for songs (will show demo results)
3. Click on a song to start singing!

### Option 2: Full YouTube Integration

To enable real YouTube search:

1. **Get a YouTube Data API Key:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project (or select existing)
   - Enable **YouTube Data API v3**
   - Create credentials → API Key
   - Copy your API key

2. **Configure the app:**
   - Open `config.js`
   - Replace `YOUR_API_KEY_HERE` with your actual API key:
     ```javascript
     const YOUTUBE_API_KEY = 'your-actual-api-key-here';
     ```

3. **Open `index.html`** in your browser and search for real songs!

## File Structure

```
Karaoke/
├── index.html          # Main HTML structure
├── styles.css          # Modern dark theme styling
├── app.js              # Main application logic
├── visualizer.js       # Three.js 3D visualizations
├── config.js           # YouTube API configuration
└── README.md           # This file
```

## How to Use

1. **Search for Songs**
   - Type a song name in the search bar
   - Press Enter or click Search
   - Browse through the results

2. **Play a Song**
   - Click on any search result
   - The video player will appear
   - Use Play/Pause/Stop controls

3. **Enjoy the Visuals**
   - Background animations run automatically
   - Visualizations react to music playback
   - Lyrics highlight in sync with music

## Technologies Used

- **Three.js** - 3D particle systems and wave animations
- **YouTube IFrame API** - Video playback control
- **YouTube Data API v3** - Song search functionality
- **Vanilla JavaScript** - No frameworks, pure performance
- **CSS3** - Modern gradients, animations, and glassmorphism

## Customization

### Change Visualizer Settings

Edit `visualizer.js` to adjust:
- `particleCount` - Number of particles (default: 1500)
- `colorPalette` - Change the color scheme
- Wave mesh resolution and position

### Change Theme Colors

Edit CSS variables in `styles.css`:
```css
:root {
    --primary: #8338ec;
    --secondary: #ff006e;
    --accent: #3a86ff;
    --highlight: #ffbe0b;
}
```

## Lyrics Integration ✅

The app now includes **real lyrics fetching** using the free **Lyrics.ovh API**:

- **No API key needed** - Works out of the box!
- **Automatic search** - Fetches lyrics when you select a song
- **Multiple strategies** - Tries different combinations of artist/title
- **Animated highlighting** - Lines highlight as you sing along
- **Graceful fallback** - Shows demo lyrics if not found

### How It Works

1. When you select a song, the app calls `https://api.lyrics.ovh/v1/:artist/:title`
2. It tries multiple search strategies:
   - Artist + clean title
   - Just the song title
   - Full song name
3. If found, displays the real lyrics with highlighting
4. If not found, shows a placeholder with the song name

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Notes

- The app works in demo mode without any API keys
- YouTube videos require an internet connection
- Three.js is loaded from CDN (no installation needed)
- For local development, you can use any static file server:
  ```bash
  python -m http.server 8000
  # or
  npx serve
  ```

## License

MIT - Feel free to use and modify!

## Enjoy Karaoke Night! 🎤✨

Happy singing! 🎵
