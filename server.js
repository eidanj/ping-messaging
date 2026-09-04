const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const multer = require('multer');

const app = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || '*';

const io = new Server(server, {
  cors: { origin: CLIENT_URL, methods: ['GET', 'POST'] }
});

app.use(cors({ origin: CLIENT_URL }));
app.use(express.json({ limit: '50mb' }));

// ── File upload storage (in-memory as base64, swap for S3 in prod) ──
const uploads = new Map(); // fileId → { id, name, type, size, data, uploadedBy, createdAt }

// Multer for multipart uploads (50MB limit)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Allow images, videos, audio, PDFs, common docs
    const allowed = /image\/|video\/|audio\/|application\/pdf|text\/|application\/zip|application\/msword|application\/vnd\./;
    if (allowed.test(file.mimetype)) cb(null, true);
    else cb(new Error('File type not allowed'));
  }
});

// ── In-memory store ──
const users = new Map();
const sessions = new Map();
const conversations = new Map();
const messages = new Map();
const userSockets = new Map();

// ── Helpers ──
function makeToken() { return uuidv4().replace(/-/g, ''); }
function getConvoKey(a, b) { return [a, b].sort().join('::'); }

function publicUser(user) {
  return {
    id: user.id, name: user.name, username: user.username,
    avatar: user.avatar, createdAt: user.createdAt,
    isOnline: userSockets.has(user.id)
  };
}

function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'];
  const userId = sessions.get(token);
  if (!userId || !users.has(userId)) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = userId;
  req.user = users.get(userId);
  next();
}

// ── Auth ──
app.post('/api/auth/register', (req, res) => {
  const { name, username, password } = req.body;
  if (!name || !username || !password)
    return res.status(400).json({ error: 'Name, username, and password are required.' });
  const taken = Array.from(users.values()).find(u => u.username === username.toLowerCase());
  if (taken) return res.status(409).json({ error: 'Username already taken.' });

  const id = uuidv4();
  const colors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6'];
  const user = {
    id, name, username: username.toLowerCase(), password,
    avatar: { initials: name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2), color: colors[name.charCodeAt(0) % colors.length] },
    createdAt: new Date().toISOString()
  };
  users.set(id, user);
  const token = makeToken();
  sessions.set(token, id);
  res.json({ token, user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = Array.from(users.values()).find(u => u.username === username?.toLowerCase() && u.password === password);
  if (!user) return res.status(401).json({ error: 'Invalid username or password.' });
  const token = makeToken();
  sessions.set(token, user.id);
  res.json({ token, user: publicUser(user) });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json(publicUser(req.user)));

// ── Users ──
app.get('/api/users', requireAuth, (req, res) => {
  res.json(Array.from(users.values()).filter(u => u.id !== req.userId).map(publicUser));
});

app.get('/api/users/search', requireAuth, (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  res.json(Array.from(users.values())
    .filter(u => u.id !== req.userId && (u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)))
    .map(publicUser));
});

// ── File Upload ──
app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided.' });
  const fileId = uuidv4();
  const fileData = {
    id: fileId,
    name: req.file.originalname,
    type: req.file.mimetype,
    size: req.file.size,
    data: req.file.buffer.toString('base64'),
    uploadedBy: req.userId,
    createdAt: new Date().toISOString()
  };
  uploads.set(fileId, fileData);
  res.json({ fileId, name: fileData.name, type: fileData.type, size: fileData.size });
});

// Serve uploaded file
app.get('/api/files/:fileId', requireAuth, (req, res) => {
  const file = uploads.get(req.params.fileId);
  if (!file) return res.status(404).json({ error: 'File not found.' });
  const buf = Buffer.from(file.data, 'base64');
  res.set('Content-Type', file.type);
  res.set('Content-Disposition', `inline; filename="${file.name}"`);
  res.send(buf);
});

// ── Conversations ──
app.get('/api/conversations', requireAuth, (req, res) => {
  const myConvos = Array.from(conversations.values())
    .filter(c => c.participants.includes(req.userId))
    .map(c => {
      const otherId = c.participants.find(id => id !== req.userId);
      const other = users.get(otherId);
      const convoMessages = Array.from(messages.values())
        .filter(m => m.convoKey === c.key)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      const unread = convoMessages.filter(m => m.senderId !== req.userId && !m.readBy?.includes(req.userId)).length;
      return { ...c, other: publicUser(other), lastMessage: convoMessages.at(-1) || null, unread };
    })
    .sort((a, b) => new Date(b.lastMessage?.createdAt || b.createdAt) - new Date(a.lastMessage?.createdAt || a.createdAt));
  res.json(myConvos);
});

app.post('/api/conversations', requireAuth, (req, res) => {
  const { otherUserId } = req.body;
  if (!users.has(otherUserId)) return res.status(404).json({ error: 'User not found.' });
  const key = getConvoKey(req.userId, otherUserId);
  if (!conversations.has(key)) {
    conversations.set(key, { id: uuidv4(), key, participants: [req.userId, otherUserId], createdAt: new Date().toISOString() });
  }
  const convo = conversations.get(key);
  const convoMessages = Array.from(messages.values())
    .filter(m => m.convoKey === key)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  res.json({ ...convo, other: publicUser(users.get(otherUserId)), messages: convoMessages });
});

app.get('/api/conversations/:key/messages', requireAuth, (req, res) => {
  const convo = conversations.get(req.params.key);
  if (!convo || !convo.participants.includes(req.userId)) return res.status(403).json({ error: 'Forbidden.' });
  res.json(Array.from(messages.values()).filter(m => m.convoKey === req.params.key)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
});

// ── Socket.io ──
io.on('connection', (socket) => {
  let authedUserId = null;

  socket.on('auth', (token) => {
    const userId = sessions.get(token);
    if (!userId) return socket.emit('authError', 'Invalid token');
    authedUserId = userId;
    userSockets.set(userId, socket.id);
    socket.join(`user:${userId}`);
    io.emit('userOnline', userId);
  });

  socket.on('joinConvo', (convoKey) => socket.join(`convo:${convoKey}`));

  socket.on('sendMessage', ({ convoKey, text, fileId, fileName, fileType, fileSize }) => {
    if (!authedUserId) return;
    const convo = conversations.get(convoKey);
    if (!convo || !convo.participants.includes(authedUserId)) return;
    if (!text?.trim() && !fileId) return;

    const msg = {
      id: uuidv4(), convoKey, senderId: authedUserId,
      text: text?.trim() || '',
      file: fileId ? { id: fileId, name: fileName, type: fileType, size: fileSize } : null,
      createdAt: new Date().toISOString(),
      readBy: [authedUserId]
    };
    messages.set(msg.id, msg);
    io.to(`convo:${convoKey}`).emit('newMessage', msg);
    const otherId = convo.participants.find(id => id !== authedUserId);
    io.to(`user:${otherId}`).emit('conversationUpdated', convoKey);
  });

  socket.on('typing', ({ convoKey, isTyping }) => {
    if (!authedUserId) return;
    socket.to(`convo:${convoKey}`).emit('typing', { userId: authedUserId, isTyping });
  });

  socket.on('markRead', ({ convoKey }) => {
    if (!authedUserId) return;
    Array.from(messages.values())
      .filter(m => m.convoKey === convoKey && m.senderId !== authedUserId)
      .forEach(m => { if (!m.readBy) m.readBy = []; if (!m.readBy.includes(authedUserId)) m.readBy.push(authedUserId); });
  });

  socket.on('disconnect', () => {
    if (authedUserId) { userSockets.delete(authedUserId); io.emit('userOffline', authedUserId); }
  });
});

// ── Serve React ──
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'client/build/index.html')));
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
