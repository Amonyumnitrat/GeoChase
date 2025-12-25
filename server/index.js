const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const cors = require('cors');
require('dotenv').config();

app.use(cors());

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// RENK YÖNETİMİ
const NEON_COLORS = ['#00ff88', '#00ffff', '#ff00ff', '#ff8800', '#ffff00', '#ff0055', '#8800ff', '#0088ff'];
const usedColors = new Set();

function assignUniqueColor() {
  // Kullanılmayan renkleri bul
  const available = NEON_COLORS.filter(c => !usedColors.has(c));
  // Eğer hepsi doluysa mecburen rastgele birini, değilse boşlardan birini seç
  const color = available.length > 0
    ? available[Math.floor(Math.random() * available.length)]
    : NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)];

  usedColors.add(color);
  return color;
}

// OYUNCU STATE
// Key: socket.id, Value: { lat, lng, heading, color }
const players = new Map();

io.on('connection', (socket) => {
  console.log('✅ Oyuncu bağlandı:', socket.id);

  // 1. Renk Ata
  const myColor = assignUniqueColor();

  // Oyuncuyu kaydet (Başlangıçta konumu null olabilir veya varsayılan)
  players.set(socket.id, {
    color: myColor,
    lat: 0, lng: 0, heading: 0,
    roomId: null, // Odaya sonra katılacak
    username: ''
  });

  // 2. Oyuncuya kendi rengini bildir (Hemen)
  socket.emit('init-data', { id: socket.id, color: myColor });

  // 3. JOIN ROOM
  socket.on('join-room', ({ roomId, username }) => {
    const player = players.get(socket.id);
    if (!player) return;

    player.roomId = roomId;
    player.username = username;

    socket.join(roomId);
    console.log(`✅ ${username} odaya girdi: ${roomId}`);

    // ODADAKİ DİĞERLERİNE BİLDİR (Broadcast)
    socket.to(roomId).emit('player-joined', {
      playerId: socket.id,
      username: player.username,
      color: player.color,
      lat: player.lat,
      lng: player.lng,
      heading: player.heading
    });

    // YENİ GELENE MEVCUT LİSTEYİ GÖNDER
    const roomPlayers = Array.from(players.entries())
      .filter(([id, p]) => p.roomId === roomId && id !== socket.id) // Kendisi hariç diğerleri
      .map(([id, data]) => ({
        playerId: id,
        ...data
      }));

    socket.emit('current-players', roomPlayers);
  });

  // 4. Konum Güncelleme
  socket.on('update-position', (data) => {
    const player = players.get(socket.id);
    if (player && player.roomId) {
      player.lat = data.lat;
      player.lng = data.lng;
      player.heading = data.heading;

      // Sadece odaya yayın yap
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

  // 5. Oyunu Başlat
  socket.on('start-game', (roomId) => {
    console.log(`🎮 Oyun başlatılıyor: ${roomId}`);
    io.to(roomId).emit('game-started');
  });

  // 6. Ayrılma
  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      const { roomId, color } = player;
      usedColors.delete(color);
      players.delete(socket.id);

      if (roomId) {
        socket.to(roomId).emit('player-disconnected', socket.id);
        broadcastRoomPlayers(roomId); // Biri çıkınca da listeyi tazele
      }
    }
    console.log('❌ Ayrıldı:', socket.id);
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server çalışıyor: http://localhost:${PORT}`);
});
