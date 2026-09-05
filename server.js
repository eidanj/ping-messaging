const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const multer = require('multer');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const CLIENT_URL = process.env.CLIENT_URL || '*';

const io = new Server(server, {
  cors: { origin: CLIENT_URL, methods: ['GET', 'POST'] }
});

app.use(cors({ origin: CLIENT_URL }));
app.use(express.json({ limit: '50mb' }));

// ── PostgreSQL ──
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// ── Create tables if they don't exist ──
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      avatar_initials TEXT,
      avatar_color TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      convo_key TEXT UNIQUE NOT NULL,
      participant_a TEXT REFERENCES users(id) ON DELETE CASCADE,
      participant_b TEXT REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      convo_key TEXT NOT NULL,
      sender_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      text TEXT DEFAULT '',
      file_id TEXT,
      file_name TEXT,
      file_type TEXT,
      file_size INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS message_reads (
      message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (message_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      size INTEGER NOT NULL,
      data TEXT NOT NULL,
      uploaded_by TEXT REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('Database initialized');
}

// ── File upload ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /image\/|video\/|audio\/|application\/pdf|text\/|application\/zip|application\/msword|application\/vnd\./;
    allowed.test(file.mimetype) ? cb(null, true) : cb(new Error('File type not allowed'));
  }
});

// ── Online tracking (still in-memory, just for presence) ──
const userSockets = new Map(); // userId → socketId

// ── Helpers ──
function makeToken() { return uuidv4().replace(/-/g, ''); }
function getConvoKey(a, b) { return [a, b].sort().join('::'); }

function publicUser(row, isOnline) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    avatar: { initials: row.avatar_initials, color: row.avatar_color },
    createdAt: row.created_at,
    isOnline: isOnline ?? userSockets.has(row.id)
  };
}

async function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { rows } = await pool.query(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1',
    [token]
  );
  if (!rows.length) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = rows[0].id;
  req.user = rows[0];
  next();
}

// ── Auth ──
app.post('/api/auth/register', async (req, res) => {
  const { name, username, password } = req.body;
  if (!name || !username || !password)
    return res.status(400).json({ error: 'Name, username, and password are required.' });

  const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username.toLowerCase()]);
  if (existing.rows.length) return res.status(409).json({ error: 'Username already taken.' });

  const colors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6'];
  const id = uuidv4();
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const color = colors[name.charCodeAt(0) % colors.length];

  await pool.query(
    'INSERT INTO users (id, name, username, password, avatar_initials, avatar_color) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, name, username.toLowerCase(), password, initials, color]
  );

  const token = makeToken();
  await pool.query('INSERT INTO sessions (token, user_id) VALUES ($1,$2)', [token, id]);
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  res.json({ token, user: publicUser(rows[0]) });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE username = $1 AND password = $2',
    [username?.toLowerCase(), password]
  );
  if (!rows.length) return res.status(401).json({ error: 'Invalid username or password.' });
  const token = makeToken();
  await pool.query('INSERT INTO sessions (token, user_id) VALUES ($1,$2)', [token, rows[0].id]);
  res.json({ token, user: publicUser(rows[0]) });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json(publicUser(req.user)));

// ── Users ──
app.get('/api/users/search', requireAuth, async (req, res) => {
  const q = `%${(req.query.q || '').toLowerCase()}%`;
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE id != $1 AND (LOWER(name) LIKE $2 OR username LIKE $2)',
    [req.userId, q]
  );
  res.json(rows.map(r => publicUser(r)));
});

app.get('/api/users', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id != $1', [req.userId]);
  res.json(rows.map(r => publicUser(r)));
});

// ── Upload ──
app.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided.' });
  const fileId = uuidv4();
  await pool.query(
    'INSERT INTO uploads (id, name, type, size, data, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6)',
    [fileId, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer.toString('base64'), req.userId]
  );
  res.json({ fileId, name: req.file.originalname, type: req.file.mimetype, size: req.file.size });
});

app.get('/api/files/:fileId', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM uploads WHERE id = $1', [req.params.fileId]);
  if (!rows.length) return res.status(404).json({ error: 'File not found.' });
  const file = rows[0];
  res.set('Content-Type', file.type);
  res.set('Content-Disposition', `inline; filename="${file.name}"`);
  res.send(Buffer.from(file.data, 'base64'));
});

// ── TURN credentials from Metered ──
app.get('/api/turn', requireAuth, async (req, res) => {
  try {
    const domain = process.env.METERED_DOMAIN;
    const key = process.env.METERED_SECRET_KEY;
    if (!domain || !key) {
      // Fallback to STUN only if not configured
      return res.json({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    }
    const response = await fetch(
      `https://${domain}/api/v1/turn/credentials?apiKey=${key}`
    );
    const iceServers = await response.json();
    res.json({ iceServers });
  } catch (err) {
    console.error('TURN fetch error:', err);
    res.json({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  }
});


app.get('/api/conversations', requireAuth, async (req, res) => {
  const { rows: convos } = await pool.query(
    `SELECT c.*, 
      ua.id as a_id, ua.name as a_name, ua.username as a_username, ua.avatar_initials as a_initials, ua.avatar_color as a_color,
      ub.id as b_id, ub.name as b_name, ub.username as b_username, ub.avatar_initials as b_initials, ub.avatar_color as b_color
     FROM conversations c
     JOIN users ua ON ua.id = c.participant_a
     JOIN users ub ON ub.id = c.participant_b
     WHERE c.participant_a = $1 OR c.participant_b = $1`,
    [req.userId]
  );

  const result = await Promise.all(convos.map(async c => {
    const isA = c.participant_a === req.userId;
    const other = {
      id: isA ? c.b_id : c.a_id,
      name: isA ? c.b_name : c.a_name,
      username: isA ? c.b_username : c.a_username,
      avatar: { initials: isA ? c.b_initials : c.a_initials, color: isA ? c.b_color : c.a_color },
      isOnline: userSockets.has(isA ? c.b_id : c.a_id)
    };

    const { rows: msgs } = await pool.query(
      'SELECT * FROM messages WHERE convo_key = $1 ORDER BY created_at DESC LIMIT 1',
      [c.convo_key]
    );

    const { rows: unreadRows } = await pool.query(
      `SELECT COUNT(*) FROM messages m
       WHERE m.convo_key = $1 AND m.sender_id != $2
       AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = $2)`,
      [c.convo_key, req.userId]
    );

    return {
      id: c.id, key: c.convo_key,
      participants: [c.participant_a, c.participant_b],
      createdAt: c.created_at,
      other,
      lastMessage: msgs[0] ? {
        text: msgs[0].text,
        file: msgs[0].file_id ? { id: msgs[0].file_id, name: msgs[0].file_name, type: msgs[0].file_type } : null,
        createdAt: msgs[0].created_at
      } : null,
      unread: parseInt(unreadRows[0].count)
    };
  }));

  result.sort((a, b) => new Date(b.lastMessage?.createdAt || b.createdAt) - new Date(a.lastMessage?.createdAt || a.createdAt));
  res.json(result);
});

app.post('/api/conversations', requireAuth, async (req, res) => {
  const { otherUserId } = req.body;
  const { rows: otherRows } = await pool.query('SELECT * FROM users WHERE id = $1', [otherUserId]);
  if (!otherRows.length) return res.status(404).json({ error: 'User not found.' });

  const key = getConvoKey(req.userId, otherUserId);
  let { rows: existing } = await pool.query('SELECT * FROM conversations WHERE convo_key = $1', [key]);

  if (!existing.length) {
    const [a, b] = [req.userId, otherUserId].sort();
    await pool.query(
      'INSERT INTO conversations (id, convo_key, participant_a, participant_b) VALUES ($1,$2,$3,$4)',
      [uuidv4(), key, a, b]
    );
    existing = (await pool.query('SELECT * FROM conversations WHERE convo_key = $1', [key])).rows;
  }

  const { rows: msgs } = await pool.query(
    'SELECT * FROM messages WHERE convo_key = $1 ORDER BY created_at ASC',
    [key]
  );

  const messages = msgs.map(m => ({
    id: m.id, convoKey: m.convo_key, senderId: m.sender_id,
    text: m.text, createdAt: m.created_at,
    file: m.file_id ? { id: m.file_id, name: m.file_name, type: m.file_type, size: m.file_size } : null
  }));

  res.json({
    id: existing[0].id, key, messages,
    participants: [existing[0].participant_a, existing[0].participant_b],
    other: publicUser(otherRows[0])
  });
});

// ── Socket.io ──
io.on('connection', (socket) => {
  let authedUserId = null;

  socket.on('auth', async (token) => {
    const { rows } = await pool.query(
      'SELECT user_id FROM sessions WHERE token = $1', [token]
    );
    if (!rows.length) return socket.emit('authError', 'Invalid token');
    authedUserId = rows[0].user_id;
    userSockets.set(authedUserId, socket.id);
    socket.join(`user:${authedUserId}`);
    io.emit('userOnline', authedUserId);
  });

  socket.on('joinConvo', (convoKey) => socket.join(`convo:${convoKey}`));

  socket.on('sendMessage', async ({ convoKey, text, fileId, fileName, fileType, fileSize }) => {
    if (!authedUserId) return;
    const { rows: convoRows } = await pool.query('SELECT * FROM conversations WHERE convo_key = $1', [convoKey]);
    if (!convoRows.length) return;
    const convo = convoRows[0];
    if (convo.participant_a !== authedUserId && convo.participant_b !== authedUserId) return;
    if (!text?.trim() && !fileId) return;

    const msgId = uuidv4();
    await pool.query(
      'INSERT INTO messages (id, convo_key, sender_id, text, file_id, file_name, file_type, file_size) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [msgId, convoKey, authedUserId, text?.trim() || '', fileId || null, fileName || null, fileType || null, fileSize || null]
    );
    await pool.query('INSERT INTO message_reads (message_id, user_id) VALUES ($1,$2)', [msgId, authedUserId]);

    const msg = {
      id: msgId, convoKey, senderId: authedUserId,
      text: text?.trim() || '', createdAt: new Date().toISOString(),
      file: fileId ? { id: fileId, name: fileName, type: fileType, size: fileSize } : null
    };

    io.to(`convo:${convoKey}`).emit('newMessage', msg);
    const otherId = convo.participant_a === authedUserId ? convo.participant_b : convo.participant_a;
    io.to(`user:${otherId}`).emit('conversationUpdated', convoKey);
  });

  // ── Screenshare signaling relay ──
  // Simply forward WebRTC signals between two users — server never touches the content
  ['ss:request','ss:accepted','ss:rejected','ss:offer','ss:answer','ss:ice','ss:stop'].forEach(event => {
    socket.on(event, (data) => {
      if (!authedUserId || !data?.to) return;
      // Find target socket and forward
      const targetSocketId = userSockets.get(data.to);
      if (targetSocketId) {
        io.to(targetSocketId).emit(event, { ...data, from: authedUserId });
      }
    });
  });

  socket.on('typing', ({ convoKey, isTyping }) => {
    if (!authedUserId) return;
    socket.to(`convo:${convoKey}`).emit('typing', { userId: authedUserId, isTyping });
  });

  socket.on('markRead', async ({ convoKey }) => {
    if (!authedUserId) return;
    const { rows } = await pool.query(
      'SELECT id FROM messages WHERE convo_key = $1 AND sender_id != $2',
      [convoKey, authedUserId]
    );
    for (const msg of rows) {
      await pool.query(
        'INSERT INTO message_reads (message_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [msg.id, authedUserId]
      );
    }
  });

  socket.on('disconnect', () => {
    if (authedUserId) {
      userSockets.delete(authedUserId);
      io.emit('userOffline', authedUserId);
    }
  });
});

// ── Serve React ──
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'client/build/index.html')));
}

const PORT = process.env.PORT || 3001;
initDB().then(() => {
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
