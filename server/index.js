const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const cors = require('cors');
require('dotenv').config();

app.use(cors());

const path = require('path');
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// React Build Dosyalarını Servis Et
app.use(express.static(path.join(__dirname, '../client/dist')));

// RENK YÖNETİMİ
const NEON_COLORS = ['#00ff88', '#00ffff', '#ff00ff', '#ff8800', '#ffff00', '#ff0055', '#8800ff', '#0088ff'];
const usedColors = new Set();

function assignUniqueColor() {
  const available = NEON_COLORS.filter(c => !usedColors.has(c));
  const color = available.length > 0
    ? available[Math.floor(Math.random() * available.length)]
    : NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)];
  usedColors.add(color);
  return color;
}

// OYUNCU STATE
// Key: socket.id, Value: { lat, lng, heading, color, roomId, username, role, totalScore }
const players = new Map();

// ODA STATE
const rooms = new Map();

// Helper: Mesafe Hesaplama
function getDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 999999;
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper: Rastgele Konum
function getRandomLocation(centerLat, centerLng, minRadius, maxRadius) {
  const minR = minRadius / 111300;
  const maxR = maxRadius / 111300;
  const r = Math.sqrt(Math.random() * (maxR * maxR - minR * minR) + (minR * minR));
  const v = Math.random();
  const t = 2 * Math.PI * v;
  const dx = r * Math.cos(t);
  const dy = r * Math.sin(t);
  return {
    lat: centerLat + dx,
    lng: centerLng + dy / Math.cos(centerLat * Math.PI / 180)
  };
}

// Helper: Round bitişini işle
function handleRoundEnd(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.active) return;

  const scores = [];
  const roomPlayers = Array.from(players.entries()).filter(([id, p]) => p.roomId === roomId);
  let reason = room.isEnding ? 'narrator_found' : 'time_up';

  const narratorLoc = room.narratorLocation;
  const finders = room.finders || new Set();

  roomPlayers.forEach(([id, p]) => {
    let score = 0;
    if (p.role === 'narrator') {
      // Anlatıcı puanı: Bulunan kişi sayısına göre
      score = 50 + (finders.size * 25);
    } else if (p.role === 'seeker') {
      if (finders.has(id)) {
        // Bulanlar sabit yüksek puan alır
        score = (id === room.firstFinderId) ? 150 : 100;
      } else {
        // Bulamayanlar mesafeye göre puan alır (max 100)
        const dist = getDistance(p.lat, p.lng, narratorLoc.lat, narratorLoc.lng);
        score = Math.floor(Math.max(0, 100 - (dist / 10)));
      }
    }
    p.totalScore = (p.totalScore || 0) + score;
    scores.push({
      username: p.username,
      score: p.totalScore,
      role: p.role,
      isWinner: finders.has(id)
    });
  });

  scores.sort((a, b) => b.score - a.score);

  // Turu tamamlayan anlatıcıları kontrol et
  const availableCount = roomPlayers.filter(([id, p]) => !room.pastNarrators.includes(id)).length;

  io.to(roomId).emit('game-over', {
    reason,
    scores,
    locationInfo: room.locationInfo,
    narratorLocation: room.narratorLocation, // Uydu görüntüsü için
    isFinalGameEnd: availableCount === 0
  });

  room.active = false;
  room.endRoundVotes = new Set(); // Oyları sıfırla
  room.isEnding = false;
}

io.on('connection', (socket) => {
  console.log('✅ Oyuncu bağlandı:', socket.id);

  const myColor = assignUniqueColor();
  players.set(socket.id, {
    color: myColor,
    lat: 0, lng: 0, heading: 0,
    roomId: null,
    username: '',
    role: 'seeker',
    totalScore: 0
  });

  socket.emit('init-data', { id: socket.id, color: myColor });

  socket.on('join-room', ({ roomId, username, isCreator }) => {
    const player = players.get(socket.id);
    if (!player) return;

    // ODA KONTROLÜ
    if (!rooms.has(roomId) && !isCreator) {
      console.log(`❌ Oda bulunamadı: ${roomId} (İsteyen: ${username})`);
      socket.emit('room-error', { message: 'Oyun kodu bulunamadı.' });
      return;
    }

    player.roomId = roomId;
    player.username = username;

    socket.join(roomId);
    console.log(`✅ ${username} odaya girdi: ${roomId}`);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        pastNarrators: [],
        active: false,
        endRoundVotes: new Set()
      });
    }

    const room = rooms.get(roomId);

    // EĞER OYUN DEVAM EDİYORSA (F5 DURUMU)
    if (room.active) {
      console.log(`⚠️ [SERVER] ${username} odaya katıldı ama oyun aktif! Reconnection gibi davranılıyor.`);
      player.role = 'seeker';
      player.lat = room.narratorLocation.lat + 0.001;
      player.lng = room.narratorLocation.lng + 0.001;

      const initialPositions = {};
      Array.from(players.entries())
        .filter(([id, p]) => p.roomId === roomId)
        .forEach(([id, p]) => {
          initialPositions[id] = { lat: p.lat, lng: p.lng, role: p.role };
        });

      socket.emit('game-started', {
        narratorId: room.narratorId,
        endTime: room.endTime,
        initialPositions,
        spawnDistance: room.spawnDistance || 500
      });
    }

    socket.to(roomId).emit('player-joined', {
      playerId: socket.id,
      username: player.username,
      color: player.color,
      lat: player.lat,
      lng: player.lng,
      heading: player.heading
    });

    const roomPlayers = Array.from(players.entries())
      .filter(([id, p]) => p.roomId === roomId && id !== socket.id)
      .map(([id, data]) => ({ playerId: id, ...data }));

    socket.emit('current-players', roomPlayers);
  });

  socket.on('update-position', (data) => {
    const player = players.get(socket.id);
    if (player && player.roomId) {
      player.lat = data.lat;
      player.lng = data.lng;
      player.heading = data.heading;

      socket.to(player.roomId).emit('player-moved', {
        playerId: socket.id,
        lat: data.lat,
        lng: data.lng,
        heading: data.heading,
        color: player.color,
        username: player.username
      });
    }
  });

  socket.on('start-game', ({ roomId, narratorLocation, locationInfo, spawnDistance }) => {
    try {
      console.log(`🎮 [SERVER] Oyun başlatma isteği geldi. Oda: ${roomId}`);

      const room = rooms.get(roomId);
      if (!room) return;

      const roomPlayers = Array.from(players.entries()).filter(([id, p]) => p.roomId === roomId);
      if (roomPlayers.length < 2) {
        socket.emit('room-error', { message: 'Oyunu başlatmak için en az 2 oyuncu gereklidir.' });
        return;
      }

      // Anlatıcı Seçimi
      const availablePlayers = roomPlayers.filter(([id, p]) => !room.pastNarrators.includes(id));
      let narratorId = availablePlayers.length > 0 ? availablePlayers[Math.floor(Math.random() * availablePlayers.length)][0] : roomPlayers[0][0];

      if (availablePlayers.length === 0) room.pastNarrators = [];
      room.pastNarrators.push(narratorId);

      // Spawn Noktaları
      // DİNAMİK MESAFE: spawnDistance (varsayılan 500)
      const targetDist = spawnDistance || 500;
      const minR = targetDist * 0.9;
      const maxR = targetDist * 1.1;

      const initialPositions = {};
      roomPlayers.forEach(([id, p]) => {
        if (id === narratorId) {
          p.role = 'narrator';
          p.lat = narratorLocation.lat;
          p.lng = narratorLocation.lng;
        } else {
          p.role = 'seeker';
          const spawn = getRandomLocation(narratorLocation.lat, narratorLocation.lng, minR, maxR);
          p.lat = spawn.lat;
          p.lng = spawn.lng;
        }
        initialPositions[id] = { lat: p.lat, lng: p.lng, role: p.role };
      });

      const startTime = Date.now();
      const endTime = startTime + (5 * 60 * 1000);

      room.narratorId = narratorId;
      room.startTime = startTime;
      room.endTime = endTime;
      room.narratorLocation = narratorLocation;
      room.locationInfo = locationInfo;
      room.spawnDistance = targetDist; // Odaya kaydet
      room.isEnding = false;
      room.active = true;
      room.finders = new Set();
      room.endRoundVotes = new Set();

      io.to(roomId).emit('game-started', {
        narratorId,
        endTime,
        initialPositions,
        spawnDistance: targetDist
      });

    } catch (error) {
      console.error(`❌ [SERVER HATA] start-game içinde hata:`, error);
    }
  });

  socket.on('found-narrator', ({ roomId, finderId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.active) return;

    if (!room.finders) room.finders = new Set();
    if (room.finders.has(finderId)) return;

    room.finders.add(finderId);

    if (!room.isEnding) {
      room.endTime = Date.now() + 30000;
      room.isEnding = true;
      room.firstFinderId = finderId;

      io.to(roomId).emit('narrator-found', {
        newEndTime: room.endTime,
        finderId: finderId
      });
    }
  });

  socket.on('vote-end-round', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.active) return;

    if (!room.endRoundVotes) room.endRoundVotes = new Set();
    room.endRoundVotes.add(socket.id);

    io.to(roomId).emit('vote-end-round', {
      votes: Array.from(room.endRoundVotes)
    });

    const totalPlayersInRoom = Array.from(players.values()).filter(p => p.roomId === roomId).length;

    if (room.endRoundVotes.size >= totalPlayersInRoom) {
      console.log(`🗳️ [SERVER] Tüm oyuncular oy verdi, round erken bitiyor: ${roomId}`);
      io.to(roomId).emit('round-ended-early');
      handleRoundEnd(roomId);
    }
  });

  socket.on('time-up', ({ roomId }) => {
    handleRoundEnd(roomId);
  });

  socket.on('next-round', ({ roomId }) => {
    io.to(roomId).emit('reset-game-ui', { isTransitioning: true });
  });

  socket.on('return-to-lobby', ({ roomId }) => {
    console.log(`🏠 [SERVER] Lobiye dönüş isteği: ${roomId}`);
    const room = rooms.get(roomId);
    if (room) {
      // Sadece game state'ini sıfırla, oda bilgilerini koru
      room.active = false;
      room.endRoundVotes = new Set();
      room.isEnding = false;
    }
    // Tüm odaya reset sinyali gönder
    io.to(roomId).emit('reset-game-ui');
  });

  socket.on('change-game-mode', ({ roomId, gameMode }) => {
    console.log(`🎮 [SERVER] Oyun modu değiştirildi: ${roomId} -> ${gameMode}`);
    // Host'un seçtiği modu tüm odaya yayınla
    socket.to(roomId).emit('game-mode-changed', { gameMode });
  });


  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      const { roomId, color } = player;
      usedColors.delete(color);
      players.delete(socket.id);

      if (roomId) {
        socket.to(roomId).emit('player-disconnected', socket.id);

        const room = rooms.get(roomId);
        if (room && room.endRoundVotes) {
          room.endRoundVotes.delete(socket.id);
          // Oyları güncelleyerek diğerlerine bildir
          io.to(roomId).emit('vote-end-round', {
            votes: Array.from(room.endRoundVotes)
          });

          // Eğer bu ayrılma ile herkes oy vermiş durumuna düştüyse (ve oyun aktifse)
          if (room.active) {
            const totalPlayersInRoom = Array.from(players.values()).filter(p => p.roomId === roomId).length;
            if (totalPlayersInRoom > 0 && room.endRoundVotes.size >= totalPlayersInRoom) {
              console.log(`🗳️ [SERVER] Oyuncu ayrıldı, kalan herkes oy vermiş, round bitiyor: ${roomId}`);
              io.to(roomId).emit('round-ended-early');
              handleRoundEnd(roomId);
            }
          }
        }

        const roomPlayers = Array.from(players.values()).filter(p => p.roomId === roomId);
        if (roomPlayers.length === 0) {
          rooms.delete(roomId);
        }
      }
    }
    console.log('❌ Ayrıldı:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

server.listen(PORT, () => {
  console.log(`🚀 Server çalışıyor: http://localhost:${PORT}`);
});
