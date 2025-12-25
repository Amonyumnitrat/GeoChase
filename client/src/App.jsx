import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Lobby from './components/Lobby';
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
    const [uiMode, setUiMode] = useState('lobby'); // 'lobby', 'waiting', 'game'
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
    const startLocationMapRef = useRef(null);
    const [narratorStartPos, setNarratorStartPos] = useState(null);
    const [isMinimapMaximized, setIsMinimapMaximized] = useState(false);
    const [isUiVisible, setIsUiVisible] = useState(true); // UI Toggle State
    const [isDevPanelOpen, setIsDevPanelOpen] = useState(false);

    // Sabitler
    const DEV_MODE = true; // true yaparak lobiyi atlayabilirsin
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

    // Global Avatar Cache
    const avatarImgRef = useRef(null);

    useEffect(() => {
        const img = new Image();
        img.src = "/avatar.png";
        img.onload = () => { avatarImgRef.current = img; };
    }, []);

    // Helper: Canvas ile Dinamik İkon (Resim + İsim Birleşik)
    const getDynamicAvatar = (distance, username, color) => {
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
        if (avatarImgRef.current) {
            // Resmi canvas'ın alt ortasına yerleştir
            const x = (canvasW - targetW) / 2;
            const y = textHeight; // Üstte metin boşluğu bıraktık
            ctx.drawImage(avatarImgRef.current, x, y, targetW, targetH);
        }

        // 2. Metni Çiz (Üst kısma)
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



    // Lobby Join Handler
    const handleJoinGame = (user, code, creator) => {
        setOtherPlayers(new Map()); // Listeyi temizle (Ghostları sil)
        setUsername(user);
        setRoomId(code);
        setIsCreator(creator);
        setUiMode('waiting');
    };

    // GAME START LOGIC (HOST)
    const handleStartGame = (attempts = 0) => {
        console.log(`Game Start Triggered (Attempt ${attempts + 1})`);
        if (!socketRef.current) {
            alert("Sunucu bağlantısı yok!");
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

        if (attempts > 15) {
            alert("Uygun Street View konumu bulunamadı. Lütfen tekrar deneyin.");
            return;
        }

        // Rastgele Konum Seç (İstanbul Geneli) - Kapsamı biraz genişletelim
        const randomLat = 41.0082 + (Math.random() - 0.5) * 0.15;
        const randomLng = 28.9784 + (Math.random() - 0.5) * 0.15;

        console.log("Searching for StreetView at:", randomLat, randomLng);

        const svService = new window.google.maps.StreetViewService();
        svService.getPanorama({
            location: { lat: randomLat, lng: randomLng },
            radius: 1000,
            preference: window.google.maps.StreetViewPreference.NEAREST,
            source: window.google.maps.StreetViewSource.OUTDOOR
        }, (data, status) => {
            if (status === 'OK' && data && data.location && data.location.latLng) {
                // KONTROL: Hareket edilebilir mi? (Link sayısı)
                // Eğer hiç link yoksa oyuncu hareket edemez.
                if (!data.links || data.links.length === 0) {
                    console.warn("⚠️ Street View bulundu ama hareket edilemiyor (Link yok). Tekrar deneniyor...");
                    setTimeout(() => handleStartGame(attempts + 1), 500);
                    return;
                }

                console.log(`✅ StreetView bulundu! Link sayısı: ${data.links.length}`);
                const loc = data.location.latLng;

                // Pano ID'yi de gönderelim ki herkes aynı kareye baksın
                socketRef.current.emit('start-game', {
                    roomId,
                    narratorLocation: {
                        lat: loc.lat(),
                        lng: loc.lng(),
                        panoId: data.location.pano
                    }
                });
            } else {
                console.warn("⚠️ Valid Street View not found, retrying...", status);
                // 500ms bekleyip tekrar dene
                setTimeout(() => handleStartGame(attempts + 1), 500);
            }
        });
    };

    // 0. Room Join Effect
    useEffect(() => {
        if (uiMode === 'waiting' && socketRef.current && roomId) {
            socketRef.current.emit('join-room', { roomId, username });
        }
    }, [uiMode, roomId, username]);

    useEffect(() => {
        try {
            // Canlıya alındığında (Production) sunucu ile client aynı yere bağlansın diye boş bırakıyoruz
            socketRef.current = io();
            socketRef.current.on('connect', () => setIsConnected(true));

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
                setUiMode('game');
                setGameEndTime(data.endTime);
                setNarratorId(data.narratorId);
                setNarratorFound(false);
                setGameOverData(null); // Reset game over screen

                // Show Narrator Start Location
                if (data.initialPositions[data.narratorId]) {
                    setNarratorStartPos({
                        lat: data.initialPositions[data.narratorId].lat,
                        lng: data.initialPositions[data.narratorId].lng
                    });
                    setShowStartLocation(true);
                    setTimeout(() => setShowStartLocation(false), 15000); // 15 Saniye
                }

                // Rolümü Bul, Pozisyonumu Al
                const myData = data.initialPositions[socketRef.current.id];
                if (myData) {
                    setRole(myData.role);

                    // NARRATOR Zaten Valid Konumda Başlıyor
                    if (myData.role === 'narrator') {
                        setPosition({ lat: myData.lat, lng: myData.lng });
                        if (panoramaRef.current) {
                            // Pano ID varsa direkt oraya git (Daha kesin)
                            if (data.initialPositions[socketRef.current.id].panoId) {
                                panoramaRef.current.setPano(data.initialPositions[socketRef.current.id].panoId);
                            } else {
                                panoramaRef.current.setPosition({ lat: myData.lat, lng: myData.lng });
                            }
                        }
                    }
                    // SEEKER İÇİN SNAP LOGIC (Suya düşmemesi için)
                    else {
                        // Server rastgele bir nokta verdi ama bu suyun içi olabilir.
                        // Biz bu noktanın EN YAKININDAKİ street view'i bulup oraya ışınlanalım.
                        const svService = new window.google.maps.StreetViewService();
                        svService.getPanorama({
                            location: { lat: myData.lat, lng: myData.lng },
                            radius: 500, // 500m içinde kara ara
                            preference: window.google.maps.StreetViewPreference.NEAREST,
                            source: window.google.maps.StreetViewSource.OUTDOOR
                        }, (panoData, status) => {
                            if (status === 'OK' && panoData && panoData.location) {
                                const validLat = panoData.location.latLng.lat();
                                const validLng = panoData.location.latLng.lng();
                                console.log("Seekeer Snapped to Road:", validLat, validLng);

                                setPosition({ lat: validLat, lng: validLng });
                                if (panoramaRef.current) {
                                    panoramaRef.current.setPosition({ lat: validLat, lng: validLng });
                                }

                                // Server'a gerçek/geçerli konumumu bildir
                                socketRef.current.emit('update-position', {
                                    lat: validLat, lng: validLng,
                                    heading: 0,
                                    role: 'seeker',
                                    roomId: roomId // Bunu state'den ya da kaplamdan almalı
                                });
                            } else {
                                // Bulamazsa (Örn: Denizin ortası 500m'den uzaksa), ANLATICI'nın yanına ışınla.
                                // Anlatıcı konumu her zaman garantidir.
                                console.warn("Seeker spawn point invalid (water?), fallback to Narrator location.");

                                const narratorPos = data.initialPositions[data.narratorId];
                                if (narratorPos) {
                                    setPosition({ lat: narratorPos.lat, lng: narratorPos.lng });
                                    if (panoramaRef.current) {
                                        // Biraz şaşırtmaca olsun diye 50m rastgele açı ile ışınlayabiliriz ama
                                        // şimdilik direkt güvenli noktaya alalım.
                                        panoramaRef.current.setPosition({ lat: narratorPos.lat, lng: narratorPos.lng });
                                    }
                                    // Servera güncelleme at
                                    socketRef.current.emit('update-position', {
                                        lat: narratorPos.lat, lng: narratorPos.lng,
                                        heading: 0,
                                        role: 'seeker',
                                        roomId: roomId
                                    });
                                }
                            }
                        });
                    }
                }

                // Rol Ekranını Göster
                setShowRoleReveal(true);
                setTimeout(() => setShowRoleReveal(false), 4000); // 4sn sonra kapat
            });

            // ANLATICI BULUNDU (30sn Timer)
            socketRef.current.on('narrator-found', (data) => {
                setNarratorFound(true);
                setGameEndTime(data.newEndTime);
                // Sesli uyarı eklenebilir
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
                setOtherPlayers(prev => {
                    if (data.playerId === socketRef.current.id) return prev;
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
        } catch (err) { console.error(err); }
        return () => socketRef.current?.disconnect();
    }, []);

    // Initial Location Reveal Logic
    useEffect(() => {
        if (showStartLocation && narratorStartPos && window.google) {
            const timer = setTimeout(() => {
                if (startLocationMapRef.current) {
                    const map = new window.google.maps.Map(startLocationMapRef.current, {
                        center: narratorStartPos,
                        zoom: 15,
                        disableDefaultUI: true,
                        styles: [
                            { featureType: "all", elementType: "labels", stylers: [{ visibility: "off" }] },
                            { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
                            { featureType: "water", elementType: "geometry", stylers: [{ color: "#00bfff" }] }
                        ]
                    });
                    new window.google.maps.Marker({
                        position: narratorStartPos,
                        map: map,
                        icon: {
                            path: window.google.maps.SymbolPath.CIRCLE,
                            scale: 10,
                            fillColor: "#FF4444",
                            fillOpacity: 1,
                            strokeColor: "white",
                            strokeWeight: 2,
                        }
                    });
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [showStartLocation, narratorStartPos]);

    // Minimap Resize Trigger -- Harita büyüyüp küçülünce gri kalmaması için
    useEffect(() => {
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
                // 30 metre görüş/bulma mesafesi
                if (dist < 30) {
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

        // Event Listeners
        panorama.addListener('position_changed', () => {
            const newPos = panorama.getPosition();
            if (newPos) {
                const lat = newPos.lat();
                const lng = newPos.lng();
                setPosition({ lat, lng });

                if (mapInstanceRef.current) {
                    mapInstanceRef.current.setCenter({ lat, lng });
                }

                socketRef.current?.emit('update-position', {
                    lat, lng,
                    heading: panorama.getPov().heading,
                    role: 'seeker',
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

    }, [isMapLoaded, uiMode]); // uiMode değişince (game olunca) çalışacak

    // 4. Marker Güncelleme (Rendering + Visibility Rule)
    useEffect(() => {
        if (!mapInstanceRef.current || !panoramaRef.current || !window.google) return;

        otherPlayers.forEach((pData, id) => {
            const dist = getDistance(position.lat, position.lng, pData.lat, pData.lng);

            // VISIBILITY RULE: 100m'den uzaktaysa ve Oyun Modundaysan GİZLE
            // İstisna: Dev Mode, veya Oyun Sonu (narratorFound), veya Lobi
            const isVisible = (dist < 100) || narratorFound || DEV_MODE || uiMode !== 'game';

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
            if (dist > 100) {
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
            if (dist > 100) { // Aslında visibility check zaten 50m, burası 'dist > 45' idi.
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
                        const iconData = getDynamicAvatar(d, pData.username || "Oyuncu", pData.color);
                        marker.setIcon(iconData);
                    });

                    // Label kullanımına artık gerek yok, isim iconData içinde.
                } else {
                    const iconData = getDynamicAvatar(dist, pData.username || "Oyuncu", pData.color);
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
    }, [otherPlayers, position, zoom, narratorFound, uiMode]); // Visibility için bağımlılıklar

    // 5. Rotation
    useEffect(() => {
        if (minimapRef.current) {
            minimapRef.current.style.transform = `translate(-50%, -50%) rotate(${-heading}deg)`;
        }
    }, [heading]);

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
                    // Süre doldu, servera bildir (Sadece host veya anlatıcı yapsın ki spam olmasın)
                    // Basitlik için: Herkes emit edebilir, server ilk geleni kabul eder.
                    socketRef.current.emit('time-up', { roomId });
                }
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [gameEndTime, gameOverData, roomId]); // Dependency'e roomId eklendi

    // Reset UI Handler for Next Round
    useEffect(() => {
        if (!socketRef.current) return;

        socketRef.current.on('reset-game-ui', () => {
            setUiMode('waiting'); // Waiting moduna dön
            setGameOverData(null); // Skor tablosunu kapat
            setNarratorFound(false);
            setGameEndTime(null);
            // Harita instance'larını temizleme işini zaten useEffect(uiMode) yapıyor
        });

        return () => {
            socketRef.current.off('reset-game-ui');
        };
    }, []);

    // NEXT ROUND Butonu
    const handleNextRound = () => {
        socketRef.current.emit('next-round', { roomId });
    };

    // Format Timer
    const formatTime = (s) => {
        const m = Math.floor(s / 60);
        const secs = s % 60;
        return `${m}:${secs < 10 ? '0' : ''}${secs}`;
    };

    if (uiMode !== 'game' && !DEV_MODE) {
        return (
            <Lobby
                onJoin={handleJoinGame}
                mode={uiMode}
                roomId={roomId}
                isCreator={isCreator}
                participants={Array.from(otherPlayers.values())}
                onStart={handleStartGame}
                myUsername={username}
                myColor={myColor}
            />
        );
    }

    return (
        <div className="app">
            {/* ROLE REVEAL SCREEN */}
            {isUiVisible && showRoleReveal && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.5)', // %50 Siyah
                    zIndex: 9999,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontFamily: "'Fredoka', sans-serif"
                }}>
                    <div style={{ fontSize: '2rem' }}>SENİN ROLÜN:</div>
                    <div style={{
                        fontSize: '4rem',
                        fontWeight: 'bold',
                        color: role === 'narrator' ? '#FF4444' : '#00FFFF',
                        textShadow: '0 0 20px currentColor'
                    }}>
                        {role === 'narrator' ? 'ANLATICI' : 'ARAYICI'}
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
                    zIndex: 1001
                }}>
                    {/* Room Code Info */}
                    <div style={{
                        background: 'rgba(0,0,0,0.6)',
                        backdropFilter: 'blur(5px)',
                        padding: '10px 20px',
                        borderRadius: '10px',
                        border: '1px solid rgba(255,255,255,0.2)',
                        color: 'white',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
                    }}>
                        <div style={{ fontSize: '0.8rem', color: '#aaa' }}>ODA</div>
                        <div style={{ fontWeight: 'bold', color: '#00ffff' }}>{roomId}</div>
                    </div>

                    {/* Timer & Status */}
                    <div style={{
                        background: 'rgba(0,0,0,0.6)',
                        backdropFilter: 'blur(5px)',
                        padding: '10px 20px',
                        borderRadius: '10px',
                        border: '1px solid rgba(255,255,255,0.2)',
                        color: 'white',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                        minWidth: '120px'
                    }}>
                        <div style={{ fontSize: '0.8rem', color: narratorFound ? '#ff4444' : '#aaa' }}>
                            {narratorFound ? 'ANLATICI BULUNDU!' : 'SÜRE'}
                        </div>
                        <div style={{
                            fontSize: '1.5rem',
                            fontWeight: 'bold',
                            fontFamily: 'monospace',
                            color: narratorFound ? '#ff4444' : '#ffffff'
                        }}>
                            {formatTime(timeLeft)}
                        </div>
                    </div>

                    {/* Role Info */}
                    <div style={{
                        background: 'rgba(0,0,0,0.6)',
                        backdropFilter: 'blur(5px)',
                        padding: '10px 20px',
                        borderRadius: '10px',
                        border: '1px solid rgba(255,255,255,0.2)',
                        color: 'white',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
                    }}>
                        <div style={{ fontSize: '0.8rem', color: '#aaa' }}>ROLÜN</div>
                        <div style={{ fontWeight: 'bold', color: role === 'narrator' ? '#ff4444' : '#00ffff' }}>
                            {role === 'narrator' ? 'ANLATICI' : 'ARAYICI'}
                        </div>
                    </div>
                </div>
            )}

            {/* MINIMAP */}
            {isUiVisible && (
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
                    transition: 'all 0.3s ease'
                }}>
                    <div ref={minimapRef} className="minimap-content"></div>
                    <div className="player-marker-ui" style={{
                        background: myColor,
                        boxShadow: `0 0 8px ${myColor}80`
                    }}></div>

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
            )}

            <div ref={mapRef} className="street-view">
                {!isMapLoaded && <div style={{ color: 'white', textAlign: 'center', paddingTop: 100 }}>Yükleniyor...</div>}
            </div>




            {/* GAME START LOCATION REVEAL (15 SECONDS) */}
            {isUiVisible && showStartLocation && (
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '600px',
                    height: '400px',
                    zIndex: 2500,
                    background: 'rgba(0,0,0,0.8)',
                    padding: '10px',
                    borderRadius: '15px',
                    boxShadow: '0 0 50px rgba(0,0,0,0.8)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center'
                }}>
                    <div style={{ color: 'white', fontSize: '1.5rem', marginBottom: '10px', fontWeight: 'bold' }}>
                        ANLATICI BURADA BAŞLIYOR!
                    </div>
                    <div ref={startLocationMapRef} style={{ width: '100%', height: '100%', borderRadius: '10px' }}></div>
                    <div style={{ color: '#aaa', marginTop: '5px' }}>Dikkatli bakın, 15 saniye sonra kaybolacak...</div>
                </div>
            )}

            {/* SETTINGS BUTTON - Fixed Positioning */}
            {isUiVisible && (
                <div style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 2000 }}>
                    <button
                        className="settings-btn"
                        onClick={() => setIsSettingsOpen(true)}
                    >
                        ⚙️ Ayarlar
                    </button>
                </div>
            )}

            {/* GAME OVER MODAL */}
            {isUiVisible && gameOverData && (
                <div className="lobby-container" style={{ zIndex: 99999, background: 'rgba(0,0,0,0.85)' }}>
                    <div className="lobby-card" style={{ maxWidth: '600px', padding: '2rem' }}>
                        <h1 className="game-title" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>
                            {gameOverData.reason === 'narrator_found' ? 'ANLATICI YAKALANDI!' : 'SÜRE DOLDU!'}
                        </h1>
                        <div className="game-subtitle" style={{ fontSize: '1.2rem', color: gameOverData.reason === 'narrator_found' ? '#00ff88' : '#ff4444' }}>
                            {gameOverData.reason === 'narrator_found' ? 'Arayıcılar Kazandı' : 'Anlatıcı Kazandı'}
                        </div>

                        <div style={{ margin: '2rem 0', textAlign: 'left', maxHeight: '300px', overflowY: 'auto' }}>
                            {gameOverData.scores.map((s, i) => (
                                <div key={i} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '10px',
                                    background: s.isWinner ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                                    marginBottom: '5px',
                                    borderRadius: '5px',
                                    border: s.isWinner ? '1px solid #00ff88' : 'none'
                                }}>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <span style={{ color: '#aaa' }}>#{i + 1}</span>
                                        <span style={{ fontWeight: 'bold', color: 'white' }}>{s.username}</span>
                                        <span style={{ fontSize: '0.8rem', opacity: 0.7, alignSelf: 'center' }}>
                                            ({s.role === 'narrator' ? 'Anlatıcı' : 'Arayıcı'})
                                        </span>
                                    </div>
                                    <div style={{ fontWeight: 'bold', color: '#00ffff' }}>{s.score} Puan</div>
                                </div>
                            ))}
                        </div>

                        {isCreator && (
                            <button className="join-btn" onClick={handleNextRound} style={{ width: '100%' }}>
                                YENİ TUR BAŞLAT
                            </button>
                        )}
                        {!isCreator && <div style={{ color: '#aaa' }}>Oda kurucusunun yeni turu başlatması bekleniyor...</div>}
                    </div>
                </div>
            )}


            {/* AYARLAR PANELİ (MODAL) */}
            {
                isUiVisible && isSettingsOpen && (
                    <div className="settings-panel-overlay" style={{
                        position: 'absolute',
                        top: 0, left: 0, width: '100%', height: '100%',
                        background: 'rgba(0,0,0,0.5)',
                        zIndex: 3000,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <div className="settings-panel" style={{
                            background: '#1a1a2e', padding: '30px', borderRadius: '10px',
                            border: '1px solid rgba(255,255,255,0.1)', width: '300px', color: 'white',
                            boxShadow: '0 0 20px rgba(0,0,0,0.5)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Ayarlar</h2>
                                <button onClick={() => setIsSettingsOpen(false)} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
                            </div>
                            <div className="setting-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <span>Kontrol Modu</span>
                                <button onClick={() => setIsFpsMode(prev => !prev)} style={{ padding: '5px 10px', background: isFpsMode ? '#4CAF50' : '#333', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}>
                                    {isFpsMode ? 'FPS Modu' : 'Mouse Modu'}
                                </button>
                            </div>
                            {isFpsMode && (
                                <div className="setting-item" style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                        <span>Hassasiyet</span>
                                        <span style={{ color: '#aaa', fontSize: '0.9rem' }}>{sensitivity.toFixed(2)}</span>
                                    </div>
                                    <input type="range" min="0.01" max="1.0" step="0.01" value={sensitivity} onChange={(e) => setSensitivity(parseFloat(e.target.value))} style={{ width: '100%', cursor: 'pointer' }} />
                                </div>
                            )}
                            <div style={{ marginTop: '20px', fontSize: '0.8rem', color: '#666', textAlign: 'center' }}>
                                FPS Modunda iken: <br /> Mouse ile etrafa bak <br /> 'W' ile ilerle <br /> ESC ile çık
                            </div>
                        </div>
                    </div>
                )
            }

            {/* DEVELOPER CONTROL PANEL (F8) */}
            {DEV_MODE && isDevPanelOpen && (
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
            )}
        </div >
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
