// Main Application
class KaraokeApp {
    constructor() {
        this.player = null;
        this.currentVideoId = null;
        this.isPlaying = false;
        this.visualizer = null;
        this.simulatedTime = 0;
        
        this.init();
    }
    
    async init() {
        // Initialize Three.js visualizer
        this.visualizer = new KaraokeVisualizer(document.getElementById('three-container'));

        // Setup event listeners
        this.setupEventListeners();

        // Load YouTube IFrame API
        await this.loadYouTubeAPI();

        // Check URL for saved state (e.g., on page reload)
        this.restoreStateFromURL();

        console.log('Karaoke App Initialized');
    }

    restoreStateFromURL() {
        const params = new URLSearchParams(window.location.search);
        const searchQuery = params.get('search');
        const playVideoId = params.get('play');

        if (playVideoId) {
            // Restore player state
            const title = params.get('title') || 'Unknown Song';
            const artist = params.get('artist') || 'Unknown Artist';
            this.selectVideo(playVideoId, title, artist);
        } else if (searchQuery) {
            // Restore search results
            document.getElementById('search-input').value = searchQuery.replace(' karaoke', '');
            this.search(searchQuery.replace(' karaoke', ''), false);
        }
    }

    async searchWithQuery(query, appendKaraoke = true) {
        // Set the search input value
        document.getElementById('search-input').value = query;
        
        // Perform search
        await this.search(query, appendKaraoke);
    }
    
    setupEventListeners() {
        const searchInput = document.getElementById('search-input');
        const searchButton = document.getElementById('search-button');

        searchButton.addEventListener('click', () => this.search());
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.search();
        });

        // Player controls
        document.getElementById('btn-play').addEventListener('click', () => this.play());
        document.getElementById('btn-pause').addEventListener('click', () => this.pause());
        document.getElementById('btn-stop').addEventListener('click', () => this.stop());

        // Handle browser back button
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.page === 'search-results') {
                this.showSearchResults();
            } else if (e.state && e.state.page === 'home') {
                this.hidePlayerAndLyrics();
            }
        });
    }
    
    async loadYouTubeAPI() {
        return new Promise((resolve) => {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            
            window.onYouTubeIframeAPIReady = () => {
                console.log('YouTube IFrame API ready');
                resolve();
            };
        });
    }
    
    async search(queryOverride = null, appendKaraoke = true) {
        const query = queryOverride || document.getElementById('search-input').value.trim();
        if (!query) return;

        // Automatically append "karaoke" to the search query
        const karaokeQuery = query.toLowerCase().includes('karaoke')
            ? query
            : appendKaraoke ? `${query} karaoke` : query;

        console.log('Searching for:', query);
        console.log('Karaoke query:', karaokeQuery);
        console.log('DEMO_MODE:', DEMO_MODE);
        console.log('API Key:', YOUTUBE_API_KEY ? YOUTUBE_API_KEY.substring(0, 10) + '...' : 'not set');

        try {
            let results;

            if (DEMO_MODE) {
                // Demo mode - filter sample data
                await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
                results = DEMO_SEARCH_RESULTS.filter(r =>
                    r.snippet.title.toLowerCase().includes(query.toLowerCase()) ||
                    r.snippet.channelTitle.toLowerCase().includes(query.toLowerCase())
                );

                if (results.length === 0) {
                    results = DEMO_SEARCH_RESULTS; // Show all if no matches
                }
            } else {
                // Real YouTube API search with "karaoke" appended
                const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(karaokeQuery)}&type=video&maxResults=10&key=${YOUTUBE_API_KEY}`;
                console.log('Fetching:', url);
                
                const response = await fetch(url);
                
                if (!response.ok) {
                    const errorData = await response.json();
                    console.error('YouTube API Error:', errorData);
                    throw new Error(errorData.error?.message || 'API error');
                }
                
                const data = await response.json();
                console.log('YouTube response:', data);
                results = data.items || [];
            }

            this.displayResults(results);
            
            // Push state to history so back button returns to results
            history.pushState({ page: 'search-results', query: karaokeQuery }, '', `?search=${encodeURIComponent(karaokeQuery)}`);

        } catch (error) {
            console.error('Search error:', error);
            alert(`Error searching for songs: ${error.message}. Falling back to demo mode.`);
            
            // Fallback to demo mode
            await new Promise(resolve => setTimeout(resolve, 500));
            let results = DEMO_SEARCH_RESULTS.filter(r =>
                r.snippet.title.toLowerCase().includes(query.toLowerCase()) ||
                r.snippet.channelTitle.toLowerCase().includes(query.toLowerCase())
            );
            if (results.length === 0) {
                results = DEMO_SEARCH_RESULTS;
            }
            this.displayResults(results);
            
            // Push state to history for fallback too
            history.pushState({ page: 'search-results', query: karaokeQuery }, '', `?search=${encodeURIComponent(karaokeQuery)}`);
        }
    }
    
    displayResults(results) {
        const container = document.getElementById('results-container');
        container.innerHTML = '';
        container.classList.remove('hidden');
        
        if (results.length === 0) {
            container.innerHTML = '<p class="no-results">No results found. Try another search!</p>';
            return;
        }
        
        results.forEach(video => {
            const videoId = video.id.videoId;
            const title = video.snippet.title;
            const channel = video.snippet.channelTitle;
            const thumbnail = video.snippet.thumbnails.default.url;
            
            const resultItem = document.createElement('div');
            resultItem.className = 'result-item';
            resultItem.innerHTML = `
                <img src="${thumbnail}" alt="${title}">
                <div class="result-info">
                    <h3>${title}</h3>
                    <p>${channel}</p>
                </div>
            `;
            
            resultItem.addEventListener('click', () => this.selectVideo(videoId, title, channel));
            container.appendChild(resultItem);
        });
    }
    
    selectVideo(videoId, title, artist) {
        this.currentVideoId = videoId;

        // Update now playing
        document.getElementById('song-title').textContent = title;
        document.getElementById('song-artist').textContent = artist;

        // Show player container
        document.getElementById('player-container').classList.remove('hidden');
        document.getElementById('results-container').classList.add('hidden');

        // Initialize YouTube player
        this.initPlayer(videoId);

        // Load lyrics
        this.loadLyrics(title, artist);
        
        // Push state for player so back button returns to search results
        history.pushState({ page: 'player', videoId, title, artist }, '', `?play=${videoId}`);
    }
    
    initPlayer(videoId) {
        if (this.player) {
            this.player.loadVideoById(videoId);
        } else {
            this.player = new YT.Player('video-player', {
                height: '390',
                width: '640',
                videoId: videoId,
                playerVars: {
                    'playsinline': 1,
                    'controls': 1,
                    'modestbranding': 1
                },
                events: {
                    'onReady': (event) => {
                        console.log('Player ready');
                    },
                    'onStateChange': (event) => this.onPlayerStateChange(event)
                }
            });
        }
    }
    
    onPlayerStateChange(event) {
        // Update visualizer based on player state
        if (event.data === YT.PlayerState.PLAYING) {
            this.isPlaying = true;
            this.animateVisualizer();
        } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
            this.isPlaying = false;
        }
    }
    
    animateVisualizer() {
        if (!this.isPlaying) return;
        
        // Simulate audio energy with oscillating values
        this.simulatedTime += 0.05;
        const energy = 0.5 + Math.sin(this.simulatedTime) * 0.3 + Math.random() * 0.2;
        this.visualizer.setAudioEnergy(energy);
        
        requestAnimationFrame(() => this.animateVisualizer());
    }
    
    play() {
        if (this.player && this.player.playVideo) {
            this.player.playVideo();
        }
    }
    
    pause() {
        if (this.player && this.player.pauseVideo) {
            this.player.pauseVideo();
        }
    }
    
    stop() {
        if (this.player && this.player.stopVideo) {
            this.player.stopVideo();
        }
    }
    
    async loadLyrics(songTitle, artist = '') {
        const lyricsContainer = document.getElementById('lyrics-container');
        const lyricsDisplay = document.getElementById('lyrics-display');

        // Show loading state
        lyricsDisplay.innerHTML = `
            <div class="lyrics-placeholder">
                <h3>🎵 Lyrics</h3>
                <p class="loading">Loading lyrics...</p>
            </div>
        `;
        lyricsContainer.classList.remove('hidden');

        try {
            // Try to fetch lyrics from lyrics.ovh API (free, no API key needed)
            // The API endpoint is: https://api.lyrics.ovh/v1/:artist/:title
            let lyrics = null;

            // Try multiple search strategies
            if (artist && songTitle) {
                // Strategy 1: Use artist and extracted title
                const cleanArtist = artist.split(' - ')[0].trim() || artist;
                const cleanTitle = songTitle.split(' - ').pop().trim();
                lyrics = await this.fetchLyrics(cleanArtist, cleanTitle);
            }

            if (!lyrics && songTitle) {
                // Strategy 2: Try with just the song title
                const cleanTitle = songTitle.split(' - ').pop().trim();
                lyrics = await this.fetchLyrics('', cleanTitle);
            }

            if (!lyrics) {
                // Strategy 3: Try with the full song title
                lyrics = await this.fetchLyrics('', songTitle);
            }

            if (lyrics) {
                this.displayLyrics(lyrics);
            } else {
                this.showLyricsNotFound(songTitle);
            }

        } catch (error) {
            console.error('Lyrics error:', error);
            this.showLyricsNotFound(songTitle);
        }
    }

    async fetchLyrics(artist, title) {
        try {
            const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
            console.log('Fetching lyrics from:', url);

            const response = await fetch(url);

            if (!response.ok) {
                return null;
            }

            const data = await response.json();

            if (data.lyrics) {
                return data.lyrics;
            }

            return null;
        } catch (error) {
            console.log('Lyrics fetch failed:', error.message);
            return null;
        }
    }

    displayLyrics(lyricsText) {
        const lyricsDisplay = document.getElementById('lyrics-display');

        // Split lyrics into lines and filter empty ones
        const lines = lyricsText.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        // Create lyric line elements
        const lyricLines = lines.map((line, index) =>
            `<p class="lyric-line ${index === 0 ? 'active' : ''}">${this.escapeHtml(line)}</p>`
        ).join('');

        lyricsDisplay.innerHTML = `
            <h3>🎵 Lyrics</h3>
            <div class="demo-lyrics">
                ${lyricLines}
            </div>
            <p class="hint" style="margin-top: 15px; font-size: 0.9rem;">
                💡 Tip: Lines highlight automatically as you sing along!
            </p>
        `;

        // Animate lyrics highlighting
        this.animateLyrics();
    }

    showLyricsNotFound(songTitle) {
        const lyricsDisplay = document.getElementById('lyrics-display');

        lyricsDisplay.innerHTML = `
            <div class="lyrics-placeholder">
                <h3>🎵 Lyrics</h3>
                <p>Lyrics not available for this song.</p>
                <p class="hint">Enjoy the music and sing along!</p>
                <div class="demo-lyrics">
                    <p class="lyric-line active">🎤 ${this.escapeHtml(songTitle)}</p>
                    <p class="lyric-line">🎵 Sing your heart out!</p>
                    <p class="lyric-line">✨ Let the rhythm guide you</p>
                    <p class="lyric-line">🎶 Feel the melody</p>
                </div>
            </div>
        `;

        // Animate demo lyrics
        this.animateLyrics();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showSearchResults() {
        // Hide player and lyrics, show search results
        document.getElementById('player-container').classList.add('hidden');
        document.getElementById('lyrics-container').classList.add('hidden');
        document.getElementById('results-container').classList.remove('hidden');
        
        // Stop any playing video
        if (this.player && this.player.stopVideo) {
            this.player.stopVideo();
        }
        this.isPlaying = false;
    }

    hidePlayerAndLyrics() {
        // Hide everything except search
        document.getElementById('player-container').classList.add('hidden');
        document.getElementById('lyrics-container').classList.add('hidden');
        document.getElementById('results-container').classList.add('hidden');
        
        // Stop any playing video
        if (this.player && this.player.stopVideo) {
            this.player.stopVideo();
        }
        this.isPlaying = false;
    }
    
    animateLyrics() {
        const lines = document.querySelectorAll('.lyric-line');
        let currentIndex = 0;
        
        setInterval(() => {
            lines.forEach(line => line.classList.remove('active'));
            currentIndex = (currentIndex + 1) % lines.length;
            lines[currentIndex].classList.add('active');
        }, 3000);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.karaokeApp = new KaraokeApp();
});
