# 🌍 GeoChase - Multiplayer Street View Saklambaç

Modern, gerçek zamanlı çok oyunculu bir Google Street View oyunu.

## 🎮 Nasıl Çalışır?

1. **Anlatıcı (Narrator)**: Dünyada rastgele bir yerde bekler ve çevresini anlatır.
2. **Arayıcılar (Seekers)**: Anlatıcının ipuçlarını kullanarak onu bulmaya çalışır.
3. **Sıcak/Soğuk Sistemi**: Yaklaştıkça sinyaller değişir.

## 🚀 Kurulum

### Gereksinimler
- ✅ Node.js v24.12.0 (yüklü)
- ✅ npm 11.6.2 (yüklü)
- 🔑 Google Maps API Anahtarı (Maps JavaScript API etkin)

### Adımlar

1. **Google Maps API Anahtarını Ekle**
   - `client/.env` dosyasını aç
   - `YOUR_API_KEY_HERE` yerine kendi anahtarını yapıştır

2. **Sunucuyu Başlat** (Terminal 1)
   ```bash
   cd server
   node index.js
   ```
   Çıktı: `🚀 Server çalışıyor: http://localhost:3000`

3. **İstemciyi Başlat** (Terminal 2)
   ```bash
   cd client
   npm run dev
   ```
   Çıktı: `  ➜  Local:   http://localhost:5173/`

4. **Tarayıcıda Aç**
   - http://localhost:5173 adresine git
   - Street View'da gezmeye başla!

## 📝 Test Etmek İçin

1. Tek tarayıcıda test: `http://localhost:5173` adresini aç
2. Konsolda koordinatları gör (F12 → Console)
3. Street View'da hareket et, koordinatların değiştiğini izle

## 🎯 Sonraki Adımlar
    
- [x] Temel Street View entegrasyonu
- [x] Socket.io real-time bağlantı
- [x] Konum senkronizasyonu
- [x] **Minimap (Radar Modu)**: Sol üstte, oyuncu yönüne göre dönen taktiksel harita
- [x] **Oyuncu İkonları**: Rastgele takım renklerine sahip "Damla" şeklindeki yön göstergeleri
- [x] **Minimalist UI**: Gereksiz paneller kaldırıldı, odak oyunda
- [ ] Mesafe hesaplama (server-side)
- [ ] Proximity indicator (Sıcak/Soğuk)
- [ ] 3D Avatar rendering (Street View içinde - opsiyonel)
- [ ] Lobby sistemi
- [ ] Puanlama mekanizması

## 🛠️ Teknolojiler

- **Frontend**: React + Vite
- **Backend**: Node.js + Express + Socket.io
- **Maps**: Google Maps JavaScript API
- **Styling**: Modern CSS (Glassmorphism + Dark Mode + Neon)
