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

// Helper: Rastgele Konum (Belirli bir halka/ring içinde)
function getRandomLocation(centerLat, centerLng, minRadius, maxRadius) {
  const minR = minRadius / 111300;
  const maxR = maxRadius / 111300;

  // Halka içinde homojen dağılım için karekök formülü
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

    // Odayı ilklendir (Eğer yoksa)
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        pastNarrators: [],
        active: false
      });
    }

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
  socket.on('start-game', ({ roomId, narratorLocation, locationInfo }) => {
    try {
      console.log(`🎮 [SERVER] Oyun başlatma isteği geldi. Oda: ${roomId}`);
      console.log(`📍 [SERVER] Narrator Konumu:`, narratorLocation);
      console.log(`🌍 [SERVER] Konum Bilgisi:`, locationInfo);

      const room = rooms.get(roomId);
      if (!room) return;

      const roomPlayers = Array.from(players.entries()).filter(([id, p]) => p.roomId === roomId);
      console.log(`👥 [SERVER] Odadaki oyuncu sayısı: ${roomPlayers.length}`);

      if (roomPlayers.length === 0) {
        console.warn(`⚠️ [SERVER] Odada kimse yok, başlatılamadı!`);
        return;
      }

      // A. Rol Dağıtımı (Sırayla Anlatıcı Seçimi)
      // Daha önce anlatıcı olmamış oyuncuları bul
      const availablePlayers = roomPlayers.filter(([id, p]) => !room.pastNarrators.includes(id));

      let narratorId;
      if (availablePlayers.length > 0) {
        // Sıradaki ilk uygun oyuncuyu seç
        narratorId = availablePlayers[0][0];
      } else {
        // Eğer herkes anlatıcı olduysa (Yine de bir tur daha istenmişse), sıfırla ve yeniden başla
        // VEYA client tarafında buton gizlenmeli. Biz burada fallback olarak sıfırlayalım.
        room.pastNarrators = [];
        narratorId = roomPlayers[0][0];
      }

      room.pastNarrators.push(narratorId);
      console.log(`🎲 [SERVER] Anlatıcı seçildi: ${narratorId} (Sıradaki)`);

      // B. Spawn Noktaları
      const initialPositions = {};

      roomPlayers.forEach(([id, p]) => {
        if (id === narratorId) {
          p.role = 'narrator';
          p.lat = narratorLocation.lat;
          p.lng = narratorLocation.lng;
        } else {
          p.role = 'seeker';
          const spawn = getRandomLocation(narratorLocation.lat, narratorLocation.lng, 250, 500);
          p.lat = spawn.lat;
          p.lng = spawn.lng;
        }
        initialPositions[id] = { lat: p.lat, lng: p.lng, role: p.role };
      });

      console.log(`✅ [SERVER] Roller ve Konumlar hazırlandı.`);

      // C. Oda Durumu
      const startTime = Date.now();
      const endTime = startTime + (5 * 60 * 1000); // 5 Dakika

      room.narratorId = narratorId;
      room.startTime = startTime;
      room.endTime = endTime;
      room.narratorLocation = narratorLocation;
      room.locationInfo = locationInfo;
      room.isEnding = false;
      room.locationInfo = locationInfo;
      room.isEnding = false;
      room.active = true;
      room.finders = new Set(); // Reset finders list

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
    if (!room) return;

    // Eğer zaten bulunduysa listeye ekle, yoksa yeni başlat
    if (!room.finders) room.finders = new Set();

    // Zaten bulduysa işlem yapma
    if (room.finders.has(finderId)) return;

    room.finders.add(finderId);

    // EĞER İLK BULAN KİŞİYSE -> Sayacı Başlat
    if (!room.isEnding) {
      const now = Date.now();
      room.endTime = now + 30000; // 30 Saniye "Bitiş Penceresi"
      room.isEnding = true;
      room.firstFinderId = finderId; // İlk bulanı kaydet (Bonus için)

      // Herkese duyur (30 saniye başladı)
      io.to(roomId).emit('narrator-found', {
        newEndTime: room.endTime,
        finderId: finderId
      });
      console.log(`🎯 [SERVER] Anlatıcı bulundu! 30sn başladı. Oda: ${roomId} | Bulanlar: ${room.finders.size}`);
    } else {
      console.log(`🎯 [SERVER] Anlatıcı bir kişi daha tarafından bulundu! (${finderId}) Toplam: ${room.finders.size}`);
    }
  });

  // 8. Süre Doldu (Server Kontrolü veya Client Tetiklemesi)
  socket.on('time-up', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    // Eğer zaten bitiş süreci başlatılmadıysa (isEnding false), 
    // bu normal süre bitimidir (Anlatıcı kazanır).
    // Eğer isEnding true ise, narrator-found sonrası 30sn dolmuştur.

    const scores = [];
    const roomPlayers = Array.from(players.entries()).filter(([id, p]) => p.roomId === roomId);
    let reason = 'time_up';
    let winnerId = null;

    // PUANLAMA LOGIC V4 (Multi-Finder & Balanced Narrator)
    const narratorLoc = room.narratorLocation;
    const finders = room.finders || new Set();

    if (room.isEnding && finders.size > 0) {
      // --- SENARYO 1: ANLATICI YAKALANDI ---
      reason = 'narrator_found';
      winnerId = room.firstFinderId; // UI için ilk bulanı göster

      roomPlayers.forEach(([id, p]) => {
        let score = 0;

        // 1. ANLATICI PUANI
        if (p.role === 'narrator') {
          // Formül: 50 + (BulanSayısı * 25)
          score = 50 + (finders.size * 25);
        }
        // 2. ARAYICILAR
        else if (p.role === 'seeker') {
          // A) Bulanlar
          if (finders.has(id)) {
            if (id === room.firstFinderId) {
              score = 150; // İlk bulan (Büyük ödül)
            } else {
              score = 100; // Sonradan bulan (Standart ödül)
            }
          }
          // B) Bulamayanlar
          else {
            const dist = getDistance(p.lat, p.lng, narratorLoc.lat, narratorLoc.lng);
            const distScore = Math.max(0, 100 - (dist / 10)); // Mesafe puanı
            score = Math.floor(distScore);
          }
        }

        p.totalScore = (p.totalScore || 0) + score;
        scores.push({
          username: p.username,
          score: p.totalScore,
          role: p.role,
          isWinner: finders.has(id) // UI'da kazanan olarak işaretle
        });
      });

    } else {
      // --- SENARYO 2: SÜRE BİTTİ (KİMSE BULAMADI) ---
      reason = 'time_up';

      roomPlayers.forEach(([id, p]) => {
        let score = 0;

        // Anlatıcı: Bulduramadığı için puan ALAMAZ (veya cezalandırılabilir)
        if (p.role === 'narrator') {
          score = 0;
        }
        // Arayıcılar: Yine de yaklaştıkları için TESELLİ puanı alırlar
        else if (p.role === 'seeker') {
          const dist = getDistance(p.lat, p.lng, narratorLoc.lat, narratorLoc.lng);
          const distScore = Math.max(0, 100 - (dist / 10));
          score = Math.floor(distScore);
        }

        p.totalScore = (p.totalScore || 0) + score;
        // Süre bittiyse teknik olarak kimse "kazanmadı" ama en yüksek puan alan öne çıkar
        scores.push({ username: p.username, score: p.totalScore, role: p.role, isWinner: false });
      });
    }

    scores.sort((a, b) => b.score - a.score);

    // Oyun Tamamen Bitti mi? (Herkes anlatıcı oldu mu?)
    const availableCount = roomPlayers.filter(([id, p]) => !room.pastNarrators.includes(id)).length;
    const isFinalGameEnd = availableCount === 0;

    io.to(roomId).emit('game-over', {
      reason,
      finderId: room.finderId,
      scores,
      locationInfo: room.locationInfo,
      isFinalGameEnd // Client bu bilgiye göre "Yeni Tur" butonunu gizleyebilir/değiştirebilir
    });

    // Odayı sadece pasife çek, silme (Geçmişi koru)
    room.active = false;
    console.log(`🏁 [SERVER] Tur Bitti (${reason}): ${roomId}. Kalan Anlatıcı: ${availableCount}`);
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

        // Oda temizliği: Kimse kalmadıysa odayı sil
        const roomPlayers = Array.from(players.values()).filter(p => p.roomId === roomId);
        if (roomPlayers.length === 0) {
          rooms.delete(roomId);
          console.log(`🧹 [SERVER] Oda temizlendi: ${roomId}`);
        }
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

// Helper: Mesafe Hesaplama (Metre cinsinden)
function getDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 999999;
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
