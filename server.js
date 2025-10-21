const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({ storage });

const usersFile = path.join(__dirname, 'users.json');
const postsFile = path.join(__dirname, 'posts.json');
const dmsFile = path.join(__dirname, 'dms.json');

function ensureFile(file, initial) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(initial, null, 2));
}

function readJSON(file) {
  ensureFile(file, file === postsFile || file === dmsFile ? [] : {});
  return JSON.parse(fs.readFileSync(file));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

ensureFile(usersFile, {});
ensureFile(postsFile, []);
ensureFile(dmsFile, []);

// ---------- Account & Auth ----------
app.post('/create-account', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const users = readJSON(usersFile);
  if (users[username]) return res.status(409).json({ error: 'Username already exists' });
  const hash = await bcrypt.hash(password, 10);
  users[username] = {
    password: hash,
    friends: [],
    pendingRequests: [],
    profileComplete: false,
    age: null,
    dob: '',
    relationshipStatus: '',
    createdAt: new Date().toISOString(),
    bio: '',
    profilePic: '/uploads/default.jpg',
    lastLoggedIn: new Date().toISOString(),
    isOnline: true,
    privacy: {
      showAge: true,
      showDOB: true,
      showRelationship: true,
      showLastLogin: true,
      showStatus: true
    }
  };
  writeJSON(usersFile, users);
  res.cookie('username', username, { httpOnly: true, path: '/' });
  res.json({ success: true });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const users = readJSON(usersFile);
  if (!users[username]) return res.status(401).json({ error: 'Invalid username or password' });
  const match = await bcrypt.compare(password, users[username].password);
  if (!match) return res.status(401).json({ error: 'Invalid username or password' });
  users[username].lastLoggedIn = new Date().toISOString();
  users[username].isOnline = true;
  writeJSON(usersFile, users);
  res.cookie('username', username, { httpOnly: true, path: '/' });
  res.json({ success: true });
});

app.get('/logout', (req, res) => {
  const username = req.cookies.username;
  const users = readJSON(usersFile);
  if (username && users[username]) {
    users[username].isOnline = false;
    writeJSON(usersFile, users);
  }
  res.clearCookie('username', { path: '/' });
  res.redirect('/index.html');
});

// ---------- Friends ----------
function ensureUserStructure(user) {
  if (!user.friends) user.friends = [];
  if (!user.pendingRequests) user.pendingRequests = [];
  if (!user.privacy) user.privacy = {
    showAge: true,
    showDOB: true,
    showRelationship: true,
    showLastLogin: true,
    showStatus: true
  };
  return user;
}

app.get('/friends', (req, res) => {
  const username = req.cookies.username;
  const users = readJSON(usersFile);
  const me = ensureUserStructure(users[username] || {});
  const list = (me.friends || []).map(f => {
    const data = ensureUserStructure(users[f] || {});
    return { username: f, profilePic: data.profilePic || '/uploads/default.jpg' };
  });
  res.json({ friends: list });
});

app.post('/friend-request', (req, res) => {
  const username = req.cookies.username;
  const { recipient } = req.body;
  const users = readJSON(usersFile);
  if (!users[recipient]) return res.status(404).json({ error: 'User not found' });
  ensureUserStructure(users[recipient]);
  ensureUserStructure(users[username]);
  if (users[recipient].pendingRequests.includes(username))
    return res.status(409).json({ error: 'Request already sent' });
  users[recipient].pendingRequests.push(username);
  writeJSON(usersFile, users);
  res.json({ ok: true });
});

app.get('/friend-requests', (req, res) => {
  const username = req.cookies.username;
  const users = readJSON(usersFile);
  const me = ensureUserStructure(users[username] || {});
  res.json({ requests: me.pendingRequests || [] });
});

app.post('/friend-request/respond', (req, res) => {
  const username = req.cookies.username;
  const { from, accept } = req.body;
  const users = readJSON(usersFile);
  ensureUserStructure(users[username]);
  ensureUserStructure(users[from]);
  users[username].pendingRequests = (users[username].pendingRequests || []).filter(u => u !== from);
  if (accept) {
    users[username].friends = Array.from(new Set([...(users[username].friends || []), from]));
    users[from].friends = Array.from(new Set([...(users[from].friends || []), username]));
  }
  writeJSON(usersFile, users);
  res.json({ ok: true });
});

// ---------- Posts ----------
app.get('/posts', (req, res) => {
  res.json(readJSON(postsFile));
});

app.post('/posts', upload.single('image'), (req, res) => {
  const username = req.cookies.username;
  const { message } = req.body;
  const posts = readJSON(postsFile);
  const users = readJSON(usersFile);
  const newPost = {
    id: Date.now().toString(),
    username,
    message: message || '',
    image: req.file ? `/uploads/${req.file.filename}` : null,
    profilePic: users[username]?.profilePic || '/uploads/default.jpg',
    likes: [],
    comments: [],
    createdAt: new Date().toISOString()
  };
  posts.push(newPost);
  writeJSON(postsFile, posts);
  res.sendStatus(200);
});

app.post('/like', (req, res) => {
  const username = req.cookies.username;
  const { postId } = req.body;
  const posts = readJSON(postsFile);
  const post = posts.find(p => p.id === postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const i = post.likes.indexOf(username);
  if (i === -1) post.likes.push(username);
  else post.likes.splice(i, 1);
  writeJSON(postsFile, posts);
  res.json({ ok: true, likes: post.likes.length });
});

app.post('/comment', (req, res) => {
  const username = req.cookies.username;
  const { postId, text } = req.body;
  const posts = readJSON(postsFile);
  const post = posts.find(p => p.id === postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  post.comments.push({ user: username, text, createdAt: new Date().toISOString() });
  writeJSON(postsFile, posts);
  res.json({ ok: true, comments: post.comments });
});

// ---------- DMs ----------
app.get('/dm', (req, res) => {
  const username = req.cookies.username;
  const other = req.query.user;
  const dms = readJSON(dmsFile);
  const convo = dms.filter(
    m => (m.from === username && m.to === other) || (m.from === other && m.to === username)
  );
  const users = readJSON(usersFile);
  res.json(convo.map(m => ({
    username: m.from,
    message: m.message,
    createdAt: m.createdAt,
    profilePic: users[m.from]?.profilePic || '/uploads/default.jpg'
  })));
});

app.post('/dm', upload.none(), (req, res) => {
  const username = req.cookies.username;
  const { friend, message } = req.body;
  const dms = readJSON(dmsFile);
  dms.push({ id: Date.now().toString(), from: username, to: friend, message, createdAt: new Date().toISOString() });
  writeJSON(dmsFile, dms);
  res.json({ ok: true });
});

// ---------- Search ----------
app.get('/search-users', (req, res) => {
  const q = (req.query.query || '').trim().toLowerCase();
  const users = readJSON(usersFile);
  if (!q) return res.json({ users: [] });
  const matches = Object.keys(users).filter(u => u.toLowerCase().includes(q));
  res.json({ users: matches });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

