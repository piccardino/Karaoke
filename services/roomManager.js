const { v4: uuidv4 } = require('uuid');

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(hostSocketId) {
    const roomId = uuidv4().slice(0, 8);
    this.rooms.set(roomId, {
      id: roomId,
      host: hostSocketId,
      guests: [],
      currentSong: null,
      state: 'waiting'
    });
    return roomId;
  }

  joinRoom(roomId, guestSocketId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.guests.push(guestSocketId);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  getRoomBySocket(socketId) {
    for (const room of this.rooms.values()) {
      if (room.host === socketId || room.guests.includes(socketId)) {
        return room;
      }
    }
    return null;
  }

  removeSocket(socketId) {
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.host === socketId) {
        this.rooms.delete(roomId);
        return { roomId, role: 'host' };
      }
      const idx = room.guests.indexOf(socketId);
      if (idx !== -1) {
        room.guests.splice(idx, 1);
        return { roomId, role: 'guest' };
      }
    }
    return null;
  }

  setSong(roomId, song) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.currentSong = song;
    }
  }
}

module.exports = new RoomManager();
