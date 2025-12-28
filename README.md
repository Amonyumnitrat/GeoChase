# 🌍 GeoChase

**Gerçek zamanlı, çok oyunculu Street View kovalamaca oyunu!**

[![Beta](https://img.shields.io/badge/Version-Beta%20v0.1-ff9aa2?style=for-the-badge)](https://github.com/Amonyumnitrat/GeoChase)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=nodedotjs)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?style=for-the-badge&logo=socketdotio)](https://socket.io/)

---

## 🎮 Oyun Hakkında

GeoChase, arkadaşlarınla Google Street View üzerinde oynayabileceğin heyecan verici bir kovalamaca oyunudur!

- **Anlatıcı (Narrator):** Bir konumda gizlenir ve 30 metre hareket alanına sahiptir.
- **Arayıcılar (Seekers):** Anlatıcıyı bulmak için Street View'da gezinir.

Süre bitmeden anlatıcıyı bul ve puan kazan!

---

## ✨ Özellikler

- 🌍 **3 Oyun Modu:**
  - Tüm Dünya (Rastgele konum)
  - Başkentler (Ünlü şehirler)
  - Kendin Seç (Özel şehir listesi)

- 👥 **Çok Oyunculu:** Arkadaşlarınla aynı odada oyna
- ⚡ **Gerçek Zamanlı:** Socket.IO ile anlık senkronizasyon
- 🗺️ **Minimap:** Yakındaki oyuncuları gör
- 🎯 **Dinamik Zorluk:** Doğuş mesafesi ayarlanabilir (100m - 1km)
- 📱 **Responsive:** Mobil ve masaüstü uyumlu

---

## 🛠️ Teknolojiler

| Katman | Teknoloji |
|--------|-----------|
| **Frontend** | React 18, Vite 7 |
| **Backend** | Node.js, Express 5 |
| **Realtime** | Socket.IO 4 |
| **Harita** | Google Maps JavaScript API, Street View API |
| **Styling** | Vanilla CSS (Glassmorphism) |

---

## 🚀 Kurulum

### Gereksinimler
- Node.js 20.x veya üzeri
- Google Maps API Key ([Nasıl Alınır?](https://developers.google.com/maps/documentation/javascript/get-api-key))

### Adımlar

1. **Repoyu Klonla:**
   ```bash
   git clone https://github.com/Amonyumnitrat/GeoChase.git
   cd GeoChase
   ```

2. **Bağımlılıkları Yükle:**
   ```bash
   cd client && npm install
   cd ../server && npm install
   ```

3. **Environment Dosyalarını Oluştur:**

   `client/.env`:
   ```env
   VITE_GOOGLE_MAPS_API_KEY=YOUR_API_KEY_HERE
   ```

   `server/.env`:
   ```env
   PORT=3001
   NODE_ENV=development
   ```

4. **Sunucuyu Başlat:**
   ```bash
   # Terminal 1 - Backend
   cd server && node index.js

   # Terminal 2 - Frontend
   cd client && npm run dev
   ```

5. **Tarayıcıda Aç:**
   ```
   http://localhost:5173
   ```

---

## 🌐 Production Deployment

```bash
# Client Build
cd client && npm run build

# Server (PM2 ile)
cd server && pm2 start index.js --name geochase
```

Nginx reverse proxy ayarı için [dokümantasyona](https://nginx.org/en/docs/) bakın.

---

## 📸 Ekran Görüntüleri

| Giriş Ekranı | Oyun İçi |
|--------------|----------|
| ![Landing](https://via.placeholder.com/400x250?text=Landing+Page) | ![Game](https://via.placeholder.com/400x250?text=Game+Screen) |

---

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push yapın (`git push origin feature/amazing-feature`)
5. Pull Request açın

---

## 📄 Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına bakın.

---

## 👨‍💻 Geliştirici

**Amonyumnitrat**

- GitHub: [@Amonyumnitrat](https://github.com/Amonyumnitrat)

---

<div align="center">

**⭐ Projeyi beğendiysen yıldız vermeyi unutma! ⭐**

Made with ❤️ in Turkey

</div>
