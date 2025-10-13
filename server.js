const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const multer = require('multer');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// Multer setup for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({ storage });

// JSON files
const usersFile = path.join(__dirname, 'users.json');
const postsFile = path.join(__dirname, 'posts.json');
const dmsFile = path.join(__dirname, 'dms.json');

// ----------------------------
// Helpers
// ----------------------------
function readJSON(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({}));
  return JSON.parse(fs.readFileSync(file));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ----------------------------
// Account routes
// ----------------------------
app.post('/create-account', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const users = readJSON(usersFile);
  if (users[username]) return res.status(409).json({ error: 'Username exists' });

  const hash = await bcrypt.hash(password, 10);
  users[username] = { password: hash, friends: [], pendingRequests: [] };
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

  res.cookie('username', username, { httpOnly: true, path: '/' });
  res.json({ success: true });
});

app.get('/logout', (req, res) => {
  res.clearCookie('username', { path: '/' });
  res.redirect('/index.html');
});

app.get('/me', (req, res) => {
  const username = req.cookies.username;
  const users = readJSON(usersFile);
  if (!username || !users[username]) return res.status(401).json({ error: 'Not logged in' });
  res.json({ username });
});

// ----------------------------
// Posts
// ----------------------------
app.get('/posts', (req, res) => {
  const posts = fs.existsSync(postsFile) ? JSON.parse(fs.readFileSync(postsFile)) : [];
  res.json(posts);
});

app.post('/posts', upload.single('image'), (req, res) => {
  const username = req.cookies.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });

  const { message } = req.body;
  const posts = fs.existsSync(postsFile) ? JSON.parse(fs.readFileSync(postsFile)) : [];
  const newPost = {
    id: Date.now().toString(),
    username,
    message: message || '',
    image: req.file ? `/uploads/${req.file.filename}` : null,
    likes: [],
    comments: []
  };
  posts.push(newPost);
  writeJSON(postsFile, posts);
  res.sendStatus(200);
});

// ----------------------------
// DMs
// ----------------------------
app.get('/dm', (req, res) => {
  const username = req.cookies.username;
  const friend = req.query.user;
  if (!username || !friend) return res.status(400).json({ error: 'Invalid request' });

  const dms = readJSON(dmsFile);
  const convKey = [username, friend].sort().join('_');
  res.json(dms[convKey] || []);
});

app.post('/dm', upload.single('image'), (req, res) => {
  const username = req.cookies.username;
  const { message, friend } = req.body;
  if (!username || !friend) return res.status(400).json({ error: 'Invalid request' });

  const dms = readJSON(dmsFile);
  const convKey = [username, friend].sort().join('_');
  if (!dms[convKey]) dms[convKey] = [];

  const newDM = {
    id: Date.now().toString(),
    username,
    message: message || '',
    image: req.file ? `/uploads/${req.file.filename}` : null
  };
  dms[convKey].push(newDM);
  writeJSON(dmsFile, dms);
  res.sendStatus(200);
});

// ----------------------------
// Likes & Comments
// ----------------------------
app.post('/like', (req, res) => {
  const username = req.cookies.username;
  const { postId } = req.body;
  if (!username || !postId) return res.status(400).json({ error: 'Invalid request' });

  const posts = readJSON(postsFile);
  const post = posts.find(p => p.id === postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  if (!post.likes.includes(username)) post.likes.push(username);
  writeJSON(postsFile, posts);
  res.json({ ok: true });
});

app.post('/comment', (req, res) => {
  const username = req.cookies.username;
  const { postId, text } = req.body;
  if (!username || !postId || !text) return res.status(400).json({ error: 'Invalid request' });

  const posts = readJSON(postsFile);
  const post = posts.find(p => p.id === postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  post.comments.push({ user: username, text });
  writeJSON(postsFile, posts);
  res.json({ ok: true });
});

// ----------------------------
// Friends
// ----------------------------
app.get('/friends', (req, res) => {
  const username = req.cookies.username;
  const users = readJSON(usersFile);
  if (!username || !users[username]) return res.json({ friends: [] });
  res.json({ friends: users[username].friends });
});

app.delete('/friends', (req, res) => {
  const username = req.cookies.username;
  const { friend } = req.body;
  const users = readJSON(usersFile);
  if (!username || !users[username]) return res.sendStatus(400);

  users[username].friends = users[username].friends.filter(f => f !== friend);
  if (users[friend]) users[friend].friends = users[friend].friends.filter(f => f !== username);
  writeJSON(usersFile, users);
  res.sendStatus(200);
});

// ----------------------------
// Friend requests
// ----------------------------
app.post('/friend-request', (req, res) => {
  const sender = req.cookies.username;
  const { recipient } = req.body;
  const users = readJSON(usersFile);

  if (!sender || !users[sender] || !users[recipient]) return res.status(400).json({ error: 'Invalid request' });
  if (users[recipient].pendingRequests.includes(sender) || users[recipient].friends.includes(sender)) return res.json({ ok: true });

  users[recipient].pendingRequests.push(sender);
  writeJSON(usersFile, users);
  res.json({ ok: true });
});

app.get('/friend-requests', (req, res) => {
  const username = req.cookies.username;
  const users = readJSON(usersFile);
  if (!username || !users[username]) return res.status(401).json({ error: 'Not logged in' });

  res.json({ requests: users[username].pendingRequests });
});

app.post('/friend-request/respond', (req, res) => {
  const recipient = req.cookies.username;
  const { from, accept } = req.body;
  const users = readJSON(usersFile);

  if (!recipient || !users[recipient] || !users[from]) return res.status(400).json({ error: 'Invalid request' });

  users[recipient].pendingRequests = users[recipient].pendingRequests.filter(u => u !== from);

  if (accept) {
    if (!users[recipient].friends.includes(from)) users[recipient].friends.push(from);
    if (!users[from].friends.includes(recipient)) users[from].friends.push(recipient);
  }

  writeJSON(usersFile, users);
  res.json({ ok: true });
});

// ----------------------------
// Search users
// ----------------------------
app.get('/search-users', (req, res) => {
  const query = req.query.query?.toLowerCase() || '';
  const users = Object.keys(readJSON(usersFile));
  const matches = users.filter(u => u.toLowerCase().includes(query));
  res.json({ users: matches });
});

// ----------------------------
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

