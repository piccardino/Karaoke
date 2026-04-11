// YouTube API Configuration
// IMPORTANT: You need to get a YouTube Data API key from Google Cloud Console
// Instructions:
// 1. Go to https://console.cloud.google.com/
// 2. Create a new project or select an existing one
// 3. Enable the YouTube Data API v3
// 4. Create credentials (API Key)
// 5. Replace 'YOUR_API_KEY_HERE' with your actual API key

const YOUTUBE_API_KEY = 'AIzaSyDIiK3ydkRsvmkudaXZzpovT38DUdnCHNY';

// Demo mode is only enabled if API key is still the placeholder
const DEMO_MODE = YOUTUBE_API_KEY === 'YOUR_API_KEY_HERE';

// Sample data for demo mode
const DEMO_SEARCH_RESULTS = [
    {
        id: { videoId: 'dQw4w9WgXcQ' },
        snippet: {
            title: 'Never Gonna Give You Up - Rick Astley',
            channelTitle: 'Rick Astley',
            thumbnails: { default: { url: 'https://img.youtube.com/vi/dQw4w9WgXcQ/default.jpg' } }
        }
    },
    {
        id: { videoId: 'kJQP7kiw5Fk' },
        snippet: {
            title: 'Despacito - Luis Fonsi ft. Daddy Yankee',
            channelTitle: 'Luis Fonsi',
            thumbnails: { default: { url: 'https://img.youtube.com/vi/kJQP7kiw5Fk/default.jpg' } }
        }
    },
    {
        id: { videoId: 'JGwWNGJdvx8' },
        snippet: {
            title: 'Shape of You - Ed Sheeran',
            channelTitle: 'Ed Sheeran',
            thumbnails: { default: { url: 'https://img.youtube.com/vi/JGwWNGJdvx8/default.jpg' } }
        }
    },
    {
        id: { videoId: 'RgKAFK5djSk' },
        snippet: {
            title: 'See You Again - Wiz Khalifa ft. Charlie Puth',
            channelTitle: 'Wiz Khalifa',
            thumbnails: { default: { url: 'https://img.youtube.com/vi/RgKAFK5djSk/default.jpg' } }
        }
    },
    {
        id: { videoId: '60ItHLz5WEA' },
        snippet: {
            title: 'Faded - Alan Walker',
            channelTitle: 'Alan Walker',
            thumbnails: { default: { url: 'https://img.youtube.com/vi/60ItHLz5WEA/default.jpg' } }
        }
    }
];
