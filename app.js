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
        document.getElementById('btn-toggle-player').addEventListener('click', () => this.togglePlayer());
        document.getElementById('btn-search-original').addEventListener('click', () => this.searchOriginalSong());

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
    
    async search(queryOverride = null, appendKaraoke = null) {
        const query = queryOverride || document.getElementById('search-input').value.trim();
        if (!query) return;

        // Check if karaoke mode is enabled (use parameter if provided, otherwise check toggle)
        const shouldAppendKaraoke = appendKaraoke !== null
            ? appendKaraoke
            : document.getElementById('karaoke-mode').checked;

        // Automatically append "karaoke" to the search query if toggle is on
        const karaokeQuery = query.toLowerCase().includes('karaoke')
            ? query
            : shouldAppendKaraoke ? `${query} karaoke` : query;

        console.log('Searching for:', query);
        console.log('Karaoke mode:', shouldAppendKaraoke ? 'ON' : 'OFF');
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
        const stateUrl = `?play=${videoId}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
        history.pushState({ page: 'player', videoId, title, artist }, '', stateUrl);
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

    togglePlayer() {
        const content = document.getElementById('player-content');
        const btn = document.getElementById('btn-toggle-player');

        if (content.classList.contains('collapsed')) {
            content.classList.remove('collapsed');
            btn.textContent = '🎬';
            btn.title = 'Hide Player';
        } else {
            content.classList.add('collapsed');
            btn.textContent = '🎥';
            btn.title = 'Show Player';
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
            let lyrics = null;

            // Clean up artist and title for better matching
            const cleanArtist = this.cleanArtistName(artist);
            const cleanTitle = this.cleanSongTitle(songTitle);

            console.log('Searching lyrics for:', { artist: cleanArtist, title: cleanTitle });

            // Strategy 1: Lyrics.ovh with artist + title
            if (!lyrics && cleanArtist && cleanTitle) {
                lyrics = await this.fetchFromLyricsOvh(cleanArtist, cleanTitle);
            }

            // Strategy 2: Lyrics.ovh with just title
            if (!lyrics && cleanTitle) {
                lyrics = await this.fetchFromLyricsOvh('', cleanTitle);
            }

            // Strategy 3: Vagalume API (alternative free API)
            if (!lyrics && cleanArtist && cleanTitle) {
                lyrics = await this.fetchFromVagalume(cleanArtist, cleanTitle);
            }

            // Strategy 4: Try YouTube to get original title, then search lyrics
            if (!lyrics) {
                lyrics = await this.fetchLyricsFromYouTubeTitle(cleanTitle);
            }

            // Strategy 5: Try variant combinations with Lyrics.ovh
            if (!lyrics) {
                const variants = this.getTitleVariants(cleanTitle);
                for (const variant of variants) {
                    lyrics = await this.fetchFromLyricsOvh(cleanArtist, variant);
                    if (lyrics) break;
                }
            }

            // Strategy 6: Vagalume with variants
            if (!lyrics) {
                const variants = this.getTitleVariants(cleanTitle);
                for (const variant of variants) {
                    lyrics = await this.fetchFromVagalume(cleanArtist, variant);
                    if (lyrics) break;
                }
            }

            // Strategy 7: Try lyrics.wiki API
            if (!lyrics) {
                lyrics = await this.fetchFromLyricsWiki(cleanArtist, cleanTitle);
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

    cleanArtistName(artist) {
        if (!artist) return '';
        return artist
            .split(' - ')[0]
            .split(' ft. ')[0]
            .split(' feat. ')[0]
            .split(' with ')[0]
            .split(' & ')[0]
            .trim();
    }

    cleanSongTitle(title) {
        if (!title) return '';
        return title
            // Remove karaoke-related terms
            .replace(/\(?karaoke\)?/gi, '')
            .replace(/\(?karaoke\s*version\)?/gi, '')
            .replace(/\(?karaoke\s*track\)?/gi, '')
            .replace(/\(instrumental\)/gi, '')
            .replace(/\(sing\s*along\)/gi, '')
            .replace(/\(lyrics?\)/gi, '')
            .replace(/\(with\s*lyrics?\)/gi, '')
            // Remove common video type tags
            .replace(/\(official\s*(music\s*)?video\)/gi, '')
            .replace(/\(official\s*(audio|lyric(s)?)\)/gi, '')
            .replace(/\(lyric(s)?\s*video\)/gi, '')
            .replace(/\(feat\..*?\)/gi, '')
            .replace(/\(ft\..*?\)/gi, '')
            .split(' - ').pop()
            .replace(/\s+/g, ' ')  // Clean up multiple spaces
            .trim();
    }

    getTitleVariants(title) {
        const variants = [title];

        // Remove common suffixes
        const cleaned = title
            .replace(/\s*\(.*?\)\s*/g, '')
            .replace(/\s*-\s*.*$/g, '')
            .trim();

        if (cleaned && cleaned !== title) {
            variants.push(cleaned);
        }

        // Try without "The" prefix
        if (title.startsWith('The ')) {
            variants.push(title.substring(4));
        }

        // Try first few words only
        const words = title.split(' ');
        if (words.length > 3) {
            variants.push(words.slice(0, 3).join(' '));
            variants.push(words.slice(0, 4).join(' '));
        }

        return [...new Set(variants.filter(v => v.length > 0))];
    }

    async fetchFromLyricsOvh(artist, title) {
        if (!title) return null;

        try {
            const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
            console.log('Trying Lyrics.ovh:', url);

            const response = await fetch(url);

            if (!response.ok) {
                return null;
            }

            const data = await response.json();

            if (data.lyrics && data.lyrics.trim().length > 0) {
                console.log('✓ Found lyrics on Lyrics.ovh');
                return this.cleanLyricsText(data.lyrics);
            }

            return null;
        } catch (error) {
            console.log('Lyrics.ovh failed:', error.message);
            return null;
        }
    }

    async fetchFromVagalume(artist, title) {
        if (!title) return null;

        try {
            // Vagalume API - free, no key needed
            const url = `https://api.vagalume.com.br/search.php?q=${encodeURIComponent(artist + ' ' + title)}&limit=1`;
            console.log('Trying Vagalume:', url);

            const response = await fetch(url);

            if (!response.ok) {
                return null;
            }

            const data = await response.json();

            if (data.type === 'exact' || data.type === 'aprox') {
                const song = data.mus[0];
                if (song && song.text && song.text.trim().length > 0) {
                    console.log('✓ Found lyrics on Vagalume');
                    return this.cleanLyricsText(song.text);
                }
            }

            return null;
        } catch (error) {
            console.log('Vagalume failed:', error.message);
            return null;
        }
    }

    async fetchLyricsFromYouTubeTitle(title) {
        // Try to extract the original song name from a YouTube karaoke title
        // e.g. "Never Gonna Give You Up (Karaoke Version)" -> "Never Gonna Give You Up"
        if (!title) return null;

        try {
            // First, search YouTube for the original song (without karaoke)
            const originalTitle = title
                .replace(/\(?karaoke\)?/gi, '')
                .replace(/\(?karaoke\s*version\)?/gi, '')
                .replace(/\(?instrumental\)?/gi, '')
                .replace(/\s+/g, ' ')
                .trim();

            if (!originalTitle || originalTitle.length < 3) {
                return null;
            }

            console.log('Searching YouTube for original title:', originalTitle);

            // Search YouTube for the original song to get the proper artist
            if (DEMO_MODE) {
                return null; // Can't do this in demo mode
            }

            const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(originalTitle)}&type=video&maxResults=5&key=${YOUTUBE_API_KEY}`;
            const response = await fetch(searchUrl);

            if (!response.ok) {
                return null;
            }

            const data = await response.json();

            if (!data.items || data.items.length === 0) {
                return null;
            }

            // Try to find a video that's NOT karaoke (look for official video/audio)
            let bestMatch = null;
            for (const item of data.items) {
                const videoTitle = item.snippet.title.toLowerCase();
                const channel = item.snippet.channelTitle.toLowerCase();

                // Skip karaoke results
                if (videoTitle.includes('karaoke') || videoTitle.includes('instrumental')) {
                    continue;
                }

                // Prefer official videos
                if (videoTitle.includes('official') || videoTitle.includes('video')) {
                    bestMatch = item;
                    break;
                }

                if (!bestMatch) {
                    bestMatch = item;
                }
            }

            if (!bestMatch) {
                return null;
            }

            const videoTitle = bestMatch.snippet.title;
            const artist = bestMatch.snippet.channelTitle;

            console.log('Found original video:', videoTitle, 'by', artist);

            // Now try to fetch lyrics with the proper artist and title
            const cleanTitle = this.cleanSongTitle(videoTitle);
            const cleanArtist = this.cleanArtistName(artist);

            // Try Lyrics.ovh
            const lyrics = await this.fetchFromLyricsOvh(cleanArtist, cleanTitle);
            if (lyrics) {
                console.log('✓ Found lyrics using YouTube search');
                return lyrics;
            }

            // Try Vagalume
            const vagalumeLyrics = await this.fetchFromVagalume(cleanArtist, cleanTitle);
            if (vagalumeLyrics) {
                console.log('✓ Found lyrics on Vagalume via YouTube search');
                return vagalumeLyrics;
            }

            return null;
        } catch (error) {
            console.log('YouTube lyrics search failed:', error.message);
            return null;
        }
    }

    async fetchFromLyricsWiki(artist, title) {
        if (!title) return null;

        try {
            // lyrics.fandom.com wiki API (unofficial)
            const song = `${artist} - ${title}`.replace(/\s+/g, '_');
            const url = `https://lyrics.fandom.com/wiki/${song}`;

            // Since we can't directly scrape websites due to CORS,
            // we'll use a CORS proxy or skip this for now
            // This is a placeholder for future implementation
            console.log('Lyrics Wiki requires server-side scraping - skipping');
            return null;
        } catch (error) {
            console.log('Lyrics Wiki failed:', error.message);
            return null;
        }
    }

    cleanLyricsText(text) {
        return text
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
            .trim();
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

    searchOriginalSong() {
        // Search for the original song (without karaoke) using the current title
        const currentTitle = document.getElementById('song-title').textContent;
        const currentArtist = document.getElementById('song-artist').textContent;

        if (!currentTitle) return;

        // Clean the title to get the original song name
        const originalTitle = this.cleanSongTitle(currentTitle);
        const originalArtist = this.cleanArtistName(currentArtist);

        // Set the search input and perform search without karaoke toggle
        document.getElementById('search-input').value = `${originalArtist} - ${originalTitle}`;

        // Temporarily disable karaoke mode for this search
        const karaokeToggle = document.getElementById('karaoke-mode');
        const wasChecked = karaokeToggle.checked;
        karaokeToggle.checked = false;

        // Search without karaoke
        this.search(`${originalArtist} - ${originalTitle}`, false).then(() => {
            // Restore karaoke toggle state
            karaokeToggle.checked = wasChecked;
        });
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
