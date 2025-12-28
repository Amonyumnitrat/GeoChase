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
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            animation: 'fadeIn 0.3s ease-out'
        }} onClick={onClose}>
            <div className="custom-location-panel" style={{
                position: 'relative',
                width: '90%',
                maxWidth: '600px',
                background: 'rgba(20, 20, 30, 0.98)',
                border: '1px solid rgba(199, 206, 234, 0.4)',
                borderRadius: '20px',
                padding: '25px',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                boxShadow: '0 0 50px rgba(0,0,0,0.8)',
                animation: 'zoomIn 0.3s ease-out'
            }} onClick={e => e.stopPropagation()}>

                {/* Header with Close Button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <h2 style={{ color: '#C7CEEA', margin: 0, fontSize: '1.5rem', fontWeight: '800' }}>Özel Liste Oluştur</h2>
                        <p style={{ color: '#888', margin: 0, fontSize: '0.9rem' }}>İstediğin şehirleri ekleyerek kendi oyun listeni hazırla.</p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: 'none',
                            color: '#fff',
                            width: '35px',
                            height: '35px',
                            borderRadius: '50%',
                            fontSize: '1.2rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => e.target.style.background = 'rgba(255,154,162,0.3)'}
                        onMouseLeave={e => e.target.style.background = 'rgba(255,255,255,0.05)'}
                    >
                        ×
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '10px', position: 'relative' }}>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddLocation()}
                        onFocus={() => searchQuery && setShowSuggestions(true)}
                        placeholder="Şehir adı yaz (Örn: Istanbul, Paris)..."
                        style={{
                            flex: 1,
                            padding: '12px 15px',
                            borderRadius: '10px',
                            border: '1px solid #444',
                            background: 'rgba(0,0,0,0.5)',
                            color: 'white',
                            fontSize: '1rem',
                            outline: 'none'
                        }}
                    />
                    <button
                        onClick={handleAddLocation}
                        disabled={isSearching}
                        style={{
                            padding: '0 25px',
                            background: '#B5EAD7',
                            border: 'none',
                            borderRadius: '10px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            color: '#000',
                            fontSize: '1rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        {isSearching ? '...' : 'EKLE'}
                    </button>
                </div>

                {/* ÖNERİLER */}
                {showSuggestions && suggestions.length > 0 && (
                    <div style={{
                        position: 'absolute',
                        top: '145px',
                        left: '25px',
                        right: '125px',
                        background: 'rgba(30, 30, 40, 0.98)',
                        border: '1px solid rgba(199, 206, 234, 0.4)',
                        borderRadius: '10px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        zIndex: 1000,
                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                    }}>
                        {suggestions.map((prediction, idx) => (
                            <div
                                key={prediction.place_id}
                                onClick={() => handleSelectSuggestion(prediction)}
                                style={{
                                    padding: '12px 15px',
                                    cursor: 'pointer',
                                    borderBottom: idx < suggestions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(199, 206, 234, 0.2)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                                <div style={{ color: '#C7CEEA', fontSize: '0.95rem', fontWeight: 'bold' }}>
                                    {prediction.structured_formatting.main_text}
                                </div>
                                <div style={{ color: '#888', fontSize: '0.8rem' }}>
                                    {prediction.structured_formatting.secondary_text}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{
                    maxHeight: '300px',
                    overflowY: 'auto',
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: '12px',
                    padding: '10px',
                    border: '1px solid rgba(255,255,255,0.05)'
                }}>
                    {customLocations.length === 0 ? (
                        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#666', fontSize: '1rem' }}>
                            <div style={{ fontSize: '2rem', marginBottom: '10px' }}>📍</div>
                            Henüz hiç konum eklemediniz. Eklemek için yukarıdaki kutuyu kullanın.
                        </div>
                    ) : (
                        customLocations.map((loc, idx) => (
                            <div key={idx} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '12px 15px',
                                borderBottom: idx < customLocations.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                                background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                                borderRadius: '8px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ color: '#C7CEEA', fontSize: '1.1rem' }}>📍</span>
                                    <span style={{ color: '#ddd', fontSize: '1rem', fontWeight: '500' }}>{loc.name}</span>
                                </div>
                                <button
                                    onClick={() => handleRemoveLocation(idx)}
                                    style={{
                                        background: 'rgba(255,154,162,0.1)',
                                        border: 'none',
                                        color: '#FF9AA2',
                                        cursor: 'pointer',
                                        padding: '5px 10px',
                                        borderRadius: '6px',
                                        fontSize: '0.9rem',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,154,162,0.2)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,154,162,0.1)'}
                                >
                                    SİL
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ color: '#888', fontSize: '0.9rem' }}>
                        Toplam <strong>{customLocations.length}</strong> konum eklendi
                    </div>
                    {/* ONAY BUTONU */}
                    <button
                        onClick={onClose}
                        style={{
                            padding: '12px 30px',
                            background: 'linear-gradient(to right, #B5EAD7, #C7CEEA)',
                            border: 'none',
                            borderRadius: '10px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            color: '#000',
                            fontSize: '1rem',
                            boxShadow: '0 4px 15px rgba(181, 234, 215, 0.3)'
                        }}
                    >
                        ✓ LİSTEYİ ONAYLA
                    </button>
                </div>
            </div>
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



    // INTERMISSION EKRANI (Turlar arası geçiş - Siyah yükleme ekranı)
    // Bu ekran, host "sonraki tura geç" dediğinde lobi yerine gösterilir
    if (mode === 'waiting' && isIntermission) {
        return (
            <div style={{
                width: '100vw',
                height: '100vh',
                position: 'fixed',
                top: 0,
                left: 0,
                background: 'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(10,14,26,1) 50%, rgba(0,0,0,1) 100%)',
                zIndex: 99999,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                {/* Dönen Yükleme İkonu */}
                <div style={{
                    width: '80px',
                    height: '80px',
                    border: '5px solid rgba(255,255,255,0.1)',
                    borderTop: '5px solid #C7CEEA',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    marginBottom: '40px',
                    boxShadow: '0 0 40px rgba(199, 206, 234, 0.3)'
                }}></div>

                {/* Yükleniyor Yazısı */}
                <h2 style={{
                    color: '#C7CEEA',
                    fontSize: '2.5rem',
                    fontWeight: '800',
                    letterSpacing: '4px',
                    marginBottom: '15px',
                    textShadow: '0 0 30px rgba(199, 206, 234, 0.5)',
                    fontFamily: "'Fredoka', sans-serif"
                }}>
                    YÜKLENİYOR
                </h2>

                {/* Alt Yazı */}
                <p style={{
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: '1.1rem',
                    letterSpacing: '2px',
                    fontFamily: "'Fredoka', sans-serif"
                }}>
                    Yeni konum hazırlanıyor...
                </p>

                {/* Alt nokta animasyonu */}
                <div style={{
                    display: 'flex',
                    gap: '10px',
                    marginTop: '30px'
                }}>
                    {[0, 1, 2].map((i) => (
                        <div key={i} style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            background: '#C7CEEA',
                            animation: `pulse 1.5s ease-in-out ${i * 0.2}s infinite`,
                            boxShadow: '0 0 10px rgba(199, 206, 234, 0.5)'
                        }}></div>
                    ))}
                </div>
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
                {/* LOADING OVERLAY (MASK) */}
                {isLoading && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: 'rgba(0, 0, 0, 0.85)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 9999, // En üstte
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        animation: 'fadeIn 0.5s ease-out'
                    }}>
                        <div style={{
                            width: '80px', height: '80px',
                            border: '6px solid rgba(255,255,255,0.1)',
                            borderTop: '6px solid #B5EAD7',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            marginBottom: '30px',
                            boxShadow: '0 0 30px rgba(181, 234, 215, 0.3)'
                        }}></div>
                        <h2 style={{
                            color: '#B5EAD7',
                            fontSize: '2.5rem',
                            fontWeight: '800',
                            letterSpacing: '2px',
                            marginBottom: '10px',
                            textShadow: '0 0 20px rgba(181, 234, 215, 0.5)'
                        }}>
                            KONUM ARANIYOR
                        </h2>
                        <p style={{
                            color: 'rgba(255,255,255,0.7)',
                            fontSize: '1.2rem',
                            letterSpacing: '1px'
                        }}>
                            Yeni bir macera hazırlanıyor...
                        </p>
                    </div>
                )}

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
                    <span style={{ fontSize: '0.9rem', color: '#C7CEEA', fontWeight: 'bold' }}>{MODES[gameMode] || gameMode}</span>
                </div>

                <div className="lobby-card" style={{ maxWidth: '450px' }}>
                    <h2 style={{ color: '#C7CEEA', marginBottom: '5px' }}>Oda Hazırlanıyor</h2>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', marginBottom: '20px' }}>Arkadaşlar bekliyor...</p>

                    {/* Normal Lobby Content (Always Rendered) */}
                    <>
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
                            <div style={{ fontSize: '2rem', fontWeight: '800', fontFamily: 'monospace', color: '#C7CEEA', letterSpacing: '5px' }}>
                                {roomId}
                            </div>
                            {isCopied && <div style={{ position: 'absolute', right: 10, top: 10, color: '#B5EAD7', fontSize: '0.7rem' }}>Kopyalandı!</div>}
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
                                    <span style={{ color: '#C7CEEA', fontWeight: 'bold', fontSize: '0.9rem' }}>⚔️ OYNANIŞ AYARLARI</span>
                                </div>

                                <div style={{ marginBottom: '5px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ccc', fontSize: '0.8rem', marginBottom: '5px' }}>
                                        <span>Doğuş Uzaklığı (Zorluk)</span>
                                        <span style={{ color: '#B5EAD7', fontWeight: 'bold' }}>{spawnDistance}m</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="100"
                                        max="1000"
                                        step="50"
                                        value={spawnDistance}
                                        onChange={(e) => setSpawnDistance && setSpawnDistance(Number(e.target.value))}
                                        style={{ width: '100%', cursor: 'pointer', accentColor: '#B5EAD7' }}
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
                                        <div style={{ color: '#FF9AA2', fontWeight: 'bold', fontSize: '0.9rem' }}>
                                            {Math.round(20 + ((spawnDistance - 100) * (30 / 900)))}m
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>




                    {isCreator ? (
                        <button
                            onClick={onStart}
                            className="start-btn"
                            disabled={isLoading || participants.length === 0}
                            style={{
                                width: '100%',
                                padding: '15px',
                                background: (isLoading || participants.length === 0) ? '#444' : 'linear-gradient(to right, #B5EAD7, #C7CEEA)',
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
                        <div style={{ color: '#B5EAD7', fontSize: '1rem', fontWeight: 'bold' }}>
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
                        {
                            id: 'WORLD',
                            name: 'TÜM DÜNYA',
                            icon: (
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#C7CEEA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                </svg>
                            )
                        },
                        {
                            id: 'CAPITALS',
                            name: 'BAŞKENTLER',
                            icon: (
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#B5EAD7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 21h18M3 7v1h18V7l-9-4-9 4zM5 8v10M9 8v10M13 8v10M17 8v10" />
                                </svg>
                            )
                        },
                        {
                            id: 'MOD3',
                            name: 'MOD 3',
                            icon: (
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF9AA2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                    <polyline points="7.5 4.21 12 6.81 16.5 4.21" />
                                    <polyline points="7.5 19.79 7.5 14.63 3 12" />
                                    <polyline points="21 12 16.5 14.63 16.5 19.79" />
                                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                    <line x1="12" y1="22.08" x2="12" y2="12" />
                                </svg>
                            )
                        },
                        {
                            id: 'MOD4',
                            name: 'MOD 4',
                            icon: (
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FFDAC1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                </svg>
                            )
                        },
                        {
                            id: 'CUSTOM',
                            name: 'KENDİN SEÇ',
                            icon: (
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#E2F0CB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                </svg>
                            )
                        }
                    ].map((m) => (
                        <div key={m.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            {/* CUSTOM modu seçiliyse ve düzenleme paneli kapalıysa butonu üstte göster */}
                            {m.id === 'CUSTOM' && gameMode === 'CUSTOM' && isCreator && !isCustomPanelOpen && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsCustomPanelOpen(true);
                                    }}
                                    style={{
                                        position: 'absolute',
                                        bottom: '135px',
                                        width: '200px',
                                        padding: '8px 0',
                                        background: 'rgba(181, 234, 215, 0.2)',
                                        border: '1px solid #B5EAD7',
                                        borderRadius: '8px',
                                        color: '#B5EAD7',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        fontSize: '0.75rem',
                                        backdropFilter: 'blur(10px)',
                                        transition: 'all 0.2s',
                                        zIndex: 20
                                    }}
                                    onMouseEnter={(e) => e.target.style.background = 'rgba(181, 234, 215, 0.3)'}
                                    onMouseLeave={(e) => e.target.style.background = 'rgba(181, 234, 215, 0.2)'}
                                >
                                    ✏️ LİSTEYİ DÜZENLE ({customLocations.length})
                                </button>
                            )}
                            <div
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
                        </div>
                    ))}
                </div>

                {/* Custom Location Panel (açıksa göster) */}
                {gameMode === 'CUSTOM' && isCreator && isCustomPanelOpen && (
                    <CustomLocationPanel
                        customLocations={customLocations}
                        setCustomLocations={setCustomLocations}
                        onClose={() => setIsCustomPanelOpen(false)}
                    />
                )}
            </div >
        );
    }

    // GİRİŞ EKRANI (ENTRY)
    return (
        <div className="lobby-container">
            <div className="lobby-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', marginBottom: '10px' }}>
                    <img src="/logo.png" alt="GeoChase" className="game-logo-img" style={{ height: '60px' }} />
                    <h1 className="game-title" style={{ margin: 0, fontSize: '3rem' }}>GeoChase</h1>
                </div>
                <p className="game-subtitle">Dünya Çapında Gerçek Zamanlı Kovalamaca</p>

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
                            background: '#C7CEEA',
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
                                background: '#B5EAD7',
                                boxSizing: 'border-box'
                            }}
                        >
                            KATIL
                        </button>
                    </div>

                </div>

                <div className="lobby-footer">
                    <p>Zaman Daralıyor... Hedefi Bulmak İçin Dünyayı Keşfet!</p>
                </div>
            </div>


            <StreetViewBackground />

            {/* OYUN MODU SEÇİM ÇUBUĞU - Giriş ekranında da seçilebilir */}
            <div className="game-modes-bar">
                {[
                    {
                        id: 'WORLD',
                        name: 'TÜM DÜNYA',
                        icon: (
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#C7CEEA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                            </svg>
                        )
                    },
                    {
                        id: 'CAPITALS',
                        name: 'BAŞKENTLER',
                        icon: (
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#B5EAD7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 21h18M3 7v1h18V7l-9-4-9 4zM5 8v10M9 8v10M13 8v10M17 8v10" />
                            </svg>
                        )
                    },
                    {
                        id: 'MOD3',
                        name: 'MOD 3',
                        icon: (
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF9AA2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                <polyline points="7.5 4.21 12 6.81 16.5 4.21" />
                                <polyline points="7.5 19.79 7.5 14.63 3 12" />
                                <polyline points="21 12 16.5 14.63 16.5 19.79" />
                                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                <line x1="12" y1="22.08" x2="12" y2="12" />
                            </svg>
                        )
                    },
                    {
                        id: 'MOD4',
                        name: 'MOD 4',
                        icon: (
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FFDAC1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                        )
                    },
                    {
                        id: 'CUSTOM',
                        name: 'KENDİN SEÇ',
                        icon: (
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#E2F0CB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                        )
                    }
                ].map((m) => (
                    <div key={m.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        {/* CUSTOM modu seçiliyse ve düzenleme paneli kapalıysa butonu üstte göster */}
                        {m.id === 'CUSTOM' && gameMode === 'CUSTOM' && !isCustomPanelOpen && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsCustomPanelOpen(true);
                                }}
                                style={{
                                    position: 'absolute',
                                    bottom: '135px', // Kartın hemen üstünde (kart yüksekliği + boşluk)
                                    width: '200px', // .mode-card ile aynı genişlik
                                    padding: '8px 0',
                                    background: 'rgba(181, 234, 215, 0.2)',
                                    border: '1px solid #B5EAD7',
                                    borderRadius: '8px',
                                    color: '#B5EAD7',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    backdropFilter: 'blur(10px)',
                                    transition: 'all 0.2s',
                                    zIndex: 20
                                }}
                                onMouseEnter={(e) => e.target.style.background = 'rgba(181, 234, 215, 0.3)'}
                                onMouseLeave={(e) => e.target.style.background = 'rgba(181, 234, 215, 0.2)'}
                            >
                                ✏️ LİSTEYİ DÜZENLE ({customLocations.length})
                            </button>
                        )}
                        <div
                            className={`mode-card ${gameMode === m.id ? 'active' : ''}`}
                            onClick={() => setGameMode && setGameMode(m.id)}
                            style={{ margin: 0 }}
                        >
                            <div className="mode-card-inner">
                                <div className="mode-icon">{m.icon}</div>
                                <div className="mode-name">{m.name}</div>
                            </div>
                        </div>

                    </div>
                ))}
            </div>

            {gameMode === 'CUSTOM' && isCustomPanelOpen && (
                <CustomLocationPanel
                    customLocations={customLocations}
                    setCustomLocations={setCustomLocations}
                    onClose={() => setIsCustomPanelOpen(false)}
                />
            )}
        </div>
    );
}

export default Lobby;
