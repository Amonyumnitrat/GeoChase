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
// Key: socket.id, Value: { lat, lng, heading, color, roomId, username, role }
const players = new Map();

// ODA STATE
// Key: roomId, Value: { narratorId, startTime, endTime, narratorLocation, isEnding }
const rooms = new Map();

// Helper: Rastgele Konum (Belirli bir merkezden radius kadar uzakta)
function getRandomLocation(centerLat, centerLng, radiusInMeters) {
  const r = radiusInMeters / 111300; // Metreyi dereceye çevir (kabaca)
  const u = Math.random();
  const v = Math.random();
  const w = r * Math.sqrt(u);
  const t = 2 * Math.PI * v;
  const x = w * Math.cos(t);
  const y = w * Math.sin(t);

  const newLat = centerLat + x;
  const newLng = centerLng + y / Math.cos(centerLat * Math.PI / 180); // Boylam düzeltmesi

  return { lat: newLat, lng: newLng };
}

io.on('connection', (socket) => {
  console.log('✅ Oyuncu bağlandı:', socket.id);

  // 1. Renk Ata
  const myColor = assignUniqueColor();

  // Oyuncuyu kaydet
  players.set(socket.id, {
    color: myColor,
    lat: 0, lng: 0, heading: 0,
    roomId: null,
    username: '',
    role: 'seeker' // Varsayılan
  });

  // 2. Oyuncuya kendi rengini bildir
  socket.emit('init-data', { id: socket.id, color: myColor });

  // 3. JOIN ROOM
  socket.on('join-room', ({ roomId, username }) => {
    const player = players.get(socket.id);
    if (!player) return;

    player.roomId = roomId;
    player.username = username;

    socket.join(roomId);
    console.log(`✅ ${username} odaya girdi: ${roomId}`);

    // ODADAKİ DİĞERLERİNE BİLDİR
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
      .filter(([id, p]) => p.roomId === roomId && id !== socket.id)
      .map(([id, data]) => ({ playerId: id, ...data }));

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
  socket.on('start-game', ({ roomId, narratorLocation }) => {
    try {
      console.log(`🎮 [SERVER] Oyun başlatma isteği geldi. Oda: ${roomId}`);
      console.log(`📍 [SERVER] Narrator Konumu:`, narratorLocation);

      const roomPlayers = Array.from(players.entries()).filter(([id, p]) => p.roomId === roomId);
      console.log(`👥 [SERVER] Odadaki oyuncu sayısı: ${roomPlayers.length}`);

      if (roomPlayers.length === 0) {
        console.warn(`⚠️ [SERVER] Odada kimse yok, başlatılamadı!`);
        return;
      }

      // A. Rol Dağıtımı (Rastgele 1 Anlatıcı)
      const narratorIndex = Math.floor(Math.random() * roomPlayers.length);
      const narratorId = roomPlayers[narratorIndex][0]; // [id, data]
      console.log(`🎲 [SERVER] Anlatıcı seçildi: ${narratorId}`);

      // B. Spawn Noktaları
      const initialPositions = {};

      roomPlayers.forEach(([id, p]) => {
        if (id === narratorId) {
          p.role = 'narrator';
          p.lat = narratorLocation.lat;
          p.lng = narratorLocation.lng;
        } else {
          p.role = 'seeker';
          const spawn = getRandomLocation(narratorLocation.lat, narratorLocation.lng, 100);
          p.lat = spawn.lat;
          p.lng = spawn.lng;
        }
        initialPositions[id] = { lat: p.lat, lng: p.lng, role: p.role };
      });

      console.log(`✅ [SERVER] Roller ve Konumlar hazırlandı.`);

      // C. Oda Durumu
      const startTime = Date.now();
      const endTime = startTime + (5 * 60 * 1000); // 5 Dakika

      rooms.set(roomId, {
        narratorId,
        startTime,
        endTime,
        narratorLocation,
        isEnding: false
      });

      // D. Başlangıç Verisini Gönder
      console.log(`🚀 [SERVER] 'game-started' eventi gönderiliyor...`);
      io.to(roomId).emit('game-started', {
        narratorId,
        endTime,
        initialPositions
      });
      console.log(`📡 [SERVER] Event gönderildi.`);

    } catch (error) {
      console.error(`❌ [SERVER HATA] start-game içinde hata:`, error);
    }
  });

  // 6. Anlatıcı Bulundu (Win Condition)
  socket.on('found-narrator', ({ roomId, finderId }) => {
    const room = rooms.get(roomId);
    if (!room || room.isEnding) return;

    // 30 saniye sonra bitecek şekilde güncelle
    // Eğer zaten 30sn'den az kaldıysa değiştirme
    const now = Date.now();
    const remaining = room.endTime - now;

    if (remaining > 0) { // Sadece oyun devam ediyorsa
      room.endTime = now; // Hemen bitir
      room.isEnding = true;

      // PUAN HESAPLAMA
      const scores = [];
      const roomPlayers = Array.from(players.entries()).filter(([id, p]) => p.roomId === roomId);

      roomPlayers.forEach(([id, p]) => {
        let score = 0;
        if (id === finderId) score += 100; // Bulan kişi
        if (p.role === 'seeker' && id !== finderId) score += 50; // Diğer arayıcılar (Katılım)
        if (p.role === 'narrator') score += 10; // Yakalanan anlatıcı (Teselli)

        p.totalScore = (p.totalScore || 0) + score;
        scores.push({ username: p.username, score: p.totalScore, role: p.role, isWinner: id === finderId });
      });

      // Skorlara göre sırala
      scores.sort((a, b) => b.score - a.score);

      // Herkese Game Over Bildir
      io.to(roomId).emit('game-over', {
        reason: 'narrator_found',
        finderId,
        scores
      });
      console.log(`🏁 [SERVER] Oyun Bitti (Bulundu): ${roomId}`);
    }
  });

  // 8. Süre Doldu (Server Kontrolü veya Client Tetiklemesi)
  // Basitlik için Client'lardan biri "time-up" atarsa bitirelim veya server interval kuralım.
  // Server-side robust timer tercih edilir ama şimdilik client-side time-up'a güvenelim (prototype)
  socket.on('time-up', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.isEnding) return;

    room.isEnding = true;
    room.endTime = Date.now();

    // PUAN HESAPLAMA (Anlatıcı Kazanır)
    const scores = [];
    const roomPlayers = Array.from(players.entries()).filter(([id, p]) => p.roomId === roomId);

    roomPlayers.forEach(([id, p]) => {
      let score = 0;
      if (p.role === 'narrator') score += 200; // Kaçan anlatıcı (Büyük ödül)
      if (p.role === 'seeker') score += 10; // Kaybeden arayıcılar

      p.totalScore = (p.totalScore || 0) + score;
      scores.push({ username: p.username, score: p.totalScore, role: p.role, isWinner: p.role === 'narrator' });
    });
    scores.sort((a, b) => b.score - a.score);

    io.to(roomId).emit('game-over', {
      reason: 'time_up',
      scores
    });
    console.log(`🏁 [SERVER] Oyun Bitti (Süre Doldu): ${roomId}`);
  });

  // 9. Yeni Tur
  socket.on('next-round', ({ roomId }) => {
    console.log(`🔄 [SERVER] Yeni Tur İsteği: ${roomId}`);
    // Sadece odaya reset sinyali yolla, UI'ı waiting'e çeksinler
    // Sonra host zaten start-game atacak
    io.to(roomId).emit('reset-game-ui');
  });

  // 7. Ayrılma
  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      const { roomId, color } = player;
      usedColors.delete(color);
      players.delete(socket.id);

      if (roomId) {
        socket.to(roomId).emit('player-disconnected', socket.id);

        // Eğer anlatıcı çıktıysa oyunu bitir? (Şimdilik basit tutalım)
      }
    }
    console.log('❌ Ayrıldı:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;

// React SPA Yönlendirmesi (En sonda olmalı, her şeyi karşılar)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

server.listen(PORT, () => {
  console.log(`🚀 Server çalışıyor: http://localhost:${PORT}`);
});
