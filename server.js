const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

const usersFile = path.join(__dirname, 'users.json');
const postsFile = path.join(__dirname, 'posts.json');

// ----------------------------
// JSON Helpers
// ----------------------------
function readJSON(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({}));
  return JSON.parse(fs.readFileSync(file));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ----------------------------
// ACCOUNT MANAGEMENT
// ----------------------------
app.post('/create-account', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const users = readJSON(usersFile);
  if (users[username]) return res.status(409).json({ error: 'Username already exists' });

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
// POSTS
// ----------------------------
app.get('/posts', (req, res) => {
  const posts = fs.existsSync(postsFile) ? JSON.parse(fs.readFileSync(postsFile)) : [];
  res.json(posts);
});

app.post('/posts', (req, res) => {
  const username = req.cookies.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });

  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  const posts = fs.existsSync(postsFile) ? JSON.parse(fs.readFileSync(postsFile)) : [];
  posts.push({ username, message });
  writeJSON(postsFile, posts);
  res.sendStatus(200);
});

// ----------------------------
// FRIENDS
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
// FRIEND REQUESTS
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
// SEARCH USERS (exact match optional in front-end)
// ----------------------------
app.get('/search-users', (req, res) => {
  const query = req.query.query?.toLowerCase() || '';
  const users = Object.keys(readJSON(usersFile));
  const matches = users.filter(u => u.toLowerCase().includes(query));
  res.json({ users: matches });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

