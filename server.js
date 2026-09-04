const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || '*';

const io = new Server(server, {
  cors: { origin: CLIENT_URL, methods: ['GET', 'POST'] }
});

app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

// ── In-memory store (swap with Postgres/Redis for production) ──
const users = new Map();        // id → user
const sessions = new Map();     // token → userId
const conversations = new Map();// key → conversation
const messages = new Map();     // id → message
const userSockets = new Map();  // userId → socketId

// ── Helpers ──
function makeToken() {
  return uuidv4().replace(/-/g, '');
}

function getConvoKey(a, b) {
  return [a, b].sort().join('::');
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    avatar: user.avatar,
    createdAt: user.createdAt,
    isOnline: userSockets.has(user.id)
  };
}

function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'];
  const userId = sessions.get(token);
  if (!userId || !users.has(userId)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.userId = userId;
  req.user = users.get(userId);
  next();
}

// ── Auth ──
// Register
app.post('/api/auth/register', (req, res) => {
  const { name, username, password } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Name, username, and password are required.' });
  }

  // Check username taken
  const taken = Array.from(users.values()).find(u => u.username === username.toLowerCase());
  if (taken) return res.status(409).json({ error: 'Username already taken.' });

  const id = uuidv4();
  // Simple avatar color based on name
  const colors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6'];
  const color = colors[name.charCodeAt(0) % colors.length];
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const user = {
    id,
    name,
    username: username.toLowerCase(),
    password, // In production: hash with bcrypt
    avatar: { initials, color },
    createdAt: new Date().toISOString()
  };

  users.set(id, user);

  const token = makeToken();
  sessions.set(token, id);

  res.json({ token, user: publicUser(user) });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = Array.from(users.values()).find(
    u => u.username === username?.toLowerCase() && u.password === password
  );
  if (!user) return res.status(401).json({ error: 'Invalid username or password.' });

  const token = makeToken();
  sessions.set(token, user.id);
  res.json({ token, user: publicUser(user) });
});

// Me
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json(publicUser(req.user));
});

// ── Users ──
app.get('/api/users', requireAuth, (req, res) => {
  const all = Array.from(users.values())
    .filter(u => u.id !== req.userId)
    .map(publicUser);
  res.json(all);
});

app.get('/api/users/search', requireAuth, (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const results = Array.from(users.values())
    .filter(u => u.id !== req.userId && (
      u.name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q)
    ))
    .map(publicUser);
  res.json(results);
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
      return {
        ...c,
        other: publicUser(other),
        lastMessage: convoMessages.at(-1) || null,
        unread
      };
    })
    .sort((a, b) => {
      const aTime = a.lastMessage?.createdAt || a.createdAt;
      const bTime = b.lastMessage?.createdAt || b.createdAt;
      return new Date(bTime) - new Date(aTime);
    });

  res.json(myConvos);
});

app.post('/api/conversations', requireAuth, (req, res) => {
  const { otherUserId } = req.body;
  if (!users.has(otherUserId)) return res.status(404).json({ error: 'User not found.' });

  const key = getConvoKey(req.userId, otherUserId);
  if (!conversations.has(key)) {
    conversations.set(key, {
      id: uuidv4(),
      key,
      participants: [req.userId, otherUserId],
      createdAt: new Date().toISOString()
    });
  }

  const convo = conversations.get(key);
  const other = users.get(otherUserId);
  const convoMessages = Array.from(messages.values())
    .filter(m => m.convoKey === key)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  res.json({ ...convo, other: publicUser(other), messages: convoMessages });
});

// ── Messages ──
app.get('/api/conversations/:key/messages', requireAuth, (req, res) => {
  const convo = conversations.get(req.params.key);
  if (!convo || !convo.participants.includes(req.userId)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  const convoMessages = Array.from(messages.values())
    .filter(m => m.convoKey === req.params.key)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  res.json(convoMessages);
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

  socket.on('joinConvo', (convoKey) => {
    socket.join(`convo:${convoKey}`);
  });

  socket.on('sendMessage', ({ convoKey, text }) => {
    if (!authedUserId) return;
    const convo = conversations.get(convoKey);
    if (!convo || !convo.participants.includes(authedUserId)) return;
    if (!text?.trim()) return;

    const msg = {
      id: uuidv4(),
      convoKey,
      senderId: authedUserId,
      text: text.trim(),
      createdAt: new Date().toISOString(),
      readBy: [authedUserId]
    };
    messages.set(msg.id, msg);

    io.to(`convo:${convoKey}`).emit('newMessage', msg);

    // Notify the other participant
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
      .forEach(m => {
        if (!m.readBy) m.readBy = [];
        if (!m.readBy.includes(authedUserId)) m.readBy.push(authedUserId);
      });
  });

  socket.on('disconnect', () => {
    if (authedUserId) {
      userSockets.delete(authedUserId);
      io.emit('userOffline', authedUserId);
    }
  });
});

// ── Serve built React app in production ──
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'client/build/index.html')));
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
