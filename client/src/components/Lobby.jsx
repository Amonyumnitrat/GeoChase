import { useState, useEffect, useRef } from 'react';
import '../App.css';

// Dönen Street View Arka Plan Bileşeni
const StreetViewBackground = () => {
    const bgRef = useRef(null);
    const [isGoogleReady, setIsGoogleReady] = useState(false);

    // Google Maps API yüklenene kadar bekle (polling with timeout)
    // ÖNEMLİ: Sadece google.maps değil, StreetViewPanorama'nın da hazır olduğunu kontrol et
    useEffect(() => {
        const isFullyLoaded = () => {
            return window.google &&
                window.google.maps &&
                typeof window.google.maps.StreetViewPanorama === 'function';
        };

        // Zaten tam yüklüyse direkt başla
        if (isFullyLoaded()) {
            console.log('✅ Google Maps API (+ Street View) zaten yüklü');
            setIsGoogleReady(true);
            return;
        }

        let attempts = 0;
        const maxAttempts = 150; // 15 saniye (150 * 100ms)

        // Yüklenmemişse bekle
        const checkGoogle = setInterval(() => {
            attempts++;
            if (isFullyLoaded()) {
                console.log('✅ Google Maps API (+ Street View) yüklendi!');
                setIsGoogleReady(true);
                clearInterval(checkGoogle);
            } else if (attempts >= maxAttempts) {
                console.warn('⚠️ Google Maps Street View API yüklenemedi (timeout)');
                clearInterval(checkGoogle);
                // Arka plan siyah kalacak ama uygulama çalışmaya devam edecek
            }
        }, 100); // Her 100ms kontrol et

        return () => clearInterval(checkGoogle);
    }, []);

    // API hazır olduğunda panoramayı oluştur
    useEffect(() => {
        if (!isGoogleReady || !bgRef.current) return;

        // Ekstra güvenlik kontrolü
        if (typeof window.google?.maps?.StreetViewPanorama !== 'function') {
            console.warn('⚠️ StreetViewPanorama hala hazır değil, atlanıyor');
            return;
        }

        try {
            // Çeşitli İlgi Çekici Lokasyonlar
            const LOCATIONS = [
                { lat: 41.025636, lng: 28.974223 }, // Istanbul Galata
                { lat: 40.758896, lng: -73.985130 }, // New York Times Square
                { lat: 48.858370, lng: 2.294481 },   // Paris Eiffel
                { lat: 35.659456, lng: 139.700547 }, // Tokyo Shibuya
                { lat: 51.500729, lng: -0.124625 },  // London Big Ben
                { lat: 41.890210, lng: 12.492231 },  // Rome Colosseum
                { lat: -33.856784, lng: 151.215297 }, // Sydney Opera House
                { lat: 38.643033, lng: 34.828859 }   // Cappadocia
            ];

            // Rastgele bir lokasyon seç
            const randomLoc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];

            const panorama = new window.google.maps.StreetViewPanorama(bgRef.current, {
                position: randomLoc,
                pov: { heading: 0, pitch: 10 },
                zoom: 1,
                disableDefaultUI: true,
                showRoadLabels: false,
                clickToGo: false,
                scrollwheel: false,
                disableDoubleClickZoom: true,
                linksControl: false,
                panControl: false,
                enableCloseButton: false
            });

            let heading = 0;
            let animationFrameId;

            const animate = () => {
                heading = (heading + 0.01) % 360; // Çok yavaş dönüş
                panorama.setPov({ heading: heading, pitch: 10 });
                animationFrameId = requestAnimationFrame(animate);
            };

            animate();

            return () => {
                if (animationFrameId) cancelAnimationFrame(animationFrameId);
            };
        } catch (err) {
            console.error('❌ StreetViewPanorama oluşturulurken hata:', err);
        }
    }, [isGoogleReady]);

    return (
        <div
            ref={bgRef}
            className="lobby-bg"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: -1,
                filter: 'brightness(0.5)', // Metin okunabilirliği için karartma
                pointerEvents: 'none',
                background: '#0a0e1a' // API yüklenene kadar siyah arka plan
            }}
        />
    );
};

// Custom Location Panel Component
const CustomLocationPanel = ({ customLocations, setCustomLocations, onClose }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const autocompleteServiceRef = useRef(null);
    const placesServiceRef = useRef(null);

    // Google Places Autocomplete Service'i başlat
    useEffect(() => {
        if (window.google && window.google.maps && window.google.maps.places) {
            console.log('✅ Google Places API yüklendi');
            autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
            // PlacesService için dummy div oluştur
            const dummyDiv = document.createElement('div');
            placesServiceRef.current = new window.google.maps.places.PlacesService(dummyDiv);
        } else {
            console.warn('⚠️ Google Places API henüz yüklenmedi');
        }
    }, []);

    // API'dan öneri al
    useEffect(() => {
        if (searchQuery.trim().length > 1 && autocompleteServiceRef.current) {
            const request = {
                input: searchQuery,
                types: ['(cities)'], // Sadece şehirler
            };

            console.log('🔍 Öneri aranıyor:', searchQuery);
            autocompleteServiceRef.current.getPlacePredictions(request, (predictions, status) => {
                console.log('📍 API Yanıt:', status, predictions);
                if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
                    setSuggestions(predictions.slice(0, 5)); // İlk 5 öneri
                    setShowSuggestions(true);
                } else {
                    console.warn('⚠️ Öneri bulunamadı:', status);
                    setSuggestions([]);
                    setShowSuggestions(false);
                }
            });
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    }, [searchQuery]);

    const handleSelectSuggestion = (prediction) => {
        // Place details'i al
        if (!placesServiceRef.current) return;

        placesServiceRef.current.getDetails(
            { placeId: prediction.place_id },
            (place, status) => {
                if (status === window.google.maps.places.PlacesServiceStatus.OK && place.geometry) {
                    const cityName = prediction.structured_formatting.main_text;

                    // Duplicate check
                    if (customLocations.some(l => l.name === cityName)) {
                        alert("Bu konum zaten ekli!");
                        return;
                    }

                    setCustomLocations(prev => [...prev, {
                        name: cityName,
                        lat: place.geometry.location.lat(),
                        lng: place.geometry.location.lng()
                    }]);
                    setSearchQuery('');
                    setShowSuggestions(false);
                }
            }
        );
    };

    const handleAddLocation = () => {
        if (!searchQuery.trim() || !window.google) return;
        setIsSearching(true);
        setShowSuggestions(false);
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: searchQuery }, (results, status) => {
            setIsSearching(false);
            if (status === 'OK' && results[0]) {
                const loc = results[0].geometry.location;
                const name = results[0].formatted_address.split(',')[0]; // Sadece şehir/yer adı

                // Duplicate check
                if (customLocations.some(l => l.name === name)) {
                    alert("Bu konum zaten ekli!");
                    return;
                }

                setCustomLocations(prev => [...prev, {
                    name: name,
                    lat: loc.lat(),
                    lng: loc.lng()
                }]);
                setSearchQuery('');
            } else {
                alert("Konum bulunamadı!");
            }
        });
    };

    const handleRemoveLocation = (index) => {
        setCustomLocations(prev => prev.filter((_, i) => i !== index));
    };

    return (
        <div className="custom-location-panel" style={{
            position: 'absolute',
            bottom: '160px', /* Modes barın üstünde */
            left: '50%',
            transform: 'translateX(-50%)',
            width: '90%',
            maxWidth: '400px',
            background: 'rgba(20, 20, 30, 0.95)',
            border: '1px solid rgba(0, 255, 255, 0.3)',
            borderRadius: '15px',
            padding: '15px',
            zIndex: 100,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 0 30px rgba(0,0,0,0.8)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            animation: 'fadeInUp 0.3s ease-out'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ color: '#00ffff', margin: 0, fontSize: '1rem' }}>Özel Liste Oluştur</h3>
                <div style={{ color: '#888', fontSize: '0.8rem' }}>
                    Başka bir mod seçerek paneli kapatabilirsiniz
                </div>
            </div>

            <div style={{ display: 'flex', gap: '5px', position: 'relative' }}>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddLocation()}
                    onFocus={() => searchQuery && setShowSuggestions(true)}
                    placeholder="Şehir adı yaz..."
                    style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid #444',
                        background: 'rgba(0,0,0,0.5)',
                        color: 'white',
                        fontSize: '0.9rem'
                    }}
                />
                <button
                    onClick={handleAddLocation}
                    disabled={isSearching}
                    style={{
                        padding: '8px 15px',
                        background: '#00ff88',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        color: '#000',
                        fontSize: '0.8rem'
                    }}
                >
                    {isSearching ? '...' : 'EKLE'}
                </button>
            </div>

            {/* ÖNERİLER */}
            {showSuggestions && suggestions.length > 0 && (
                <div style={{
                    position: 'relative',
                    background: 'rgba(30, 30, 40, 0.98)',
                    border: '1px solid rgba(0, 255, 255, 0.3)',
                    borderRadius: '6px',
                    marginTop: '5px',
                    maxHeight: '150px',
                    overflowY: 'auto',
                    zIndex: 1000
                }}>
                    {suggestions.map((prediction, idx) => (
                        <div
                            key={prediction.place_id}
                            onClick={() => handleSelectSuggestion(prediction)}
                            style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                borderBottom: idx < suggestions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                                transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <div style={{ color: '#00ffff', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                {prediction.structured_formatting.main_text}
                            </div>
                            <div style={{ color: '#888', fontSize: '0.75rem' }}>
                                {prediction.structured_formatting.secondary_text}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div style={{
                maxHeight: '150px',
                overflowY: 'auto',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '6px',
                padding: '5px'
            }}>
                {customLocations.length === 0 ? (
                    <div style={{ padding: '10px', textAlign: 'center', color: '#666', fontSize: '0.8rem' }}>
                        Henüz hiç konum eklemediniz.
                    </div>
                ) : (
                    customLocations.map((loc, idx) => (
                        <div key={idx} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '6px 10px',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'
                        }}>
                            <span style={{ color: '#ddd', fontSize: '0.85rem' }}>{loc.name}</span>
                            <button
                                onClick={() => handleRemoveLocation(idx)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#ff4444',
                                    cursor: 'pointer',
                                    fontSize: '1rem'
                                }}
                            >
                                ×
                            </button>
                        </div>
                    ))
                )}
            </div>

            {customLocations.length > 0 && (
                <div style={{ textAlign: 'right', color: '#888', fontSize: '0.7rem' }}>
                    {customLocations.length} konum eklendi
                </div>
            )}

            {/* ONAY BUTONU */}
            <button
                onClick={onClose}
                style={{
                    width: '100%',
                    padding: '10px',
                    background: 'linear-gradient(to right, #00ff88, #00ffff)',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    color: '#000',
                    fontSize: '0.9rem',
                    marginTop: '5px'
                }}
            >
                ✓ ONAY - LİSTEYİ KAPAT
            </button>
        </div>
    );
};

function Lobby({ onJoin, mode, roomId, isCreator, participants, onStart, myUsername, myColor, isLoading, isIntermission, onLeave, gameMode, setGameMode, customLocations, setCustomLocations, spawnDistance, setSpawnDistance }) {
    const [username, setUsername] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [isCustomPanelOpen, setIsCustomPanelOpen] = useState(false); // Panel görünürlüğü

    // CUSTOM moduna geçildiğinde paneli otomatik aç
    useEffect(() => {
        if (gameMode === 'CUSTOM') {
            setIsCustomPanelOpen(true);
        } else {
            setIsCustomPanelOpen(false);
        }
    }, [gameMode]);

    useEffect(() => {
        if (mode === 'lobby') {
            setIsThinking(false);
        }
    }, [mode]);
    const [isCopied, setIsCopied] = useState(false);

    const generateRoomCode = () => {
        return Math.random().toString(36).substring(2, 6).toUpperCase();
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(roomId);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            // Fallback: Manuel kopyalama
            const textArea = document.createElement('textarea');
            textArea.value = roomId;
            textArea.style.position = 'fixed';
            textArea.style.left = '-9999px';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        }
    };

    const handleCreate = (e) => {
        e.preventDefault();
        if (!username.trim()) {
            alert('Lütfen bir takma ad girin!');
            return;
        }
        setIsThinking(true);
        const newCode = generateRoomCode();
        setTimeout(() => {
            onJoin(username, newCode, true);
        }, 800);
    };

    const handleJoin = (e) => {
        e.preventDefault();
        if (!username.trim()) {
            alert('Lütfen bir takma ad girin!');
            return;
        }
        if (!roomCode.trim() || roomCode.length < 4) {
            alert('Lütfen geçerli bir oda kodu girin!');
            return;
        }
        setIsThinking(true);
        setTimeout(() => {
            onJoin(username, roomCode.toUpperCase(), false);
        }, 800);
    };

    // INTERMISSION (ARA EKRAN)
    if (mode === 'waiting' && isIntermission) {
        return (
            <div className="lobby-container">
                <div className="lobby-card" style={{ maxWidth: '400px', textAlign: 'center', padding: '40px' }}>
                    <div style={{
                        width: '60px', height: '60px',
                        background: '#00ff88', borderRadius: '50%',
                        margin: '0 auto 20px'
                    }}></div>
                    <h2 style={{ color: 'white', marginBottom: '10px' }}>SONRAKİ TUR HAZIRLANIYOR</h2>
                    <p style={{ color: '#aaa', fontSize: '0.9rem' }}>
                        Lütfen bekleyin, herkes yeni konuma ışınlanıyor...
                    </p>
                    {isCreator && (
                        <div style={{ marginTop: '20px', color: '#00ffff', fontSize: '0.8rem' }}>
                            (Oda Kurucusu: Konum aranıyor...)
                        </div>
                    )}
                </div>
                <StreetViewBackground />
            </div>
        );
    }

    // BEKLEME ODASI (WAITING ROOM)
    if (mode === 'waiting') {
        const MODES = {
            'WORLD': 'TÜM DÜNYA',
            'CAPITALS': 'BAŞKENTLER',
            'MOD3': 'MOD 3',
            'MOD4': 'MOD 4',
            'CUSTOM': 'KENDİN SEÇ'
        };

        return (
            <div className="lobby-container">
                {/* SEÇİLEN MOD GÖSTERGESİ */}
                <div style={{
                    position: 'absolute',
                    top: '20px',
                    right: '20px',
                    background: 'rgba(0, 0, 0, 0.6)',
                    padding: '8px 16px',
                    borderRadius: '20px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(5px)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    zIndex: 20
                }}>
                    <span style={{ fontSize: '0.8rem', color: '#aaa' }}>SEÇİLEN MOD:</span>
                    <span style={{ fontSize: '0.9rem', color: '#00ffff', fontWeight: 'bold' }}>{MODES[gameMode] || gameMode}</span>
                </div>

                <div className="lobby-card" style={{ maxWidth: '450px' }}>
                    <h2 style={{ color: '#00ffff', marginBottom: '5px' }}>Oda Hazırlanıyor</h2>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', marginBottom: '20px' }}>Arkadaşlar bekliyor...</p>

                    <div className="room-code-display" onClick={handleCopy} style={{
                        background: 'rgba(255,255,255,0.05)',
                        padding: '15px',
                        borderRadius: '10px',
                        border: '1px dashed rgba(255,255,255,0.2)',
                        cursor: 'pointer',
                        marginBottom: '20px',
                        position: 'relative'
                    }}>
                        <div style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase' }}>Oda Kodu (Kopyalamak için tıkla)</div>
                        <div style={{ fontSize: '2rem', fontWeight: '800', fontFamily: 'monospace', color: '#00ffff', letterSpacing: '5px' }}>
                            {roomId}
                        </div>
                        {isCopied && <div style={{ position: 'absolute', right: 10, top: 10, color: '#00ff88', fontSize: '0.7rem' }}>Kopyalandı!</div>}
                    </div>

                    <div className="participants-list" style={{
                        textAlign: 'left',
                        marginBottom: '30px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        padding: '10px',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: '10px'
                    }}>
                        <h3 style={{ fontSize: '0.9rem', color: '#aaa', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '5px' }}>
                            Katılımcılar ({participants.length + 1})
                        </h3>
                        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {/* KENDİM */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    background: myColor || '#fff',
                                    boxShadow: `0 0 8px ${myColor || '#fff'}`
                                }}></div>
                                <span style={{ color: '#fff', fontWeight: 'bold' }}>{myUsername} (Sen)</span>
                            </div>
                            {/* DİĞERLERİ */}
                            {participants.map((p, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: p.color || '#888', boxShadow: `0 0 5px ${p.color} ` }}></div>
                                    <span style={{ color: 'rgba(255,255,255,0.8)' }}>{p.username || 'Katılıyor...'}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* AYARLAR SLIDER (Sadece Host) */}
                    {isCreator && (
                        <div style={{
                            marginBottom: '20px',
                            background: 'rgba(0,0,0,0.3)',
                            padding: '15px',
                            borderRadius: '10px',
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <span style={{ color: '#00ffff', fontWeight: 'bold', fontSize: '0.9rem' }}>⚔️ OYNANIŞ AYARLARI</span>
                            </div>

                            <div style={{ marginBottom: '5px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ccc', fontSize: '0.8rem', marginBottom: '5px' }}>
                                    <span>Doğuş Uzaklığı (Zorluk)</span>
                                    <span style={{ color: '#00ff88', fontWeight: 'bold' }}>{spawnDistance}m</span>
                                </div>
                                <input
                                    type="range"
                                    min="100"
                                    max="1000"
                                    step="50"
                                    value={spawnDistance}
                                    onChange={(e) => setSpawnDistance && setSpawnDistance(Number(e.target.value))}
                                    style={{ width: '100%', cursor: 'pointer', accentColor: '#00ff88' }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: '0.7rem' }}>
                                    <span>100m</span>
                                    <span>1km</span>
                                </div>
                            </div>

                            {/* Dinamik Bilgiler */}
                            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '5px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.7rem', color: '#aaa' }}>Görüş Mesafesi</div>
                                    <div style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem' }}>
                                        {Math.round(20 + ((spawnDistance - 100) * (80 / 900)))}m
                                    </div>
                                </div>
                                <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '5px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.7rem', color: '#aaa' }}>Yakalama</div>
                                    <div style={{ color: '#ff4444', fontWeight: 'bold', fontSize: '0.9rem' }}>
                                        {Math.round(20 + ((spawnDistance - 100) * (30 / 900)))}m
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {isCreator ? (
                        <button
                            onClick={onStart}
                            className="start-btn"
                            disabled={isLoading || participants.length === 0}
                            style={{
                                width: '100%',
                                padding: '15px',
                                background: (isLoading || participants.length === 0) ? '#444' : 'linear-gradient(to right, #00ff88, #00ffff)',
                                color: (isLoading || participants.length === 0) ? '#888' : '#000',
                                border: 'none',
                                borderRadius: '10px',
                                fontSize: '1.2rem',
                                fontWeight: '900',
                                cursor: (isLoading || participants.length === 0) ? 'not-allowed' : 'pointer',
                                opacity: 1
                            }}>
                            {isLoading ? 'KONUM ARANIYOR...' : (participants.length === 0 ? 'EN AZ 2 OYUNCU GEREKLİ' : 'OYUNU BAŞLAT')}
                        </button>
                    ) : (
                        <div style={{ color: '#00ff88', fontSize: '1rem', fontWeight: 'bold' }}>
                            Liderin oyunu başlatması bekleniyor...
                        </div>
                    )}

                    {/* Ayrıl Butonu */}
                    <button
                        onClick={onLeave}
                        className="join-btn"
                        style={{
                            width: '100%',
                            padding: '12px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            marginTop: '10px'
                        }}
                    >
                        ODADAN AYRIL
                    </button>
                </div>
                <StreetViewBackground />

                {/* OYUN MODU SEÇİM ÇUBUĞU */}
                <div className="game-modes-bar">
                    {[
                        { id: 'WORLD', name: 'TÜM DÜNYA', icon: '🌍' },
                        { id: 'CAPITALS', name: 'BAŞKENTLER', icon: '🏛️' },
                        { id: 'MOD3', name: 'MOD 3', icon: '❓' },
                        { id: 'MOD4', name: 'MOD 4', icon: '❓' },
                        { id: 'CUSTOM', name: 'KENDİN SEÇ', icon: '✏️' }
                    ].map((m) => (
                        <div
                            key={m.id}
                            className={`mode-card ${gameMode === m.id ? 'active' : ''}`}
                            onClick={() => isCreator && setGameMode && setGameMode(m.id)}
                            style={{
                                cursor: isCreator ? 'pointer' : 'not-allowed',
                                opacity: isCreator ? 1 : 0.6
                            }}
                        >
                            <div className="mode-card-inner">
                                <div className="mode-icon">{m.icon}</div>
                                <div className="mode-name">{m.name}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Custom Panel */}
                {gameMode === 'CUSTOM' && isCreator && (
                    <>
                        {isCustomPanelOpen ? (
                            <CustomLocationPanel
                                customLocations={customLocations}
                                setCustomLocations={setCustomLocations}
                                onClose={() => setIsCustomPanelOpen(false)}
                            />
                        ) : (
                            <button
                                onClick={() => setIsCustomPanelOpen(true)}
                                style={{
                                    position: 'absolute',
                                    bottom: '160px',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    padding: '12px 24px',
                                    background: 'rgba(0, 255, 136, 0.2)',
                                    border: '2px solid #00ff88',
                                    borderRadius: '10px',
                                    color: '#00ff88',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    zIndex: 99,
                                    backdropFilter: 'blur(10px)'
                                }}
                            >
                                ✏️ KONUM LİSTESİNİ DÜZENLE ({customLocations.length})
                            </button>
                        )}
                    </>
                )}
            </div>
        );
    }

    // GİRİŞ EKRANI (ENTRY)
    return (
        <div className="lobby-container">
            <div className="lobby-card">
                <h1 className="game-title">GeoChase</h1>
                <p className="game-subtitle">Street View Saklambaç</p>

                <div className="lobby-form">
                    <div className="input-group">
                        <input
                            type="text"
                            placeholder="Takma Adın..."
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            maxLength={12}
                        />
                    </div>

                    {/* ODA KUR */}
                    <button
                        onClick={handleCreate}
                        className="create-btn"
                        disabled={isThinking}
                        style={{
                            width: '100%',
                            padding: '15px',
                            background: '#00ffff',
                            color: '#000',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '1.1rem',
                            fontWeight: '800',
                            cursor: 'pointer',
                            marginTop: '10px'
                        }}
                    >
                        {isThinking ? '...' : 'ODA KUR & BAĞLAN'}
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0' }}>
                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.2)', flex: 1 }}></div>
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>VEYA</span>
                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.2)', flex: 1 }}></div>
                    </div>

                    {/* ODAYA KATIL ROW */}
                    <div className="join-row" style={{ display: 'flex', gap: '10px', width: '100%', boxSizing: 'border-box' }}>
                        <input
                            type="text"
                            placeholder="KOD"
                            value={roomCode}
                            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                            maxLength={4}
                            style={{
                                flex: '0 0 50px',
                                width: 'auto',
                                padding: '15px 2px',
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '10px',
                                color: 'white',
                                textAlign: 'center',
                                fontSize: '0.9rem',
                                letterSpacing: '0px',
                                textTransform: 'uppercase',
                                boxSizing: 'border-box'
                            }}
                        />
                        <button
                            onClick={handleJoin}
                            className="join-btn"
                            disabled={isThinking}
                            style={{
                                flex: 1,
                                background: '#00ff88',
                                boxSizing: 'border-box'
                            }}
                        >
                            KATIL
                        </button>
                    </div>

                </div>

                <div className="lobby-footer">
                    <p>WASD ile Hareket Et • Mouse ile Bak</p>
                </div>
            </div>


            <StreetViewBackground />

            {/* OYUN MODU SEÇİM ÇUBUĞU - Giriş ekranında da seçilebilir */}
            <div className="game-modes-bar">
                {[
                    { id: 'WORLD', name: 'TÜM DÜNYA', icon: '🌍' },
                    { id: 'CAPITALS', name: 'BAŞKENTLER', icon: '🏛️' },
                    { id: 'MOD3', name: 'MOD 3', icon: '❓' },
                    { id: 'MOD4', name: 'MOD 4', icon: '❓' },
                    { id: 'CUSTOM', name: 'KENDİN SEÇ', icon: '✏️' }
                ].map((m) => (
                    <div
                        key={m.id}
                        className={`mode-card ${gameMode === m.id ? 'active' : ''}`}
                        onClick={() => setGameMode && setGameMode(m.id)}
                    >
                        <div className="mode-card-inner">
                            <div className="mode-icon">{m.icon}</div>
                            <div className="mode-name">{m.name}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Custom Panel - Entry ekranında da göster */}
            {gameMode === 'CUSTOM' && (
                <>
                    {isCustomPanelOpen ? (
                        <CustomLocationPanel
                            customLocations={customLocations}
                            setCustomLocations={setCustomLocations}
                            onClose={() => setIsCustomPanelOpen(false)}
                        />
                    ) : (
                        <button
                            onClick={() => setIsCustomPanelOpen(true)}
                            style={{
                                position: 'absolute',
                                bottom: '160px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                padding: '12px 24px',
                                background: 'rgba(0, 255, 136, 0.2)',
                                border: '2px solid #00ff88',
                                borderRadius: '10px',
                                color: '#00ff88',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                zIndex: 99,
                                backdropFilter: 'blur(10px)'
                            }}
                        >
                            ✏️ KONUM LİSTESİNİ DÜZENLE ({customLocations.length})
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

export default Lobby;

