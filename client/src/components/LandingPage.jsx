import { useState, useEffect, useRef } from 'react';
import '../App.css';

// Arka plan için dönen Globe animasyonu
const GlobeAnimation = () => {
    return (
        <div className="globe-container">
            <div className="globe">
                <div className="globe-inner"></div>
            </div>
        </div>
    );
};

// Mini Street View Preview (Sağ taraf için)
const GamePreview = () => {
    const previewRef = useRef(null);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        const checkGoogle = setInterval(() => {
            if (window.google?.maps?.StreetViewPanorama) {
                setIsReady(true);
                clearInterval(checkGoogle);
            }
        }, 100);

        return () => clearInterval(checkGoogle);
    }, []);

    useEffect(() => {
        if (!isReady || !previewRef.current) return;

        try {
            const panorama = new window.google.maps.StreetViewPanorama(previewRef.current, {
                position: { lat: 48.858370, lng: 2.294481 }, // Paris Eiffel
                pov: { heading: 270, pitch: 0 },
                zoom: 0,
                disableDefaultUI: true,
                showRoadLabels: false,
                clickToGo: false,
                scrollwheel: false,
                linksControl: false,
                panControl: false
            });

            let heading = 270;
            const animate = () => {
                heading = (heading + 0.02) % 360;
                panorama.setPov({ heading, pitch: 0 });
                requestAnimationFrame(animate);
            };
            animate();
        } catch (err) {
            console.error('Preview panorama error:', err);
        }
    }, [isReady]);

    return (
        <div className="game-preview-container">
            <div className="game-preview-frame">
                <div ref={previewRef} className="game-preview-streetview"></div>
                {/* Overlay: Oyuncu marker simülasyonu */}
                <div className="preview-overlay">
                    <div className="preview-marker seeker">🔍</div>
                    <div className="preview-marker narrator">📍</div>
                </div>
            </div>
            <p className="preview-caption">Gerçek Zamanlı Kovalamaca</p>
        </div>
    );
};

function LandingPage({ onPlay }) {
    const [isAnimated, setIsAnimated] = useState(false);

    useEffect(() => {
        // Animasyonları başlat
        setTimeout(() => setIsAnimated(true), 100);
    }, []);

    return (
        <div className="landing-container">
            {/* Arka Plan Gradient */}
            <div className="landing-bg"></div>

            {/* Header */}
            <header className="landing-header">
                <div className="landing-logo">🌍 GeoChase</div>
                <nav className="landing-nav">
                    <a href="#features">Özellikler</a>
                    <a href="#how-to-play">Nasıl Oynanır</a>
                </nav>
            </header>

            {/* Hero Section */}
            <main className="landing-hero">
                {/* Sol Taraf: Başlık ve CTA */}
                <div className={`hero-content ${isAnimated ? 'animated' : ''}`}>
                    <h1 className="hero-title">
                        <span className="highlight">Dünyayı</span> Keşfet,
                        <br />
                        <span className="highlight">Hedefi</span> Bul!
                    </h1>
                    <p className="hero-subtitle">
                        Arkadaşlarınla Google Street View'da gerçek zamanlı kovalamaca.
                        Anlatıcıyı bul, zamanı yen!
                    </p>

                    <div className="hero-cta">
                        <button className="play-btn" onClick={onPlay}>
                            <span className="play-icon">▶</span>
                            HEMEN OYNA
                        </button>
                        <p className="cta-note">Ücretsiz • Kayıt Gerektirmez</p>
                    </div>

                    {/* Özellik Rozetleri */}
                    <div className="hero-badges">
                        <div className="badge">
                            <span className="badge-icon">🌍</span>
                            <span>Tüm Dünya</span>
                        </div>
                        <div className="badge">
                            <span className="badge-icon">👥</span>
                            <span>Çok Oyunculu</span>
                        </div>
                        <div className="badge">
                            <span className="badge-icon">⚡</span>
                            <span>Gerçek Zamanlı</span>
                        </div>
                    </div>
                </div>

                {/* Sağ Taraf: Oyun Önizlemesi */}
                <div className={`hero-preview ${isAnimated ? 'animated' : ''}`}>
                    <GamePreview />
                </div>
            </main>

            {/* Oyun Modları Bölümü */}
            <section className="landing-features" id="features">
                <h2 className="section-title">Oyun Modları</h2>
                <div className="features-grid">
                    <div className="feature-card">
                        <div className="feature-icon">🌍</div>
                        <h3>Tüm Dünya</h3>
                        <p>Dünyanın herhangi bir yerinde rastgele konum</p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon">🏛️</div>
                        <h3>Başkentler</h3>
                        <p>Ünlü başkentlerde geziyor gibi hisset</p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon">✏️</div>
                        <h3>Kendin Seç</h3>
                        <p>Kendi şehir listeni oluştur ve oyna</p>
                    </div>
                </div>
            </section>

            {/* Nasıl Oynanır */}
            <section className="landing-howto" id="how-to-play">
                <h2 className="section-title">Nasıl Oynanır?</h2>
                <div className="howto-steps">
                    <div className="howto-step">
                        <div className="step-number">1</div>
                        <h3>Oda Kur veya Katıl</h3>
                        <p>Arkadaşlarını davet et veya bir odaya katıl</p>
                    </div>
                    <div className="howto-step">
                        <div className="step-number">2</div>
                        <h3>Rolünü Öğren</h3>
                        <p>Anlatıcı mı yoksa arayıcı mı olduğunu gör</p>
                    </div>
                    <div className="howto-step">
                        <div className="step-number">3</div>
                        <h3>Keşfet ve Bul!</h3>
                        <p>Street View'da hareket et, hedefi yakala</p>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="landing-footer">
                <p>GeoChase © 2025 • Tüm Dünyayı Keşfet</p>
            </footer>
        </div>
    );
}

export default LandingPage;
