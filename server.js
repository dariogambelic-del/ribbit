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
  ensureFile(file, Array.isArray(initialPlaceholder(file)) ? [] : {});
  return JSON.parse(fs.readFileSync(file));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function initialPlaceholder(file) {
  if (file === postsFile) return [];
  if (file === dmsFile) return [];
  return {};
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
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
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

// ---------- User Info ----------
app.get('/me', (req, res) => {
  const username = req.cookies.username;
  const users = readJSON(usersFile);
  if (!username || !users[username]) return res.status(401).json({ error: 'Not logged in' });
  const userData = users[username];
  res.json({
    username,
    bio: userData.bio || '',
    age: userData.age || null,
    dob: userData.dob || 'N/A',
    relationshipStatus: userData.relationshipStatus || '',
    createdAt: userData.createdAt || null,
    profilePic: userData.profilePic || '/uploads/default.jpg',
    profileComplete: userData.profileComplete,
    status: userData.isOnline ? 'online 🟢' : 'offline 🔴',
    lastLoggedIn: userData.lastLoggedIn || 'Unknown'
  });
});

app.get('/user/:username', (req, res) => {
  const username = req.params.username;
  const users = readJSON(usersFile);
  if (!users[username]) return res.status(404).json({ error: 'User not found' });
  const userData = users[username];
  res.json({
    username,
    bio: userData.bio || '',
    age: userData.age || null,
    dob: userData.dob || 'N/A',
    relationshipStatus: userData.relationshipStatus || '',
    createdAt: userData.createdAt || null,
    profilePic: userData.profilePic || '/uploads/default.jpg',
    status: userData.isOnline ? 'online 🟢' : 'offline 🔴',
    lastLoggedIn: userData.lastLoggedIn || 'Unknown'
  });
});

// ---------- Privacy Settings ----------
app.get('/privacy-settings', (req, res) => {
  const username = req.cookies.username;
  const users = readJSON(usersFile);
  if (!username || !users[username]) return res.status(401).json({ error: 'Not logged in' });
  res.json(users[username].privacy || {
    showAge: true,
    showDOB: true,
    showRelationship: true,
    showLastLogin: true,
    showStatus: true
  });
});

app.post('/update-privacy', (req, res) => {
  const username = req.cookies.username;
  const users = readJSON(usersFile);
  if (!username || !users[username]) return res.status(401).json({ error: 'Not logged in' });
  const privacy = req.body;
  users[username].privacy = {
    showAge: privacy.showAge ?? true,
    showDOB: privacy.showDOB ?? true,
    showRelationship: privacy.showRelationship ?? true,
    showLastLogin: privacy.showLastLogin ?? true,
    showStatus: privacy.showStatus ?? true
  };
  writeJSON(usersFile, users);
  res.json({ ok: true });
});

// ---------- Keep Alive / Last Login ----------
app.post('/update-last-login', (req, res) => {
  const username = req.cookies.username;
  const users = readJSON(usersFile);
  if (!username || !users[username]) return res.status(401).json({ error: 'Not logged in' });
  const { lastLoggedIn } = req.body;
  users[username].lastLoggedIn = lastLoggedIn || new Date().toISOString();
  users[username].isOnline = true;
  writeJSON(usersFile, users);
  res.json({ ok: true });
});

app.post('/keep-online', (req, res) => {
  const username = req.cookies.username;
  const users = readJSON(usersFile);
  if (!username || !users[username]) return res.sendStatus(401);
  users[username].isOnline = true;
  writeJSON(usersFile, users);
  res.sendStatus(200);
});

// ---------- Profile ----------
app.post('/complete-profile', upload.single('profilePic'), (req, res) => {
  const username = req.cookies.username;
  const users = readJSON(usersFile);
  if (!username || !users[username]) return res.status(401).json({ error: 'Not logged in' });
  const { age, bio, relationshipStatus, dob } = req.body;
  const parsedAge = parseInt(age);
  if (isNaN(parsedAge) || parsedAge < 18) return res.status(400).json({ error: 'Invalid age' });
  if (!bio || bio.length > 35) return res.status(400).json({ error: 'Invalid bio' });
  let profilePicPath = users[username].profilePic || '/uploads/default.jpg';
  if (req.file && req.file.filename) profilePicPath = `/uploads/${req.file.filename}`;
  users[username].age = parsedAge;
  users[username].bio = bio;
  users[username].relationshipStatus = relationshipStatus || '';
  users[username].dob = dob || '';
  users[username].profilePic = profilePicPath;
  users[username].profileComplete = true;
  if (!users[username].createdAt) users[username].createdAt = new Date().toISOString();
  writeJSON(usersFile, users);
  res.json({ ok: true });
});

app.post('/edit-profile', upload.single('profilePic'), (req, res) => {
  const username = req.cookies.username;
  const users = readJSON(usersFile);
  if (!username || !users[username]) return res.status(401).json({ error: 'Not logged in' });
  const { bio, relationshipStatus, dob } = req.body;
  if (!bio || bio.length > 35) return res.status(400).json({ error: 'Invalid bio' });
  users[username].bio = bio;
  users[username].relationshipStatus = relationshipStatus || users[username].relationshipStatus;
  if (dob) users[username].dob = dob;
  if (req.file && req.file.filename) users[username].profilePic = `/uploads/${req.file.filename}`;
  writeJSON(usersFile, users);
  res.json({ ok: true });
});

// ---------- Posts ----------
app.get('/posts', (req, res) => {
  const posts = fs.existsSync(postsFile) ? JSON.parse(fs.readFileSync(postsFile)) : [];
  res.json(posts);
});

app.post('/posts', upload.single('image'), (req, res) => {
  const username = req.cookies.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });
  const { message } = req.body;
  const posts = fs.existsSync(postsFile) ? JSON.parse(fs.readFileSync(postsFile)) : [];
  const users = readJSON(usersFile);
  const newPost = {
    id: Date.now().toString(),
    username,
    message: message || '',
    image: req.file ? `/uploads/${req.file.filename}` : null,
    profilePic: users[username].profilePic || '/uploads/default.jpg',
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
  if (!username) return res.status(401).json({ error: 'Not logged in' });
  const { postId } = req.body;
  if (!postId) return res.status(400).json({ error: 'postId required' });
  const posts = fs.existsSync(postsFile) ? JSON.parse(fs.readFileSync(postsFile)) : [];
  const post = posts.find(p => p.id === postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const idx = post.likes.indexOf(username);
  if (idx === -1) post.likes.push(username);
  else post.likes.splice(idx, 1);
  writeJSON(postsFile, posts);
  res.json({ ok: true, likes: post.likes.length });
});

app.post('/comment', (req, res) => {
  const username = req.cookies.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });
  const { postId, text } = req.body;
  if (!postId || !text) return res.status(400).json({ error: 'postId and text required' });
  const posts = fs.existsSync(postsFile) ? JSON.parse(fs.readFileSync(postsFile)) : [];
  const post = posts.find(p => p.id === postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  post.comments = post.comments || [];
  post.comments.push({ user: username, text, createdAt: new Date().toISOString() });
  writeJSON(postsFile, posts);
  res.json({ ok: true, comments: post.comments });
});

// ---------- DMs ----------
app.get('/dm', (req, res) => {
  const username = req.cookies.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });
  const other = req.query.user;
  if (!other) return res.status(400).json({ error: 'user query param required' });
  const dms = fs.existsSync(dmsFile) ? JSON.parse(fs.readFileSync(dmsFile)) : [];
  const convo = dms.filter(m =>
    (m.from === username && m.to === other) || (m.from === other && m.to === username)
  ).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  const users = readJSON(usersFile);
  const enriched = convo.map(m => ({
    username: m.from,
    message: m.message,
    createdAt: m.createdAt,
    profilePic: users[m.from]?.profilePic || '/uploads/default.jpg'
  }));
  res.json(enriched);
});

app.post('/dm', upload.none(), (req, res) => {
  const username = req.cookies.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });
  const { friend, message } = req.body;
  if (!friend || !message) return res.status(400).json({ error: 'friend and message required' });
  const dms = fs.existsSync(dmsFile) ? JSON.parse(fs.readFileSync(dmsFile)) : [];
  const users = readJSON(usersFile);
  if (!users[friend]) return res.status(404).json({ error: 'Recipient not found' });
  const newDM = {
    id: Date.now().toString(),
    from: username,
    to: friend,
    message,
    createdAt: new Date().toISOString()
  };
  dms.push(newDM);
  writeJSON(dmsFile, dms);
  res.json({ ok: true });
});

// ---------- Friends & Friend Requests ----------
app.get('/friends', (req, res) => {
  const username = req.cookies.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });
  const users = readJSON(usersFile);
  const me = users[username];
  const list = (me.friends || []).map(f => {
    const data = users[f] || {};
    return { username: f, profilePic: data.profilePic || '/uploads/default.jpg' };
  });
  res.json({ friends: list });
});

app.post('/friend-request', (req, res) => {
  const username = req.cookies.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });
  const { recipient } = req.body;
  if (!recipient) return res.status(400).json({ error: 'recipient required' });
  const users = readJSON(usersFile);
  if (!users[recipient]) return res.status(404).json({ error: 'User not found' });
  if (users[recipient].pendingRequests && users[recipient].pendingRequests.includes(username)) {
    return res.status(409).json({ error: 'Request already sent' });
  }
  users[recipient].pendingRequests = users[recipient].pendingRequests || [];
  users[recipient].pendingRequests.push(username);
  writeJSON(usersFile, users);
  res.json({ ok: true });
});

app.get('/friend-requests', (req, res) => {
  const username = req.cookies.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });
  const users = readJSON(usersFile);
  const me = users[username];
  res.json({ requests: me.pendingRequests || [] });
});

app.post('/friend-request/respond', (req, res) => {
  const username = req.cookies.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });
  const { from, accept } = req.body;
  if (!from) return res.status(400).json({ error: 'from required' });
  const users = readJSON(usersFile);
  if (!users[from]) return res.status(404).json({ error: 'Sender not found' });
  users[username].pendingRequests = (users[username].pendingRequests || []).filter(u => u !== from);
  if (accept) {
    users[username].friends = Array.from(new Set([...(users[username].friends || []), from]));
    users[from].friends = Array.from(new Set([...(users[from].friends || []), username]));
  }
  writeJSON(usersFile, users);
  res.json({ ok: true });
});

app.delete('/friends', (req, res) => {
  const username = req.cookies.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });
  const { friend } = req.body;
  if (!friend) return res.status(400).json({ error: 'friend required' });
  const users = readJSON(usersFile);
  if (!users[friend]) return res.status(404).json({ error: 'Friend not found' });
  users[username].friends = (users[username].friends || []).filter(f => f !== friend);
  users[friend].friends = (users[friend].friends || []).filter(f => f !== username);
  writeJSON(usersFile, users);
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

// ---------- Reset posts (clear once every 24h via client trigger) ----------
app.post('/reset-posts', (req, res) => {
  writeJSON(postsFile, []);
  res.json({ ok: true });
});

// ---------- Utility: return full user list for Explore (optional) ----------
app.get('/all-users', (req, res) => {
  const users = readJSON(usersFile);
  const list = Object.keys(users).map(u => ({
    username: u,
    profilePic: users[u].profilePic || '/uploads/default.jpg',
    bio: users[u].bio || ''
  }));
  res.json(list);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

