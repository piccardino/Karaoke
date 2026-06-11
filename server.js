const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const roomManager = require('./services/roomManager');
const audioCache = require('./services/audioCache');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/audio/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    let filePath;
    try {
      filePath = await audioCache.downloadAudio(videoId);
    } catch (err) {
      console.error('Audio download error:', err.message);
      // Fallback to placeholder audio
      filePath = path.join(__dirname, 'cache', '_placeholder.mp3');
      if (!fs.existsSync(filePath)) {
        // Generate a simple silent MP3 placeholder
        const silentBuffer = Buffer.alloc(1024);
        silentBuffer.write('ID3', 0, 3, 'ascii');
        silentBuffer[3] = 3; silentBuffer[4] = 0;
        fs.writeFileSync(filePath, silentBuffer);
      }
    }
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400'
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('Audio serve error:', err.message);
    res.status(500).json({ error: 'Failed to serve audio' });
  }
});

const SONG_NOTES = {
  'dQw4w9WgXcQ': [ // Never Gonna Give You Up
    { time: 0, note: 'D4' }, { time: 2, note: 'A4' },
    { time: 4, note: 'B4' }, { time: 6, note: 'F#4' },
    { time: 8, note: 'G4' }, { time: 10, note: 'D4' },
    { time: 12, note: 'A4' }, { time: 14, note: 'B4' },
    { time: 16, note: 'A4' }, { time: 18, note: 'G4' },
  ]
};

app.get('/api/notes/:videoId', (req, res) => {
  const notes = SONG_NOTES[req.params.videoId] || [];
  res.json({ notes });
});

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('create-room', () => {
    const roomId = roomManager.createRoom(socket.id);
    socket.join(roomId);
    socket.emit('room-created', { roomId, inviteLink: `${socket.handshake.headers.origin || ''}/?room=${roomId}` });
    console.log(`Room created: ${roomId} by ${socket.id}`);
  });

  socket.on('join-room', (roomId) => {
    const room = roomManager.joinRoom(roomId, socket.id);
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    socket.join(roomId);
    socket.emit('room-joined', { roomId, role: 'guest' });
    io.to(room.host).emit('guest-joined', { guestId: socket.id });
    console.log(`Guest ${socket.id} joined room ${roomId}`);
  });

  socket.on('set-song', ({ roomId, videoId, title, artist }) => {
    const room = roomManager.getRoom(roomId);
    if (room && room.host === socket.id) {
      roomManager.setSong(roomId, { videoId, title, artist });
      io.to(roomId).emit('song-selected', { videoId, title, artist });
    }
  });

  socket.on('start-recording', (roomId) => {
    const room = roomManager.getRoom(roomId);
    if (room) {
      io.to(roomId).emit('recording-started');
    }
  });

  socket.on('stop-recording', (roomId) => {
    const room = roomManager.getRoom(roomId);
    if (room) {
      io.to(roomId).emit('recording-stopped');
    }
  });

  // WebRTC signaling
  socket.on('webrtc-offer', ({ roomId, offer }) => {
    const room = roomManager.getRoom(roomId);
    if (room && room.host) {
      socket.broadcast.to(room.host).emit('webrtc-offer', { offer, from: socket.id });
    }
  });

  socket.on('webrtc-answer', ({ roomId, answer }) => {
    const room = roomManager.getRoom(roomId);
    if (room) {
      // Guest sends answer, route to host
      if (socket.id !== room.host) {
        io.to(room.host).emit('webrtc-answer', { answer, from: socket.id });
      } else {
        // Host sends answer, route to guest
        const guest = room.guests[room.guests.length - 1];
        if (guest) io.to(guest).emit('webrtc-answer', { answer, from: socket.id });
      }
    }
  });

  socket.on('webrtc-ice', ({ roomId, candidate }) => {
    const room = roomManager.getRoom(roomId);
    if (room) {
      if (socket.id === room.host && room.guests.length > 0) {
        io.to(room.guests[room.guests.length - 1]).emit('webrtc-ice', { candidate, from: socket.id });
      } else {
        io.to(room.host).emit('webrtc-ice', { candidate, from: socket.id });
      }
    }
  });

  socket.on('disconnect', () => {
    const result = roomManager.removeSocket(socket.id);
    if (result) {
      io.to(result.roomId).emit(result.role === 'host' ? 'host-disconnected' : 'guest-disconnected', { socketId: socket.id });
      console.log(`Socket ${socket.id} removed from room ${result.roomId}`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Karaoke Night server running on http://localhost:${PORT}`);
  audioCache.cleanCache();
});
