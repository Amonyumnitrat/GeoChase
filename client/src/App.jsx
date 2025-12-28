import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Lobby from './components/Lobby';
import LandingPage from './components/LandingPage';
import { CAPITALS_LIST } from './data/capitals';
import { ACCESSORIES_CONFIG } from './data/accessories';
import './App.css';

function App() {
    const mapRef = useRef(null);
    const panoramaRef = useRef(null);
    const minimapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef(new Map()); // Minimap (2D)
    const streetMarkersRef = useRef(new Map()); // Street View (3D)
    const socketRef = useRef(null);

    const [position, setPosition] = useState({ lat: 41.0082, lng: 28.9784 });
    const [heading, setHeading] = useState(0);
    const [isConnected, setIsConnected] = useState(false);
    const [isMapLoaded, setIsMapLoaded] = useState(false);
    const [otherPlayers, setOtherPlayers] = useState(new Map());
    const [myColor, setMyColor] = useState('#FFFFFF');
    const [myId, setMyId] = useState(null);
    const [isFpsMode, setIsFpsMode] = useState(false); // Default: Mouse Mode
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [sensitivity, setSensitivity] = useState(0.15);
    const [zoom, setZoom] = useState(0);
    const [uiMode, setUiMode] = useState('landing'); // 'landing', 'lobby', 'waiting', 'game'
    const [username, setUsername] = useState('');
    const [roomId, setRoomId] = useState(null);
    const [isCreator, setIsCreator] = useState(false);

    const [role, setRole] = useState(null); // 'narrator' | 'seeker'
    const [gameEndTime, setGameEndTime] = useState(null);
    const [showRoleReveal, setShowRoleReveal] = useState(false);
    const [narratorFound, setNarratorFound] = useState(false); // { finderId, isFound }
    const [narratorId, setNarratorId] = useState(null);
    const [gameOverData, setGameOverData] = useState(null); // { scores: [] }

    const [showStartLocation, setShowStartLocation] = useState(false);
    const [revealTimeLeft, setRevealTimeLeft] = useState(15);
    const startLocationMapRef = useRef(null);
    const [narratorStartPos, setNarratorStartPos] = useState(null);
    const [isMinimapMaximized, setIsMinimapMaximized] = useState(false);
    const minimapMaxRef = useRef(isMinimapMaximized); // Listener içinde state erişimi için
    const [teleportRights, setTeleportRights] = useState(3);
    const [isLoading, setIsLoading] = useState(false); // Yeni oyun başlatılırken/aranırken
    const teleportRightsRef = useRef(3); // Listener içinde anlık erişim için
    const [isUiVisible, setIsUiVisible] = useState(true); // UI Toggle State
    const [isDevPanelOpen, setIsDevPanelOpen] = useState(false);
    const [roundKey, setRoundKey] = useState(0); // Tur değişiminde haritayı yeniden oluşturmak için
    const [hasGameStartedOnce, setHasGameStartedOnce] = useState(false); // Oyunun en az bir kere başlayıp başlamadığını tutar
    const [endRoundVotes, setEndRoundVotes] = useState([]); // Round'u erken bitirmek için oy verenler (Array)
    const [hasVotedToEnd, setHasVotedToEnd] = useState(false); // Kullanıcı oy verdi mi
    const [showReturnConfirm, setShowReturnConfirm] = useState(false); // Lobiye dönüş onayı
    const [errorMsg, setErrorMsg] = useState(null); // Merkezi hata mesajı
    const [myAvatar, setMyAvatar] = useState('char1'); // 'char1' | 'char2' - Karakter seçimi
    const [myAccessories, setMyAccessories] = useState({}); // { glasses: 'glasses_ski', hats: null, ... }

    // Narrator Hareketi Kısıtlama
    const movementAnchorRef = useRef(null); // Hareketin merkezi (Başlangıç veya Işınlanma noktası)
    const lastValidPosRef = useRef(null); // Son geçerli konum (Geri almak için)

    // Sabitler
    const DEV_MODE = false; // true yaparak lobiyi atlayabilirsin
    const BASE_WIDTH = 60;
    const BASE_HEIGHT = 90;

    // Helper: Marker Animasyonu (Interpolasyon)
    const animateMarker = (marker, targetLat, targetLng, onUpdate) => {
        const startPos = marker.getPosition();
        if (!startPos) {
            marker.setPosition({ lat: targetLat, lng: targetLng });
            if (onUpdate) onUpdate(new window.google.maps.LatLng(targetLat, targetLng));
            return;
        }

        const startLat = startPos.lat();
        const startLng = startPos.lng();

        if (Math.abs(startLat - targetLat) < 0.000001 && Math.abs(startLng - targetLng) < 0.000001) {
            if (onUpdate) onUpdate(startPos);
            return;
        }

        const startTime = performance.now();
        const duration = 500;

        if (marker.animationId) cancelAnimationFrame(marker.animationId);

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = progress * (2 - progress);

            const currentLat = startLat + (targetLat - startLat) * ease;
            const currentLng = startLng + (targetLng - startLng) * ease;

            const newPos = new window.google.maps.LatLng(currentLat, currentLng);
            marker.setPosition(newPos);

            if (onUpdate) onUpdate(newPos);

            if (progress < 1) {
                marker.animationId = requestAnimationFrame(animate);
            } else {
                marker.animationId = null;
            }
        };

        marker.animationId = requestAnimationFrame(animate);
    };

    // Helper: Mesafe Hesaplama (Metre)
    const getDistance = (lat1, lng1, lat2, lng2) => {
        const R = 6371e3;
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    // Global Avatar Cache - Karakter pozları için
    const avatarImgRef = useRef({ char1: null, char2: null, char3: null });
    const accessoryImgRef = useRef({}); // Dinamik obje

    useEffect(() => {
        // Poz 1 avatar
        const char1Img = new Image();
        char1Img.src = "/char_1.png";
        char1Img.onload = () => { avatarImgRef.current.char1 = char1Img; };

        // Poz 2 avatar
        const char2Img = new Image();
        char2Img.src = "/char_2.png";
        char2Img.onload = () => { avatarImgRef.current.char2 = char2Img; };

        // Poz 3 avatar
        const char3Img = new Image();
        char3Img.src = "/char_3.png";
        char3Img.onload = () => { avatarImgRef.current.char3 = char3Img; };

        // Aksesuarları Dinamik Yükle
        Object.values(ACCESSORIES_CONFIG).forEach(category => {
            category.forEach(opt => {
                if (opt) {
                    const img = new Image();
                    img.src = `/accessories/${opt}.png`;
                    img.onload = () => { accessoryImgRef.current[opt] = img; };
                }
            });
        });
    }, []);

    // Helper: Canvas ile Dinamik İkon (Resim + İsim + Aksesuarlar Birleşik)
    const getDynamicAvatar = (distance, username, color, avatarType = 'char1', accessories = {}) => {
        // 1. Scale Hesapla
        let distScale = 2000 / Math.pow(Math.max(10, distance), 2.0);
        distScale = Math.min(Math.max(distScale, 0.4), 3.0);

        // Orijinal boyutlar (Avatar resminin yaklaşık aspect ratio'su)
        // Varsayalım avatar.png 200x300 gibi yüksek çözünürlükte olsun
        // Bizim base boyutlarımız:
        const baseW = 60;
        const baseH = 90;

        // Hedef boyutlar
        const targetW = baseW * distScale;
        const targetH = baseH * distScale;

        // Canvas Boyutu (İsim için üstte biraz boşluk bırakıyoruz)
        const textHeight = targetH * 0.4; // İsim alanı yüksekliği (Karakterin %40'ı kadar)
        const canvasW = targetW * 1.5; // Genişlik biraz fazlaca olsun, uzun isimler sığsın
        const canvasH = targetH + textHeight;

        // Canvas elementini oluştur (Sanal)
        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d');

        // 1. Resmi Çiz (Alt kısma)
        const avatarImg = avatarImgRef.current[avatarType] || avatarImgRef.current.char1;
        const avatarX = (canvasW - targetW) / 2;
        const avatarY = textHeight; // Üstte metin boşluğu bıraktık
        if (avatarImg) {
            ctx.drawImage(avatarImg, avatarX, avatarY, targetW, targetH);
        }

        // 2. Aksesuarları Çiz (Dinamik Katmanlama)
        Object.keys(ACCESSORIES_CONFIG).forEach(category => {
            const accessoryKey = accessories[category];
            if (accessoryKey && accessoryImgRef.current[accessoryKey]) {
                const accImg = accessoryImgRef.current[accessoryKey];
                // Aksesuar görseli karakterle aynı boyut ve pozisyonda (Tam uyumlu PNG varsayımı)
                ctx.drawImage(accImg, avatarX, avatarY, targetW, targetH);
            }
        });

        // 3. Metni Çiz (Üst kısma)
        const fontSize = Math.max(10, 12 * distScale);
        ctx.font = `bold ${fontSize}px 'Fredoka', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        // Stroke (Kenarlık) - Okunabilirlik için
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'black';
        ctx.strokeText(username, canvasW / 2, textHeight);

        // Fill (İç Renk)
        ctx.fillStyle = color || '#FFFFFF';
        ctx.fillText(username, canvasW / 2, textHeight);

        return {
            url: canvas.toDataURL(),
            scaledSize: new window.google.maps.Size(canvasW, canvasH),
            anchor: new window.google.maps.Point(canvasW / 2, canvasH) // Ayaklar en altta
        };
    };



    // Session Persistence (Auto-Rejoin on F5)
    useEffect(() => {
        const savedSession = sessionStorage.getItem('geoFind_session');
        if (savedSession) {
            try {
                const { username, roomId, isCreator } = JSON.parse(savedSession);
                if (username && roomId) {
                    console.log('Restoring session:', username, roomId);
                    setOtherPlayers(new Map());
                    setUsername(username);
                    setRoomId(roomId);
                    setIsCreator(isCreator);
                    setUiMode('waiting');
                }
            } catch (e) {
                console.error('Session parse error', e);
                sessionStorage.removeItem('geoFind_session');
            }
        }
    }, []);

    // Lobby Join Handler
    const handleJoinGame = (user, code, creator) => {
        // Save session
        sessionStorage.setItem('geoFind_session', JSON.stringify({
            username: user,
            roomId: code,
            isCreator: creator
        }));

        setOtherPlayers(new Map()); // Listeyi temizle (Ghostları sil)
        setUsername(user);
        setRoomId(code);
        setIsCreator(creator);
        setUiMode('waiting');
    };

    // Lobby Return Handler (Oyun bittikten sonra waiting room'a dön)
    const handleReturnToLobby = () => {
        // Oyun state'lerini sıfırla ama oda ve kullanıcı bilgilerini koru
        setGameOverData(null);
        setRole(null);
        setGameEndTime(null);
        setShowRoleReveal(false);
        setNarratorFound(false);
        setNarratorId(null);
        setShowStartLocation(false);
        setNarratorStartPos(null);
        setTeleportRights(3);
        teleportRightsRef.current = 3;
        setHasVotedToEnd(false);
        setEndRoundVotes([]);
        setIsLoading(false);
        setRoundKey(prev => prev + 1);
        setHasGameStartedOnce(false); // Intermission ekranını kapatmak için

        // Waiting room'a geri dön (Username ve RoomId korunur)
        setUiMode('waiting');

        // Server'a reset sinyali gönder
        if (socketRef.current && roomId) {
            socketRef.current.emit('return-to-lobby', { roomId });
        }
    };

    // Odadan Tamamen Ayrıl (Ana lobiye dön)
    const handleLeaveRoom = () => {
        // Session'ı temizle
        sessionStorage.removeItem('geoFind_session');

        // Tüm state'leri sıfırla
        setRoomId(null);
        setUsername('');
        setIsCreator(false);
        setOtherPlayers(new Map());
        setGameOverData(null);
        setRole(null);
        setGameEndTime(null);
        setShowRoleReveal(false);
        setNarratorFound(false);
        setNarratorId(null);
        setShowStartLocation(false);
        setNarratorStartPos(null);
        setTeleportRights(3);
        teleportRightsRef.current = 3;
        setHasVotedToEnd(false);
        setEndRoundVotes([]);
        setIsLoading(false);
        setHasGameStartedOnce(false);

        // Ana lobiye dön
        setUiMode('lobby');

        // Server'a disconnect sinyali göndermek için socket yeniden bağlanabilir
        // Şimdilik sadece UI geçişi yeterli
    };

    const [spawnDistance, setSpawnDistance] = useState(300); // 100m - 500m
    const [currentGameSpawnDist, setCurrentGameSpawnDist] = useState(300); // Oyun başladığındaki değer

    // Dinamik Aralık Hesaplayıcılar
    // Yeni formül: 100m spawn = 50m görüş, 500m spawn = 100m görüş
    const calculateRanges = (dist) => {
        const visibility = 50 + ((dist - 100) * (50 / 400)); // 50m-100m arası
        const capture = 20 + ((dist - 100) * (30 / 400)); // 20m-50m arası
        return {
            visibility: Math.round(visibility),
            capture: Math.round(capture)
        };
    };




    const [gameMode, setGameMode] = useState('WORLD'); // 'WORLD', 'CAPITALS', 'CUSTOM' etc.
    const [customLocations, setCustomLocations] = useState([]); // Kullanıcının seçtiği özel şehirler

    // Game Mode Change Handler (sadece host çağırabilir)
    const handleGameModeChange = (newMode) => {
        setGameMode(newMode);
        // Host ise server'a bildir
        if (isCreator && socketRef.current && roomId) {
            socketRef.current.emit('change-game-mode', { roomId, gameMode: newMode });
        }
    };

    // GAME START LOGIC (HOST)
    const handleStartGame = (attempts = 0) => {
        if (attempts === 0) setIsLoading(true); // HEMEN AÇ

        // Tek kişi kontrolü (Sadece ilk denemede)
        if (attempts === 0 && otherPlayers.size === 0) {
            setErrorMsg("Oyunu başlatmak için en az 2 kişi gereklidir.");
            setIsLoading(false);
            return;
        }

        console.log(`Game Start Triggered (Attempt ${attempts + 1}, Mode: ${gameMode})`);

        // Max deneme sayısını artır
        if (attempts > 20) {
            alert("Uygun Street View konumu bulunamadı. Lütfen tekrar deneyin.");
            setIsLoading(false);
            return;
        }

        if (!socketRef.current) {
            alert("Sunucu bağlantısı yok!");
            setIsLoading(false);
            return;
        }
        if (!roomId) {
            alert("Oda ID yok!");
            return;
        }
        if (!window.google || !window.google.maps) {
            alert("Google Maps API henüz yüklenmedi, lütfen bekleyin...");
            return;
        }

        // --- MOD 5: KENDİN SEÇ (CUSTOM) ---
        if (gameMode === 'CUSTOM') {
            if (!customLocations || customLocations.length === 0) {
                alert("Lütfen önce listeden şehir ekleyin!");
                setIsLoading(false);
                return;
            }

            const randomLoc = customLocations[Math.floor(Math.random() * customLocations.length)];
            console.log(`Searching for StreetView in Custom Location: ${randomLoc.name}`);

            // Şehir merkezinden rastgele bir offset ekle (0-10km arası)
            const offsetKm = Math.random() * 10; // 0-10 km
            const offsetDeg = offsetKm / 111; // km'yi derece'ye çevir (yaklaşık)
            const angle = Math.random() * 2 * Math.PI; // Rastgele açı

            const searchLat = randomLoc.lat + (offsetDeg * Math.cos(angle));
            const searchLng = randomLoc.lng + (offsetDeg * Math.sin(angle) / Math.cos(randomLoc.lat * Math.PI / 180));

            console.log(`📍 Arama noktası: ${searchLat.toFixed(4)}, ${searchLng.toFixed(4)} (${offsetKm.toFixed(2)}km offset)`);

            const svService = new window.google.maps.StreetViewService();
            svService.getPanorama({
                location: { lat: searchLat, lng: searchLng },
                radius: 5000, // 5km yarıçap
                preference: window.google.maps.StreetViewPreference.NEAREST,
                source: window.google.maps.StreetViewSource.OUTDOOR
            }, (data, status) => {
                if (status === 'OK' && data && data.location && data.location.latLng) {
                    if (!data.links || data.links.length < 2) {
                        console.warn("⚠️ Street View bulundu ama hareket kısıtlı. Tekrar deneniyor...");
                        handleStartGame(attempts + 1);
                        return;
                    }
                    console.log(`✅ Custom StreetView bulundu!`);
                    const loc = data.location.latLng;
                    socketRef.current.emit('start-game', {
                        roomId,
                        narratorLocation: {
                            lat: loc.lat(),
                            lng: loc.lng(),
                            panoId: data.location.pano
                        },
                        locationInfo: {
                            city: randomLoc.name,
                            country: "Özel Konum"
                        },
                        spawnDistance
                    });
                } else {
                    console.warn(`⚠️ Valid Street View not found in ${randomLoc.name}, retrying...`, status);
                    handleStartGame(attempts + 1);
                }
            });
            return;
        }


        // ... inside App component

        // --- MOD 2: BAŞKENTLER (CAPITALS) ---
        if (gameMode === 'CAPITALS') {
            const randomCapital = CAPITALS_LIST[Math.floor(Math.random() * CAPITALS_LIST.length)];
            console.log(`Searching for StreetView in Capital: ${randomCapital.city}, ${randomCapital.country}`);

            const svService = new window.google.maps.StreetViewService();
            // Başkentlerde radius'u daha küçük tutabiliriz, çünkü şehir merkezi genelde çekilidir.
            // 5km (5000m) yarıçap genelde iyidir.
            svService.getPanorama({
                location: { lat: randomCapital.lat, lng: randomCapital.lng },
                radius: 5000,
                preference: window.google.maps.StreetViewPreference.NEAREST,
                source: window.google.maps.StreetViewSource.OUTDOOR
            }, (data, status) => {
                if (status === 'OK' && data && data.location && data.location.latLng) {
                    // KONTROL: Hareket edilebilir mi?
                    if (!data.links || data.links.length < 2) {
                        console.warn("⚠️ Street View bulundu ama hareket kısıtlı. Tekrar deneniyor...");
                        handleStartGame(attempts + 1);
                        return;
                    }

                    console.log(`✅ Capital StreetView bulundu!`);
                    const loc = data.location.latLng;

                    // Direkt olarak bildiğimiz lokasyon bilgisini gönderelim (Geocoder'a gerek yok)
                    socketRef.current.emit('start-game', {
                        roomId,
                        narratorLocation: {
                            lat: loc.lat(),
                            lng: loc.lng(),
                            panoId: data.location.pano
                        },
                        locationInfo: {
                            city: randomCapital.city,
                            country: randomCapital.country
                        },
                        spawnDistance
                    });
                } else {
                    console.warn(`⚠️ Valid Street View not found in ${randomCapital.city}, retrying...`, status);
                    handleStartGame(attempts + 1);
                }
            });
            return; // Fonksiyondan çık, WORLD moduna girmesin
        }

        // --- MOD 1: TÜM DÜNYA (WORLD) ---
        if (gameMode === 'WORLD') {
            // DÜNYA GENELİ RASTGELE KONUM ALGORİTMASI
            // Okyanuslardan kaçınmak için kabaca kıta kutuları (Bounding Boxes) tanımlıyoruz.
            const regions = [
                { name: "Europe", latMin: 35, latMax: 70, lngMin: -10, lngMax: 40, weight: 4 },
                { name: "North America", latMin: 25, latMax: 70, lngMin: -130, lngMax: -60, weight: 3 },
                { name: "Asia", latMin: 10, latMax: 70, lngMin: 40, lngMax: 140, weight: 4 },
                { name: "South America", latMin: -55, latMax: 15, lngMin: -80, lngMax: -35, weight: 2 },
                { name: "Australia", latMin: -45, latMax: -10, lngMin: 110, lngMax: 155, weight: 2 },
                { name: "Africa", latMin: -35, latMax: 35, lngMin: -20, lngMax: 50, weight: 1 } // Street view az
            ];

            // Ağırlıklı rastgele seçim
            const totalWeight = regions.reduce((sum, r) => sum + r.weight, 0);
            let randomVal = Math.random() * totalWeight;
            let selectedRegion = regions[regions.length - 1];

            for (const region of regions) {
                randomVal -= region.weight;
                if (randomVal <= 0) {
                    selectedRegion = region;
                    break;
                }
            }

            const randomLat = selectedRegion.latMin + Math.random() * (selectedRegion.latMax - selectedRegion.latMin);
            const randomLng = selectedRegion.lngMin + Math.random() * (selectedRegion.lngMax - selectedRegion.lngMin);

            console.log(`Searching for StreetView in ${selectedRegion.name} at:`, randomLat, randomLng);

            const svService = new window.google.maps.StreetViewService();
            svService.getPanorama({
                location: { lat: randomLat, lng: randomLng },
                radius: 100000, // 100km yarıçap (Issız yerlerde bile en yakın yolu bulsun)
                preference: window.google.maps.StreetViewPreference.NEAREST,
                source: window.google.maps.StreetViewSource.OUTDOOR
            }, (data, status) => {
                if (status === 'OK' && data && data.location && data.location.latLng) {
                    // KONTROL: Hareket edilebilir mi? (Link sayısı)
                    if (!data.links || data.links.length < 2) {
                        // En az 2 link olsun ki sıkışmayalım (Opsiyonel, duruma göre 1 de olabilir)
                        console.warn("⚠️ Street View bulundu ama hareket kısıtlı. Tekrar deneniyor...");
                        handleStartGame(attempts + 1);
                        return;
                    }

                    console.log(`✅ StreetView bulundu! Link sayısı: ${data.links.length}`);
                    const loc = data.location.latLng;

                    // Geocoder ile yer ismini bul (Şehir, Ülke)
                    const geocoder = new window.google.maps.Geocoder();
                    geocoder.geocode({ location: loc }, (results, status) => {
                        let locationInfo = { city: "Bilinmiyor", country: "Bilinmiyor" };
                        if (status === 'OK' && results[0]) {
                            // Basitçe adres bileşenlerinden bulalım
                            const components = results[0].address_components;
                            let city = "";
                            let country = "";

                            for (const comp of components) {
                                if (comp.types.includes("locality") || comp.types.includes("administrative_area_level_1")) {
                                    if (!city) city = comp.long_name;
                                }
                                if (comp.types.includes("country")) {
                                    country = comp.long_name;
                                }
                            }
                            locationInfo = { city: city || "Bilinmiyor", country: country || "Bilinmiyor" };
                        }

                        // Pano ID ve Location Info'yu gönder
                        socketRef.current.emit('start-game', {
                            roomId,
                            narratorLocation: {
                                lat: loc.lat(),
                                lng: loc.lng(),
                                panoId: data.location.pano
                            },
                            locationInfo, // Yeni eklenen bilgi
                            spawnDistance
                        });
                    });
                } else {
                    console.warn(`⚠️ Valid Street View not found in ${selectedRegion.name}, retrying...`, status);
                    handleStartGame(attempts + 1);
                }
            });
        }
    };

    // 0. Room Join Effect
    useEffect(() => {
        if (uiMode === 'waiting' && socketRef.current && roomId) {
            socketRef.current.emit('join-room', {
                roomId,
                username,
                isCreator,
                avatarType: myAvatar,
                accessories: myAccessories
            });
        }
    }, [uiMode, roomId, username, isCreator, myAvatar, myAccessories]);

    useEffect(() => {
        try {
            // Canlıya alındığında (Production) sunucu ile client aynı yere bağlansın diye boş bırakıyoruz
            // Firefox/Edge uyumluluğu için connection options
            socketRef.current = io({
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                timeout: 20000,
                transports: ['websocket', 'polling'] // WebSocket önce, polling fallback
            });

            socketRef.current.on('connect', () => {
                console.log('✅ Socket.io bağlantısı kuruldu');
                setIsConnected(true);
            });

            socketRef.current.on('connect_error', (err) => {
                console.warn('⚠️ Socket.io bağlantı hatası:', err.message);
            });

            socketRef.current.on('init-data', (data) => {
                setMyId(data.id);
                setMyColor(data.color);

                // DEV_MODE: Bağlantı kurulduktan sonra otomatik olarak "DEV" odasına bağlan
                if (DEV_MODE) {
                    socketRef.current.emit('join-room', {
                        roomId: 'DEV',
                        username: 'Player_' + Math.random().toString(36).substr(2, 4)
                    });
                    setUiMode('game'); // Haritayı başlat
                    setRole('seeker'); // Dev modda varsayılan seeker
                }
            });

            // OYUN BAŞLADI
            socketRef.current.on('game-started', (data) => {
                // START ile 'game' yapma, konum hazır olunca yap
                // setUiMode('game'); <-- REMOVED

                setGameEndTime(data.endTime);
                setNarratorId(data.narratorId);
                setNarratorFound(false);
                setGameOverData(null); // Reset game over screen
                setTeleportRights(3);
                teleportRightsRef.current = 3;
                // setIsLoading(false); // <--- REMOVED: Loading'i burada kapatma, oyun ekranı açılınca kapat
                setHasGameStartedOnce(true); // Oyun başladı işareti
                setHasVotedToEnd(false); // Oyları sıfırla
                setEndRoundVotes([]); // Oy listesini temizle
                setCurrentGameSpawnDist(data.spawnDistance || 500);

                // Show Narrator Start Location
                if (data.initialPositions[data.narratorId]) {
                    setNarratorStartPos({
                        lat: data.initialPositions[data.narratorId].lat,
                        lng: data.initialPositions[data.narratorId].lng
                    });
                    setRevealTimeLeft(15);
                    setShowStartLocation(true);
                }

                // Sync other players' initial positions
                setOtherPlayers(prev => {
                    const newMap = new Map(prev);
                    Object.entries(data.initialPositions).forEach(([id, pos]) => {
                        if (id !== socketRef.current.id) {
                            const existing = newMap.get(id) || {};
                            newMap.set(id, {
                                ...existing,
                                lat: pos.lat,
                                lng: pos.lng,
                                role: pos.role,
                                avatarType: pos.avatarType || 'char1',
                                accessories: pos.accessories || {}
                            });
                        }
                    });
                    return newMap;
                });

                // Rolümü Bul, Pozisyonumu Al
                const myData = data.initialPositions[socketRef.current.id];
                if (myData) {
                    setRole(myData.role);

                    // NARRATOR Zaten Valid Konumda Başlıyor
                    if (myData.role === 'narrator') {
                        // Hareket kısıtlaması için çapa at
                        movementAnchorRef.current = { lat: myData.lat, lng: myData.lng };
                        lastValidPosRef.current = { lat: myData.lat, lng: myData.lng };

                        // Önce pozisyonu ayarla, sonra game moduna geç
                        // useEffect(position, uiMode) haritayı bu konumla oluşturacak
                        setPosition({ lat: myData.lat, lng: myData.lng });
                        setUiMode('game');
                        setIsLoading(false); // <--- ADDED: Oyun ekranı açılınca kapat
                    }
                    // SEEKER İÇİN
                    // SEEKER İÇİN SNAP LOGIC (Geçerli Yol Kontrolü)
                    else {
                        // Server rastgele bir nokta verdi ama bu suyun içi olabilir.
                        // Biz bu noktanın EN YAKININDAKİ street view'i bulup oraya ışınlanalım.
                        const svService = new window.google.maps.StreetViewService();

                        // Yarıçapı 1000m yaptık (Arayıcılar anlatıcının tepesine düşmesin diye en yakın yolu geniş arıyoruz)
                        svService.getPanorama({
                            location: { lat: myData.lat, lng: myData.lng },
                            radius: 1000,
                            preference: window.google.maps.StreetViewPreference.NEAREST,
                            source: window.google.maps.StreetViewSource.OUTDOOR
                        }, (panoData, status) => {
                            if (status === 'OK' && panoData && panoData.location) {
                                const validLat = panoData.location.latLng.lat();
                                const validLng = panoData.location.latLng.lng();
                                console.log("✅ Seeker Snapped to Road:", validLat, validLng);

                                setPosition({ lat: validLat, lng: validLng });

                                // Server'a da doğrusunu bildir
                                socketRef.current.emit('update-position', {
                                    lat: validLat, lng: validLng,
                                    heading: 0,
                                    role: 'seeker',
                                    roomId: data.roomId // roomId scope'dan gelmeyebilir, data context'ten emin oluyoruz
                                });

                                setUiMode('game');
                                setIsLoading(false); // <--- ADDED: Oyun ekranı açılınca kapat
                            } else {
                                // Bulamazsa (Örn: Denizin ortası), ANLATICI'nın yanına ışınla.
                                console.warn("⚠️ Seeker spawn invalid, fallback to Narrator location.");

                                const narratorPos = data.initialPositions[data.narratorId];
                                if (narratorPos) {
                                    setPosition({ lat: narratorPos.lat, lng: narratorPos.lng });

                                    socketRef.current.emit('update-position', {
                                        lat: narratorPos.lat, lng: narratorPos.lng,
                                        heading: 0,
                                        role: 'seeker',
                                        roomId: data.roomId
                                    });

                                    setUiMode('game');
                                    setIsLoading(false); // <--- ADDED: Oyun ekranı açılınca kapat
                                }
                            }
                        });
                    }
                }

                // Tur değişti, haritayı yeniden oluşturmak için key'i artır
                setRoundKey(prev => prev + 1);

                // Rol Ekranını Göster
                setShowRoleReveal(true);
                setTimeout(() => setShowRoleReveal(false), 4000); // 4sn sonra kapat
            });

            // ANLATICI BULUNDU (5sn Timer)
            socketRef.current.on('narrator-found', (data) => {
                setNarratorFound(true);
                setGameEndTime(data.newEndTime);
                // Sesli uyarı eklenebilir
            });

            // OY VERİLDİ (Round'u bitir)
            socketRef.current.on('vote-end-round', (data) => {
                setEndRoundVotes(data.votes); // data.votes is Array
            });

            // ROUND ERKEN BİTTİ
            socketRef.current.on('round-ended-early', () => {
                // Oyun bitmiş gibi davran, sonuçlar gelecek
                console.log('Round oylarla erken bitti!');
            });

            socketRef.current.on('current-players', (list) => {
                setOtherPlayers(prev => {
                    const newMap = new Map(prev); // Eski verileri koru
                    list.forEach(p => {
                        if (p.playerId !== socketRef.current.id) {
                            newMap.set(p.playerId, p);
                        }
                    });
                    return newMap;
                });
            });

            socketRef.current.on('player-joined', (data) => {
                if (data.playerId === socketRef.current.id) return;
                console.log("👤 Player Joined with Data:", data);
                setOtherPlayers(prev => {
                    const newMap = new Map(prev);
                    newMap.set(data.playerId, data);
                    return newMap;
                });
            });

            socketRef.current.on('player-moved', (data) => {
                setOtherPlayers(prev => {
                    if (data.playerId === socketRef.current.id) return prev;
                    const newMap = new Map(prev);
                    const existing = prev.get(data.playerId) || {};
                    newMap.set(data.playerId, { ...existing, ...data });
                    return newMap;
                });
            });

            // GAME OVER
            socketRef.current.on('game-over', (data) => {
                setGameOverData(data); // Skor tablosunu göster
                setGameEndTime(null); // Sayacı durdur
            });



            // RESET UI BETWEEN ROUNDS
            socketRef.current.on('reset-game-ui', (data) => {
                setUiMode('waiting');
                setGameOverData(null);
                setNarratorFound(false);
                setGameEndTime(null);
                setTeleportRights(3);
                teleportRightsRef.current = 3;

                if (data && data.isTransitioning) {
                    // Sonraki tura geçiş - yükleme ekranı göster
                    setIsLoading(true);
                    // hasGameStartedOnce true kalmalı ki intermission gösterilsin
                } else {
                    // Lobiye dönüş - normal lobi ekranı göster
                    setIsLoading(false);
                    setHasGameStartedOnce(false); // Intermission yerine normal lobi göster
                }
            });

            // GAME MODE CHANGED (Host değiştirdiğinde)
            socketRef.current.on('game-mode-changed', ({ gameMode: newMode }) => {
                console.log(`🎮 Oyun modu değişti: ${newMode}`);
                setGameMode(newMode);
            });


            socketRef.current.on('player-disconnected', (playerId) => {
                setOtherPlayers(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(playerId);
                    return newMap;
                });

                if (markersRef.current.has(playerId)) {
                    markersRef.current.get(playerId).setMap(null);
                    markersRef.current.delete(playerId);
                }
                if (streetMarkersRef.current.has(playerId)) {
                    streetMarkersRef.current.get(playerId).setMap(null);
                    streetMarkersRef.current.delete(playerId);
                }
            });

            socketRef.current.on('disconnect', () => setIsConnected(false));
            window.socket = socketRef.current; // FOR TESTING

            // ODA HATASI (Geçersiz kod vb.)
            socketRef.current.on('room-error', (data) => {
                setErrorMsg(data.message);
                setUiMode('lobby');
                setIsLoading(false);
                setRoomId(null);
                sessionStorage.removeItem('geoFind_session');
            });
        } catch (err) { console.error(err); }
        return () => socketRef.current?.disconnect();
    }, []);



    // Minimap Resize Trigger
    useEffect(() => {
        minimapMaxRef.current = isMinimapMaximized; // Ref'i güncelle (Listener için)

        if (mapInstanceRef.current && window.google) {
            const timer = setTimeout(() => {
                window.google.maps.event.trigger(mapInstanceRef.current, 'resize');
                if (position && position.lat) {
                    mapInstanceRef.current.setCenter(position);
                }
            }, 100); // Transition bitmesini bekle
            return () => clearTimeout(timer);
        }
    }, [isMinimapMaximized]);

    // DEV MODE UI TOGGLE (Press 'H' for Hide UI, 'F8' for Dev Panel)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!DEV_MODE) return;

            // H: Hide All UI
            if (e.key.toLowerCase() === 'h') {
                setIsUiVisible(prev => !prev);
            }

            // F8: Toggle Dev Panel
            if (e.key === 'F8') {
                setIsDevPanelOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Win/Found Checker (Seeker Side)
    useEffect(() => {
        if (uiMode !== 'game' || role !== 'seeker' || narratorFound || !narratorId) return;

        const checkWin = setInterval(() => {
            // Anlatıcıyı bul (otherPlayers içinde)
            const narrator = otherPlayers.get(narratorId);
            if (narrator) {
                const dist = getDistance(position.lat, position.lng, narrator.lat, narrator.lng);
                // DİNAMİK YAKALAMA MESAFESİ
                const { capture } = calculateRanges(currentGameSpawnDist);
                if (dist < capture) {
                    socketRef.current.emit('found-narrator', { roomId, finderId: socketRef.current.id });
                }
            }
        }, 1000);

        return () => clearInterval(checkWin);
    }, [uiMode, role, narratorFound, narratorId, otherPlayers, position, roomId]);

    // 2. Google API
    useEffect(() => {
        const checkGoogle = setInterval(() => {
            if (window.google && window.google.maps) {
                setIsMapLoaded(true);
                clearInterval(checkGoogle);
            }
        }, 500);
        return () => clearInterval(checkGoogle);
    }, []);

    // 3. Haritalar
    useEffect(() => {
        // Eğer oyun modunda değilsek veya harita API yüklenmediyse çık
        if (!isMapLoaded || uiMode !== 'game' || !mapRef.current || !minimapRef.current) return;
        // Eğer oyun modunda değilsek veya harita API yüklenmediyse çık
        if (!isMapLoaded || uiMode !== 'game' || !mapRef.current || !minimapRef.current) return;

        // Temizlik: Önceki instance'ları temizle ve yeniden oluştur
        // (Her game moduna girişte temiz bir sayfa açmak en güvenlisi)
        if (panoramaRef.current) {
            window.google.maps.event.clearInstanceListeners(panoramaRef.current);
            panoramaRef.current = null;
        }
        if (mapInstanceRef.current) {
            window.google.maps.event.clearInstanceListeners(mapInstanceRef.current);
            mapInstanceRef.current = null;
        }

        // Street View
        console.log("Initializing Street View at:", position);
        const panorama = new window.google.maps.StreetViewPanorama(mapRef.current, {
            position: position,
            pov: { heading: 0, pitch: 0 },
            visible: true, // EXPLICIT VISIBILITY
            addressControl: false,
            fullscreenControl: false,
            motionTracking: false,
            motionTrackingControl: false,
            zoomControl: false,
            levelControl: false,
            showRoadLabels: false,
            linksControl: true
        });

        // Debug Status
        panorama.addListener('status_changed', () => {
            const status = panorama.getStatus();
            console.log("Street View Status Changed:", status);
            if (status !== 'OK') {
                console.error("Street View Failed to Load. Reason:", status);
            }
        });

        panoramaRef.current = panorama;

        // Minimap
        const map2D = new window.google.maps.Map(minimapRef.current, {
            center: position,
            zoom: 16,
            disableDefaultUI: true,
            mapTypeId: 'roadmap',
            gestureHandling: 'none',
            keyboardShortcuts: false,
            styles: [
                { featureType: "all", elementType: "labels", stylers: [{ visibility: "off" }] },
                { featureType: "all", elementType: "geometry", stylers: [{ color: "#000000" }] },
                { featureType: "road", elementType: "geometry", stylers: [{ color: "#808080" }, { weight: 1.5 }] },
                { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#ffffff" }, { weight: 0.5 }] },
                { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f0e26" }] },
            ],
        });
        mapInstanceRef.current = map2D;

        // MINIMAP TELEPORT LISTENER
        map2D.addListener('click', (e) => {
            // Sadece BÜYÜK MODDA iken tıklanabilir olsun
            // Ref kullanarak güncel state değerini kontrol ediyoruz
            if (!minimapMaxRef.current) {
                return;
            }

            // Işınlanma hakkı kontrolü
            if (teleportRightsRef.current <= 0) {
                // Hakkı kalmadı
                console.log("Işınlanma hakkı bitti!");
                return;
            }

            if (!panoramaRef.current || !e.latLng) return;

            const clickedLat = e.latLng.lat();
            const clickedLng = e.latLng.lng();
            console.log("Minimap Clicked:", clickedLat, clickedLng);

            // Tıklanan yere en yakın Street View'i bul
            const svService = new window.google.maps.StreetViewService();
            svService.getPanorama({
                location: { lat: clickedLat, lng: clickedLng },
                radius: 25, // Çok dar (10m) olursa bulamayabilir, çok geniş (50m) olursa yan sokağa atabilir. 25m ideal.
                preference: window.google.maps.StreetViewPreference.BEST, // En yakın değil, en "iyi" eşleşmeyi bul
                source: window.google.maps.StreetViewSource.DEFAULT // Sadece outdoor zorlamasını kaldır (Veri eksik olabilir)
            }, (data, status) => {
                if (status === 'OK' && data && data.location) {
                    const newLoc = data.location.latLng;

                    // Panoramayı oraya taşı
                    panoramaRef.current.setPosition(newLoc);

                    // Hakkı düş
                    teleportRightsRef.current -= 1;
                    setTeleportRights(prev => prev - 1);

                    // YENİ ANCHOR NOKTASI: Işınlanınca merkez burası olur
                    movementAnchorRef.current = { lat: newLoc.lat(), lng: newLoc.lng() };
                    lastValidPosRef.current = { lat: newLoc.lat(), lng: newLoc.lng() };

                    // State ve Socket güncellemesi zaten 'position_changed' listener'ı tarafından yapılacak
                    // O yüzden burada manuel setPosition veya emit yapmaya gerek yok.
                    // panoramaRef.current.setPosition() -> triggers 'position_changed' -> updates state -> emits socket
                } else {
                    console.warn("No Street View found near click location.");
                }
            });
        });

        // Event Listeners
        // Event Listeners
        panorama.addListener('position_changed', () => {
            const newPos = panorama.getPosition();
            if (newPos) {
                const lat = newPos.lat();
                const lng = newPos.lng();

                // --- HAREKET KISITLAMASI (Sadece Anlatıcı) ---
                if (role === 'narrator' && movementAnchorRef.current) {
                    const dist = getDistance(lat, lng, movementAnchorRef.current.lat, movementAnchorRef.current.lng);

                    // 50 Metreden fazla uzaklaştıysa
                    if (dist > 50) {
                        // Geri Işınla (Son geçerli konuma)
                        if (lastValidPosRef.current) {
                            panorama.setPosition(lastValidPosRef.current);
                        }
                        return; // Güncellemeyi durdur
                    } else {
                        // Mesafe uygun, bu konumu "Son Geçerli" olarak kaydet
                        lastValidPosRef.current = { lat, lng };
                    }
                }

                setPosition({ lat, lng });

                if (mapInstanceRef.current) {
                    mapInstanceRef.current.setCenter({ lat, lng });
                }

                socketRef.current?.emit('update-position', {
                    lat, lng,
                    heading: panorama.getPov().heading,
                    roomId
                });
            }
        });

        panorama.addListener('zoom_changed', () => {
            setZoom(panorama.getZoom());
        });

        panorama.addListener('pov_changed', () => {
            setHeading(panorama.getPov().heading);
        });

    }, [isMapLoaded, uiMode, roundKey]); // roundKey değişince haritayı yeniden oluştur

    // 4. Marker Güncelleme (Rendering + Visibility Rule)
    useEffect(() => {
        if (!mapInstanceRef.current || !panoramaRef.current || !window.google) return;

        otherPlayers.forEach((pData, id) => {
            const dist = getDistance(position.lat, position.lng, pData.lat, pData.lng);

            // DİNAMİK GÖRÜŞ MESAFESİ
            const { visibility } = calculateRanges(currentGameSpawnDist);

            // VISIBILITY RULE: 100m'den uzaktaysa ve Oyun Modundaysan GİZLE
            // İstisna: Dev Mode, veya Oyun Sonu (narratorFound), veya Lobi
            const isVisible = (dist < visibility) || narratorFound || DEV_MODE || uiMode !== 'game';

            if (!isVisible) {
                // Gizle
                if (markersRef.current.has(id)) {
                    markersRef.current.get(id).setMap(null);
                }
                if (streetMarkersRef.current.has(id)) {
                    streetMarkersRef.current.get(id).setMap(null);
                }
                return;
            }

            // A. Minimap (2D) - 100m Limit
            if (dist > visibility) {
                if (markersRef.current.has(id)) {
                    markersRef.current.get(id).setMap(null);
                }
            } else {
                // Görünür olmalı
                if (markersRef.current.has(id)) {
                    const marker = markersRef.current.get(id);
                    if (marker.getMap() === null) marker.setMap(mapInstanceRef.current);

                    marker.setPosition({ lat: pData.lat, lng: pData.lng });

                    const icon = marker.getIcon();
                    if (icon && icon.fillColor !== pData.color && pData.color) {
                        marker.setIcon({ ...icon, fillColor: pData.color });
                    }
                } else {
                    const marker2D = new window.google.maps.Marker({
                        position: { lat: pData.lat, lng: pData.lng },
                        map: mapInstanceRef.current,
                        icon: {
                            path: window.google.maps.SymbolPath.CIRCLE,
                            scale: 5,
                            fillColor: pData.color || "#FF4444",
                            fillOpacity: 1,
                            strokeColor: "white",
                            strokeWeight: 2,
                        }
                    });
                    markersRef.current.set(id, marker2D);
                }
            }

            // B. Street View Avatar (3D) - 100m Limit (User preference)
            if (dist > visibility) { // Aslında visibility check zaten 50m, burası 'dist > 45' idi.
                if (streetMarkersRef.current.has(id)) {
                    streetMarkersRef.current.get(id).setMap(null);
                }
            } else {
                // Görünür olmalı
                if (streetMarkersRef.current.has(id)) {
                    const marker = streetMarkersRef.current.get(id);
                    if (marker.getMap() === null) marker.setMap(panoramaRef.current);

                    animateMarker(marker, pData.lat, pData.lng, (currentPos) => {
                        const d = getDistance(position.lat, position.lng, currentPos.lat(), currentPos.lng());
                        const iconData = getDynamicAvatar(
                            d,
                            pData.username || "Oyuncu",
                            pData.color,
                            pData.avatarType || 'char1',
                            pData.accessories || {}
                        );
                        marker.setIcon(iconData);
                    });

                    // Label kullanımına artık gerek yok, isim iconData içinde.
                } else {
                    const iconData = getDynamicAvatar(
                        dist,
                        pData.username || "Oyuncu",
                        pData.color,
                        pData.avatarType || 'char1',
                        pData.accessories || {}
                    );
                    const avatar3D = new window.google.maps.Marker({
                        position: { lat: pData.lat, lng: pData.lng },
                        map: panoramaRef.current,
                        icon: iconData,
                        title: pData.username || "Oyuncu",
                        clickable: false,
                        optimized: false
                        // Label yok
                    });
                    streetMarkersRef.current.set(id, avatar3D);
                }
            }
        });
    }, [otherPlayers, position, zoom, narratorFound, uiMode, currentGameSpawnDist]); // Visibility için bağımlılıklar

    // 5. Rotation
    // 5. Rotation - ARTIK KULLANILMIYOR (Harita sabit kalsın, ok dönsün)
    // useEffect(() => {
    //     if (minimapRef.current) {
    //         minimapRef.current.style.transform = `translate(-50%, -50%) rotate(${-heading}deg)`;
    //     }
    // }, [heading]);

    // 6. FPS Controls (Mouse Look + Keyboard Move)
    useEffect(() => {
        if (!isMapLoaded) return;

        // FPS Mode Check
        if (!isFpsMode) {
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
            return;
        }

        const container = mapRef.current;
        const handleClick = () => {
            if (container && document.pointerLockElement !== container) {
                container.requestPointerLock();
            }
        };

        const handleMouseMove = (e) => {
            if (document.pointerLockElement === container && panoramaRef.current) {
                const { movementX, movementY } = e;
                const pov = panoramaRef.current.getPov();

                const newHeading = pov.heading + (movementX * sensitivity);
                const newPitch = pov.pitch - (movementY * sensitivity);

                panoramaRef.current.setPov({
                    heading: newHeading,
                    pitch: Math.min(Math.max(newPitch, -85), 85)
                });
            }
        };

        const handleKeyDown = (e) => {
            if (document.pointerLockElement === container && panoramaRef.current) {
                const key = e.key.toLowerCase();
                if (key === 'w') {
                    const links = panoramaRef.current.getLinks();
                    const heading = panoramaRef.current.getPov().heading;
                    if (links) {
                        let bestLink = null;
                        let minDiff = 360;
                        links.forEach(link => {
                            let diff = Math.abs(link.heading - heading) % 360;
                            if (diff > 180) diff = 360 - diff;
                            if (diff < minDiff) {
                                minDiff = diff;
                                bestLink = link;
                            }
                        });
                        if (bestLink && minDiff < 90) {
                            panoramaRef.current.setPano(bestLink.pano);
                        }
                    }
                }
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('keydown', handleKeyDown);
        if (container) container.addEventListener('click', handleClick);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('keydown', handleKeyDown);
            if (container) container.removeEventListener('click', handleClick);
        };
    }, [isMapLoaded, isFpsMode, sensitivity]);

    // Timer Logic
    const [timeLeft, setTimeLeft] = useState(0);
    useEffect(() => {
        if (gameEndTime && !gameOverData) {
            const timer = setInterval(() => {
                const now = Date.now();
                const diff = Math.max(0, Math.ceil((gameEndTime - now) / 1000));
                setTimeLeft(diff);
                if (diff <= 0) {
                    clearInterval(timer);
                    // Süre doldu, servera bildir (Sadece host yapsın ki çakışma/spam olmasın)
                    if (isCreator) {
                        socketRef.current.emit('time-up', { roomId });
                    }
                }
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [gameEndTime, gameOverData, roomId]); // Dependency'e roomId eklendi



    // --- REVEAL COUNTDOWN TIMER ---
    useEffect(() => {
        if (showStartLocation && revealTimeLeft > 0) {
            const timer = setInterval(() => {
                setRevealTimeLeft(prev => {
                    if (prev <= 1) {
                        setShowStartLocation(false);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [showStartLocation, revealTimeLeft]);

    // --- START LOCATION MAP INIT ---
    // Anlatıcının başlangıç konumunu gösteren haritayı oluşturur
    useEffect(() => {
        // showStartLocation true ise ve showRoleReveal bittiyse (DOM'da ise)
        if (showStartLocation && narratorStartPos && !showRoleReveal) {
            console.log("📍 Start Location Effect Tetiklendi", { pos: narratorStartPos });

            // DOM'un render edilmesi için kısa bir gecikme
            const timer = setTimeout(() => {
                const mapDiv = startLocationMapRef.current;

                if (mapDiv && window.google) {
                    console.log("🗺️ Harita OLUŞTURULUYOR...", mapDiv);
                    try {
                        const mapOptions = {
                            center: narratorStartPos,
                            zoom: 18,
                            disableDefaultUI: true,
                            draggable: false,
                            zoomControl: false,
                            scrollwheel: false,
                            disableDoubleClickZoom: true,
                            mapTypeId: 'satellite'
                        };

                        const map = new window.google.maps.Map(mapDiv, mapOptions);

                        // KOCAMAN DAİRE (200m) - Güncellendi
                        const circle = new window.google.maps.Circle({
                            center: narratorStartPos,
                            radius: 200,
                            map: map,
                            fillColor: '#FF8800',
                            fillOpacity: 0.4,
                            strokeColor: '#FF8800',
                            strokeOpacity: 0.9,
                            strokeWeight: 4
                        });

                        // Daireyi sığdır
                        map.fitBounds(circle.getBounds());
                        console.log("✅ Harita Başarıyla Oluşturuldu");
                    } catch (err) {
                        console.error("❌ Harita Hatası:", err);
                        mapDiv.innerHTML = `<div style='color:red; padding:20px'>Harita Hatası: ${err.message}</div>`;
                    }
                } else {
                    console.error("❌ Ref yok veya Google yüklü değil!", { mapDiv, google: !!window.google });
                }
            }, 100);

            return () => clearTimeout(timer);
        }
    }, [showStartLocation, narratorStartPos, showRoleReveal]); // showRoleReveal değişince tekrar kontrol et

    // NEXT ROUND Butonu (Host tarafından çağrılır)
    // NEXT ROUND Butonu (Host tarafından çağrılır)
    const handleNextRound = () => {
        setIsLoading(true); // HEMEN AÇ
        setUiMode('waiting'); // Hemen Lobiye (ve maskeye) geç
        if (socketRef.current) {
            socketRef.current.emit('next-round', { roomId });

            // UI'ın sıfırlanması ve herkesin senkronize olması için kısa bir gecikme ekliyoruz.
            // Bu "bambaşka çözüm", her iki tarafın önce temizlenmesini garanti eder.
            setTimeout(() => {
                handleStartGame(); // Yeni konum aramasını başlat (2 saniye sonra)
            }, 2000);
        }
    };

    // Format Timer
    const formatTime = (s) => {
        const m = Math.floor(s / 60);
        const secs = s % 60;
        return `${m}:${secs < 10 ? '0' : ''}${secs}`;
    };

    return (
        <div className="app">
            {/* LANDING PAGE */}
            {uiMode === 'landing' && (
                <LandingPage onPlay={() => setUiMode('lobby')} />
            )}

            {/* LOBBY / WAITING ROOM */}
            {(uiMode === 'lobby' || uiMode === 'waiting') && !DEV_MODE && (
                <Lobby
                    onJoin={handleJoinGame}
                    mode={uiMode}
                    roomId={roomId}
                    isCreator={isCreator}
                    participants={Array.from(otherPlayers.values())}
                    onStart={handleStartGame}
                    myUsername={username}
                    myColor={myColor}
                    isLoading={isLoading}
                    isIntermission={hasGameStartedOnce}
                    onLeave={handleLeaveRoom}
                    gameMode={gameMode}
                    setGameMode={handleGameModeChange}
                    customLocations={customLocations}
                    setCustomLocations={setCustomLocations}
                    spawnDistance={spawnDistance}
                    setSpawnDistance={setSpawnDistance}
                    myAvatar={myAvatar}
                    setMyAvatar={setMyAvatar}
                    myAccessories={myAccessories}
                    setMyAccessories={setMyAccessories}
                />
            )}

            {/* GAME SCREEN */}
            {(uiMode === 'game' || DEV_MODE) && (
                <>
                    {/* ROLE REVEAL SCREEN */}
                    {isUiVisible && showRoleReveal && (
                        <div style={{
                            position: 'fixed',
                            top: 0, left: 0, width: '100%', height: '100%',
                            background: 'rgba(10, 14, 26, 0.7)',
                            backdropFilter: 'blur(10px)',
                            WebkitBackdropFilter: 'blur(10px)',
                            zIndex: 9999,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontFamily: "'Fredoka', sans-serif",
                            animation: 'fadeIn 0.5s ease-out'
                        }}>
                            <div style={{
                                fontSize: '1.8rem',
                                letterSpacing: '6px',
                                color: 'rgba(199, 206, 234, 0.7)',
                                fontWeight: '600',
                                marginBottom: '10px'
                            }}>SENİN ROLÜN</div>
                            <div style={{
                                fontSize: '5rem',
                                fontWeight: '900',
                                background: role === 'narrator'
                                    ? 'linear-gradient(135deg, #FF9AA2 0%, #FFB7B2 100%)'
                                    : 'linear-gradient(135deg, #B5EAD7 0%, #C7CEEA 100%)',
                                WebkitBackgroundClip: 'text',
                                backgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                letterSpacing: '4px',
                                textShadow: 'none',
                                filter: `drop-shadow(0 0 30px ${role === 'narrator' ? 'rgba(255, 154, 162, 0.5)' : 'rgba(181, 234, 215, 0.5)'})`
                            }}>
                                {role === 'narrator' ? 'ANLATICI' : 'ARAYICI'}
                            </div>
                            <div style={{
                                marginTop: '25px',
                                color: role === 'narrator' ? 'rgba(255, 183, 178, 0.8)' : 'rgba(199, 206, 234, 0.8)',
                                fontSize: '1.1rem',
                                fontStyle: 'italic',
                                letterSpacing: '1px'
                            }}>
                                {role === 'narrator' ? '"Konumu tarif et ve bulunmasını sağla!"' : '"Anlatıcıyı dinle ve konumu bul!"'}
                            </div>
                        </div>
                    )}

                    {/* HUD (Top Center) */}
                    {isUiVisible && (
                        <div style={{
                            position: 'absolute',
                            top: 20,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            display: 'flex',
                            gap: '20px',
                            zIndex: 1001,
                            opacity: showRoleReveal ? 0 : 1, // CSS Gizleme
                            pointerEvents: showRoleReveal ? 'none' : 'auto',
                            transition: 'opacity 0.5s ease'
                        }}>
                            {/* Room Code Info */}
                            <div style={{
                                background: 'rgba(255, 255, 255, 0.08)',
                                backdropFilter: 'blur(15px)',
                                padding: '10px 25px',
                                borderRadius: '12px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: 'white',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                                minWidth: '100px'
                            }}>
                                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', fontWeight: 'bold', letterSpacing: '1px' }}>ODA</div>
                                <div style={{ fontWeight: '800', color: '#C7CEEA', fontSize: '1.2rem' }}>{roomId}</div>
                            </div>

                            {/* Timer & Status */}
                            <div style={{
                                background: 'rgba(255, 255, 255, 0.08)',
                                backdropFilter: 'blur(15px)',
                                padding: '10px 25px',
                                borderRadius: '12px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: 'white',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                                minWidth: '130px'
                            }}>
                                <div style={{ fontSize: '0.75rem', color: narratorFound ? '#FF9AA2' : 'rgba(255,255,255,0.5)', fontWeight: 'bold', letterSpacing: '1px' }}>
                                    {narratorFound ? 'ANLATICI BULUNDU!' : 'SÜRE'}
                                </div>
                                <div style={{
                                    fontSize: '1.5rem',
                                    fontWeight: '800',
                                    color: narratorFound ? '#FF9AA2' : '#B5EAD7'
                                }}>
                                    {formatTime(timeLeft)}
                                </div>
                            </div>

                            {/* Role Info */}
                            <div style={{
                                background: 'rgba(255, 255, 255, 0.08)',
                                backdropFilter: 'blur(15px)',
                                padding: '10px 25px',
                                borderRadius: '12px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: 'white',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                                minWidth: '120px'
                            }}>
                                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', fontWeight: 'bold', letterSpacing: '1px' }}>ROLÜN</div>
                                <div style={{ fontWeight: '800', color: role === 'narrator' ? '#FF9AA2' : '#C7CEEA', fontSize: '1.1rem' }}>
                                    {role === 'narrator' ? 'ANLATICI' : 'ARAYICI'}
                                </div>
                            </div>

                            {/* Round'u Bitir Button */}
                            <button
                                onClick={() => {
                                    if (!hasVotedToEnd && socketRef.current) {
                                        socketRef.current.emit('vote-end-round', { roomId });
                                        setHasVotedToEnd(true);
                                    }
                                }}
                                disabled={hasVotedToEnd}
                                style={{
                                    background: hasVotedToEnd ? 'rgba(181, 234, 215, 0.2)' : 'rgba(255, 218, 193, 0.2)',
                                    backdropFilter: 'blur(15px)',
                                    padding: '10px 25px',
                                    borderRadius: '12px',
                                    border: hasVotedToEnd ? '1px solid #B5EAD7' : '1px solid #FFDAC1',
                                    color: hasVotedToEnd ? '#B5EAD7' : '#FFDAC1',
                                    cursor: hasVotedToEnd ? 'not-allowed' : 'pointer',
                                    fontWeight: '800',
                                    fontSize: '0.9rem',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    opacity: hasVotedToEnd ? 0.8 : 1
                                }}
                            >
                                {hasVotedToEnd ? '✓ OY VERİLDİ' : 'ROUND\'U BİTİR'}
                                <div style={{ fontSize: '0.7rem', marginTop: '2px', color: 'rgba(255,255,255,0.6)' }}>
                                    {endRoundVotes.length}/{otherPlayers.size + 1} oy
                                </div>
                            </button>
                        </div>
                    )}

                    {/* MINIMAP */}
                    {
                        isUiVisible && (
                            <div className="minimap-wrapper" style={{
                                top: 0,
                                left: 0,
                                width: isMinimapMaximized ? '60vw' : 200,
                                height: isMinimapMaximized ? '40vw' : 200, // Dikdörtgen oran
                                borderRadius: 0,
                                borderTop: 'none',
                                borderLeft: 'none',
                                borderRight: '1px solid #333',
                                borderBottom: '1px solid #333',
                                background: '#0a0e1a',
                                boxShadow: isMinimapMaximized ? '0 0 50px rgba(0,0,0,0.5)' : 'none',
                                zIndex: isMinimapMaximized ? 2000 : 10,
                                transition: 'all 0.3s ease',
                                opacity: showRoleReveal ? 0 : 1, // CSS Gizleme (Map instance korunsun diye)
                                pointerEvents: showRoleReveal ? 'none' : 'auto'
                            }}>
                                <div key={`minimap-${roundKey}`} ref={minimapRef} className="minimap-content"></div>
                                <div className="player-marker-ui" style={{
                                    // SVG Rotasyonu. CSS'teki transformu ezer, o yüzden translate'i de ekliyoruz.
                                    transform: `translate(-50%, -50%) rotate(${heading}deg)`
                                }}>
                                    {/* Neon filtresi kaldırıldı */}
                                    <svg width="100%" height="100%" viewBox="0 0 24 24" style={{ overflow: 'visible' }}>
                                        {/* Beyaz Çerçeveli İçeren Damla - Orta Boy, Daha Yumuşak (Tatlış) */}
                                        <path
                                            d="M 12 -2 C 12 -2 20 5 20 12 A 8 8 0 1 1 4 12 C 4 5 12 -2 12 -2 Z"
                                            fill={myColor}
                                            stroke="#ffffff"
                                            strokeWidth="2"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                </div>

                                {/* Işınlanma Hakkı Göstergesi (Sadece Maximized iken) */}
                                {isMinimapMaximized && (
                                    <div style={{
                                        position: 'absolute',
                                        bottom: 5,
                                        left: 5,
                                        background: 'rgba(0,0,0,0.6)',
                                        color: teleportRights > 0 ? '#00ff88' : '#ff4444',
                                        padding: '5px 10px',
                                        borderRadius: '5px',
                                        fontSize: '0.8rem',
                                        fontWeight: 'bold',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        zIndex: 2002
                                    }}>
                                        Işınlanma: {teleportRights}
                                    </div>
                                )}

                                {/* Maximize/Minimize Button */}
                                <button
                                    onClick={() => setIsMinimapMaximized(!isMinimapMaximized)}
                                    style={{
                                        position: 'absolute',
                                        bottom: 5,
                                        right: 5,
                                        width: '30px',
                                        height: '30px',
                                        background: 'rgba(0,0,0,0.6)',
                                        color: 'white',
                                        border: '1px solid rgba(255,255,255,0.3)',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '1.2rem',
                                        zIndex: 2001
                                    }}
                                    title={isMinimapMaximized ? "Küçült" : "Büyüt"}
                                >
                                    {isMinimapMaximized ? '↙' : '⤢'}
                                </button>
                            </div>
                        )
                    }

                    <div key={`streetview-${roundKey}`} ref={mapRef} className="street-view">
                        {!isMapLoaded && <div style={{ color: 'white', textAlign: 'center', paddingTop: 100 }}>Yükleniyor...</div>}
                    </div>




                    {/* GAME START LOCATION REVEAL (15 SECONDS) */}
                    {
                        isUiVisible && showStartLocation && !showRoleReveal && (
                            <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                width: '600px',
                                height: 'auto',
                                zIndex: 2500,
                                background: 'rgba(15, 20, 35, 0.75)',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                                padding: '25px',
                                borderRadius: '24px',
                                boxShadow: '0 8px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(199, 206, 234, 0.15)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                border: '1px solid rgba(199, 206, 234, 0.25)',
                                animation: 'fadeIn 0.4s ease-out'
                            }}>
                                {/* Close Button */}
                                <button
                                    onClick={() => setShowStartLocation(false)}
                                    style={{
                                        position: 'absolute',
                                        top: '15px',
                                        right: '15px',
                                        background: 'rgba(199, 206, 234, 0.15)',
                                        border: '1px solid rgba(199, 206, 234, 0.3)',
                                        color: '#C7CEEA',
                                        fontSize: '1rem',
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '50%',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.2s ease',
                                        fontWeight: 'bold'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.target.style.background = 'rgba(255, 100, 100, 0.4)';
                                        e.target.style.borderColor = 'rgba(255, 100, 100, 0.6)';
                                        e.target.style.color = '#fff';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.target.style.background = 'rgba(199, 206, 234, 0.15)';
                                        e.target.style.borderColor = 'rgba(199, 206, 234, 0.3)';
                                        e.target.style.color = '#C7CEEA';
                                    }}
                                >
                                    ✕
                                </button>

                                {/* Başlık */}
                                <div style={{
                                    color: '#C7CEEA',
                                    fontSize: '1.4rem',
                                    marginBottom: '8px',
                                    fontWeight: '800',
                                    letterSpacing: '2px',
                                    textAlign: 'center',
                                    textShadow: '0 0 20px rgba(199, 206, 234, 0.4)'
                                }}>
                                    ANLATICI: {narratorId === myId ? 'Sensin' : (otherPlayers.get(narratorId)?.username || 'Bilinmiyor')}
                                </div>
                                <div style={{
                                    color: '#B5EAD7',
                                    fontSize: '1rem',
                                    marginBottom: '20px',
                                    fontWeight: '600',
                                    letterSpacing: '1px'
                                }}>
                                    Burada başlıyor!
                                </div>

                                {/* Map Wrapper to clip Google UI elements */}
                                <div style={{
                                    width: '560px',
                                    height: '300px',
                                    borderRadius: '16px',
                                    overflow: 'hidden',
                                    position: 'relative',
                                    border: '2px solid rgba(199, 206, 234, 0.3)',
                                    boxShadow: '0 4px 30px rgba(0, 0, 0, 0.4), inset 0 0 20px rgba(0, 0, 0, 0.2)'
                                }}>
                                    <div
                                        ref={startLocationMapRef}
                                        style={{
                                            width: '100%',
                                            height: '115%',
                                            marginTop: '-5px',
                                            backgroundColor: 'rgba(10, 14, 26, 0.8)'
                                        }}
                                    >
                                        <div style={{ color: '#C7CEEA', padding: '20px', textAlign: 'center' }}>Harita Yükleniyor...</div>
                                    </div>
                                </div>

                                {/* Countdown */}
                                <div style={{
                                    color: '#B5EAD7',
                                    marginTop: '20px',
                                    fontSize: '1.1rem',
                                    fontWeight: '600',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    <span style={{ opacity: 0.8 }}>Dikkatli bakın!</span>
                                    <span style={{
                                        color: '#fff',
                                        fontSize: '1.5rem',
                                        fontWeight: '900',
                                        background: 'rgba(199, 206, 234, 0.2)',
                                        padding: '4px 12px',
                                        borderRadius: '8px',
                                        minWidth: '40px',
                                        textAlign: 'center'
                                    }}>
                                        {revealTimeLeft}
                                    </span>
                                    <span style={{ opacity: 0.8 }}>saniye kaldı...</span>
                                </div>
                            </div>
                        )
                    }

                    {/* SETTINGS BUTTON - Fixed Positioning */}
                    {
                        isUiVisible && (
                            <div style={{
                                position: 'absolute', bottom: 30, left: 30, zIndex: 2000,
                                opacity: showRoleReveal ? 0 : 1,
                                pointerEvents: showRoleReveal ? 'none' : 'auto',
                                transition: 'opacity 0.5s ease',
                                display: 'flex',
                                gap: '15px'
                            }}>
                                <button
                                    onClick={() => setIsSettingsOpen(true)}
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.08)',
                                        backdropFilter: 'blur(15px)',
                                        padding: '12px 20px',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        color: '#C7CEEA',
                                        cursor: 'pointer',
                                        fontWeight: '800',
                                        fontSize: '0.9rem',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                >
                                    ⚙️ Ayarlar
                                </button>
                                <button
                                    onClick={() => setShowReturnConfirm(true)}
                                    style={{
                                        background: 'rgba(255, 154, 162, 0.15)',
                                        backdropFilter: 'blur(15px)',
                                        color: '#FF9AA2',
                                        border: '1px solid rgba(255, 154, 162, 0.3)',
                                        padding: '12px 20px',
                                        borderRadius: '12px',
                                        cursor: 'pointer',
                                        fontWeight: '800',
                                        fontSize: '0.9rem',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 154, 162, 0.25)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 154, 162, 0.15)'}
                                >
                                    🚪 Lobiye Dön
                                </button>
                            </div>
                        )
                    }

                    {/* GAME OVER MODAL */}
                    {
                        isUiVisible && gameOverData && (
                            <div style={{
                                position: 'fixed',
                                top: 0, left: 0, right: 0, bottom: 0,
                                zIndex: 99999,
                                background: 'rgba(10, 14, 26, 0.85)',
                                backdropFilter: 'blur(10px)',
                                WebkitBackdropFilter: 'blur(10px)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                animation: 'fadeIn 0.4s ease-out'
                            }}>
                                <div style={{
                                    maxWidth: '600px',
                                    width: '90%',
                                    padding: '30px',
                                    background: 'rgba(20, 25, 40, 0.8)',
                                    backdropFilter: 'blur(20px)',
                                    WebkitBackdropFilter: 'blur(20px)',
                                    borderRadius: '24px',
                                    border: '1px solid rgba(199, 206, 234, 0.25)',
                                    boxShadow: '0 8px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(199, 206, 234, 0.1)',
                                    color: 'white',
                                    fontFamily: "'Fredoka', sans-serif"
                                }}>
                                    {/* Başlık */}
                                    <h1 style={{
                                        fontSize: '2.5rem',
                                        marginBottom: '0.5rem',
                                        textAlign: 'center',
                                        background: 'linear-gradient(to right, #FF9AA2, #C7CEEA)',
                                        WebkitBackgroundClip: 'text',
                                        backgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                        textShadow: 'none',
                                        fontWeight: '900',
                                        letterSpacing: '2px'
                                    }}>
                                        {gameOverData.reason === 'narrator_found' ? 'ANLATICI YAKALANDI!' : 'SÜRE DOLDU!'}
                                    </h1>
                                    <div style={{
                                        fontSize: '1.2rem',
                                        color: gameOverData.reason === 'narrator_found' ? '#B5EAD7' : '#FF9AA2',
                                        textAlign: 'center',
                                        marginBottom: '20px',
                                        fontWeight: '600'
                                    }}>
                                        {gameOverData.reason === 'narrator_found' ? 'Arayıcılar Kazandı' : 'Anlatıcı Kazandı'}
                                    </div>

                                    {/* KONUM BİLGİSİ */}
                                    {gameOverData.locationInfo && (
                                        <div style={{
                                            marginTop: '10px',
                                            padding: '12px 16px',
                                            background: 'rgba(199, 206, 234, 0.1)',
                                            borderRadius: '12px',
                                            textAlign: 'center',
                                            border: '1px solid rgba(199, 206, 234, 0.2)'
                                        }}>
                                            <div style={{ fontSize: '0.8rem', color: '#C7CEEA', marginBottom: '4px', letterSpacing: '1px', fontWeight: '600' }}>KONUM</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'white' }}>
                                                {gameOverData.locationInfo.city}, {gameOverData.locationInfo.country} 🌍
                                            </div>
                                        </div>
                                    )}

                                    {/* UYDU GÖRÜNTÜSÜ */}
                                    {gameOverData.narratorLocation && (
                                        <div style={{
                                            marginTop: '15px',
                                            padding: '12px',
                                            background: 'rgba(15, 20, 35, 0.6)',
                                            borderRadius: '16px',
                                            border: '2px solid rgba(199, 206, 234, 0.25)',
                                            boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.3)'
                                        }}>
                                            <div style={{ fontSize: '0.85rem', color: '#B5EAD7', marginBottom: '10px', fontWeight: 'bold', textAlign: 'center' }}>
                                                📍 KONUM UYDU GÖRÜNTÜSÜ
                                            </div>
                                            <img
                                                src={`https://maps.googleapis.com/maps/api/staticmap?center=${gameOverData.narratorLocation.lat},${gameOverData.narratorLocation.lng}&zoom=15&size=550x300&maptype=satellite&markers=color:red%7C${gameOverData.narratorLocation.lat},${gameOverData.narratorLocation.lng}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`}
                                                alt="Konum Uydu Görüntüsü"
                                                style={{
                                                    width: '100%',
                                                    borderRadius: '12px',
                                                    border: '1px solid rgba(199, 206, 234, 0.15)'
                                                }}
                                            />
                                        </div>
                                    )}

                                    {/* SKORLAR */}
                                    <div style={{ margin: '20px 0', textAlign: 'left', maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        {/* ANLATICI BÖLÜMÜ */}
                                        <div>
                                            <div style={{
                                                color: '#FF9AA2',
                                                fontSize: '0.85rem',
                                                fontWeight: 'bold',
                                                marginBottom: '10px',
                                                borderBottom: '1px solid rgba(255, 154, 162, 0.3)',
                                                paddingBottom: '6px',
                                                letterSpacing: '1px'
                                            }}>
                                                ANLATICI
                                            </div>
                                            {gameOverData.scores.filter(s => s.role === 'narrator').map((s, i) => (
                                                <div key={`narrator-${i}`} style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    padding: '12px 14px',
                                                    background: s.isWinner ? 'rgba(181, 234, 215, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                                    marginBottom: '6px',
                                                    borderRadius: '10px',
                                                    border: s.isWinner ? '1px solid rgba(181, 234, 215, 0.4)' : '1px solid rgba(255, 255, 255, 0.05)'
                                                }}>
                                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                        <span style={{ fontWeight: 'bold', color: 'white' }}>{s.username}</span>
                                                    </div>
                                                    <div style={{ fontWeight: 'bold', color: '#FF9AA2' }}>{s.score} Puan</div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* ARAYICILAR BÖLÜMÜ */}
                                        <div>
                                            <div style={{
                                                color: '#C7CEEA',
                                                fontSize: '0.85rem',
                                                fontWeight: 'bold',
                                                marginBottom: '10px',
                                                borderBottom: '1px solid rgba(199, 206, 234, 0.3)',
                                                paddingBottom: '6px',
                                                letterSpacing: '1px'
                                            }}>
                                                ARAYICILAR
                                            </div>
                                            {gameOverData.scores.filter(s => s.role === 'seeker').map((s, i) => (
                                                <div key={`seeker-${i}`} style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    padding: '12px 14px',
                                                    background: s.isWinner ? 'rgba(181, 234, 215, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                                    marginBottom: '6px',
                                                    borderRadius: '10px',
                                                    border: s.isWinner ? '1px solid rgba(181, 234, 215, 0.4)' : '1px solid rgba(255, 255, 255, 0.05)'
                                                }}>
                                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                        <span style={{ color: 'rgba(199, 206, 234, 0.6)', fontSize: '0.9rem' }}>#{i + 1}</span>
                                                        <span style={{ fontWeight: 'bold', color: 'white' }}>{s.username}</span>
                                                    </div>
                                                    <div style={{ fontWeight: 'bold', color: '#C7CEEA' }}>{s.score} Puan</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* BUTONLAR */}
                                    {(isCreator || gameOverData.isFinalGameEnd) && (
                                        <button
                                            onClick={gameOverData.isFinalGameEnd ? handleReturnToLobby : handleNextRound}
                                            style={{
                                                width: '100%',
                                                padding: '16px',
                                                background: gameOverData.isFinalGameEnd
                                                    ? 'rgba(255, 255, 255, 0.1)'
                                                    : 'linear-gradient(135deg, #B5EAD7 0%, #C7CEEA 100%)',
                                                color: gameOverData.isFinalGameEnd ? '#C7CEEA' : '#1a1a2e',
                                                border: gameOverData.isFinalGameEnd ? '1px solid rgba(199, 206, 234, 0.3)' : 'none',
                                                borderRadius: '12px',
                                                fontSize: '1.1rem',
                                                fontWeight: '800',
                                                cursor: isLoading ? 'not-allowed' : 'pointer',
                                                opacity: isLoading ? 0.7 : 1,
                                                pointerEvents: isLoading ? 'none' : 'auto',
                                                transition: 'all 0.3s ease',
                                                letterSpacing: '1px'
                                            }}
                                        >
                                            {isLoading ? 'ARANIYOR...' : (gameOverData.isFinalGameEnd ? 'OYUNU BİTİR (LOBİYE DÖN)' : 'SONRAKİ TURA GEÇ')}
                                        </button>
                                    )}
                                    {!isCreator && !gameOverData.isFinalGameEnd && (
                                        <div style={{ color: 'rgba(199, 206, 234, 0.7)', marginTop: '15px', textAlign: 'center', fontSize: '0.95rem' }}>
                                            Oda kurucusunun yeni turu başlatması bekleniyor...
                                        </div>
                                    )}
                                    {gameOverData.isFinalGameEnd && (
                                        <div style={{ color: '#B5EAD7', marginTop: '15px', fontSize: '0.95rem', textAlign: 'center', fontWeight: '600' }}>
                                            🏆 Herkes anlatıcı görevini tamamladı!
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    }                </>
            )}

            {/* AYARLAR PANELİ (MODAL) */}
            {
                isUiVisible && isSettingsOpen && (
                    <div style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(10, 14, 26, 0.7)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        zIndex: 3000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        animation: 'fadeIn 0.3s ease-out'
                    }}>
                        <div style={{
                            background: 'rgba(20, 25, 40, 0.85)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            padding: '25px 30px',
                            borderRadius: '20px',
                            border: '1px solid rgba(199, 206, 234, 0.25)',
                            width: '320px',
                            color: 'white',
                            boxShadow: '0 8px 50px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(199, 206, 234, 0.1)',
                            fontFamily: "'Fredoka', sans-serif"
                        }}>
                            {/* Header */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '20px',
                                paddingBottom: '15px',
                                borderBottom: '1px solid rgba(199, 206, 234, 0.15)'
                            }}>
                                <h2 style={{
                                    margin: 0,
                                    fontSize: '1.3rem',
                                    color: '#C7CEEA',
                                    fontWeight: '800',
                                    letterSpacing: '1px'
                                }}>Ayarlar</h2>
                                <button
                                    onClick={() => setIsSettingsOpen(false)}
                                    style={{
                                        background: 'rgba(199, 206, 234, 0.1)',
                                        border: '1px solid rgba(199, 206, 234, 0.2)',
                                        color: '#C7CEEA',
                                        fontSize: '1.2rem',
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '50%',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.target.style.background = 'rgba(255, 100, 100, 0.3)';
                                        e.target.style.borderColor = 'rgba(255, 100, 100, 0.5)';
                                        e.target.style.color = '#fff';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.target.style.background = 'rgba(199, 206, 234, 0.1)';
                                        e.target.style.borderColor = 'rgba(199, 206, 234, 0.2)';
                                        e.target.style.color = '#C7CEEA';
                                    }}
                                >&times;</button>
                            </div>

                            {/* Kontrol Modu */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '12px 0',
                                borderBottom: '1px solid rgba(199, 206, 234, 0.1)'
                            }}>
                                <span style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.95rem' }}>Kontrol Modu</span>
                                <button
                                    onClick={() => setIsFpsMode(prev => !prev)}
                                    style={{
                                        padding: '8px 16px',
                                        background: isFpsMode
                                            ? 'linear-gradient(135deg, #B5EAD7 0%, #98D4BB 100%)'
                                            : 'rgba(199, 206, 234, 0.15)',
                                        color: isFpsMode ? '#1a1a2e' : '#C7CEEA',
                                        border: isFpsMode ? 'none' : '1px solid rgba(199, 206, 234, 0.3)',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem',
                                        fontWeight: '700',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    {isFpsMode ? 'FPS Modu' : 'Mouse Modu'}
                                </button>
                            </div>

                            {/* Hassasiyet Slider (FPS modunda) */}
                            {isFpsMode && (
                                <div style={{ padding: '15px 0', borderBottom: '1px solid rgba(199, 206, 234, 0.1)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                        <span style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.95rem' }}>Hassasiyet</span>
                                        <span style={{
                                            color: '#B5EAD7',
                                            fontSize: '0.9rem',
                                            background: 'rgba(181, 234, 215, 0.15)',
                                            padding: '2px 10px',
                                            borderRadius: '4px',
                                            fontWeight: '600'
                                        }}>{sensitivity.toFixed(2)}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.01"
                                        max="1.0"
                                        step="0.01"
                                        value={sensitivity}
                                        onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                                        style={{
                                            width: '100%',
                                            cursor: 'pointer',
                                            accentColor: '#B5EAD7'
                                        }}
                                    />
                                </div>
                            )}

                            {/* Bilgi Metni */}
                            <div style={{
                                marginTop: '20px',
                                fontSize: '0.8rem',
                                color: 'rgba(199, 206, 234, 0.5)',
                                textAlign: 'center',
                                lineHeight: '1.6'
                            }}>
                                FPS Modunda iken: <br />
                                <span style={{ color: 'rgba(181, 234, 215, 0.7)' }}>Mouse ile etrafa bak</span> <br />
                                <span style={{ color: 'rgba(181, 234, 215, 0.7)' }}>'W' ile ilerle</span> <br />
                                <span style={{ color: 'rgba(255, 154, 162, 0.7)' }}>ESC ile çık</span>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* DEVELOPER CONTROL PANEL (F8) */}
            {
                DEV_MODE && isDevPanelOpen && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        right: 0,
                        width: '300px',
                        height: '100vh',
                        background: 'rgba(0, 0, 0, 0.9)',
                        borderLeft: '2px solid #00ff88',
                        padding: '20px',
                        zIndex: 100000,
                        overflowY: 'auto',
                        fontFamily: 'monospace',
                        color: '#00ff88',
                        boxShadow: '-5px 0 15px rgba(0,0,0,0.5)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>DEV TOOLS</h2>
                            <button onClick={() => setIsDevPanelOpen(false)} style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '1.2rem' }}>X</button>
                        </div>

                        {/* STATE CONTROLS */}
                        <div className="dev-section" style={{ marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '1rem', color: 'white', marginBottom: '10px' }}>GAME STATE</h3>
                            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                <button onClick={() => setUiMode(uiMode === 'game' ? 'waiting' : 'game')} style={devButtonStyle}>
                                    Toggle Mode: {uiMode.toUpperCase()}
                                </button>
                                <button onClick={() => setRole(role === 'narrator' ? 'seeker' : 'narrator')} style={devButtonStyle}>
                                    Toggle Role: {role ? role.toUpperCase() : 'NONE'}
                                </button>
                            </div>
                        </div>

                        {/* UI OVERLAYS */}
                        <div className="dev-section" style={{ marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '1rem', color: 'white', marginBottom: '10px' }}>UI OVERLAYS</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <button onClick={() => setShowRoleReveal(!showRoleReveal)} style={devButtonStyle}>
                                    Toggle Role Reveal ({showRoleReveal ? 'ON' : 'OFF'})
                                </button>
                                <button onClick={() => setShowStartLocation(!showStartLocation)} style={devButtonStyle}>
                                    Toggle Start Map ({showStartLocation ? 'ON' : 'OFF'})
                                </button>
                                <button onClick={() => {
                                    if (gameOverData) setGameOverData(null);
                                    else setGameOverData({ reason: 'narrator_found', scores: [{ username: 'DevBot', score: 999, isWinner: true, role: 'narrator' }] });
                                }} style={devButtonStyle}>
                                    Toggle Game Over Screen
                                </button>
                                <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} style={devButtonStyle}>
                                    Toggle Settings Panel
                                </button>
                            </div>
                        </div>

                        {/* ACTIONS */}
                        <div className="dev-section" style={{ marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '1rem', color: 'white', marginBottom: '10px' }}>ACTIONS & BOTS</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <button onClick={() => {
                                    const lat = 41.0082 + (Math.random() - 0.5) * 0.05;
                                    const lng = 28.9784 + (Math.random() - 0.5) * 0.05;
                                    setPosition({ lat, lng });
                                    if (panoramaRef.current) panoramaRef.current.setPosition({ lat, lng });
                                }} style={devButtonStyle}>
                                    Teleport Random (Istanbul)
                                </button>

                                <button onClick={() => {
                                    const id = 'bot_' + Math.random().toString(36).substr(2, 5);
                                    const lat = position.lat + (Math.random() - 0.5) * 0.002;
                                    const lng = position.lng + (Math.random() - 0.5) * 0.002;
                                    const bot = {
                                        playerId: id,
                                        username: 'Bot_' + Math.floor(Math.random() * 100),
                                        lat, lng,
                                        color: '#' + Math.floor(Math.random() * 16777215).toString(16),
                                        role: Math.random() > 0.5 ? 'narrator' : 'seeker'
                                    };
                                    setOtherPlayers(prev => {
                                        const next = new Map(prev);
                                        next.set(id, bot);
                                        return next;
                                    });
                                }} style={devButtonStyle}>
                                    Add Dummy Bot (Nearby)
                                </button>

                                <button onClick={() => setOtherPlayers(new Map())} style={{ ...devButtonStyle, background: '#5e0000', borderColor: '#ff4444' }}>
                                    Clear All Bots
                                </button>
                            </div>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#666', marginTop: 'auto' }}>
                            Press F8 to Toggle
                        </div>
                    </div>
                )
            }
            {/* RETURN TO LOBBY CONFIRMATION MODAL */}
            {showReturnConfirm && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.85)',
                    zIndex: 20000, // En üstte
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(10px)'
                }}>
                    <div className="lobby-card" style={{
                        maxWidth: '400px',
                        padding: '2rem',
                        textAlign: 'center',
                        position: 'relative' // lobby-card override'larını engellemek için
                    }}>
                        <div style={{ fontSize: '1.8rem', marginBottom: '1rem', fontWeight: 'bold', color: '#ff4444' }}>
                            AYRILMAK İSTİYOR MUSUN?
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '2rem', fontSize: '1rem', lineHeight: '1.5' }}>
                            Mevcut oyunun sonlanacak ve lobiden düşeceksin. Devam etmek istiyor musun?
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                            <button
                                onClick={() => setShowReturnConfirm(false)}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    background: 'rgba(255,255,255,0.05)',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
                                onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.05)'}
                            >
                                Vazgeç
                            </button>
                            <button
                                onClick={() => {
                                    setShowReturnConfirm(false);
                                    handleReturnToLobby();
                                }}
                                className="join-btn"
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    background: '#ff4444',
                                    color: 'white',
                                    border: 'none',
                                    boxShadow: '0 5px 15px rgba(255,68,68,0.3)'
                                }}
                            >
                                Evet, Ayrıl
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ERROR MODAL */}
            {errorMsg && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.85)',
                    zIndex: 30000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(10px)'
                }}>
                    <div className="lobby-card" style={{
                        maxWidth: '400px',
                        padding: '2.5rem',
                        textAlign: 'center',
                        border: '1px solid rgba(255, 68, 68, 0.3)',
                        boxShadow: '0 0 30px rgba(255, 68, 68, 0.15)'
                    }}>
                        <div style={{
                            width: '60px',
                            height: '60px',
                            background: 'rgba(255, 68, 68, 0.15)',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 1.5rem',
                            fontSize: '2rem',
                            color: '#ff4444',
                            border: '2px solid #ff4444'
                        }}>
                            !
                        </div>
                        <div style={{ fontSize: '1.8rem', marginBottom: '1rem', fontWeight: 'bold', color: '#ff4444', letterSpacing: '1px' }}>
                            BİR HATA OLUŞTU
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '2.5rem', fontSize: '1.05rem', lineHeight: '1.6' }}>
                            {errorMsg}
                        </div>
                        <button
                            onClick={() => setErrorMsg(null)}
                            className="join-btn"
                            style={{
                                width: '100%',
                                padding: '14px',
                                background: 'rgba(255,255,255,0.1)',
                                color: 'white',
                                border: '1px solid rgba(255,255,255,0.2)',
                                fontSize: '1.1rem',
                                fontWeight: 'bold'
                            }}
                            onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'}
                            onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
                        >
                            Anladım
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
}

const devButtonStyle = {
    padding: '8px',
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid #00ff88',
    color: 'white',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '0.85rem',
    borderRadius: '4px',
    transition: 'all 0.2s',
    marginBottom: '5px'
};

export default App;
