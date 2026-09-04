import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const API = process.env.REACT_APP_API_URL || '';

// ── Socket singleton ──
let socket = null;
function getSocket() {
  if (!socket) socket = io(API || window.location.origin, { autoConnect: false });
  return socket;
}

// ── CSS-in-JS styles ──
const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', -apple-system, sans-serif; background: #0f0f10; color: #e4e4e7; }
  input, textarea, button { font-family: inherit; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 4px; }

  .app { display: flex; height: 100dvh; overflow: hidden; }

  /* ── Auth ── */
  .auth-wrap { min-height: 100dvh; display: flex; align-items: center; justify-content: center; background: #0f0f10; }
  .auth-card { width: 360px; background: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 32px; }
  .auth-logo { font-size: 22px; font-weight: 600; color: #fff; margin-bottom: 4px; }
  .auth-sub { font-size: 13px; color: #71717a; margin-bottom: 28px; }
  .auth-tabs { display: flex; gap: 4px; background: #09090b; border-radius: 8px; padding: 4px; margin-bottom: 24px; }
  .auth-tab { flex: 1; padding: 7px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all .15s; background: transparent; color: #71717a; }
  .auth-tab.active { background: #27272a; color: #fff; }
  .field { margin-bottom: 14px; }
  .field label { display: block; font-size: 12px; font-weight: 500; color: #a1a1aa; margin-bottom: 6px; }
  .field input { width: 100%; padding: 10px 12px; background: #09090b; border: 1px solid #27272a; border-radius: 8px; color: #e4e4e7; font-size: 14px; outline: none; transition: border-color .15s; }
  .field input:focus { border-color: #6366f1; }
  .btn-primary { width: 100%; padding: 10px; background: #6366f1; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background .15s; }
  .btn-primary:hover { background: #4f46e5; }
  .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
  .auth-err { font-size: 12px; color: #f87171; margin-bottom: 12px; padding: 8px 12px; background: #450a0a; border-radius: 6px; }

  /* ── Sidebar ── */
  .sidebar { width: 280px; min-width: 280px; background: #18181b; border-right: 1px solid #27272a; display: flex; flex-direction: column; }
  .sidebar-header { padding: 16px; border-bottom: 1px solid #27272a; display: flex; align-items: center; gap: 10px; }
  .sidebar-title { font-size: 16px; font-weight: 600; color: #fff; flex: 1; }
  .icon-btn { width: 32px; height: 32px; border: none; background: #27272a; border-radius: 8px; cursor: pointer; color: #a1a1aa; display: flex; align-items: center; justify-content: center; transition: all .15s; font-size: 16px; }
  .icon-btn:hover { background: #3f3f46; color: #fff; }
  .search-wrap { padding: 12px 16px; border-bottom: 1px solid #27272a; }
  .search-input { width: 100%; padding: 8px 12px; background: #09090b; border: 1px solid #27272a; border-radius: 8px; color: #e4e4e7; font-size: 13px; outline: none; transition: border-color .15s; }
  .search-input:focus { border-color: #6366f1; }
  .convo-list { flex: 1; overflow-y: auto; }
  .convo-item { display: flex; align-items: center; gap: 10px; padding: 12px 16px; cursor: pointer; transition: background .1s; border-left: 2px solid transparent; }
  .convo-item:hover { background: #27272a; }
  .convo-item.active { background: #1e1b4b; border-left-color: #6366f1; }
  .convo-name { font-size: 14px; font-weight: 500; color: #e4e4e7; }
  .convo-preview { font-size: 12px; color: #71717a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
  .unread-badge { background: #6366f1; color: #fff; font-size: 10px; font-weight: 600; border-radius: 10px; padding: 2px 6px; min-width: 18px; text-align: center; }
  .sidebar-footer { padding: 12px 16px; border-top: 1px solid #27272a; display: flex; align-items: center; gap: 10px; }
  .footer-name { font-size: 13px; font-weight: 500; color: #e4e4e7; flex: 1; }
  .footer-username { font-size: 11px; color: #71717a; }
  .signout-btn { font-size: 12px; color: #71717a; background: none; border: none; cursor: pointer; padding: 4px 8px; border-radius: 4px; }
  .signout-btn:hover { color: #f87171; }

  /* ── Avatar ── */
  .avatar { width: 36px; height: 36px; min-width: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: #fff; position: relative; }
  .avatar.sm { width: 28px; height: 28px; min-width: 28px; font-size: 10px; }
  .avatar.lg { width: 44px; height: 44px; font-size: 14px; }
  .online-dot { position: absolute; bottom: 1px; right: 1px; width: 9px; height: 9px; border-radius: 50%; background: #22c55e; border: 2px solid #18181b; }

  /* ── Chat area ── */
  .chat-area { flex: 1; display: flex; flex-direction: column; background: #0f0f10; min-width: 0; }
  .chat-header { padding: 14px 20px; border-bottom: 1px solid #27272a; display: flex; align-items: center; gap: 12px; background: #18181b; }
  .chat-header-name { font-size: 15px; font-weight: 600; color: #fff; }
  .chat-header-status { font-size: 12px; color: #71717a; }
  .chat-header-status.online { color: #22c55e; }
  .messages-wrap { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 4px; }
  .msg-group { display: flex; flex-direction: column; gap: 2px; margin-bottom: 12px; }
  .msg-row { display: flex; align-items: flex-end; gap: 8px; }
  .msg-row.mine { flex-direction: row-reverse; }
  .msg-bubble { max-width: 420px; padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.5; word-break: break-word; }
  .msg-bubble.theirs { background: #27272a; color: #e4e4e7; border-bottom-left-radius: 4px; }
  .msg-bubble.mine { background: #6366f1; color: #fff; border-bottom-right-radius: 4px; }
  .msg-time { font-size: 10px; color: #52525b; padding: 0 4px; white-space: nowrap; }
  .msg-sender { font-size: 11px; color: #71717a; margin-bottom: 4px; padding-left: 44px; }
  .typing-indicator { display: flex; align-items: center; gap: 8px; padding: 8px 12px; }
  .typing-dots { display: flex; gap: 4px; }
  .typing-dot { width: 6px; height: 6px; border-radius: 50%; background: #52525b; animation: pulse 1.2s ease-in-out infinite; }
  .typing-dot:nth-child(2) { animation-delay: .2s; }
  .typing-dot:nth-child(3) { animation-delay: .4s; }
  @keyframes pulse { 0%,80%,100% { opacity:.3; transform: scale(.8); } 40% { opacity:1; transform: scale(1); } }
  .input-area { padding: 16px 20px; border-top: 1px solid #27272a; display: flex; gap: 12px; align-items: flex-end; background: #18181b; }
  .msg-input { flex: 1; background: #09090b; border: 1px solid #27272a; border-radius: 12px; padding: 10px 14px; color: #e4e4e7; font-size: 14px; outline: none; resize: none; min-height: 42px; max-height: 120px; line-height: 1.5; transition: border-color .15s; }
  .msg-input:focus { border-color: #6366f1; }
  .send-btn { width: 42px; height: 42px; background: #6366f1; border: none; border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background .15s; color: #fff; font-size: 18px; flex-shrink: 0; }
  .send-btn:hover { background: #4f46e5; }
  .send-btn:disabled { opacity: .4; cursor: not-allowed; }

  /* ── Empty / welcome ── */
  .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #52525b; text-align: center; gap: 8px; }
  .empty-icon { font-size: 48px; margin-bottom: 8px; }
  .empty-title { font-size: 18px; font-weight: 600; color: #71717a; }
  .empty-sub { font-size: 14px; }

  /* ── New chat modal ── */
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.7); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .modal { width: 400px; background: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 24px; }
  .modal-title { font-size: 16px; font-weight: 600; color: #fff; margin-bottom: 16px; }
  .user-result { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 8px; cursor: pointer; transition: background .1s; }
  .user-result:hover { background: #27272a; }
  .user-result-name { font-size: 14px; font-weight: 500; color: #e4e4e7; }
  .user-result-handle { font-size: 12px; color: #71717a; }
  .modal-actions { display: flex; justify-content: flex-end; margin-top: 16px; }
  .btn-ghost { padding: 8px 16px; background: none; border: 1px solid #27272a; border-radius: 8px; color: #a1a1aa; cursor: pointer; font-size: 13px; }
  .btn-ghost:hover { border-color: #52525b; color: #fff; }
  .no-results { text-align: center; padding: 24px; color: #52525b; font-size: 13px; }

  /* ── Date divider ── */
  .date-divider { display: flex; align-items: center; gap: 12px; margin: 16px 0; }
  .date-divider::before, .date-divider::after { content: ''; flex: 1; height: 1px; background: #27272a; }
  .date-divider span { font-size: 11px; color: #52525b; white-space: nowrap; }

  @media (max-width: 640px) {
    .sidebar { width: 72px; min-width: 72px; }
    .sidebar-title, .search-wrap, .convo-name, .convo-preview, .footer-name, .footer-username { display: none; }
    .sidebar-header { justify-content: center; }
    .sidebar-footer { justify-content: center; }
    .convo-item { justify-content: center; padding: 10px; }
    .unread-badge { position: absolute; top: 4px; right: 4px; }
    .convo-item { position: relative; }
  }
`;

// ── Helpers ──
function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000 && d.getDate() === now.getDate()) return 'Today';
  if (diff < 172800000) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function Avatar({ user, size = '' }) {
  return (
    <div className={`avatar ${size}`} style={{ background: user?.avatar?.color || '#6366f1' }}>
      {user?.avatar?.initials || '?'}
    </div>
  );
}

// ── Auth Screen ──
function AuthScreen({ onAuth }) {
  const [tab, setTab] = useState('login');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      const body = tab === 'register'
        ? { name, username, password }
        : { username, password };
      const res = await fetch(`${API}/api/auth/${tab}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return; }
      localStorage.setItem('ping_token', data.token);
      onAuth(data.token, data.user);
    } catch {
      setError('Could not connect to server.');
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e) => { if (e.key === 'Enter') submit(); };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">💬 Ping</div>
        <div className="auth-sub">Message anyone, instantly.</div>
        <div className="auth-tabs">
          <button className={`auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => setTab('login')}>Sign in</button>
          <button className={`auth-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => setTab('register')}>Create account</button>
        </div>
        {error && <div className="auth-err">{error}</div>}
        {tab === 'register' && (
          <div className="field">
            <label>Display name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" onKeyDown={onKey} />
          </div>
        )}
        <div className="field">
          <label>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="janesmith" onKeyDown={onKey} autoFocus />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={onKey} />
        </div>
        <button className="btn-primary" onClick={submit} disabled={loading}>
          {loading ? 'Please wait…' : tab === 'register' ? 'Create account' : 'Sign in'}
        </button>
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
        const res = await fetch(`${API}/api/users/search?q=${encodeURIComponent(q)}`, {
          headers: { 'x-auth-token': token }
        });
        setResults(await res.json());
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, token]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">New conversation</div>
        <input
          className="search-input"
          style={{ marginBottom: 12 }}
          placeholder="Search by name or username…"
          value={q}
          onChange={e => setQ(e.target.value)}
          autoFocus
        />
        {loading && <div className="no-results">Searching…</div>}
        {!loading && q && results.length === 0 && <div className="no-results">No users found.</div>}
        {results.map(u => (
          <div key={u.id} className="user-result" onClick={() => { onSelect(u); onClose(); }}>
            <Avatar user={u} />
            <div>
              <div className="user-result-name">{u.name}</div>
              <div className="user-result-handle">@{u.username || u.name}</div>
            </div>
            {u.isOnline && <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />}
          </div>
        ))}
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
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
  const messagesEnd = useRef(null);
  const typingTimeout = useRef(null);
  const sock = useRef(null);

  // ── Bootstrap ──
  useEffect(() => {
    if (!token) return;
    (async () => {
      const res = await fetch(`${API}/api/auth/me`, { headers: { 'x-auth-token': token } });
      if (!res.ok) { setToken(null); localStorage.removeItem('ping_token'); return; }
      const user = await res.json();
      setMe(user);
    })();
  }, [token]);

  // ── Socket ──
  useEffect(() => {
    if (!token || !me) return;
    const s = getSocket();
    sock.current = s;
    s.connect();
    s.emit('auth', token);

    s.on('newMessage', (msg) => {
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    s.on('userOnline', (uid) => setOnlineUsers(prev => new Set([...prev, uid])));
    s.on('userOffline', (uid) => setOnlineUsers(prev => { const n = new Set(prev); n.delete(uid); return n; }));

    s.on('typing', ({ userId, isTyping }) => {
      setTypingUsers(prev => ({ ...prev, [userId]: isTyping }));
    });

    s.on('conversationUpdated', () => fetchConversations());

    return () => {
      s.off('newMessage');
      s.off('userOnline');
      s.off('userOffline');
      s.off('typing');
      s.off('conversationUpdated');
      s.disconnect();
    };
  }, [token, me]);

  const fetchConversations = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${API}/api/conversations`, { headers: { 'x-auth-token': token } });
    if (res.ok) setConversations(await res.json());
  }, [token]);

  useEffect(() => { if (me) fetchConversations(); }, [me, fetchConversations]);

  // ── Open conversation ──
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
  };

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send ──
  const sendMessage = () => {
    if (!msgText.trim() || !activeConvo) return;
    sock.current?.emit('sendMessage', { convoKey: activeConvo.key, text: msgText });
    setMsgText('');
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
    setToken(null); setMe(null); setConversations([]); setActiveConvo(null); setMessages([]);
  };

  if (!token || !me) return (
    <>
      <style>{css}</style>
      <AuthScreen onAuth={(t, u) => { setToken(t); setMe(u); }} />
    </>
  );

  const filteredConvos = conversations.filter(c =>
    c.other?.name?.toLowerCase().includes(searchQ.toLowerCase())
  );

  // Group messages by date and sender
  const grouped = [];
  messages.forEach((msg, i) => {
    const prev = messages[i - 1];
    const newDate = !prev || formatDate(msg.createdAt) !== formatDate(prev.createdAt);
    const newSender = !prev || prev.senderId !== msg.senderId || newDate;
    if (newDate) grouped.push({ type: 'date', label: formatDate(msg.createdAt), id: `d-${i}` });
    if (newSender) grouped.push({ type: 'senderLabel', msg, id: `sl-${i}` });
    grouped.push({ type: 'msg', msg, id: msg.id });
  });

  const otherIsTyping = activeConvo && Object.entries(typingUsers)
    .some(([uid, typing]) => typing && uid !== me.id);

  const otherOnline = activeConvo && onlineUsers.has(activeConvo.other?.id);

  return (
    <>
      <style>{css}</style>
      <div className="app">
        {/* ── Sidebar ── */}
        <div className="sidebar">
          <div className="sidebar-header">
            <span className="sidebar-title">💬 Ping</span>
            <button className="icon-btn" title="New message" onClick={() => setShowNewChat(true)}>✏️</button>
          </div>
          <div className="search-wrap">
            <input
              className="search-input"
              placeholder="Search conversations…"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
            />
          </div>
          <div className="convo-list">
            {filteredConvos.length === 0 && (
              <div style={{ padding: '24px 16px', fontSize: 13, color: '#52525b', textAlign: 'center' }}>
                {searchQ ? 'No results.' : 'No conversations yet. Start one!'}
              </div>
            )}
            {filteredConvos.map(c => (
              <div
                key={c.id}
                className={`convo-item ${activeConvo?.id === c.id ? 'active' : ''}`}
                onClick={() => openConvo(c.other)}
              >
                <div style={{ position: 'relative' }}>
                  <Avatar user={c.other} />
                  {onlineUsers.has(c.other?.id) && <div className="online-dot" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="convo-name">{c.other?.name}</div>
                  <div className="convo-preview">{c.lastMessage?.text || 'Say hello!'}</div>
                </div>
                {c.unread > 0 && <span className="unread-badge">{c.unread}</span>}
              </div>
            ))}
          </div>
          <div className="sidebar-footer">
            <Avatar user={me} size="sm" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="footer-name">{me.name}</div>
              <div className="footer-username">@{me.username}</div>
            </div>
            <button className="signout-btn" onClick={signOut} title="Sign out">↩</button>
          </div>
        </div>

        {/* ── Chat ── */}
        <div className="chat-area">
          {activeConvo ? (
            <>
              <div className="chat-header">
                <div style={{ position: 'relative' }}>
                  <Avatar user={activeConvo.other} />
                  {otherOnline && <div className="online-dot" />}
                </div>
                <div>
                  <div className="chat-header-name">{activeConvo.other?.name}</div>
                  <div className={`chat-header-status ${otherOnline ? 'online' : ''}`}>
                    {otherOnline ? 'Online' : 'Offline'}
                  </div>
                </div>
              </div>

              <div className="messages-wrap">
                {grouped.map(item => {
                  if (item.type === 'date') return (
                    <div key={item.id} className="date-divider"><span>{item.label}</span></div>
                  );
                  if (item.type === 'senderLabel' && item.msg.senderId !== me.id) return (
                    <div key={item.id} className="msg-sender">{activeConvo.other?.name}</div>
                  );
                  if (item.type === 'senderLabel') return null;
                  const msg = item.msg;
                  const mine = msg.senderId === me.id;
                  return (
                    <div key={item.id} className={`msg-row ${mine ? 'mine' : ''}`}>
                      {!mine && <Avatar user={activeConvo.other} size="sm" />}
                      <div className={`msg-bubble ${mine ? 'mine' : 'theirs'}`}>{msg.text}</div>
                      <div className="msg-time">{formatTime(msg.createdAt)}</div>
                    </div>
                  );
                })}
                {otherIsTyping && (
                  <div className="typing-indicator">
                    <Avatar user={activeConvo.other} size="sm" />
                    <div className="typing-dots">
                      <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
                    </div>
                  </div>
                )}
                <div ref={messagesEnd} />
              </div>

              <div className="input-area">
                <textarea
                  className="msg-input"
                  placeholder={`Message ${activeConvo.other?.name}…`}
                  value={msgText}
                  onChange={handleTyping}
                  onKeyDown={handleKey}
                  rows={1}
                />
                <button className="send-btn" onClick={sendMessage} disabled={!msgText.trim()}>
                  ↑
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">💬</div>
              <div className="empty-title">Your messages</div>
              <div className="empty-sub">Press ✏️ to start a new conversation.</div>
            </div>
          )}
        </div>
      </div>

      {showNewChat && (
        <NewChatModal
          token={token}
          onSelect={(user) => { openConvo(user); fetchConversations(); }}
          onClose={() => setShowNewChat(false)}
        />
      )}
    </>
  );
}
