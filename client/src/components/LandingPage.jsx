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
    const [showLegal, setShowLegal] = useState(null); // 'privacy' | 'terms' | null

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
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img src="/logo.png" alt="GeoChase" className="landing-logo-img" style={{ height: '45px' }} />
                    <span className="landing-logo">GeoChase</span>
                    <span style={{
                        fontSize: '0.75rem',
                        background: 'rgba(255, 154, 162, 0.2)',
                        color: '#FF9AA2',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        border: '1px solid rgba(255, 154, 162, 0.3)',
                        fontWeight: '600',
                        letterSpacing: '0.5px'
                    }}>BETA v0.1</span>
                </div>
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
                <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)', marginTop: '5px' }}>
                    BETA v0.1 • Bu bir geliştirme sürümüdür, hatalar içerebilir.
                </p>
                <div style={{ marginTop: '15px', display: 'flex', gap: '20px', justifyContent: 'center', fontSize: '0.85rem' }}>
                    <button onClick={() => setShowLegal('privacy')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', textDecoration: 'underline' }}>
                        Gizlilik Politikası
                    </button>
                    <button onClick={() => setShowLegal('terms')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', textDecoration: 'underline' }}>
                        Kullanım Koşulları
                    </button>
                </div>
            </footer>

            {/* LEGAL MODAL */}
            {showLegal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.85)', zIndex: 10000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(5px)'
                }} onClick={() => setShowLegal(null)}>
                    <div style={{
                        background: '#1a1a2e', width: '90%', maxWidth: '600px',
                        padding: '30px', borderRadius: '20px', border: '1px solid #444',
                        color: '#eee', maxHeight: '80vh', overflowY: 'auto',
                        boxShadow: '0 0 50px rgba(0,0,0,0.5)'
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <h2 style={{ color: '#B5EAD7', margin: 0 }}>
                                {showLegal === 'privacy' ? 'Gizlilik Politikası' : 'Kullanım Koşulları'}
                            </h2>
                            <button onClick={() => setShowLegal(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                        </div>

                        {showLegal === 'privacy' ? (
                            <div style={{ lineHeight: '1.6', fontSize: '0.95rem', color: '#ccc' }}>
                                <p><strong>Son Güncelleme:</strong> 28 Aralık 2025</p>
                                <p>GeoChase ("biz", "hizmetimiz") olarak gizliliğinize önem veriyoruz. Bu politika, verilerinizin nasıl işlendiğini açıklar.</p>

                                <h3>1. Toplanan Veriler</h3>
                                <p>GeoChase oynamak için herhangi bir üyelik kaydı gerekmez. Sadece oyun sırasında kullandığınız "Takma Ad" (Username) geçici olarak sunucularımızda tutulur.</p>

                                <h3>2. Çerezler ve Yerel Depolama</h3>
                                <p>Oyun deneyiminizin kesintiye uğramaması (sayfa yenilendiğinde oyuna dönebilmeniz) için tarayıcınızın <code>sessionStorage</code> özelliği kullanılmaktadır. Bu veriler tarayıcıyı kapattığınızda silinir.</p>

                                <h3>3. Google Maps API</h3>
                                <p>Oyunumuz Google Maps Platformu'nu kullanmaktadır. Google'ın gizlilik politikasına tabidir. Konum verileriniz sadece oyun mekanikleri (yakalama/kaçma) için anlık olarak işlenir ve kaydedilmez.</p>
                            </div>
                        ) : (
                            <div style={{ lineHeight: '1.6', fontSize: '0.95rem', color: '#ccc' }}>
                                <p><strong>Sürüm:</strong> Beta v0.1</p>
                                <p>GeoChase'i kullanarak aşağıdaki şartları kabul etmiş sayılırsınız:</p>

                                <h3>1. Hizmetin Niteliği</h3>
                                <p>Bu oyun şu anda <strong>BETA</strong> aşamasındadır. Hatalar (buglar), kesintiler veya veri kayıpları yaşanabilir. Geliştirici, hizmetin sürekliliğini garanti etmez.</p>

                                <h3>2. Uygun Kullanım</h3>
                                <p>Oyunu hile yaparak, sistem açıklarını kullanarak veya diğer oyuncuları rahatsız edecek şekilde (hakaret içeren kullanıcı adları vb.) kullanmak yasaktır.</p>

                                <h3>3. Sorumluluk Reddi</h3>
                                <p>Oyun tamamen eğlence ve eğitim amaçlıdır. Google Street View görüntüleri üzerindeki içeriklerden GeoChase sorumlu değildir.</p>
                            </div>
                        )}

                        <button onClick={() => setShowLegal(null)} style={{
                            marginTop: '25px', width: '100%', padding: '12px',
                            background: '#C7CEEA', color: '#000', border: 'none',
                            borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer'
                        }}>
                            ANLAŞILDI
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default LandingPage;
