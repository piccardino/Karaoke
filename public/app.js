class KaraokeApp {
    constructor() {
        this.socket = null;
        this.roomId = null;
        this.role = null;
        this.peerConnection = null;
        this.guestStream = null;
        this.pitchDetector = null;
        this.scorer = null;
        this.isRecording = false;
        this.expectedNotes = [];

        this.player = null;
        this.currentVideoId = null;
        this.isPlaying = false;
        this.visualizer = null;
        this.simulatedTime = 0;
        this.audioElement = null;

        this.currentPage = 0;
        this.currentQuery = '';
        this.allResults = [];
        this.resultsPerPage = 10;

        this.syncedLyrics = [];
        this.currentLyricIndex = 0;
        this.lyricsSyncInterval = null;

        // Web Audio nodes for EQ
        this.audioCtx = null;
        this.sourceNode = null;
        this.gainNode = null;
        this.vocalFilter = null;
        this.musicGain = null;
        this.bassFilter = null;
        this.analyserNode = null;

        this.init();
    }

    async init() {
        this.visualizer = new KaraokeVisualizer(document.getElementById('three-container'));
        this.pitchDetector = new PitchDetector();
        this.scorer = new Scorer();

        this.connectSocket();
        this.setupEventListeners();

        // Check URL params
        const params = new URLSearchParams(window.location.search);
        const roomParam = params.get('room');

        if (roomParam) {
            this.autoJoinRoom(roomParam);
        }

        this.restoreStateFromURL();
        console.log('Karaoke App v2 initialized');
    }

    connectSocket() {
        this.socket = io();
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        this.socket.on('room-created', ({ roomId, inviteLink }) => {
            this.roomId = roomId;
            this.role = 'host';
            document.getElementById('invite-link').textContent = inviteLink;
            document.getElementById('invite-display').classList.remove('hidden');
            document.getElementById('room-indicator').textContent = `🎤 Host: ${roomId}`;
            document.getElementById('room-indicator').classList.remove('hidden');
            document.getElementById('btn-create-room').disabled = true;
            this.addToLog(`Room created: ${roomId}`);
        });

        this.socket.on('room-joined', ({ roomId, role }) => {
            this.roomId = roomId;
            this.role = role;
            document.getElementById('room-indicator').textContent = role === 'guest' ? `📱 Guest: ${roomId}` : `🎤 Host: ${roomId}`;
            document.getElementById('room-indicator').classList.remove('hidden');

            if (role === 'guest') {
                this.enterPhoneMode();
            }
        });

        this.socket.on('guest-joined', ({ guestId }) => {
            document.getElementById('guest-status').textContent = `🎉 Guest connected! Starting WebRTC...`;
            this.addToLog('Guest joined, initiating WebRTC');
            this.initWebRTC(true);
        });

        this.socket.on('host-disconnected', () => {
            this.addToLog('Host disconnected');
            alert('The host has disconnected.');
            this.leaveRoom();
        });

        this.socket.on('guest-disconnected', () => {
            document.getElementById('guest-status').textContent = 'Guest disconnected. Waiting for new guest...';
            this.addToLog('Guest disconnected');
            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }
        });

        this.socket.on('song-selected', ({ videoId, title, artist }) => {
            this.addToLog(`Song selected: ${title}`);
            if (this.role === 'guest') {
                document.getElementById('phone-status').textContent = `🎵 Song: ${title} - Get ready to sing!`;
            }
        });

        this.socket.on('recording-started', () => {
            this.isRecording = true;
            this.scorer.reset();
            if (this.role === 'guest') {
                document.getElementById('btn-start-singing').classList.add('recording');
                document.getElementById('btn-start-singing').textContent = '🔴 Singing...';
            }
        });

        this.socket.on('recording-stopped', () => {
            this.isRecording = false;
            if (this.role === 'guest') {
                document.getElementById('btn-start-singing').classList.remove('recording');
                document.getElementById('btn-start-singing').textContent = '🎤 Start Singing';
                document.getElementById('phone-status').textContent = '✅ Done! Check your score!';
            }
        });

        // WebRTC signaling
        this.socket.on('webrtc-offer', async ({ offer, from }) => {
            if (this.role === 'guest') {
                await this.handleWebRTCOffer(offer, from);
            }
        });

        this.socket.on('webrtc-answer', ({ answer, from }) => {
            if (this.peerConnection && this.peerConnection.signalingState === 'have-local-offer') {
                this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            }
        });

        this.socket.on('webrtc-ice', ({ candidate, from }) => {
            if (this.peerConnection) {
                this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        });

        this.socket.on('error', (msg) => {
            alert(msg);
        });
    }

    async initWebRTC(isHost) {
        const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
        this.peerConnection = new RTCPeerConnection(config);

        if (isHost) {
            // Host receives audio
            this.peerConnection.ontrack = (event) => {
                this.guestStream = event.streams[0];
                this.addToLog('Received audio stream from guest');
                this.startPitchDetection();
            };

            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('webrtc-ice', { roomId: this.roomId, candidate: event.candidate });
                }
            };

            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            this.socket.emit('webrtc-offer', { roomId: this.roomId, offer });
        }
    }

    async handleWebRTCOffer(offer, from) {
        const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
        this.peerConnection = new RTCPeerConnection(config);

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('webrtc-ice', { roomId: this.roomId, candidate: event.candidate });
            }
        };

        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => this.peerConnection.addTrack(track, stream));

        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        this.socket.emit('webrtc-answer', { roomId: this.roomId, answer });
    }

    startPitchDetection() {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(this.guestStream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        this.visualizer.connectAnalyser(analyser);

        const bufferLength = analyser.fftSize;
        const buffer = new Float32Array(bufferLength);

        const detect = () => {
            if (!this.isRecording) {
                requestAnimationFrame(detect);
                return;
            }

            analyser.getFloatTimeDomainData(buffer);
            const pitch = this.pitchDetector.getPitch(buffer);

            if (pitch && pitch > 80 && pitch < 1200) {
                const noteName = this.scorer.getNoteName(pitch);
                document.getElementById('pitch-indicator').textContent = `🎵 ${noteName} (${Math.round(pitch)} Hz)`;

                // Find expected note at current time
                const currentTime = this.audioElement ? this.audioElement.currentTime : 0;
                const expected = this.findExpectedNote(currentTime);
                if (expected) {
                    const result = this.scorer.scoreNote(pitch, expected.note);
                    if (result) {
                        document.getElementById('score-value').textContent = this.scorer.getAccuracy();
                        this.addScoreToHistory(result, expected);
                    }
                }
            }

            requestAnimationFrame(detect);
        };

        detect();
    }

    findExpectedNote(time) {
        if (!this.expectedNotes || this.expectedNotes.length === 0) return null;
        let best = null;
        for (const note of this.expectedNotes) {
            if (note.time <= time) {
                best = note;
            } else {
                break;
            }
        }
        return best;
    }

    addScoreToHistory(result, expected) {
        const history = document.getElementById('score-history');
        const entry = document.createElement('span');
        entry.textContent = `${expected.note}`;
        entry.style.color = result.score >= 70 ? '#00ff88' : result.score >= 40 ? '#ffbe0b' : '#ff006e';
        entry.style.margin = '0 4px';
        entry.style.fontWeight = 'bold';
        history.appendChild(entry);
    }

    enterPhoneMode() {
        document.body.classList.add('phone-mode');
        const ui = document.createElement('div');
        ui.id = 'phone-ui';
        ui.innerHTML = `
            <h2>🎤 Sing!</h2>
            <button id="btn-start-singing">🎤 Start Singing</button>
            <p id="phone-status">Waiting for host to select a song...</p>
        `;
        document.getElementById('app-container').appendChild(ui);

        document.getElementById('btn-start-singing').addEventListener('click', () => {
            if (this.isRecording) {
                this.socket.emit('stop-recording', this.roomId);
            } else {
                this.socket.emit('start-recording', this.roomId);
            }
        });
    }

    // Room management
    createRoom() {
        this.socket.emit('create-room');
    }

    joinRoom(roomId) {
        this.socket.emit('join-room', roomId.toUpperCase());
    }

    autoJoinRoom(roomId) {
        this.socket.emit('join-room', roomId.toUpperCase());
    }

    leaveRoom() {
        this.roomId = null;
        this.role = null;
        document.getElementById('invite-display').classList.add('hidden');
        document.getElementById('room-indicator').classList.add('hidden');
        document.getElementById('btn-create-room').disabled = false;
        document.body.classList.remove('phone-mode');
        const phoneUi = document.getElementById('phone-ui');
        if (phoneUi) phoneUi.remove();
    }

    setupEventListeners() {
        const searchInput = document.getElementById('search-input');
        const searchButton = document.getElementById('search-button');

        searchButton.addEventListener('click', () => this.search());
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.search();
        });

        document.querySelector('header h1').addEventListener('click', () => this.goHome());

        document.getElementById('btn-create-room').addEventListener('click', () => this.createRoom());
        document.getElementById('btn-join-room').addEventListener('click', () => {
            const roomId = document.getElementById('room-input').value.trim();
            if (roomId) this.joinRoom(roomId);
        });
        document.getElementById('room-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const roomId = document.getElementById('room-input').value.trim();
                if (roomId) this.joinRoom(roomId);
            }
        });
        document.getElementById('btn-copy-link').addEventListener('click', () => {
            const link = document.getElementById('invite-link').textContent;
            navigator.clipboard.writeText(link);
            document.getElementById('btn-copy-link').textContent = '✅ Copied!';
            setTimeout(() => { document.getElementById('btn-copy-link').textContent = '📋 Copy'; }, 2000);
        });

        document.getElementById('btn-play').addEventListener('click', () => this.play());
        document.getElementById('btn-pause').addEventListener('click', () => this.pause());
        document.getElementById('btn-stop').addEventListener('click', () => this.stop());
        document.getElementById('btn-toggle-player').addEventListener('click', () => this.togglePlayer());
        document.getElementById('btn-search-original').addEventListener('click', () => this.searchOriginalSong());

        document.getElementById('vocal-volume').addEventListener('input', (e) => this.updateEQ());
        document.getElementById('music-volume').addEventListener('input', (e) => this.updateEQ());
        document.getElementById('bass-volume').addEventListener('input', (e) => this.updateEQ());
        document.getElementById('btn-karaoke-mode').addEventListener('click', () => this.toggleKaraokeMode());
        document.getElementById('btn-mic').addEventListener('click', () => this.enableMicrophone());

        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.page === 'search-results') {
                this.showSearchResults();
            } else if (e.state && e.state.page === 'home') {
                this.hidePlayerAndLyrics();
            }
        });
    }

    async search(queryOverride = null, appendKaraoke = null) {
        const query = queryOverride || document.getElementById('search-input').value.trim();
        if (!query) return;

        const shouldAppendKaraoke = appendKaraoke !== null
            ? appendKaraoke
            : document.getElementById('karaoke-mode').checked;

        const karaokeQuery = query.toLowerCase().includes('karaoke')
            ? query
            : shouldAppendKaraoke ? `${query} karaoke` : query;

        this.currentPage = 0;
        this.allResults = [];
        this.currentQuery = karaokeQuery;

        try {
            let results;

            if (DEMO_MODE) {
                await new Promise(resolve => setTimeout(resolve, 500));
                results = DEMO_SEARCH_RESULTS.filter(r =>
                    r.snippet.title.toLowerCase().includes(query.toLowerCase()) ||
                    r.snippet.channelTitle.toLowerCase().includes(query.toLowerCase())
                );
                if (results.length === 0) results = DEMO_SEARCH_RESULTS;
            } else {
                const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(karaokeQuery)}&type=video&maxResults=10&key=${YOUTUBE_API_KEY}`;
                const response = await fetch(url);
                if (!response.ok) throw new Error('API error');
                const data = await response.json();
                results = data.items || [];
            }

            this.allResults = results;
            this.displayResultsPage();
            history.pushState({ page: 'search-results', query: karaokeQuery }, '', `?search=${encodeURIComponent(karaokeQuery)}`);

        } catch (error) {
            console.error('Search error:', error);
            await new Promise(resolve => setTimeout(resolve, 500));
            let results = DEMO_SEARCH_RESULTS.filter(r =>
                r.snippet.title.toLowerCase().includes(query.toLowerCase()) ||
                r.snippet.channelTitle.toLowerCase().includes(query.toLowerCase())
            );
            if (results.length === 0) results = DEMO_SEARCH_RESULTS;
            this.allResults = results;
            this.displayResultsPage();
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

        const totalPages = Math.ceil(this.allResults.length / this.resultsPerPage);
        if (totalPages > 1) {
            const paginationDiv = document.createElement('div');
            paginationDiv.className = 'pagination-container';
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
            const pageInfo = document.createElement('span');
            pageInfo.className = 'page-info';
            pageInfo.textContent = `Page ${this.currentPage + 1} of ${totalPages}`;
            paginationDiv.appendChild(pageInfo);
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

    selectVideo(videoId, title, artist) {
        this.currentVideoId = videoId;

        document.getElementById('song-title').textContent = title;
        document.getElementById('song-artist').textContent = artist;

        document.getElementById('player-container').classList.remove('hidden');
        document.getElementById('scoring-container').classList.remove('hidden');
        document.getElementById('results-container').classList.add('hidden');
        document.getElementById('score-value').textContent = '0';
        document.getElementById('score-history').innerHTML = '';

        this.loadLocalAudio(videoId);
        this.loadLyrics(title, artist);
        this.loadExpectedNotes(videoId);

        // Notify room about song selection
        if (this.roomId && this.role === 'host') {
            this.socket.emit('set-song', { roomId: this.roomId, videoId, title, artist });
        }

        const stateUrl = `?play=${videoId}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
        history.pushState({ page: 'player', videoId, title, artist }, '', stateUrl);
    }

    async loadLocalAudio(videoId) {
        this.audioElement = document.getElementById('local-audio');
        const audioUrl = `/api/audio/${videoId}`;
        this.audioElement.src = audioUrl;
        this.audioElement.load();

        // Set up Web Audio API for EQ
        if (this.audioCtx) {
            this.audioCtx.close();
        }
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.sourceNode = this.audioCtx.createMediaElementSource(this.audioElement);
        this.vocalFilter = this.audioCtx.createBiquadFilter();
        this.musicGain = this.audioCtx.createGain();
        this.bassFilter = this.audioCtx.createBiquadFilter();
        this.gainNode = this.audioCtx.createGain();

        // Vocal reduction: band-stop filter centered on voice frequencies
        this.vocalFilter.type = 'peaking';
        this.vocalFilter.frequency.value = 350;
        this.vocalFilter.Q.value = 1;
        this.vocalFilter.gain.value = 0;

        // Bass filter
        this.bassFilter.type = 'lowshelf';
        this.bassFilter.frequency.value = 200;
        this.bassFilter.gain.value = 0;

        this.sourceNode.connect(this.vocalFilter);
        this.vocalFilter.connect(this.musicGain);
        this.musicGain.connect(this.bassFilter);
        this.bassFilter.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);

        // Also connect to visualizer
        if (this.visualizer) {
            this.visualizer.connectAudio(this.audioElement);
        }

        console.log('Local audio loaded:', audioUrl);
    }

    async loadExpectedNotes(videoId) {
        try {
            const response = await fetch(`/api/notes/${videoId}`);
            const data = await response.json();
            this.expectedNotes = data.notes || [];
            console.log(`Loaded ${this.expectedNotes.length} expected notes`);
        } catch (e) {
            console.log('No expected notes available');
            this.expectedNotes = [];
        }
    }

    toggleKaraokeMode() {
        const btn = document.getElementById('btn-karaoke-mode');
        const isActive = btn.classList.toggle('active');

        if (isActive && this.vocalFilter) {
            this.vocalFilter.gain.value = -15;
            this.vocalFilter.Q.value = 0.5;
            this.vocalFilter.frequency.value = 350;
            btn.textContent = '🎤 Karaoke ON';
        } else if (this.vocalFilter) {
            this.vocalFilter.gain.value = 0;
            btn.textContent = '🎤 Karaoke Mode';
        }

        this.updateEQ();
    }

    updateEQ() {
        const vocal = parseInt(document.getElementById('vocal-volume').value);
        const music = parseInt(document.getElementById('music-volume').value);
        const bass = parseInt(document.getElementById('bass-volume').value);

        document.getElementById('vocal-value').textContent = vocal + '%';
        document.getElementById('music-value').textContent = music + '%';
        document.getElementById('bass-value').textContent = bass + '%';

        if (this.vocalFilter) this.vocalFilter.gain.value = -15 + (vocal / 100) * 15;
        if (this.musicGain) this.musicGain.gain.value = music / 100;
        if (this.bassFilter) this.bassFilter.gain.value = -20 + (bass / 100) * 20;
    }

    play() {
        if (this.audioElement) {
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
            this.audioElement.play();
            this.isPlaying = true;
            this.animateVisualizer();
            if (this.syncedLyrics.length > 0) this.startLyricsSync();
        }
    }

    pause() {
        if (this.audioElement) {
            this.audioElement.pause();
            this.isPlaying = false;
            if (this.lyricsSyncInterval) {
                clearInterval(this.lyricsSyncInterval);
                this.lyricsSyncInterval = null;
            }
        }
    }

    stop() {
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.currentTime = 0;
            this.isPlaying = false;
            if (this.lyricsSyncInterval) {
                clearInterval(this.lyricsSyncInterval);
                this.lyricsSyncInterval = null;
            }
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

    animateVisualizer() {
        if (!this.isPlaying) return;
        const energy = 0.5 + Math.sin(this.simulatedTime) * 0.3 + Math.random() * 0.2;
        this.visualizer.setAudioEnergy(energy);
        requestAnimationFrame(() => this.animateVisualizer());
    }

    async enableMicrophone() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 128;
            source.connect(analyser);
            this.visualizer.analyser = analyser;
            this.visualizer.frequencyData = new Uint8Array(analyser.frequencyBinCount);
            this.visualizer.isAudioConnected = true;
            console.log('Microphone connected to visualizer');
        } catch (error) {
            console.log('Microphone access denied:', error.message);
        }
    }

    // Lyrics methods (same as original)
    async loadLyrics(songTitle, artist = '') {
        const lyricsContainer = document.getElementById('lyrics-container');
        const lyricsDisplay = document.getElementById('lyrics-display');
        lyricsDisplay.innerHTML = `
            <div class="lyrics-placeholder">
                <h3>🎵 Lyrics</h3>
                <p class="loading">Loading lyrics...</p>
            </div>
        `;
        lyricsContainer.classList.remove('hidden');

        try {
            let lyrics = null;
            const cleanArtist = this.cleanArtistName(artist);
            const cleanTitle = this.cleanSongTitle(songTitle);

            if (!lyrics && cleanArtist && cleanTitle) {
                const syncedResult = await this.fetchSyncedLyrics(cleanArtist, cleanTitle);
                if (syncedResult) {
                    lyrics = syncedResult.lyrics;
                    this.syncedLyrics = syncedResult.lines || [];
                }
            }
            if (!lyrics && cleanArtist && cleanTitle) {
                lyrics = await this.fetchFromLyricsOvh(cleanArtist, cleanTitle);
            }
            if (!lyrics && cleanTitle) {
                lyrics = await this.fetchFromLyricsOvh('', cleanTitle);
            }
            if (!lyrics && cleanArtist && cleanTitle) {
                lyrics = await this.fetchFromVagalume(cleanArtist, cleanTitle);
            }
            if (!lyrics) {
                lyrics = await this.fetchLyricsFromYouTubeTitle(cleanTitle);
            }
            if (!lyrics) {
                const variants = this.getTitleVariants(cleanTitle);
                for (const variant of variants) {
                    lyrics = await this.fetchFromLyricsOvh(cleanArtist, variant);
                    if (lyrics) break;
                }
            }
            if (!lyrics) {
                const variants = this.getTitleVariants(cleanTitle);
                for (const variant of variants) {
                    lyrics = await this.fetchFromVagalume(cleanArtist, variant);
                    if (lyrics) break;
                }
            }
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
        return artist.split(' - ')[0].split(' ft. ')[0].split(' feat. ')[0].split(' with ')[0].split(' & ')[0].trim();
    }

    cleanSongTitle(title) {
        if (!title) return '';
        return title
            .replace(/\(?karaoke\)?/gi, '').replace(/\(?karaoke\s*version\)?/gi, '')
            .replace(/\(?karaoke\s*track\)?/gi, '').replace(/\(instrumental\)/gi, '')
            .replace(/\(sing\s*along\)/gi, '').replace(/\(lyrics?\)/gi, '')
            .replace(/\(with\s*lyrics?\)/gi, '').replace(/\(official\s*(music\s*)?video\)/gi, '')
            .replace(/\(official\s*(audio|lyric(s)?)\)/gi, '').replace(/\(lyric(s)?\s*video\)/gi, '')
            .replace(/\(feat\..*?\)/gi, '').replace(/\(ft\..*?\)/gi, '')
            .split(' - ').pop().replace(/\s+/g, ' ').trim();
    }

    getTitleVariants(title) {
        const variants = [title];
        const cleaned = title.replace(/\s*\(.*?\)\s*/g, '').replace(/\s*-\s*.*$/g, '').trim();
        if (cleaned && cleaned !== title) variants.push(cleaned);
        if (title.startsWith('The ')) variants.push(title.substring(4));
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
            let searchUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
            let response = await fetch(searchUrl);
            let data = response.ok ? await response.json() : [];
            if (!data || data.length === 0) {
                searchUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}`;
                response = await fetch(searchUrl);
                data = response.ok ? await response.json() : [];
            }
            if (data && data.length > 0) {
                for (const track of data) {
                    if (track.syncedLyrics) {
                        return { lyrics: track.plainLyrics || track.name, lines: this.parseLRC(track.syncedLyrics) };
                    }
                }
                const bestMatch = data[0];
                if (bestMatch.plainLyrics) {
                    return { lyrics: bestMatch.plainLyrics, lines: [] };
                }
            }
            return null;
        } catch (error) {
            console.log('LrcLib failed:', error.message);
            return null;
        }
    }

    parseLRC(lrcText) {
        const lines = [];
        const patterns = [
            /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/,
            /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*$/,
            /\[(\d{2}):(\d{2}):(\d{2,3})\]\s*(.*)/,
        ];
        const lrcLines = lrcText.split('\n');
        for (const line of lrcLines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith('[by:') || trimmedLine.startsWith('[ar:') ||
                trimmedLine.startsWith('[ti:') || trimmedLine.startsWith('[al:') || trimmedLine.startsWith('[offset:')) continue;
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
                if (text) lines.push({ time, text });
            }
        }
        return lines;
    }

    startLyricsSync() {
        if (!this.audioElement || !this.syncedLyrics || this.syncedLyrics.length === 0) return;
        this.currentLyricIndex = 0;
        if (this.lyricsSyncInterval) clearInterval(this.lyricsSyncInterval);
        this.lyricsSyncInterval = setInterval(() => this.updateSyncedLyrics(), 100);
    }

    updateSyncedLyrics() {
        if (!this.audioElement || !this.syncedLyrics || !this.syncedLyrics.length) return;
        const currentTime = this.audioElement.currentTime;
        const lines = this.syncedLyrics;
        let newIndex = 0;
        for (let i = 0; i < lines.length; i++) {
            if (currentTime >= lines[i].time) newIndex = i;
            else break;
        }
        if (newIndex !== this.currentLyricIndex) {
            this.currentLyricIndex = newIndex;
            this.highlightCurrentLyric(newIndex);
        }
    }

    highlightCurrentLyric(index) {
        const lines = document.querySelectorAll('.lyric-line');
        lines.forEach((line, i) => {
            line.classList.remove('active');
            if (i === index) {
                line.classList.add('active');
                const container = document.querySelector('.demo-lyrics');
                if (container) {
                    const lineTop = line.offsetTop;
                    const containerHeight = container.clientHeight;
                    container.scrollTo({ top: lineTop - containerHeight / 2, behavior: 'smooth' });
                }
            }
        });
    }

    async fetchFromLyricsOvh(artist, title) {
        if (!title) return null;
        try {
            const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
            const response = await fetch(url);
            if (!response.ok) return null;
            const data = await response.json();
            if (data.lyrics && data.lyrics.trim().length > 0) return this.cleanLyricsText(data.lyrics);
            return null;
        } catch (error) {
            return null;
        }
    }

    async fetchFromVagalume(artist, title) {
        if (!title) return null;
        try {
            const url = `https://api.vagalume.com.br/search.php?q=${encodeURIComponent(artist + ' ' + title)}&limit=1`;
            const response = await fetch(url);
            if (!response.ok) return null;
            const data = await response.json();
            if (data.type === 'exact' || data.type === 'aprox') {
                const song = data.mus[0];
                if (song && song.text && song.text.trim().length > 0) return this.cleanLyricsText(song.text);
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    async fetchLyricsFromYouTubeTitle(title) {
        if (!title) return null;
        try {
            const originalTitle = title.replace(/\(?karaoke\)?/gi, '').replace(/\(?karaoke\s*version\)?/gi, '')
                .replace(/\(?instrumental\)?/gi, '').replace(/\s+/g, ' ').trim();
            if (!originalTitle || originalTitle.length < 3 || DEMO_MODE) return null;
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(originalTitle)}&type=video&maxResults=5&key=${YOUTUBE_API_KEY}`;
            const response = await fetch(searchUrl);
            if (!response.ok) return null;
            const data = await response.json();
            if (!data.items || data.items.length === 0) return null;
            let bestMatch = null;
            for (const item of data.items) {
                const videoTitle = item.snippet.title.toLowerCase();
                if (videoTitle.includes('karaoke') || videoTitle.includes('instrumental')) continue;
                if (videoTitle.includes('official') || videoTitle.includes('video')) { bestMatch = item; break; }
                if (!bestMatch) bestMatch = item;
            }
            if (!bestMatch) return null;
            const cleanTitle = this.cleanSongTitle(bestMatch.snippet.title);
            const cleanArtist = this.cleanArtistName(bestMatch.snippet.channelTitle);
            const lyrics = await this.fetchFromLyricsOvh(cleanArtist, cleanTitle);
            if (lyrics) return lyrics;
            const vagalumeLyrics = await this.fetchFromVagalume(cleanArtist, cleanTitle);
            if (vagalumeLyrics) return vagalumeLyrics;
            return null;
        } catch (error) {
            return null;
        }
    }

    async fetchFromLyricsWiki(artist, title) {
        return null;
    }

    cleanLyricsText(text) {
        return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    displayLyrics(lyricsText) {
        const lyricsDisplay = document.getElementById('lyrics-display');
        if (this.syncedLyrics.length > 0) {
            const lyricLines = this.syncedLyrics.map((line, index) =>
                `<p class="lyric-line ${index === 0 ? 'active' : ''}" data-time="${line.time}">${this.escapeHtml(line.text)}</p>`
            ).join('');
            lyricsDisplay.innerHTML = `
                <h3>🎵 Synced Lyrics</h3>
                <div class="demo-lyrics synced">${lyricLines}</div>
                <p class="hint" style="margin-top:15px;font-size:0.9rem;">✅ Lyrics are synced with the music! Press play and watch them highlight!</p>
            `;
            this.startLyricsSync();
        } else {
            const lines = lyricsText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            const lyricLines = lines.map((line, index) =>
                `<p class="lyric-line ${index === 0 ? 'active' : ''}">${this.escapeHtml(line)}</p>`
            ).join('');
            lyricsDisplay.innerHTML = `
                <h3>🎵 Lyrics (Plain Text)</h3>
                <div class="demo-lyrics">${lyricLines}</div>
                <p class="hint" style="margin-top:15px;font-size:0.9rem;">⚠️ Synced lyrics not available for this song. Showing plain text only.</p>
            `;
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
        this.animateLyrics();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showSearchResults() {
        document.getElementById('player-container').classList.add('hidden');
        document.getElementById('scoring-container').classList.add('hidden');
        document.getElementById('lyrics-container').classList.add('hidden');
        document.getElementById('results-container').classList.remove('hidden');
        this.stop();
        this.isPlaying = false;
        this.stopLyricsSync();
    }

    hidePlayerAndLyrics() {
        document.getElementById('player-container').classList.add('hidden');
        document.getElementById('scoring-container').classList.add('hidden');
        document.getElementById('lyrics-container').classList.add('hidden');
        document.getElementById('results-container').classList.add('hidden');
        this.stop();
        this.isPlaying = false;
        this.stopLyricsSync();
    }

    goHome() {
        this.hidePlayerAndLyrics();
        document.getElementById('search-input').value = '';
        this.allResults = [];
        this.currentPage = 0;
        this.currentQuery = '';
        this.syncedLyrics = [];
        this.currentLyricIndex = 0;
        history.pushState({ page: 'home' }, '', window.location.pathname);
    }

    searchOriginalSong() {
        const currentTitle = document.getElementById('song-title').textContent;
        const currentArtist = document.getElementById('song-artist').textContent;
        if (!currentTitle) return;
        const originalTitle = this.cleanSongTitle(currentTitle);
        const originalArtist = this.cleanArtistName(currentArtist);
        document.getElementById('search-input').value = `${originalArtist} - ${originalTitle}`;
        const karaokeToggle = document.getElementById('karaoke-mode');
        const wasChecked = karaokeToggle.checked;
        karaokeToggle.checked = false;
        this.search(`${originalArtist} - ${originalTitle}`, false).then(() => {
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

    restoreStateFromURL() {
        const params = new URLSearchParams(window.location.search);
        const searchQuery = params.get('search');
        const playVideoId = params.get('play');
        if (playVideoId) {
            const title = params.get('title') || 'Unknown Song';
            const artist = params.get('artist') || 'Unknown Artist';
            this.selectVideo(playVideoId, title, artist);
        } else if (searchQuery) {
            document.getElementById('search-input').value = searchQuery.replace(' karaoke', '');
            this.search(searchQuery.replace(' karaoke', ''), false);
        }
    }

    addToLog(msg) {
        console.log(`[Karaoke] ${msg}`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.karaokeApp = new KaraokeApp();
});
