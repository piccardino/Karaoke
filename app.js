// Main Application
class KaraokeApp {
    constructor() {
        this.player = null;
        this.currentVideoId = null;
        this.isPlaying = false;
        this.visualizer = null;
        this.simulatedTime = 0;
        this.audioElement = null;

        // Pagination
        this.currentPage = 0;
        this.currentQuery = '';
        this.allResults = [];
        this.resultsPerPage = 10;

        // Lyrics synchronization
        this.syncedLyrics = []; // Array of {time, text}
        this.currentLyricIndex = 0;
        this.lyricsSyncInterval = null;

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

        // Header title click to go home
        document.querySelector('header h1').addEventListener('click', () => this.goHome());

        // Player controls
        document.getElementById('btn-play').addEventListener('click', () => this.play());
        document.getElementById('btn-pause').addEventListener('click', () => this.pause());
        document.getElementById('btn-stop').addEventListener('click', () => this.stop());
        document.getElementById('btn-toggle-player').addEventListener('click', () => this.togglePlayer());
        document.getElementById('btn-search-original').addEventListener('click', () => this.searchOriginalSong());

        // EQ Controls
        document.getElementById('vocal-volume').addEventListener('input', (e) => this.updateEQ());
        document.getElementById('music-volume').addEventListener('input', (e) => this.updateEQ());
        document.getElementById('bass-volume').addEventListener('input', (e) => this.updateEQ());
        document.getElementById('btn-karaoke-mode').addEventListener('click', () => this.toggleKaraokeEQ());
        document.getElementById('btn-mic').addEventListener('click', () => this.enableMicrophone());
        document.getElementById('song-title').addEventListener('click', () => this.goHome());

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

        // Reset pagination for new search
        this.currentPage = 0;
        this.allResults = [];
        this.currentQuery = karaokeQuery;

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

            // Store all results and display first page
            this.allResults = results;
            this.displayResultsPage();

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
            this.allResults = results;
            this.displayResultsPage();

            // Push state to history for fallback too
            history.pushState({ page: 'search-results', query: karaokeQuery }, '', `?search=${encodeURIComponent(karaokeQuery)}`);
        }
    }

    displayResultsPage() {
        const container = document.getElementById('results-container');
        container.innerHTML = '';
        container.classList.remove('hidden');

        const startIndex = this.currentPage * this.resultsPerPage;
        const endIndex = startIndex + this.resultsPerPage;
        const pageResults = this.allResults.slice(startIndex, endIndex);

        if (pageResults.length === 0) {
            container.innerHTML = '<p class="no-results">No more results.</p>';
            return;
        }

        // Display results for current page
        pageResults.forEach(video => {
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

        // Add pagination controls
        const totalPages = Math.ceil(this.allResults.length / this.resultsPerPage);
        if (totalPages > 1) {
            const paginationDiv = document.createElement('div');
            paginationDiv.className = 'pagination-container';

            // Previous button
            if (this.currentPage > 0) {
                const prevBtn = document.createElement('button');
                prevBtn.className = 'pagination-btn';
                prevBtn.textContent = '← Previous';
                prevBtn.addEventListener('click', () => {
                    this.currentPage--;
                    this.displayResultsPage();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });
                paginationDiv.appendChild(prevBtn);
            }

            // Page info
            const pageInfo = document.createElement('span');
            pageInfo.className = 'page-info';
            pageInfo.textContent = `Page ${this.currentPage + 1} of ${totalPages}`;
            paginationDiv.appendChild(pageInfo);

            // Next button
            if (this.currentPage < totalPages - 1) {
                const nextBtn = document.createElement('button');
                nextBtn.className = 'pagination-btn';
                nextBtn.textContent = 'Next →';
                nextBtn.addEventListener('click', () => {
                    this.currentPage++;
                    this.displayResultsPage();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });
                paginationDiv.appendChild(nextBtn);
            }

            container.appendChild(paginationDiv);
        }
    }

    loadMoreResults() {
        // For YouTube API, we can fetch next page using pageToken
        // For now, we'll show a message that more results are available
        if (this.allResults.length >= this.resultsPerPage) {
            this.currentPage++;
            this.displayResultsPage();
        }
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
                    'modestbranding': 1,
                    'rel': 0,
                    'fs': 1
                },
                events: {
                    'onReady': (event) => {
                        console.log('Player ready');
                        this.connectAudioToVisualizer();
                    },
                    'onStateChange': (event) => this.onPlayerStateChange(event),
                    'onError': (event) => this.onPlayerError(event)
                }
            });
        }
    }

    onPlayerError(event) {
        const errorCode = event.data;
        console.error('YouTube Player Error:', errorCode);

        let errorMessage = '';
        let solution = '';

        switch (errorCode) {
            case 2:
                errorMessage = 'Invalid video ID';
                solution = 'Please try a different song';
                break;
            case 5:
                errorMessage = 'Video cannot be played in embedded player';
                solution = 'This song has embedding restrictions. Opening on YouTube...';
                this.openVideoInNewTab(this.currentVideoId);
                return;
            case 100:
                errorMessage = 'Video not found or removed';
                solution = 'Please try a different song';
                break;
            case 101:
            case 150:
                errorMessage = 'Video cannot be played embedded (copyright restriction)';
                solution = 'This song has embedding restrictions. Opening on YouTube...';
                this.openVideoInNewTab(this.currentVideoId);
                return;
            case 153:
                errorMessage = 'Video player configuration error';
                solution = 'This song may have playback restrictions. Try another song or open on YouTube.';
                break;
            default:
                errorMessage = 'Unknown playback error';
                solution = 'Please try again or open on YouTube';
                break;
        }

        // Show error message to user
        alert(`🎵 Playback Error (Code: ${errorCode})\n\n${errorMessage}\n\n${solution}`);

        // Add a button to open on YouTube if not already done
        if (errorCode !== 5 && errorCode !== 101 && errorCode !== 150) {
            this.showOpenOnYouTubeButton(this.currentVideoId);
        }
    }

    openVideoInNewTab(videoId) {
        window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
    }

    showOpenOnYouTubeButton(videoId) {
        const playerContent = document.getElementById('player-content');
        const existingBtn = document.getElementById('btn-open-youtube');

        if (existingBtn) existingBtn.remove();

        const openBtn = document.createElement('button');
        openBtn.id = 'btn-open-youtube';
        openBtn.className = 'karaoke-eq-btn';
        openBtn.style.marginTop = '15px';
        openBtn.textContent = '🎬 Open on YouTube';
        openBtn.addEventListener('click', () => this.openVideoInNewTab(videoId));

        playerContent.appendChild(openBtn);
    }

    connectAudioToVisualizer() {
        // Try to get the audio element from the YouTube player iframe
        // Note: Due to CORS restrictions, we can't directly access YouTube audio
        // We'll use a simulated audio reaction for now
        // For full audio analysis, you would need to use the Web Audio API with a local audio file

        // Alternative: Use the microphone or system audio (requires user permission)
        // For now, we'll use the simulated mode in the visualizer

        console.log('Using simulated audio visualization');
        console.log('Tip: For real audio analysis, use microphone input or local files');

        // If you want to use microphone:
        // this.connectMicrophoneToVisualizer();
    }

    async connectMicrophoneToVisualizer() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 128;

            source.connect(analyser);

            // Pass analyser to visualizer
            this.visualizer.analyser = analyser;
            this.visualizer.frequencyData = new Uint8Array(analyser.frequencyBinCount);
            this.visualizer.isAudioConnected = true;

            console.log('✓ Microphone connected to visualizer');
        } catch (error) {
            console.log('Microphone access denied:', error.message);
        }
    }
    
    onPlayerStateChange(event) {
        // Update visualizer based on player state
        if (event.data === YT.PlayerState.PLAYING) {
            this.isPlaying = true;
            this.animateVisualizer();
            // Resume lyrics sync if available
            if (this.syncedLyrics.length > 0) {
                this.startLyricsSync();
            }
        } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
            this.isPlaying = false;
            // Pause lyrics sync
            if (this.lyricsSyncInterval) {
                clearInterval(this.lyricsSyncInterval);
                this.lyricsSyncInterval = null;
            }
        }
    }
    
    animateVisualizer() {
        if (!this.isPlaying) return;

        // If microphone is connected, visualizer will use real audio
        // Otherwise, use simulated mode (already handled in visualizer.js)
        const energy = 0.5 + Math.sin(this.simulatedTime) * 0.3 + Math.random() * 0.2;
        this.visualizer.setAudioEnergy(energy);

        requestAnimationFrame(() => this.animateVisualizer());
    }

    updateEQ() {
        const vocal = document.getElementById('vocal-volume').value;
        const music = document.getElementById('music-volume').value;
        const bass = document.getElementById('bass-volume').value;

        document.getElementById('vocal-value').textContent = vocal + '%';
        document.getElementById('music-value').textContent = music + '%';
        document.getElementById('bass-value').textContent = bass + '%';

        // Note: Due to YouTube CORS restrictions, we can't directly manipulate audio
        // These controls are visual feedback for when you use local audio files
        // For YouTube videos, the system volume is the only way to control audio

        console.log('EQ Settings - Vocal:', vocal, 'Music:', music, 'Bass:', bass);
    }

    toggleKaraokeEQ() {
        const btn = document.getElementById('btn-karaoke-mode');
        const isActive = btn.classList.toggle('active');

        if (isActive) {
            // Karaoke mode: reduce vocals, keep music
            document.getElementById('vocal-volume').value = 30;
            document.getElementById('music-volume').value = 100;
            document.getElementById('bass-volume').value = 80;
            btn.textContent = '🎤 Karaoke ON';
        } else {
            // Normal mode
            document.getElementById('vocal-volume').value = 100;
            document.getElementById('music-volume').value = 100;
            document.getElementById('bass-volume').value = 100;
            btn.textContent = '🎤 Karaoke Mode';
        }

        this.updateEQ();
    }

    async enableMicrophone() {
        try {
            await this.connectMicrophoneToVisualizer();
            alert('Microphone connected! Visualizations will now react to audio.');
        } catch (error) {
            alert('Could not access microphone. Please allow microphone access and try again.');
        }
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

            // Strategy 1: Try lrclib.net for SYNCED lyrics (with timestamps)
            if (!lyrics && cleanArtist && cleanTitle) {
                console.log('=== Attempting to fetch SYNCED lyrics ===');
                const syncedResult = await this.fetchSyncedLyrics(cleanArtist, cleanTitle);
                if (syncedResult) {
                    lyrics = syncedResult.lyrics;
                    this.syncedLyrics = syncedResult.lines || []; // Store synced lyrics
                    console.log('Sync status:', {
                        hasSynced: this.syncedLyrics.length > 0,
                        lineCount: this.syncedLyrics.length,
                        firstLine: this.syncedLyrics[0]
                    });
                }
            }

            // Strategy 2: Lyrics.ovh with artist + title (plain text)
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

    async fetchSyncedLyrics(artist, title) {
        if (!title) return null;

        try {
            // Try multiple search strategies with lrclib.net
            
            // Strategy 1: Search by track name and artist
            let searchUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
            console.log('Trying LrcLib search (artist + title):', searchUrl);

            let response = await fetch(searchUrl);
            let data = response.ok ? await response.json() : [];

            // Strategy 2: Try just track name if first search fails
            if (!data || data.length === 0) {
                searchUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}`;
                console.log('Trying LrcLib search (title only):', searchUrl);
                response = await fetch(searchUrl);
                data = response.ok ? await response.json() : [];
            }

            if (data && data.length > 0) {
                console.log(`LrcLib found ${data.length} results`);
                
                // Find the best match with synced lyrics
                for (const track of data) {
                    if (track.syncedLyrics) {
                        console.log('✓ Found synced lyrics on LrcLib:', track.trackName);
                        return {
                            lyrics: track.plainLyrics || track.name,
                            lines: this.parseLRC(track.syncedLyrics)
                        };
                    }
                }
                
                // If no synced lyrics, return plain lyrics anyway
                const bestMatch = data[0];
                if (bestMatch.plainLyrics) {
                    console.log('✓ Found plain lyrics on LrcLib (not synced)');
                    return {
                        lyrics: bestMatch.plainLyrics,
                        lines: []
                    };
                }
            } else {
                console.log('LrcLib: No results found');
            }

            return null;
        } catch (error) {
            console.log('LrcLib failed:', error.message);
            return null;
        }
    }

    parseLRC(lrcText) {
        // Parse LRC format: [mm:ss.xx] lyric text or [mm:ss.xx] or [mm:ss:xx]
        const lines = [];
        
        // Support multiple LRC formats
        const patterns = [
            /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/,  // [00:12.34] text
            /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*$/,      // [00:12.34] (empty line)
            /\[(\d{2}):(\d{2}):(\d{2,3})\]\s*(.*)/,    // [00:12:34] text (alternative format)
        ];

        const lrcLines = lrcText.split('\n');

        for (const line of lrcLines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith('[by:') || trimmedLine.startsWith('[ar:') || 
                trimmedLine.startsWith('[ti:') || trimmedLine.startsWith('[al:') || trimmedLine.startsWith('[offset:')) {
                continue; // Skip metadata
            }

            // Try each pattern
            let match = null;
            for (const pattern of patterns) {
                match = pattern.exec(trimmedLine);
                if (match) break;
            }

            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const milliseconds = parseInt(match[3].padEnd(3, '0'));
                const time = minutes * 60 + seconds + milliseconds / 1000;
                const text = match[4] ? match[4].trim() : '';

                if (text) {
                    lines.push({ time, text });
                }
            }
        }

        if (lines.length > 0) {
            console.log(`✓ Parsed ${lines.length} synced lyric lines`);
            console.log('First few lines:', lines.slice(0, 3));
        } else {
            console.log('✗ No valid LRC lines found');
        }

        return lines;
    }

    startLyricsSync() {
        if (!this.player) {
            console.log('No player available');
            return;
        }

        if (!this.syncedLyrics || this.syncedLyrics.length === 0) {
            console.log('No synced lyrics available');
            return;
        }

        console.log('✓ Starting lyrics sync with', this.syncedLyrics.length, 'lines');
        this.currentLyricIndex = 0;

        // Clear existing interval
        if (this.lyricsSyncInterval) {
            clearInterval(this.lyricsSyncInterval);
        }

        // Update lyrics every 100ms
        this.lyricsSyncInterval = setInterval(() => this.updateSyncedLyrics(), 100);
    }

    updateSyncedLyrics() {
        if (!this.player || !this.syncedLyrics || !this.syncedLyrics.length) return;

        try {
            const currentTime = this.player.getCurrentTime();
            const lines = this.syncedLyrics;

            // Find current lyric line based on video time
            let newIndex = 0;
            for (let i = 0; i < lines.length; i++) {
                if (currentTime >= lines[i].time) {
                    newIndex = i;
                } else {
                    break;
                }
            }

            // Update display if line changed
            if (newIndex !== this.currentLyricIndex) {
                this.currentLyricIndex = newIndex;
                this.highlightCurrentLyric(newIndex);
                
                // Debug log every 10 lines
                if (newIndex % 10 === 0) {
                    console.log(`Lyrics sync: Line ${newIndex}/${lines.length}, Time: ${currentTime.toFixed(1)}s`);
                }
            }
        } catch (error) {
            console.log('Lyrics sync error:', error);
        }
    }

    highlightCurrentLyric(index) {
        const lines = document.querySelectorAll('.lyric-line');
        lines.forEach((line, i) => {
            line.classList.remove('active');
            if (i === index) {
                line.classList.add('active');

                // Auto-scroll to current lyric
                const container = document.querySelector('.demo-lyrics');
                if (container) {
                    const lineTop = line.offsetTop;
                    const containerHeight = container.clientHeight;
                    container.scrollTo({
                        top: lineTop - containerHeight / 2,
                        behavior: 'smooth'
                    });
                }
            }
        });
    }

    stopLyricsSync() {
        if (this.lyricsSyncInterval) {
            clearInterval(this.lyricsSyncInterval);
            this.lyricsSyncInterval = null;
        }
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

        if (this.syncedLyrics.length > 0) {
            // Display synced lyrics with timestamps
            console.log(`✓ Displaying ${this.syncedLyrics.length} synced lyric lines`);
            
            const lyricLines = this.syncedLyrics.map((line, index) =>
                `<p class="lyric-line ${index === 0 ? 'active' : ''}" data-time="${line.time}">${this.escapeHtml(line.text)}</p>`
            ).join('');

            lyricsDisplay.innerHTML = `
                <h3>🎵 Synced Lyrics</h3>
                <div class="demo-lyrics synced">
                    ${lyricLines}
                </div>
                <p class="hint" style="margin-top: 15px; font-size: 0.9rem;">
                    ✅ Lyrics are synced with the music! Press play and watch them highlight!
                </p>
            `;

            // Start sync when video plays
            this.startLyricsSync();
        } else {
            // Display plain lyrics (no sync available)
            console.log('✗ No synced lyrics found, showing plain text');
            
            const lines = lyricsText.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            const lyricLines = lines.map((line, index) =>
                `<p class="lyric-line ${index === 0 ? 'active' : ''}">${this.escapeHtml(line)}</p>`
            ).join('');

            lyricsDisplay.innerHTML = `
                <h3>🎵 Lyrics (Plain Text)</h3>
                <div class="demo-lyrics">
                    ${lyricLines}
                </div>
                <p class="hint" style="margin-top: 15px; font-size: 0.9rem;">
                    ⚠️ Synced lyrics not available for this song. Showing plain text only.
                </p>
            `;

            // Animate lyrics highlighting (fallback for non-synced)
            this.animateLyrics();
        }
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
        this.stopLyricsSync();
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
        this.stopLyricsSync();
    }

    goHome() {
        // Reset everything and go to home page
        this.hidePlayerAndLyrics();

        // Clear search
        document.getElementById('search-input').value = '';
        this.allResults = [];
        this.currentPage = 0;
        this.currentQuery = '';
        this.syncedLyrics = [];
        this.currentLyricIndex = 0;

        // Clear URL
        history.pushState({ page: 'home' }, '', window.location.pathname);

        console.log('✓ Returned to home');
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
