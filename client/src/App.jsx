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

    // Sabitler
    const BASE_WIDTH = 100;
    const BASE_HEIGHT = 150;

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

    // Helper: Dinamik İkon Üretici
    const getAvatarIcon = (distance, currentZoom) => {
        // 1. Distance Scaling (Mesafe arttıkça küçülür)
        // YENİ FORMÜL: 100 / dist (Base 40 yerine 100) -> Çok daha yavaş küçülür
        let distScale = 100 / Math.max(25, distance);

        // 2. Anti-Zoom Scaling (Zoom yaptıkça NATIVE olarak büyüyor, bunu tersine çeviriyoruz)
        // Zoom arttıkça (yakınlaştıkça) boyutu küçültmeliyiz ki ekranda sabit kalsın.
        const zoomCorrection = 1 / Math.pow(2, currentZoom);

        let finalScale = distScale * zoomCorrection;

        // Limitler
        finalScale = Math.min(Math.max(finalScale, 0.05), 5.0); // Alt limiti düşürdük

        const w = BASE_WIDTH * finalScale;
        const h = BASE_HEIGHT * finalScale;

        return {
            url: "/avatar.png",
            scaledSize: new window.google.maps.Size(w, h),
            anchor: new window.google.maps.Point(w / 2, h * 0.85),
            labelOrigin: new window.google.maps.Point(w / 2, 30)
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

    const handleStartGame = () => {
        if (socketRef.current && roomId) {
            socketRef.current.emit('start-game', roomId);
        }
    };

    // 0. Room Join Effect
    useEffect(() => {
        if (uiMode === 'waiting' && socketRef.current && roomId) {
            socketRef.current.emit('join-room', { roomId, username });
        }
    }, [uiMode, roomId, username]);

    // 1. Socket ve Konum
    useEffect(() => {
        try {
            socketRef.current = io('http://localhost:3001');
            socketRef.current.on('connect', () => setIsConnected(true));

            socketRef.current.on('init-data', (data) => {
                setMyId(data.id);
                setMyColor(data.color);
            });

            socketRef.current.on('game-started', () => {
                setUiMode('game');
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
        if (isMapLoaded && mapRef.current && minimapRef.current && !panoramaRef.current) {

            // Street View
            const panorama = new window.google.maps.StreetViewPanorama(mapRef.current, {
                position: position,
                pov: { heading: 0, pitch: 0 },
                addressControl: false,
                fullscreenControl: false,
                motionTracking: false,
                motionTrackingControl: false,
                zoomControl: false,
                levelControl: false,
                showRoadLabels: false,
                linksControl: true
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
                        roomId // <--- EKLE
                    });
                }
            });

            panorama.addListener('zoom_changed', () => {
                setZoom(panorama.getZoom());
            });

            panorama.addListener('pov_changed', () => {
                setHeading(panorama.getPov().heading);
            });
        }
    }, [isMapLoaded]);

    // 4. Marker Güncelleme
    useEffect(() => {
        if (!mapInstanceRef.current || !panoramaRef.current || !window.google) return;

        otherPlayers.forEach((pData, id) => {
            const dist = getDistance(position.lat, position.lng, pData.lat, pData.lng);

            // A. Minimap (2D) - 50m Limit
            if (dist > 50) {
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

            // B. Street View Avatar (3D) - 45m Limit (User preference)
            if (dist > 45) {
                if (streetMarkersRef.current.has(id)) {
                    streetMarkersRef.current.get(id).setMap(null);
                }
            } else {
                // Görünür olmalı
                if (streetMarkersRef.current.has(id)) {
                    const marker = streetMarkersRef.current.get(id);
                    if (marker.getMap() === null) marker.setMap(panoramaRef.current);

                    const dynamicIcon = getAvatarIcon(dist, zoom);
                    marker.setPosition({ lat: pData.lat, lng: pData.lng });
                    marker.setIcon(dynamicIcon);

                    if (pData.color) {
                        const label = marker.getLabel();
                        if (label && label.color !== pData.color) {
                            marker.setLabel({ ...label, color: pData.color });
                        }
                    }
                } else {
                    const dynamicIcon = getAvatarIcon(dist, zoom);
                    const avatar3D = new window.google.maps.Marker({
                        position: { lat: pData.lat, lng: pData.lng },
                        map: panoramaRef.current,
                        icon: dynamicIcon,
                        title: "Oyuncu",
                        clickable: false,
                        optimized: false,
                        label: {
                            text: "●",
                            color: pData.color || "#FFFFFF",
                            fontSize: "40px",
                            fontWeight: "bold",
                            className: "player-label"
                        }
                    });
                    streetMarkersRef.current.set(id, avatar3D);
                }
            }
        });
    }, [otherPlayers, position, zoom]);

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

    if (uiMode !== 'game') {
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
            <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
                <div className="status-dot"></div>
                {isConnected ? 'Bağlı' : 'Bağlantı Yok'}
            </div>

            <div className="room-info-ui" style={{
                position: 'absolute',
                top: 20,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(5px)',
                padding: '10px 20px',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'white',
                zIndex: 1001,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
            }}>
                <div style={{ fontSize: '0.8rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px' }}>Oda Kodu</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', fontFamily: 'monospace', color: '#00ffff' }}>{roomId}</div>
            </div>



            {/* MINIMAP */}
            <div className="minimap-wrapper" style={{
                top: 0,
                left: 0,
                width: 200,
                height: 200,
                borderRadius: 0,
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: '1px solid #333',
                borderBottom: '1px solid #333',
                background: '#0a0e1a',
                boxShadow: 'none'
            }}>
                <div ref={minimapRef} className="minimap-content"></div>
                <div className="player-marker-ui" style={{
                    background: myColor,
                    boxShadow: `0 0 8px ${myColor}80`
                }}></div>
            </div>

            <div ref={mapRef} className="street-view">
                {!isMapLoaded && <div style={{ color: 'white', textAlign: 'center', paddingTop: 100 }}>Yükleniyor...</div>}
            </div>

            {/* AYARLAR BUTONU */}
            <button
                className="settings-btn"
                onClick={() => setIsSettingsOpen(true)}
                style={{
                    position: 'absolute',
                    bottom: 20,
                    left: 20,
                    zIndex: 2000,
                    padding: '10px 20px',
                    background: 'rgba(0, 0, 0, 0.7)',
                    color: 'white',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    backdropFilter: 'blur(5px)'
                }}
            >
                ⚙ Ayarlar
            </button>

            {/* AYARLAR PANELİ (MODAL) */}
            {isSettingsOpen && (
                <div className="settings-panel-overlay" style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    background: 'rgba(0,0,0,0.5)',
                    zIndex: 3000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <div className="settings-panel" style={{
                        background: '#1a1a2e',
                        padding: '30px',
                        borderRadius: '10px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        width: '300px',
                        color: 'white',
                        boxShadow: '0 0 20px rgba(0,0,0,0.5)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Ayarlar</h2>
                            <button
                                onClick={() => setIsSettingsOpen(false)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#aaa',
                                    fontSize: '1.5rem',
                                    cursor: 'pointer'
                                }}
                            >
                                &times;
                            </button>
                        </div>

                        <div className="setting-item" style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 0',
                            borderBottom: '1px solid rgba(255,255,255,0.05)'
                        }}>
                            <span>Kontrol Modu</span>
                            <button
                                onClick={() => setIsFpsMode(prev => !prev)}
                                style={{
                                    padding: '5px 10px',
                                    background: isFpsMode ? '#4CAF50' : '#333',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem'
                                }}
                            >
                                {isFpsMode ? 'FPS Modu' : 'Mouse Modu'}
                            </button>
                        </div>

                        {/* SENSITIVITY SETTING (Only in FPS Mode) */}
                        {isFpsMode && (
                            <div className="setting-item" style={{
                                padding: '10px 0',
                                borderBottom: '1px solid rgba(255,255,255,0.05)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                    <span>Hassasiyet</span>
                                    <span style={{ color: '#aaa', fontSize: '0.9rem' }}>{sensitivity.toFixed(2)}</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.01"
                                    max="1.0"
                                    step="0.01"
                                    value={sensitivity}
                                    onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                                    style={{ width: '100%', cursor: 'pointer' }}
                                />
                            </div>
                        )}

                        <div style={{ marginTop: '20px', fontSize: '0.8rem', color: '#666', textAlign: 'center' }}>
                            FPS Modunda iken: <br />
                            Mouse ile etrafa bak <br />
                            'W' ile ilerle <br />
                            ESC ile çık
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
