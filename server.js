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

function readJSON(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({}));
  return JSON.parse(fs.readFileSync(file));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

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
    isOnline: true
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
    comments: []
  };
  posts.push(newPost);
  writeJSON(postsFile, posts);
  res.sendStatus(200);
});

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
  const users = readJSON(usersFile);
  const convKey = [username, friend].sort().join('_');
  if (!dms[convKey]) dms[convKey] = [];
  const newDM = {
    id: Date.now().toString(),
    username,
    message: message || '',
    image: req.file ? `/uploads/${req.file.filename}` : null,
    profilePic: users[username].profilePic || '/uploads/default.jpg'
  };
  dms[convKey].push(newDM);
  writeJSON(dmsFile, dms);
  res.sendStatus(200);
});

app.post('/like', (req, res) => {
  const username = req.cookies.username;
  const { postId } = req.body;
  if (!username || !postId) return res.status(400).json({ error: 'Invalid request' });
  const posts = readJSON(postsFile);
  const post = posts.find(p => p.id === postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.likes.includes(username)) post.likes = post.likes.filter(u => u !== username);
  else post.likes.push(username);
  writeJSON(postsFile, posts);
  res.json({ likes: post.likes.length });
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

app.get('/friends', (req, res) => {
  const username = req.cookies.username;
  const users = readJSON(usersFile);
  if (!username || !users[username]) return res.json({ friends: [] });
  const friendsData = users[username].friends.map(f => {
    const friend = users[f];
    return { username: f, profilePic: friend?.profilePic || '/uploads/default.jpg' };
  });
  res.json({ friends: friendsData });
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

app.get('/search-users', (req, res) => {
  const query = req.query.query?.toLowerCase() || '';
  const users = Object.keys(readJSON(usersFile));
  const matches = users.filter(u => u.toLowerCase().includes(query));
  res.json({ users: matches });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

