import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const API = process.env.REACT_APP_API_URL || '';

let socket = null;
function getSocket() {
  if (!socket) socket = io(API || window.location.origin, { autoConnect: false });
  return socket;
}

// ── Notification sound — low Discord-style "pop" ──
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    const play = (freq, startTime, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1200;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.22, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    // A4 -> C5, spaced and low like Discord
    play(440, now, 0.18);
    play(523, now + 0.13, 0.22);

    setTimeout(() => ctx.close(), 800);
  } catch (e) {}
}

// ── Upload sound (lower blip) ──
function playUploadSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
    setTimeout(() => ctx.close(), 500);
  } catch (e) {}
}

const MC_COLORS = ['#5B8C2A','#8B4513','#708090','#4169E1','#B8860B','#DC143C','#228B22','#FF8C00'];
const MC_SKINS  = ['🐸','🧟','🐷','🐺','🦁','🐻','🐙','🦊','🐲','🤖','👾','🧙'];

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024*1024) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1024/1024).toFixed(1)} MB`;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso) {
  const d = new Date(iso), now = new Date(), diff = now - d;
  if (diff < 86400000 && d.getDate() === now.getDate()) return '— Today —';
  if (diff < 172800000) return '— Yesterday —';
  return `— ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} —`;
}

function Avatar({ user, size = '' }) {
  const i = user?.name ? user.name.charCodeAt(0) % MC_SKINS.length : 0;
  const c = user?.name ? user.name.charCodeAt(0) % MC_COLORS.length : 0;
  return (
    <div className={`avatar ${size}`} style={{ background: MC_COLORS[c] }} title={user?.name}>
      {MC_SKINS[i]}
    </div>
  );
}

// ── File preview inside message ──
function FileAttachment({ file, token }) {
  const isImage = file.type?.startsWith('image/');
  const isVideo = file.type?.startsWith('video/');
  const isAudio = file.type?.startsWith('audio/');
  const url = `${API}/api/files/${file.id}`;
  const authUrl = `${url}?token=${token}`; // for media src

  if (isImage) return (
    <div className="file-attachment">
      <img
        src={authUrl}
        alt={file.name}
        className="file-image"
        onClick={() => window.open(authUrl, '_blank')}
      />
      <div className="file-meta">{file.name} · {formatBytes(file.size)}</div>
    </div>
  );

  if (isVideo) return (
    <div className="file-attachment">
      <video src={authUrl} controls className="file-video" />
      <div className="file-meta">{file.name} · {formatBytes(file.size)}</div>
    </div>
  );

  if (isAudio) return (
    <div className="file-attachment">
      <audio src={authUrl} controls className="file-audio" />
      <div className="file-meta">{file.name} · {formatBytes(file.size)}</div>
    </div>
  );

  // Generic file download
  return (
    <a href={authUrl} target="_blank" rel="noreferrer" className="file-download" download={file.name}>
      <span className="file-icon">{getFileIcon(file.type)}</span>
      <div>
        <div className="file-dl-name">{file.name}</div>
        <div className="file-meta">{formatBytes(file.size)}</div>
      </div>
      <span className="file-dl-arrow">⬇</span>
    </a>
  );
}

function getFileIcon(type = '') {
  if (type.includes('pdf')) return '📄';
  if (type.includes('zip') || type.includes('rar')) return '📦';
  if (type.includes('word') || type.includes('document')) return '📝';
  if (type.includes('sheet') || type.includes('excel')) return '📊';
  if (type.includes('text')) return '📃';
  return '📎';
}

// ── CSS ──
const css = `
  @import url('https://fonts.googleapis.com/css2?family=VT323&family=Press+Start+2P&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --dirt: #866043; --dirt-dark: #5C4033; --dirt-light: #9B7653;
    --grass: #5B8C2A; --grass-dark: #4a7022;
    --stone: #8E8E8E; --stone-dark: #5A5A5A; --stone-light: #B0B0B0;
    --lapis: #1a3dab; --gold: #FFC800; --redstone: #CC2200; --emerald: #00AA44;
    --text-light: #FFFACD; --text-dim: #C8B89A; --text-dark: #2A1A0A;
    --shadow: #1a0d00; --ui-bg: #1a1209; --ui-panel: #2C1F0F;
    --ui-border: #5C4033; --ui-border-light: #866043; --hotbar: #3D2B1A;
  }
  body { font-family: 'VT323', monospace; background: var(--ui-bg); color: var(--text-light); image-rendering: pixelated; }
  input, textarea, button { font-family: 'VT323', monospace; }
  ::-webkit-scrollbar { width: 8px; }
  ::-webkit-scrollbar-track { background: var(--dirt-dark); }
  ::-webkit-scrollbar-thumb { background: var(--stone); border: 2px solid var(--stone-dark); }
  .app { display: flex; height: 100dvh; overflow: hidden; }

  .mc-btn { display: inline-block; padding: 8px 16px; background: var(--stone); color: var(--text-dark); border: none; border-right: 3px solid var(--stone-dark); border-bottom: 3px solid var(--stone-dark); border-top: 3px solid var(--stone-light); border-left: 3px solid var(--stone-light); font-family: 'VT323', monospace; font-size: 18px; cursor: pointer; transition: filter .05s; width: 100%; text-align: center; letter-spacing: 1px; }
  .mc-btn:hover { filter: brightness(1.15); }
  .mc-btn:active { border-right: 3px solid var(--stone-light); border-bottom: 3px solid var(--stone-light); border-top: 3px solid var(--stone-dark); border-left: 3px solid var(--stone-dark); }
  .mc-btn.green { background: var(--grass); border-right-color: var(--grass-dark); border-bottom-color: var(--grass-dark); border-top-color: #7ab535; border-left-color: #7ab535; color: #fff; }
  .mc-btn:disabled { filter: brightness(0.5); cursor: not-allowed; }

  .mc-input { width: 100%; padding: 8px 10px; background: #0a0a0a; border: 3px solid var(--stone-dark); border-top-color: #222; border-left-color: #222; border-right-color: var(--stone); border-bottom-color: var(--stone); color: var(--text-light); font-family: 'VT323', monospace; font-size: 18px; outline: none; caret-color: var(--text-light); }
  .mc-input:focus { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
  .mc-input::placeholder { color: #555; }

  /* Auth */
  .auth-wrap { min-height: 100dvh; display: flex; align-items: center; justify-content: center; background: var(--ui-bg); background-image: repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(0,0,0,.15) 31px, rgba(0,0,0,.15) 32px), repeating-linear-gradient(90deg, transparent, transparent 31px, rgba(0,0,0,.15) 31px, rgba(0,0,0,.15) 32px); background-size: 32px 32px; }
  .auth-card { width: 380px; padding: 32px; background: rgba(26,18,9,.97); border: 4px solid var(--ui-border); border-top-color: var(--ui-border-light); border-left-color: var(--ui-border-light); border-right-color: var(--shadow); border-bottom-color: var(--shadow); box-shadow: 6px 6px 0 #000; }
  .auth-logo { font-family: 'Press Start 2P', monospace; font-size: 16px; color: var(--grass); text-shadow: 2px 2px 0 var(--grass-dark); margin-bottom: 4px; }
  .auth-sub { font-size: 16px; color: var(--text-dim); margin-bottom: 24px; }
  .auth-tabs { display: flex; gap: 4px; margin-bottom: 20px; }
  .auth-tab { flex: 1; padding: 6px 8px; background: var(--stone-dark); color: var(--text-dim); border: 2px solid var(--shadow); font-size: 16px; cursor: pointer; font-family: 'VT323', monospace; border-bottom: none; }
  .auth-tab.active { background: var(--dirt); color: var(--text-light); border-color: var(--ui-border-light); }
  .field { margin-bottom: 14px; }
  .field label { display: block; font-size: 16px; color: var(--text-dim); margin-bottom: 4px; }
  .auth-err { font-size: 16px; color: #ff6666; margin-bottom: 12px; padding: 8px; background: #330000; border: 2px solid var(--redstone); }

  /* Sidebar */
  .sidebar { width: 272px; min-width: 272px; background: var(--ui-panel); border-right: 4px solid var(--shadow); display: flex; flex-direction: column; }
  .sidebar-header { padding: 12px 14px; background: var(--dirt); border-bottom: 4px solid var(--dirt-dark); display: flex; align-items: center; gap: 10px; }
  .sidebar-title { font-family: 'Press Start 2P', monospace; font-size: 11px; color: #fff; text-shadow: 1px 1px 0 var(--grass-dark); flex: 1; }
  .icon-btn { width: 32px; height: 32px; background: var(--stone); border: none; border-right: 2px solid var(--stone-dark); border-bottom: 2px solid var(--stone-dark); border-top: 2px solid var(--stone-light); border-left: 2px solid var(--stone-light); cursor: pointer; color: var(--text-dark); display: flex; align-items: center; justify-content: center; font-size: 16px; transition: filter .05s; }
  .icon-btn:hover { filter: brightness(1.2); }
  .search-wrap { padding: 10px 12px; border-bottom: 2px solid var(--shadow); }
  .convo-list { flex: 1; overflow-y: auto; }
  .convo-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; border-bottom: 2px solid rgba(0,0,0,.3); border-left: 4px solid transparent; transition: background .05s; }
  .convo-item:hover { background: rgba(134,96,67,.3); }
  .convo-item.active { background: rgba(91,140,42,.2); border-left-color: var(--grass); }
  .convo-name { font-size: 18px; color: var(--text-light); }
  .convo-preview { font-size: 14px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
  .unread-badge { background: var(--redstone); color: #fff; font-size: 14px; padding: 1px 6px; border: 2px solid #880000; min-width: 20px; text-align: center; }
  .sidebar-footer { padding: 10px 12px; background: var(--dirt-dark); border-top: 4px solid var(--shadow); display: flex; align-items: center; gap: 10px; }
  .footer-name { font-size: 17px; color: var(--text-light); flex: 1; }
  .footer-username { font-size: 13px; color: var(--text-dim); }
  .signout-btn { font-size: 14px; color: var(--text-dim); background: none; border: 2px solid var(--ui-border); cursor: pointer; padding: 2px 8px; font-family: 'VT323', monospace; }
  .signout-btn:hover { color: #ff6666; border-color: var(--redstone); }

  /* Avatar */
  .avatar { width: 36px; height: 36px; min-width: 36px; display: flex; align-items: center; justify-content: center; font-size: 20px; position: relative; border: 2px solid rgba(0,0,0,.5); }
  .avatar.sm { width: 28px; height: 28px; min-width: 28px; font-size: 16px; }
  .avatar.lg { width: 44px; height: 44px; font-size: 26px; }
  .online-dot { position: absolute; bottom: -2px; right: -2px; width: 10px; height: 10px; background: var(--emerald); border: 2px solid var(--shadow); }

  /* Chat */
  .chat-area { flex: 1; display: flex; flex-direction: column; background: var(--ui-bg); min-width: 0; }
  .chat-header { padding: 12px 18px; background: var(--dirt); border-bottom: 4px solid var(--dirt-dark); display: flex; align-items: center; gap: 12px; }
  .chat-header-name { font-size: 20px; color: #fff; text-shadow: 1px 1px 0 rgba(0,0,0,.6); }
  .chat-header-status { font-size: 15px; color: var(--text-dim); }
  .chat-header-status.online { color: var(--emerald); }

  /* Messages */
  .messages-wrap { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 4px; background-image: repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(255,255,255,.015) 31px, rgba(255,255,255,.015) 32px), repeating-linear-gradient(90deg, transparent, transparent 31px, rgba(255,255,255,.015) 31px, rgba(255,255,255,.015) 32px); background-size: 32px 32px; }
  .msg-row { display: flex; align-items: flex-end; gap: 8px; margin-bottom: 2px; }
  .msg-row.mine { flex-direction: row-reverse; }
  .msg-bubble { max-width: 420px; padding: 8px 12px; font-size: 18px; line-height: 1.4; word-break: break-word; }
  .msg-bubble.theirs { background: var(--ui-panel); border: 2px solid var(--ui-border); border-top-color: var(--ui-border-light); border-left-color: var(--ui-border-light); color: var(--text-light); }
  .msg-bubble.mine { background: var(--lapis); border: 2px solid #0f2470; border-top-color: #2550cc; border-left-color: #2550cc; color: #fff; }
  .msg-time { font-size: 13px; color: #555; padding: 0 4px; white-space: nowrap; }
  .msg-sender { font-size: 14px; color: var(--text-dim); margin-bottom: 2px; padding-left: 36px; }

  /* File attachments */
  .file-attachment { margin-top: 6px; }
  .file-image { max-width: 280px; max-height: 220px; display: block; cursor: pointer; border: 2px solid rgba(255,255,255,.15); image-rendering: auto; }
  .file-image:hover { border-color: var(--gold); }
  .file-video { max-width: 280px; display: block; border: 2px solid rgba(255,255,255,.15); }
  .file-audio { width: 260px; display: block; margin-top: 4px; }
  .file-meta { font-size: 13px; color: var(--text-dim); margin-top: 3px; }
  .file-download { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: rgba(0,0,0,.3); border: 2px solid var(--ui-border); text-decoration: none; color: var(--text-light); margin-top: 6px; transition: border-color .1s; }
  .file-download:hover { border-color: var(--gold); }
  .file-icon { font-size: 28px; }
  .file-dl-name { font-size: 16px; color: var(--text-light); }
  .file-dl-arrow { margin-left: auto; font-size: 18px; color: var(--gold); }

  /* Typing */
  .typing-indicator { display: flex; align-items: center; gap: 8px; padding: 6px 10px; }
  .typing-dots { display: flex; gap: 5px; }
  .typing-dot { width: 8px; height: 8px; background: var(--stone); animation: mc-blink 1s steps(1) infinite; }
  .typing-dot:nth-child(2) { animation-delay: .33s; }
  .typing-dot:nth-child(3) { animation-delay: .66s; }
  @keyframes mc-blink { 0%,100% { opacity:0; } 50% { opacity:1; } }

  /* Input area */
  .input-area { padding: 12px 16px; background: var(--hotbar); border-top: 4px solid var(--shadow); display: flex; gap: 8px; align-items: flex-end; }
  .msg-input { flex: 1; background: #0a0a0a; border: 3px solid var(--stone-dark); border-top-color: #111; border-left-color: #111; border-right-color: var(--stone); border-bottom-color: var(--stone); color: var(--text-light); font-family: 'VT323', monospace; font-size: 20px; padding: 8px 12px; outline: none; resize: none; min-height: 44px; max-height: 120px; line-height: 1.4; }
  .msg-input:focus { border-color: var(--gold); }
  .msg-input::placeholder { color: #444; }

  /* Upload button */
  .upload-btn { width: 44px; height: 44px; background: var(--dirt); border: none; border-right: 3px solid var(--dirt-dark); border-bottom: 3px solid var(--dirt-dark); border-top: 3px solid var(--dirt-light); border-left: 3px solid var(--dirt-light); cursor: pointer; color: var(--text-light); font-size: 20px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: filter .05s; position: relative; }
  .upload-btn:hover { filter: brightness(1.2); }
  .upload-btn input[type=file] { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }

  /* Upload progress */
  .upload-progress { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: rgba(0,0,0,.4); border: 2px solid var(--ui-border); margin-bottom: 4px; font-size: 14px; color: var(--text-dim); }
  .progress-bar-wrap { flex: 1; height: 6px; background: var(--stone-dark); }
  .progress-bar { height: 100%; background: var(--emerald); transition: width .2s; }

  /* Pending file preview */
  .pending-file { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: rgba(91,140,42,.15); border: 2px solid var(--grass-dark); margin-bottom: 4px; font-size: 15px; color: var(--text-light); }
  .pending-file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pending-file-remove { cursor: pointer; color: var(--redstone); font-size: 18px; background: none; border: none; color: #ff6666; font-family: 'VT323', monospace; }

  .send-btn { width: 44px; height: 44px; background: var(--grass); border: none; border-right: 3px solid var(--grass-dark); border-bottom: 3px solid var(--grass-dark); border-top: 3px solid #7ab535; border-left: 3px solid #7ab535; cursor: pointer; color: #fff; font-size: 22px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: filter .05s; }
  .send-btn:hover { filter: brightness(1.15); }
  .send-btn:active { border-right-color: #7ab535; border-bottom-color: #7ab535; border-top-color: var(--grass-dark); border-left-color: var(--grass-dark); }
  .send-btn:disabled { filter: brightness(0.4); cursor: not-allowed; }

  /* Empty state */
  .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-dim); text-align: center; gap: 12px; background-image: repeating-linear-gradient(0deg, transparent, transparent 31px, rgba(255,255,255,.015) 31px, rgba(255,255,255,.015) 32px), repeating-linear-gradient(90deg, transparent, transparent 31px, rgba(255,255,255,.015) 31px, rgba(255,255,255,.015) 32px); background-size: 32px 32px; }
  .empty-icon { font-size: 64px; margin-bottom: 4px; }
  .empty-title { font-family: 'Press Start 2P', monospace; font-size: 12px; color: var(--grass); text-shadow: 1px 1px 0 var(--grass-dark); }
  .empty-sub { font-size: 18px; color: var(--text-dim); }

  /* Modal */
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.85); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .modal { width: 400px; background: var(--ui-panel); border: 4px solid var(--ui-border-light); border-right-color: var(--shadow); border-bottom-color: var(--shadow); padding: 24px; box-shadow: 8px 8px 0 #000; }
  .modal-title { font-family: 'Press Start 2P', monospace; font-size: 11px; color: var(--gold); text-shadow: 1px 1px 0 #aa8800; margin-bottom: 16px; }
  .user-result { display: flex; align-items: center; gap: 10px; padding: 10px; cursor: pointer; border: 2px solid transparent; border-bottom-color: rgba(0,0,0,.4); transition: background .05s; }
  .user-result:hover { background: rgba(91,140,42,.2); border-color: var(--grass); }
  .user-result-name { font-size: 18px; color: var(--text-light); }
  .user-result-handle { font-size: 14px; color: var(--text-dim); }
  .modal-actions { display: flex; justify-content: flex-end; margin-top: 16px; }
  .btn-ghost { padding: 6px 14px; background: var(--stone-dark); color: var(--text-dim); border: 2px solid var(--stone); font-size: 16px; cursor: pointer; font-family: 'VT323', monospace; }
  .btn-ghost:hover { background: var(--stone); color: var(--text-light); }
  .no-results { text-align: center; padding: 24px; color: var(--text-dim); font-size: 18px; }

  /* Date divider */
  .date-divider { display: flex; align-items: center; gap: 10px; margin: 14px 0; }
  .date-divider::before, .date-divider::after { content: ''; flex: 1; height: 2px; background: var(--ui-border); }
  .date-divider span { font-size: 14px; color: var(--text-dim); white-space: nowrap; padding: 2px 8px; background: var(--ui-panel); border: 1px solid var(--ui-border); }

  /* Toast notification */
  .toast { position: fixed; bottom: 24px; right: 24px; background: var(--ui-panel); border: 3px solid var(--ui-border-light); border-right-color: var(--shadow); border-bottom-color: var(--shadow); padding: 12px 16px; display: flex; align-items: center; gap: 10px; z-index: 200; box-shadow: 4px 4px 0 #000; animation: toast-in .2s ease; max-width: 300px; }
  @keyframes toast-in { from { transform: translateX(100%); opacity: 0; } to { transform: none; opacity: 1; } }
  .toast-avatar { font-size: 24px; }
  .toast-name { font-size: 14px; color: var(--text-dim); }
  .toast-text { font-size: 17px; color: var(--text-light); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }

  @media (max-width: 640px) {
    .sidebar { width: 64px; min-width: 64px; }
    .sidebar-title, .search-wrap, .convo-name, .convo-preview, .footer-name, .footer-username { display: none; }
    .sidebar-header, .sidebar-footer { justify-content: center; }
    .convo-item { justify-content: center; padding: 10px; position: relative; }
    .unread-badge { position: absolute; top: 2px; right: 2px; }
  }
`;

// ── Auth Screen ──
function AuthScreen({ onAuth }) {
  const [tab, setTab] = useState('login');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(''); setLoading(true);
    try {
      const body = tab === 'register' ? { name, username, password } : { username, password };
      const res = await fetch(`${API}/api/auth/${tab}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return; }
      localStorage.setItem('ping_token', data.token);
      onAuth(data.token, data.user);
    } catch { setError('Could not connect to server.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">⛏ CraftChat</div>
        <div className="auth-sub">Talk to your crew. Mine or die.</div>
        <div className="auth-tabs">
          <button className={`auth-tab ${tab==='login'?'active':''}`} onClick={()=>setTab('login')}>[ Sign In ]</button>
          <button className={`auth-tab ${tab==='register'?'active':''}`} onClick={()=>setTab('register')}>[ Join ]</button>
        </div>
        {error && <div className="auth-err">⚠ {error}</div>}
        {tab==='register' && <div className="field"><label>» Display Name</label><input className="mc-input" value={name} onChange={e=>setName(e.target.value)} placeholder="Steve" onKeyDown={e=>e.key==='Enter'&&submit()} /></div>}
        <div className="field"><label>» Username</label><input className="mc-input" value={username} onChange={e=>setUsername(e.target.value)} placeholder="player123" onKeyDown={e=>e.key==='Enter'&&submit()} autoFocus /></div>
        <div className="field"><label>» Password</label><input className="mc-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==='Enter'&&submit()} /></div>
        <button className="mc-btn green" onClick={submit} disabled={loading}>{loading ? 'Connecting...' : tab==='register' ? '▶ Create Account' : '▶ Enter World'}</button>
      </div>
    </div>
  );
}

// ── New Chat Modal ──
function NewChatModal({ token, onSelect, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/api/users/search?q=${encodeURIComponent(q)}`, { headers: { 'x-auth-token': token } });
        setResults(await res.json());
      } finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, token]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-title">⛏ Find a Player</div>
        <input className="mc-input" style={{marginBottom:12}} placeholder="Search by name or username..." value={q} onChange={e=>setQ(e.target.value)} autoFocus />
        {loading && <div className="no-results">Searching the overworld...</div>}
        {!loading && q && results.length===0 && <div className="no-results">No players found.</div>}
        {results.map(u => (
          <div key={u.id} className="user-result" onClick={()=>{onSelect(u);onClose();}}>
            <Avatar user={u} />
            <div>
              <div className="user-result-name">{u.name}</div>
              <div className="user-result-handle">@{u.username||u.name}</div>
            </div>
            {u.isOnline && <div style={{marginLeft:'auto',fontSize:14}}>🟢 Online</div>}
          </div>
        ))}
        <div className="modal-actions"><button className="btn-ghost" onClick={onClose}>✕ Cancel</button></div>
      </div>
    </div>
  );
}

// ── Toast ──
function Toast({ toast }) {
  if (!toast) return null;
  const skinIndex = toast.senderName ? toast.senderName.charCodeAt(0) % MC_SKINS.length : 0;
  return (
    <div className="toast">
      <div className="toast-avatar">{MC_SKINS[skinIndex]}</div>
      <div>
        <div className="toast-name">{toast.senderName}</div>
        <div className="toast-text">{toast.text || '📎 Sent a file'}</div>
      </div>
    </div>
  );
}

// ── Main App ──
export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('ping_token'));
  const [me, setMe] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConvo, setActiveConvo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgText, setMsgText] = useState('');
  const [typingUsers, setTypingUsers] = useState({});
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [pendingFile, setPendingFile] = useState(null); // { file, fileId, name, type, size }
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [toast, setToast] = useState(null);
  const messagesEnd = useRef(null);
  const typingTimeout = useRef(null);
  const toastTimeout = useRef(null);
  const sock = useRef(null);
  const activeConvoRef = useRef(null);
  const meRef = useRef(null);

  // Keep refs in sync for use inside socket callbacks
  useEffect(() => { activeConvoRef.current = activeConvo; }, [activeConvo]);
  useEffect(() => { meRef.current = me; }, [me]);

  // Bootstrap auth
  useEffect(() => {
    if (!token) return;
    (async () => {
      const res = await fetch(`${API}/api/auth/me`, { headers: { 'x-auth-token': token } });
      if (!res.ok) { setToken(null); localStorage.removeItem('ping_token'); return; }
      setMe(await res.json());
    })();
  }, [token]);

  // Show toast + play sound when message arrives and tab is not focused
  const showNotification = useCallback((msg, senderName) => {
    const isHidden = document.hidden || !document.hasFocus();
    const isActiveConvo = activeConvoRef.current?.key === msg.convoKey;

    // Play sound if tab not focused, OR message is in a different convo
    if (isHidden || !isActiveConvo) {
      playNotificationSound();
    }

    // Show toast if not in that convo
    if (!isActiveConvo) {
      clearTimeout(toastTimeout.current);
      setToast({ senderName, text: msg.text });
      toastTimeout.current = setTimeout(() => setToast(null), 4000);
    }
  }, []);

  // Socket setup
  useEffect(() => {
    if (!token || !me) return;
    const s = getSocket();
    sock.current = s;
    s.connect();
    s.emit('auth', token);

    s.on('newMessage', (msg) => {
      // Only add to view if it's the active convo
      if (activeConvoRef.current?.key === msg.convoKey) {
        setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
      }
      // Notification for messages from others
      if (msg.senderId !== meRef.current?.id) {
        // Get sender name from conversations list
        const senderName = msg._senderName || 'Someone';
        showNotification(msg, senderName);
        fetchConversations();
      }
    });

    s.on('userOnline', (uid) => setOnlineUsers(prev => new Set([...prev, uid])));
    s.on('userOffline', (uid) => setOnlineUsers(prev => { const n = new Set(prev); n.delete(uid); return n; }));
    s.on('typing', ({ userId, isTyping }) => setTypingUsers(prev => ({ ...prev, [userId]: isTyping })));
    s.on('conversationUpdated', () => fetchConversations());

    return () => {
      s.off('newMessage'); s.off('userOnline'); s.off('userOffline');
      s.off('typing'); s.off('conversationUpdated');
      s.disconnect();
    };
  }, [token, me, showNotification]);

  const fetchConversations = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${API}/api/conversations`, { headers: { 'x-auth-token': token } });
    if (res.ok) setConversations(await res.json());
  }, [token]);

  useEffect(() => { if (me) fetchConversations(); }, [me, fetchConversations]);

  const openConvo = async (otherUser) => {
    const res = await fetch(`${API}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
      body: JSON.stringify({ otherUserId: otherUser.id })
    });
    const convo = await res.json();
    setActiveConvo({ ...convo, other: otherUser });
    setMessages(convo.messages || []);
    sock.current?.emit('joinConvo', convo.key);
    sock.current?.emit('markRead', { convoKey: convo.key });
    fetchConversations();
    setToast(null);
  };

  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // File upload handler
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Use XMLHttpRequest for progress tracking
      const result = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API}/api/upload`);
        xhr.setRequestHeader('x-auth-token', token);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round(e.loaded / e.total * 100));
        };
        xhr.onload = () => {
          if (xhr.status === 200) resolve(JSON.parse(xhr.responseText));
          else reject(new Error('Upload failed'));
        };
        xhr.onerror = reject;
        xhr.send(formData);
      });

      setPendingFile({ fileId: result.fileId, name: result.name, type: result.type, size: result.size });
      playUploadSound();
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const sendMessage = () => {
    if (!msgText.trim() && !pendingFile) return;
    if (!activeConvo) return;

    sock.current?.emit('sendMessage', {
      convoKey: activeConvo.key,
      text: msgText,
      ...(pendingFile ? {
        fileId: pendingFile.fileId,
        fileName: pendingFile.name,
        fileType: pendingFile.type,
        fileSize: pendingFile.size
      } : {})
    });

    setMsgText('');
    setPendingFile(null);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleTyping = (e) => {
    setMsgText(e.target.value);
    sock.current?.emit('typing', { convoKey: activeConvo?.key, isTyping: true });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      sock.current?.emit('typing', { convoKey: activeConvo?.key, isTyping: false });
    }, 1000);
  };

  const signOut = () => {
    localStorage.removeItem('ping_token');
    setToken(null); setMe(null); setConversations([]);
    setActiveConvo(null); setMessages([]);
  };

  if (!token || !me) return (
    <><style>{css}</style><AuthScreen onAuth={(t, u) => { setToken(t); setMe(u); }} /></>
  );

  const filteredConvos = conversations.filter(c =>
    c.other?.name?.toLowerCase().includes(searchQ.toLowerCase())
  );

  const grouped = [];
  messages.forEach((msg, i) => {
    const prev = messages[i - 1];
    const newDate = !prev || formatDate(msg.createdAt) !== formatDate(prev.createdAt);
    const newSender = !prev || prev.senderId !== msg.senderId || newDate;
    if (newDate) grouped.push({ type: 'date', label: formatDate(msg.createdAt), id: `d-${i}` });
    if (newSender) grouped.push({ type: 'senderLabel', msg, id: `sl-${i}` });
    grouped.push({ type: 'msg', msg, id: msg.id });
  });

  const otherIsTyping = activeConvo && Object.entries(typingUsers).some(([uid, t]) => t && uid !== me.id);
  const otherOnline = activeConvo && onlineUsers.has(activeConvo.other?.id);


  return (
    <><style>{css}</style>
    <div className="app">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title">⛏ CraftChat</span>
          <button className="icon-btn" title="New message" onClick={() => setShowNewChat(true)}>✏</button>
        </div>
        <div className="search-wrap">
          <input className="mc-input" placeholder="Search players..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
        </div>
        <div className="convo-list">
          {filteredConvos.length === 0 && (
            <div style={{padding:'20px 14px',fontSize:16,color:'var(--text-dim)',textAlign:'center'}}>
              {searchQ ? 'No players found.' : 'No chats yet. Find a player!'}
            </div>
          )}
          {filteredConvos.map(c => (
            <div key={c.id} className={`convo-item ${activeConvo?.id===c.id?'active':''}`} onClick={() => openConvo(c.other)}>
              <div style={{position:'relative'}}>
                <Avatar user={c.other} />
                {onlineUsers.has(c.other?.id) && <div className="online-dot" />}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div className="convo-name">{c.other?.name}</div>
                <div className="convo-preview">{c.lastMessage?.file ? '📎 '+c.lastMessage.file.name : c.lastMessage?.text || 'Say hello!'}</div>
              </div>
              {c.unread > 0 && <span className="unread-badge">{c.unread}</span>}
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <Avatar user={me} size="sm" />
          <div style={{flex:1,minWidth:0}}>
            <div className="footer-name">{me.name}</div>
            <div className="footer-username">@{me.username}</div>
          </div>
          <button className="signout-btn" onClick={signOut}>✕ Leave</button>
        </div>
      </div>

      {/* Chat */}
      <div className="chat-area">
        {activeConvo ? (
          <>
            <div className="chat-header">
              <div style={{position:'relative'}}>
                <Avatar user={activeConvo.other} />
                {otherOnline && <div className="online-dot" />}
              </div>
              <div style={{flex:1}}>
                <div className="chat-header-name">{activeConvo.other?.name}</div>
                <div className={`chat-header-status ${otherOnline?'online':''}`}>
                  {otherOnline ? '🟢 Online' : '⚫ Offline'}
                </div>
              </div>
              <ScreenshareManager
                socket={sock.current}
                me={me}
                activeConvo={activeConvo}
                onlineUsers={onlineUsers}
                token={token}
              />
            </div>

            <div className="messages-wrap">
              {grouped.map(item => {
                if (item.type === 'date') return <div key={item.id} className="date-divider"><span>{item.label}</span></div>;
                if (item.type === 'senderLabel' && item.msg.senderId !== me.id) return <div key={item.id} className="msg-sender">{activeConvo.other?.name}</div>;
                if (item.type === 'senderLabel') return null;
                const msg = item.msg;
                const mine = msg.senderId === me.id;
                return (
                  <div key={item.id} className={`msg-row ${mine?'mine':''}`}>
                    {!mine && <Avatar user={activeConvo.other} size="sm" />}
                    <div className={`msg-bubble ${mine?'mine':'theirs'}`}>
                      {msg.text && <div>{msg.text}</div>}
                      {msg.file && <FileAttachment file={msg.file} token={token} />}
                    </div>
                    <div className="msg-time">{formatTime(msg.createdAt)}</div>
                  </div>
                );
              })}
              {otherIsTyping && (
                <div className="typing-indicator">
                  <Avatar user={activeConvo.other} size="sm" />
                  <div className="typing-dots"><div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" /></div>
                  <span style={{fontSize:14,color:'var(--text-dim)'}}>typing...</span>
                </div>
              )}
              <div ref={messagesEnd} />
            </div>

            <div style={{background:'var(--hotbar)',borderTop:'4px solid var(--shadow)'}}>
              {uploading && (
                <div className="upload-progress">
                  <span>⬆ Uploading...</span>
                  <div className="progress-bar-wrap"><div className="progress-bar" style={{width:`${uploadProgress}%`}} /></div>
                  <span>{uploadProgress}%</span>
                </div>
              )}
              {pendingFile && !uploading && (
                <div className="pending-file">
                  <span>{getFileIcon(pendingFile.type)}</span>
                  <span className="pending-file-name">{pendingFile.name} ({formatBytes(pendingFile.size)})</span>
                  <button className="pending-file-remove" onClick={() => setPendingFile(null)}>✕</button>
                </div>
              )}
              <div className="input-area">
                <label className="upload-btn" title="Attach file">
                  📎
                  <input type="file" onChange={handleFileSelect} accept="image/*,video/*,audio/*,.pdf,.txt,.zip,.doc,.docx,.xls,.xlsx" />
                </label>
                <textarea
                  className="msg-input"
                  placeholder={`Message ${activeConvo.other?.name}...`}
                  value={msgText}
                  onChange={handleTyping}
                  onKeyDown={handleKey}
                  rows={1}
                />
                <button className="send-btn" onClick={sendMessage} disabled={!msgText.trim() && !pendingFile}>▶</button>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">⛏</div>
            <div className="empty-title">CraftChat</div>
            <div className="empty-sub">Press ✏ to find a player and start chatting.</div>
          </div>
        )}
      </div>
    </div>

    {showNewChat && (
      <NewChatModal token={token} onSelect={(user) => { openConvo(user); fetchConversations(); }} onClose={() => setShowNewChat(false)} />
    )}

    <Toast toast={toast} />
    </>
  );
}

// ─────────────────────────────────────────────
// SCREENSHARE — appended below existing exports
// Uses WebRTC + existing Socket.io for signaling
// ─────────────────────────────────────────────

// Patch socket to forward WebRTC signaling events
// (called once after socket connects)
function attachScreenshareSignaling(socket, handlers) {
  socket.on('ss:offer',     handlers.onOffer);
  socket.on('ss:answer',    handlers.onAnswer);
  socket.on('ss:ice',       handlers.onIce);
  socket.on('ss:stop',      handlers.onStop);
  socket.on('ss:request',   handlers.onRequest);
  socket.on('ss:rejected',  handlers.onRejected);
}

function detachScreenshareSignaling(socket) {
  ['ss:offer','ss:answer','ss:ice','ss:stop','ss:request','ss:rejected'].forEach(e => socket.off(e));
}

async function fetchIceServers(token) {
  try {
    const res = await fetch(`${API}/api/turn`, { headers: { 'x-auth-token': token } });
    const data = await res.json();
    return data.iceServers;
  } catch {
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
}

// ── Screenshare CSS (appended to existing <style>) ──
const screenshareCss = `
  /* Screenshare request banner */
  .ss-banner {
    position: fixed; top: 0; left: 0; right: 0; z-index: 300;
    background: var(--lapis);
    border-bottom: 4px solid #0f2470;
    padding: 14px 20px;
    display: flex; align-items: center; gap: 14px;
    font-size: 18px; color: #fff;
    animation: ss-slide-down .2s ease;
  }
  @keyframes ss-slide-down { from { transform: translateY(-100%); } to { transform: none; } }
  .ss-banner-text { flex: 1; }
  .ss-banner-name { font-family: 'Press Start 2P', monospace; font-size: 10px; color: var(--gold); margin-bottom: 4px; }
  .ss-accept { padding: 6px 14px; background: var(--emerald); color: #fff; border: 2px solid #007733; border-top-color: #00ee66; font-family: 'VT323', monospace; font-size: 17px; cursor: pointer; }
  .ss-accept:hover { filter: brightness(1.15); }
  .ss-decline { padding: 6px 14px; background: var(--redstone); color: #fff; border: 2px solid #880000; border-top-color: #ff4444; font-family: 'VT323', monospace; font-size: 17px; cursor: pointer; }
  .ss-decline:hover { filter: brightness(1.15); }

  /* Screenshare viewer overlay */
  .ss-overlay {
    position: fixed; inset: 0; z-index: 400;
    background: #000;
    display: flex; flex-direction: column;
  }
  .ss-overlay-header {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 16px;
    background: var(--dirt);
    border-bottom: 4px solid var(--dirt-dark);
    flex-shrink: 0;
  }
  .ss-overlay-title { font-family: 'Press Start 2P', monospace; font-size: 10px; color: #fff; flex: 1; }
  .ss-overlay-status { font-size: 16px; color: var(--gold); }
  .ss-stop-btn { padding: 6px 14px; background: var(--redstone); color: #fff; border: 2px solid #880000; border-top-color: #ff4444; font-family: 'VT323', monospace; font-size: 17px; cursor: pointer; }
  .ss-stop-btn:hover { filter: brightness(1.15); }
  .ss-video-wrap { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .ss-video { max-width: 100%; max-height: 100%; display: block; background: #000; }
  .ss-footer { padding: 8px 16px; background: var(--hotbar); border-top: 2px solid var(--shadow); font-size: 14px; color: var(--text-dim); text-align: center; }

  /* Screenshare button in chat header */
  .ss-btn { padding: 5px 12px; background: var(--stone-dark); color: var(--text-dim); border: 2px solid var(--stone); border-top-color: var(--stone-light); font-family: 'VT323', monospace; font-size: 17px; cursor: pointer; transition: all .1s; margin-left: auto; }
  .ss-btn:hover { background: var(--stone); color: var(--text-light); }
  .ss-btn.active { background: var(--emerald); color: #fff; border-color: #007733; border-top-color: #00ee66; }
  .ss-btn:disabled { opacity: .4; cursor: not-allowed; }
`;

// ── ScreenshareManager component ──
export function ScreenshareManager({ socket, me, activeConvo, onlineUsers, token }) {
  const [state, setState] = useState('idle'); // idle | requesting | sharing | viewing | incoming
  const [incomingFrom, setIncomingFrom] = useState(null); // { id, name }
  const peerRef = useRef(null);
  const streamRef = useRef(null);
  const localVideoRef = useRef(null);  // sharer sees their own stream minimized
  const remoteVideoRef = useRef(null); // viewer sees remote stream

  const otherId = activeConvo?.other?.id;
  const otherName = activeConvo?.other?.name;

  // ── Cleanup helper ──
  const cleanup = useCallback((notify = false) => {
    if (notify && socket && otherId) socket.emit('ss:stop', { to: otherId });
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
    setState('idle');
    setIncomingFrom(null);
  }, [socket, otherId]);

  // ── Build RTCPeerConnection ──
  async function buildPeer() {
    const iceServers = await fetchIceServers(token);
    const pc = new RTCPeerConnection({ iceServers });
    pc.onicecandidate = (e) => {
      if (e.candidate && socket && otherId) {
        socket.emit('ss:ice', { to: otherId, candidate: e.candidate });
      }
    };
    pc.onconnectionstatechange = () => {
      if (['failed','disconnected','closed'].includes(pc.connectionState)) cleanup();
    };
    return pc;
  }

  // ── Signaling handlers ──
  useEffect(() => {
    if (!socket) return;

    const handlers = {
      onRequest: ({ from, fromName }) => {
        // Only show if it's from the person we're chatting with
        if (from === otherId) {
          setIncomingFrom({ id: from, name: fromName });
          setState('incoming');
        }
      },

      onOffer: async ({ from, offer }) => {
        if (from !== otherId) return;
        const pc = await buildPeer();
        peerRef.current = pc;
        pc.ontrack = (e) => {
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
        };
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('ss:answer', { to: from, answer });
        setState('viewing');
      },

      onAnswer: async ({ answer }) => {
        await peerRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
      },

      onIce: async ({ candidate }) => {
        try { await peerRef.current?.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
      },

      onStop: () => cleanup(),
      onRejected: () => { cleanup(); setState('idle'); alert(`${otherName} declined the screenshare.`); },
    };

    attachScreenshareSignaling(socket, handlers);
    return () => detachScreenshareSignaling(socket);
  }, [socket, otherId, otherName, cleanup]);

  // ── Set video srcObject when entering viewing state ──
  useEffect(() => {
    if (state === 'viewing' && remoteVideoRef.current) {
      // srcObject may already be set via ontrack
    }
  }, [state]);

  // ── Start sharing ──
  const startShare = async () => {
    if (!otherId || !onlineUsers.has(otherId)) { alert(`${otherName} is offline.`); return; }
    setState('requesting');
    socket.emit('ss:request', { to: otherId, fromName: me.name });
    // Wait for answer via onAnswer — if no response in 30s, cancel
    setTimeout(() => {
      setState(s => s === 'requesting' ? 'idle' : s);
    }, 30000);
  };

  // ── Accept incoming ──
  const acceptShare = async () => {
    // Signal sharer to send offer
    socket.emit('ss:accepted', { to: incomingFrom.id });

    // Build peer — offer will arrive via onOffer handler
    // (sharer listens for ss:accepted then sends offer)
    setState('connecting');
  };

  // ── Sharer: listen for acceptance then send offer ──
  useEffect(() => {
    if (!socket) return;
    const onAccepted = async ({ from }) => {
      if (from !== otherId) return;
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        streamRef.current = stream;
        const pc = await buildPeer();
        peerRef.current = pc;
        stream.getTracks().forEach(t => {
          pc.addTrack(t, stream);
          t.onended = () => cleanup(true); // user clicked "Stop sharing" in browser UI
        });
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('ss:offer', { to: from, offer });
        setState('sharing');
      } catch (err) {
        cleanup();
        if (err.name !== 'NotAllowedError') alert('Could not start screenshare: ' + err.message);
      }
    };
    socket.on('ss:accepted', onAccepted);
    return () => socket.off('ss:accepted', onAccepted);
  }, [socket, otherId, cleanup]);

  const declineShare = () => {
    socket.emit('ss:rejected', { to: incomingFrom.id });
    setState('idle');
    setIncomingFrom(null);
  };

  const stopShare = () => cleanup(true);

  // ── Render ──
  const otherOnline = otherId && onlineUsers.has(otherId);

  return (
    <>
      {/* Button shown in chat header — rendered by parent, exposed via ref */}
      {/* We expose the button + overlays here as a fragment */}

      {/* Screenshare button — parent imports and places this */}
      <button
        id="ss-trigger-btn"
        className={`ss-btn ${state === 'sharing' ? 'active' : ''}`}
        onClick={state === 'idle' ? startShare : stopShare}
        disabled={state === 'requesting' || state === 'connecting' || !activeConvo || !otherOnline}
        title={!otherOnline ? `${otherName} is offline` : state === 'sharing' ? 'Stop screenshare' : 'Share your screen'}
        style={{ display: activeConvo ? 'inline-block' : 'none' }}
      >
        {state === 'requesting' ? '⏳ Waiting...' :
         state === 'sharing'    ? '🛑 Stop Share' :
         state === 'connecting' ? '⏳ Connecting...' :
                                  '🖥 Share Screen'}
      </button>

      {/* Incoming request banner */}
      {state === 'incoming' && incomingFrom && (
        <div className="ss-banner">
          <div className="ss-banner-text">
            <div className="ss-banner-name">⛏ SCREENSHARE REQUEST</div>
            <div>{incomingFrom.name} wants to share their screen with you</div>
          </div>
          <button className="ss-accept" onClick={acceptShare}>✔ Accept</button>
          <button className="ss-decline" onClick={declineShare}>✕ Decline</button>
        </div>
      )}

      {/* Viewer overlay — fullscreen */}
      {state === 'viewing' && (
        <div className="ss-overlay">
          <div className="ss-overlay-header">
            <div className="ss-overlay-title">🖥 {otherName}'s Screen</div>
            <div className="ss-overlay-status">● LIVE</div>
            <button className="ss-stop-btn" onClick={stopShare}>✕ Close</button>
          </div>
          <div className="ss-video-wrap">
            <video
              ref={remoteVideoRef}
              className="ss-video"
              autoPlay
              playsInline
            />
          </div>
          <div className="ss-footer">You are viewing {otherName}'s screen · Press ✕ to close</div>
        </div>
      )}

      {/* Sharer: small preview (optional) */}
      {state === 'sharing' && (
        <div style={{
          position: 'fixed', bottom: 80, right: 16, zIndex: 250,
          border: '3px solid var(--emerald)', background: '#000',
          width: 200, fontSize: 13, color: 'var(--text-dim)'
        }}>
          <video ref={localVideoRef} style={{ width: '100%', display: 'block' }} autoPlay muted playsInline />
          <div style={{ padding: '4px 8px', background: 'var(--ui-panel)', textAlign: 'center' }}>
            🟢 Sharing to {otherName}
          </div>
        </div>
      )}

      {/* Inject screenshare CSS */}
      <style>{screenshareCss}</style>
    </>
  );
}
