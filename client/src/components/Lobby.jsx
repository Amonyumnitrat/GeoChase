import { useState } from 'react';
import '../App.css'; // Re-use global styles

function Lobby({ onJoin, mode, roomId, isCreator, participants, onStart, myUsername, myColor }) {
    const [username, setUsername] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    const generateRoomCode = () => {
        return Math.random().toString(36).substring(2, 6).toUpperCase();
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(roomId);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
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

    // BEKLEME ODASI (WAITING ROOM)
    if (mode === 'waiting') {
        return (
            <div className="lobby-container">
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

                    {isCreator ? (
                        <button onClick={onStart} className="start-btn" style={{
                            width: '100%',
                            padding: '15px',
                            background: 'linear-gradient(to right, #00ff88, #00ffff)',
                            color: '#000',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '1.2rem',
                            fontWeight: '900',
                            cursor: 'pointer',
                            boxShadow: '0 0 20px rgba(0,255,136,0.3)'
                        }}>
                            OYUNU BAŞLAT
                        </button>
                    ) : (
                        <div style={{ color: '#00ff88', fontSize: '1rem', fontWeight: 'bold', animation: 'pulse 1.5s infinite' }}>
                            Liderin oyunu başlatması bekleniyor...
                        </div>
                    )}
                </div>
                <div className="lobby-bg"></div>
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
                                flex: '0 0 50px', // Maksimum kısalığa getirdim (50px)
                                width: 'auto',
                                padding: '15px 2px', // Minimum yatay padding
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '10px',
                                color: 'white',
                                textAlign: 'center',
                                fontSize: '0.9rem', // Daha küçük font
                                letterSpacing: '0px', // Harf arasını kapattım
                                textTransform: 'uppercase',
                                boxSizing: 'border-box'
                            }}
                        />
                        <button
                            onClick={handleJoin}
                            className="join-btn"
                            disabled={isThinking}
                            style={{
                                flex: 1, // Kalan alanı doldur
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

            <div className="lobby-bg"></div>
        </div>
    );
}

export default Lobby;
