const EXPECTED_NOTES = {
  'dQw4w9WgXcQ': [
    { time: 0, note: 'D4' }, { time: 2, note: 'A4' },
    { time: 4, note: 'B4' }, { time: 6, note: 'F#4' },
    { time: 8, note: 'G4' }, { time: 10, note: 'D4' },
    { time: 12, note: 'A4' }, { time: 14, note: 'B4' },
    { time: 16, note: 'A4' }, { time: 18, note: 'G4' },
  ]
};

class KaraokeApp {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.mediaConn = null;
        this.role = null;
        this.guestStream = null;
        this.pitchDetector = new PitchDetector();
        this.scorer = new Scorer();
        this.isRecording = false;
        this.expectedNotes = [];

        this.player = null;
        this.currentVideoId = null;
        this.isPlaying = false;
        this.visualizer = null;
        this.simulatedTime = 0;
        this.ytPlayer = null;

        this.currentPage = 0;
        this.currentQuery = '';
        this.allResults = [];
        this.resultsPerPage = 10;

        this.syncedLyrics = [];
        this.currentLyricIndex = 0;
        this.lyricsSyncInterval = null;

        this.init();
    }

    async init() {
        this.visualizer = new KaraokeVisualizer(document.getElementById('three-container'));
        this.setupEventListeners();
        await this.loadYouTubeAPI();

        const params = new URLSearchParams(window.location.search);
        const peerParam = params.get('peer');
        if (peerParam) {
            this.joinRoom(peerParam);
        }
        this.restoreStateFromURL();
        console.log('Karaoke Night initialized');
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
            document.getElementById('btn-copy-link').textContent = '✅ Copiato!';
            setTimeout(() => { document.getElementById('btn-copy-link').textContent = '📋 Copia'; }, 2000);
        });

        document.getElementById('btn-play').addEventListener('click', () => this.play());
        document.getElementById('btn-pause').addEventListener('click', () => this.pause());
        document.getElementById('btn-stop').addEventListener('click', () => this.stop());
        document.getElementById('btn-toggle-player').addEventListener('click', () => this.togglePlayer());
        document.getElementById('btn-search-original').addEventListener('click', () => this.searchOriginalSong());

        document.getElementById('youtube-volume').addEventListener('input', (e) => this.updateVolume());
        document.getElementById('btn-mic').addEventListener('click', () => this.enableMicrophone());

        document.getElementById('btn-start-singing').addEventListener('click', () => {
            if (this.isRecording) {
                this.sendMessage({ type: 'stop-recording' });
            } else {
                this.sendMessage({ type: 'start-recording' });
            }
        });

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
            if (window.YT && YT.Player) { resolve(); return; }
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            const first = document.getElementsByTagName('script')[0];
            first.parentNode.insertBefore(tag, first);
            window.onYouTubeIframeAPIReady = () => resolve();
        });
    }

    createRoom() {
        const peerId = 'karaoke-' + Math.random().toString(36).substring(2, 8);
        this.peer = new Peer(peerId);
        this.role = 'host';

        this.peer.on('open', (id) => {
            this.roomId = id;
            const baseUrl = window.location.origin + window.location.pathname.replace(/\/+$/, '');
            const inviteLink = `${baseUrl}?peer=${id}`;
            document.getElementById('invite-link').textContent = inviteLink;
            document.getElementById('invite-display').classList.remove('hidden');
            document.getElementById('room-indicator').textContent = `🎤 Host: ${id}`;
            document.getElementById('room-indicator').classList.remove('hidden');
            document.getElementById('btn-create-room').disabled = true;
        });

        this.peer.on('connection', (conn) => {
            this.conn = conn;
            this.conn.on('data', (data) => this.handleMessage(data));
            this.conn.on('open', () => {
                document.getElementById('guest-status').textContent = '📱 Telefono connesso!';
                this.initiateMediaCall();
            });
        });

        this.peer.on('call', (call) => {
            this.mediaConn = call;
            call.answer();
            call.on('stream', (stream) => {
                this.guestStream = stream;
                document.getElementById('guest-status').textContent = '🎤 Audio in arrivo!';
                this.startPitchDetection();
            });
        });

        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
            alert('Errore di connessione: ' + err.message);
        });
    }

    initiateMediaCall() {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then((stream) => {
                const call = this.peer.call(this.roomId, stream);
                this.mediaConn = call;
                call.on('stream', (remoteStream) => {
                    this.guestStream = remoteStream;
                    document.getElementById('guest-status').textContent = '🎤 Audio in ricezione!';
                    this.startPitchDetection();
                });
                stream.getTracks().forEach(t => t.stop());
            })
            .catch((err) => {
                console.log('Host mic not needed, waiting for guest:', err.message);
            });
    }

    joinRoom(peerId) {
        this.peer = new Peer();
        this.role = 'guest';

        this.peer.on('open', () => {
            this.conn = this.peer.connect(peerId);
            this.conn.on('open', () => {
                this.roomId = peerId;
                document.getElementById('room-indicator').textContent = `📱 Ospite: connesso`;
                document.getElementById('room-indicator').classList.remove('hidden');
                this.enterPhoneMode();
            });
            this.conn.on('data', (data) => this.handleMessage(data));
        });

        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
            alert('Impossibile connettersi alla stanza. Verifica l\'ID.');
        });
    }

    sendMessage(data) {
        if (this.conn && this.conn.open) {
            this.conn.send(data);
        }
    }

    handleMessage(data) {
        switch (data.type) {
            case 'song-selected':
                if (this.role === 'guest') {
                    document.getElementById('phone-status').textContent =
                        `🎵 ${data.title} - Preparati a cantare!`;
                }
                break;
            case 'start-recording':
                this.isRecording = true;
                this.scorer.reset();
                if (this.role === 'guest') {
                    document.getElementById('btn-start-singing').classList.add('recording');
                    document.getElementById('btn-start-singing').textContent = '🔴 In Corso...';
                    this.streamMicToHost();
                } else {
                    document.getElementById('pitch-indicator').textContent = '🎤 In registrazione...';
                }
                break;
            case 'stop-recording':
                this.isRecording = false;
                if (this.role === 'guest') {
                    document.getElementById('btn-start-singing').classList.remove('recording');
                    document.getElementById('btn-start-singing').textContent = '🎤 Inizia a Cantare';
                    document.getElementById('phone-status').textContent = '✅ Fatto! Controlla il punteggio!';
                } else {
                    document.getElementById('pitch-indicator').textContent = '⏹ Registrazione ferma';
                }
                break;
        }
    }

    streamMicToHost() {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then((stream) => {
                const call = this.peer.call(this.roomId, stream);
                this.mediaConn = call;
            })
            .catch((err) => {
                alert('Servono i permessi del microfono per cantare!');
                console.error(err);
            });
    }

    startPitchDetection() {
        if (!this.guestStream) return;
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(this.guestStream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        this.visualizer.connectAnalyser(analyser);

        const buffer = new Float32Array(analyser.fftSize);

        const detect = () => {
            if (!this.isRecording) {
                requestAnimationFrame(detect);
                return;
            }
            analyser.getFloatTimeDomainData(buffer);
            const pitch = this.pitchDetector.getPitch(buffer);

            if (pitch && pitch > 80 && pitch < 1200) {
                const noteName = this.scorer.getNoteName(pitch);
                document.getElementById('pitch-indicator').textContent =
                    `🎵 ${noteName} (${Math.round(pitch)} Hz)`;

                const currentTime = this.ytPlayer ? this.ytPlayer.getCurrentTime() : 0;
                const expected = this.findExpectedNote(currentTime);
                if (expected) {
                    const result = this.scorer.scoreNote(pitch, expected.note);
                    if (result) {
                        document.getElementById('score-value').textContent = this.scorer.getAccuracy();
                        const history = document.getElementById('score-history');
                        const entry = document.createElement('span');
                        entry.textContent = expected.note;
                        entry.style.color = result.score >= 70 ? '#00ff88'
                                         : result.score >= 40 ? '#ffbe0b' : '#ff006e';
                        entry.style.margin = '0 4px';
                        entry.style.fontWeight = 'bold';
                        history.appendChild(entry);
                    }
                }
            }
            requestAnimationFrame(detect);
        };
        detect();
    }

    findExpectedNote(time) {
        if (!this.expectedNotes || !this.expectedNotes.length) return null;
        let best = null;
        for (const note of this.expectedNotes) {
            if (note.time <= time) best = note;
            else break;
        }
        return best;
    }

    enterPhoneMode() {
        document.getElementById('phone-ui').classList.remove('hidden');
        document.getElementById('room-section').classList.add('hidden');
        document.getElementById('search-container').classList.add('hidden');
        document.getElementById('scoring-container').classList.add('hidden');
        document.getElementById('player-container').classList.add('hidden');
        document.getElementById('lyrics-container').classList.add('hidden');
    }

    leaveRoom() {
        if (this.conn) this.conn.close();
        if (this.peer) this.peer.destroy();
        this.role = null;
        this.roomId = null;
        document.getElementById('invite-display').classList.add('hidden');
        document.getElementById('room-indicator').classList.add('hidden');
        document.getElementById('btn-create-room').disabled = false;
        document.getElementById('phone-ui').classList.add('hidden');
        document.getElementById('room-section').classList.remove('hidden');
        document.getElementById('search-container').classList.remove('hidden');
        document.getElementById('guest-status').textContent = 'In attesa di connessione...';
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
                await new Promise(r => setTimeout(r, 500));
                results = DEMO_SEARCH_RESULTS.filter(r =>
                    r.snippet.title.toLowerCase().includes(query.toLowerCase()) ||
                    r.snippet.channelTitle.toLowerCase().includes(query.toLowerCase())
                );
                if (!results.length) results = DEMO_SEARCH_RESULTS;
            } else {
                const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${
                    encodeURIComponent(karaokeQuery)}&type=video&maxResults=10&key=${YOUTUBE_API_KEY}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error('API error');
                const data = await res.json();
                results = data.items || [];
            }
            this.allResults = results;
            this.displayResultsPage();
            history.pushState({ page: 'search-results', query: karaokeQuery }, '',
                `?search=${encodeURIComponent(karaokeQuery)}`);
        } catch (error) {
            console.error('Search error:', error);
            await new Promise(r => setTimeout(r, 500));
            let results = DEMO_SEARCH_RESULTS.filter(r =>
                r.snippet.title.toLowerCase().includes(query.toLowerCase()) ||
                r.snippet.channelTitle.toLowerCase().includes(query.toLowerCase())
            );
            if (!results.length) results = DEMO_SEARCH_RESULTS;
            this.allResults = results;
            this.displayResultsPage();
            history.pushState({ page: 'search-results', query: karaokeQuery }, '',
                `?search=${encodeURIComponent(karaokeQuery)}`);
        }
    }

    displayResultsPage() {
        const container = document.getElementById('results-container');
        container.innerHTML = '';
        container.classList.remove('hidden');

        const start = this.currentPage * this.resultsPerPage;
        const end = start + this.resultsPerPage;
        const page = this.allResults.slice(start, end);

        if (!page.length) {
            container.innerHTML = '<p class="no-results">Nessun altro risultato.</p>';
            return;
        }

        page.forEach(video => {
            const div = document.createElement('div');
            div.className = 'result-item';
            div.innerHTML = `
                <img src="${video.snippet.thumbnails.default.url}" alt="">
                <div class="result-info">
                    <h3>${video.snippet.title}</h3>
                    <p>${video.snippet.channelTitle}</p>
                </div>`;
            div.addEventListener('click', () =>
                this.selectVideo(video.id.videoId, video.snippet.title, video.snippet.channelTitle));
            container.appendChild(div);
        });

        const total = Math.ceil(this.allResults.length / this.resultsPerPage);
        if (total > 1) {
            const pag = document.createElement('div');
            pag.className = 'pagination-container';
            if (this.currentPage > 0) {
                const b = document.createElement('button');
                b.className = 'pagination-btn';
                b.textContent = '← Precedente';
                b.addEventListener('click', () => { this.currentPage--; this.displayResultsPage(); });
                pag.appendChild(b);
            }
            const info = document.createElement('span');
            info.className = 'page-info';
            info.textContent = `Pagina ${this.currentPage + 1} di ${total}`;
            pag.appendChild(info);
            if (this.currentPage < total - 1) {
                const b = document.createElement('button');
                b.className = 'pagination-btn';
                b.textContent = 'Successivo →';
                b.addEventListener('click', () => { this.currentPage++; this.displayResultsPage(); });
                pag.appendChild(b);
            }
            container.appendChild(pag);
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

        this.initPlayer(videoId);
        this.loadLyrics(title, artist);
        this.expectedNotes = EXPECTED_NOTES[videoId] || [];

        if (this.role === 'host' && this.conn && this.conn.open) {
            this.sendMessage({ type: 'song-selected', videoId, title, artist });
        }

        history.pushState({ page: 'player', videoId, title, artist }, '',
            `?play=${videoId}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`);
    }

    initPlayer(videoId) {
        const container = document.getElementById('video-player');
        if (this.ytPlayer) {
            this.ytPlayer.loadVideoById(videoId);
        } else {
            this.ytPlayer = new YT.Player('video-player', {
                height: 390,
                width: 640,
                videoId: videoId,
                playerVars: {
                    playsinline: 1, controls: 1, modestbranding: 1, rel: 0, fs: 1
                },
                events: {
                    onReady: () => { this.ytPlayer.setVolume(100); },
                    onStateChange: (e) => this.onPlayerStateChange(e),
                    onError: (e) => this.onPlayerError(e)
                }
            });
        }
    }

    onPlayerStateChange(event) {
        if (event.data === YT.PlayerState.PLAYING) {
            this.isPlaying = true;
            this.animateVisualizer();
            if (this.syncedLyrics.length > 0) this.startLyricsSync();
        } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
            this.isPlaying = false;
            if (this.lyricsSyncInterval) {
                clearInterval(this.lyricsSyncInterval);
                this.lyricsSyncInterval = null;
            }
        }
    }

    onPlayerError(event) {
        console.error('YouTube error:', event.data);
    }

    updateVolume() {
        const val = document.getElementById('youtube-volume').value;
        document.getElementById('youtube-value').textContent = val + '%';
        if (this.ytPlayer) this.ytPlayer.setVolume(parseInt(val));
    }

    play() { if (this.ytPlayer) this.ytPlayer.playVideo(); }
    pause() { if (this.ytPlayer) this.ytPlayer.pauseVideo(); }
    stop() { if (this.ytPlayer) this.ytPlayer.stopVideo(); }

    togglePlayer() {
        const c = document.getElementById('player-content');
        const b = document.getElementById('btn-toggle-player');
        c.classList.toggle('collapsed');
        b.textContent = c.classList.contains('collapsed') ? '🎥' : '🎬';
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
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const src = ctx.createMediaStreamSource(stream);
            const a = ctx.createAnalyser();
            a.fftSize = 128;
            src.connect(a);
            this.visualizer.analyser = a;
            this.visualizer.frequencyData = new Uint8Array(a.frequencyBinCount);
            this.visualizer.isAudioConnected = true;
        } catch (e) {
            console.log('Mic error:', e.message);
        }
    }

    // Lyrics methods
    async loadLyrics(songTitle, artist = '') {
        const container = document.getElementById('lyrics-container');
        const display = document.getElementById('lyrics-display');
        display.innerHTML = `<div class="lyrics-placeholder"><h3>🎵 Testi</h3><p class="loading">Caricamento...</p></div>`;
        container.classList.remove('hidden');

        try {
            let lyrics = null;
            const ca = this.cleanArtistName(artist);
            const ct = this.cleanSongTitle(songTitle);

            if (!lyrics && ca && ct) {
                const r = await this.fetchSyncedLyrics(ca, ct);
                if (r) { lyrics = r.lyrics; this.syncedLyrics = r.lines || []; }
            }
            if (!lyrics && ca && ct) lyrics = await this.fetchFromLyricsOvh(ca, ct);
            if (!lyrics && ct) lyrics = await this.fetchFromLyricsOvh('', ct);
            if (!lyrics) {
                for (const v of this.getTitleVariants(ct)) {
                    lyrics = await this.fetchFromLyricsOvh(ca, v);
                    if (lyrics) break;
                }
            }
            if (lyrics) this.displayLyrics(lyrics);
            else this.showLyricsNotFound(songTitle);
        } catch (e) {
            console.error('Lyrics error:', e);
            this.showLyricsNotFound(songTitle);
        }
    }

    cleanArtistName(a) {
        return a ? a.split(' - ')[0].split(' ft. ')[0].split(' feat. ')[0].split(' with ')[0].split(' & ')[0].trim() : '';
    }

    cleanSongTitle(t) {
        if (!t) return '';
        return t.replace(/\(?karaoke\)?/gi, '').replace(/\(?karaoke\s*version\)?/gi, '')
            .replace(/\(?karaoke\s*track\)?/gi, '').replace(/\(instrumental\)/gi, '')
            .replace(/\(sing\s*along\)/gi, '').replace(/\(lyrics?\)/gi, '')
            .replace(/\(with\s*lyrics?\)/gi, '').replace(/\(official\s*(music\s*)?video\)/gi, '')
            .replace(/\(official\s*(audio|lyric(s)?)\)/gi, '').replace(/\(lyric(s)?\s*video\)/gi, '')
            .replace(/\(feat\..*?\)/gi, '').replace(/\(ft\..*?\)/gi, '')
            .split(' - ').pop().replace(/\s+/g, ' ').trim();
    }

    getTitleVariants(t) {
        const v = [t];
        const c = t.replace(/\s*\(.*?\)\s*/g, '').replace(/\s*-\s*.*$/g, '').trim();
        if (c && c !== t) v.push(c);
        if (t.startsWith('The ')) v.push(t.substring(4));
        const w = t.split(' ');
        if (w.length > 3) { v.push(w.slice(0, 3).join(' ')); v.push(w.slice(0, 4).join(' ')); }
        return [...new Set(v.filter(x => x.length > 0))];
    }

    async fetchSyncedLyrics(artist, title) {
        if (!title) return null;
        try {
            let url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
            let res = await fetch(url);
            let data = res.ok ? await res.json() : [];
            if (!data || !data.length) {
                url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}`;
                res = await fetch(url);
                data = res.ok ? await res.json() : [];
            }
            if (data && data.length) {
                for (const t of data) {
                    if (t.syncedLyrics) return { lyrics: t.plainLyrics || t.name, lines: this.parseLRC(t.syncedLyrics) };
                }
                if (data[0].plainLyrics) return { lyrics: data[0].plainLyrics, lines: [] };
            }
        } catch (e) { console.log('LrcLib failed:', e.message); }
        return null;
    }

    parseLRC(text) {
        const lines = [];
        const patterns = [
            /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/,
            /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*$/,
            /\[(\d{2}):(\d{2}):(\d{2,3})\]\s*(.*)/,
        ];
        for (const line of text.split('\n')) {
            const t = line.trim();
            if (!t || t.startsWith('[by:') || t.startsWith('[ar:') ||
                t.startsWith('[ti:') || t.startsWith('[al:') || t.startsWith('[offset:')) continue;
            let m = null;
            for (const p of patterns) { m = p.exec(t); if (m) break; }
            if (m) {
                const time = parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3].padEnd(3, '0')) / 1000;
                const text = m[4] ? m[4].trim() : '';
                if (text) lines.push({ time, text });
            }
        }
        return lines;
    }

    startLyricsSync() {
        if (!this.ytPlayer || !this.syncedLyrics || !this.syncedLyrics.length) return;
        this.currentLyricIndex = 0;
        if (this.lyricsSyncInterval) clearInterval(this.lyricsSyncInterval);
        this.lyricsSyncInterval = setInterval(() => this.updateSyncedLyrics(), 100);
    }

    updateSyncedLyrics() {
        if (!this.ytPlayer || !this.syncedLyrics || !this.syncedLyrics.length) return;
        const t = this.ytPlayer.getCurrentTime();
        let idx = 0;
        for (let i = 0; i < this.syncedLyrics.length; i++) {
            if (t >= this.syncedLyrics[i].time) idx = i;
            else break;
        }
        if (idx !== this.currentLyricIndex) {
            this.currentLyricIndex = idx;
            this.highlightCurrentLyric(idx);
        }
    }

    highlightCurrentLyric(idx) {
        document.querySelectorAll('.lyric-line').forEach((line, i) => {
            line.classList.toggle('active', i === idx);
            if (i === idx) {
                const c = document.querySelector('.demo-lyrics');
                if (c) c.scrollTo({ top: line.offsetTop - c.clientHeight / 2, behavior: 'smooth' });
            }
        });
    }

    async fetchFromLyricsOvh(artist, title) {
        if (!title) return null;
        try {
            const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
            const res = await fetch(url);
            if (!res.ok) return null;
            const d = await res.json();
            return d.lyrics && d.lyrics.trim() ? this.cleanLyricsText(d.lyrics) : null;
        } catch { return null; }
    }

    cleanLyricsText(t) {
        return t.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    displayLyrics(lyricsText) {
        const d = document.getElementById('lyrics-display');
        if (this.syncedLyrics.length > 0) {
            d.innerHTML = `<h3>🎵 Testi Sincronizzati</h3><div class="demo-lyrics synced">${
                this.syncedLyrics.map((l, i) =>
                    `<p class="lyric-line ${i === 0 ? 'active' : ''}">${this.escapeHtml(l.text)}</p>`
                ).join('')
            }</div>`;
            this.startLyricsSync();
        } else {
            const lines = lyricsText.split('\n').map(l => l.trim()).filter(l => l);
            d.innerHTML = `<h3>🎵 Testi</h3><div class="demo-lyrics">${
                lines.map((l, i) =>
                    `<p class="lyric-line ${i === 0 ? 'active' : ''}">${this.escapeHtml(l)}</p>`
                ).join('')
            }</div>`;
            this.animateLyrics();
        }
    }

    showLyricsNotFound(songTitle) {
        document.getElementById('lyrics-display').innerHTML = `
            <div class="lyrics-placeholder">
                <h3>🎵 Testi</h3>
                <p>Testi non disponibili per questa canzone.</p>
                <div class="demo-lyrics">
                    <p class="lyric-line active">🎤 ${this.escapeHtml(songTitle)}</p>
                    <p class="lyric-line">🎵 Canta col cuore!</p>
                    <p class="lyric-line">✨ Lascia che il ritmo ti guidi</p>
                </div>
            </div>`;
        this.animateLyrics();
    }

    escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

    showSearchResults() {
        ['player-container', 'scoring-container', 'lyrics-container'].forEach(id =>
            document.getElementById(id).classList.add('hidden'));
        document.getElementById('results-container').classList.remove('hidden');
        this.stop();
        this.isPlaying = false;
        this.stopLyricsSync();
    }

    hidePlayerAndLyrics() {
        ['player-container', 'scoring-container', 'lyrics-container', 'results-container'].forEach(id =>
            document.getElementById(id).classList.add('hidden'));
        this.stop();
        this.isPlaying = false;
        this.stopLyricsSync();
    }

    goHome() {
        this.hidePlayerAndLyrics();
        document.getElementById('search-input').value = '';
        this.allResults = [];
        this.syncedLyrics = [];
        history.pushState({ page: 'home' }, '', window.location.pathname);
    }

    searchOriginalSong() {
        const title = document.getElementById('song-title').textContent;
        const artist = document.getElementById('song-artist').textContent;
        if (!title) return;
        document.getElementById('search-input').value = `${this.cleanArtistName(artist)} - ${this.cleanSongTitle(title)}`;
        const toggle = document.getElementById('karaoke-mode');
        const was = toggle.checked;
        toggle.checked = false;
        this.search(`${this.cleanArtistName(artist)} - ${this.cleanSongTitle(title)}`, false).then(() => toggle.checked = was);
    }

    animateLyrics() {
        const lines = document.querySelectorAll('.lyric-line');
        let i = 0;
        setInterval(() => {
            lines.forEach(l => l.classList.remove('active'));
            i = (i + 1) % lines.length;
            lines[i].classList.add('active');
        }, 3000);
    }

    stopLyricsSync() {
        if (this.lyricsSyncInterval) {
            clearInterval(this.lyricsSyncInterval);
            this.lyricsSyncInterval = null;
        }
    }

    restoreStateFromURL() {
        const params = new URLSearchParams(window.location.search);
        const q = params.get('search');
        const p = params.get('play');
        if (p) this.selectVideo(p, params.get('title') || 'Unknown', params.get('artist') || 'Unknown');
        else if (q) {
            document.getElementById('search-input').value = q.replace(' karaoke', '');
            this.search(q.replace(' karaoke', ''), false);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => { window.karaokeApp = new KaraokeApp(); });
