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
const notificationsFile = path.join(__dirname, 'notifications.json');

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
ensureFile(notificationsFile, {});

function ensureUserStructure(user) {
  if (!user.friends) user.friends = [];
  if (!user.pendingRequests) user.pendingRequests = [];
  if (!user.blocked) user.blocked = [];
  if (!user.privacy) user.privacy = {
    showAge: true,
    showDOB: true,
    showRelationship: true,
    showLastLogin: true,
    showStatus: true
  };
  return user;
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
    blocked: [],
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

app.get('/friends', (req, res) => {
  const username = req.cookies.username;
  const users = readJSON(usersFile);
  const me = ensureUserStructure(users[username] || {});
  const blocked = me.blocked || [];
  const list = (me.friends || [])
    .filter(f => !blocked.includes(f))
    .map(f => {
      const data = ensureUserStructure(users[f] || {});
      return { username: f, profilePic: data.profilePic || '/uploads/default.jpg' };
    });
  res.json({ friends: list });
});

app.delete('/friends', (req, res) => {
  const username = req.cookies.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });
  const users = readJSON(usersFile);
  const friendToRemove = req.body.friend;
  if (!friendToRemove || !users[friendToRemove]) return res.status(404).json({ error: 'Friend not found' });
  users[username].friends = (users[username].friends || []).filter(f => f !== friendToRemove);
  users[friendToRemove].friends = (users[friendToRemove].friends || []).filter(f => f !== username);
  writeJSON(usersFile, users);
  res.json({ ok: true });
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

app.post('/block', async (req, res) => {
  try {
    const { friend } = req.body;
    const currentUser = req.session.username;
    if (!currentUser || !friend) return res.status(400).json({ error: 'Missing data' });
    const users = require('./users.json');
    if (!users[currentUser].blocked) users[currentUser].blocked = [];
    if (!users[currentUser].blocked.includes(friend)) {
      users[currentUser].blocked.push(friend);
    }
    users[currentUser].friends = users[currentUser].friends.filter(f => f !== friend);
    const fs = require('fs');
    fs.writeFileSync('./users.json', JSON.stringify(users, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/account/blocked', (req, res) => {
  const username = req.cookies.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });
  const users = readJSON(usersFile);
  const user = users[username];
  res.json(user?.blocked || []);
});

app.post('/account/unblock', (req, res) => {
  const username = req.cookies.username;
  const { user: blockedUser } = req.body;
  if (!username || !blockedUser) return res.status(400).json({ error: 'Missing data' });
  const users = readJSON(usersFile);
  if (!users[username]) return res.status(404).json({ error: 'User not found' });
  users[username].blocked = (users[username].blocked || []).filter(u => u !== blockedUser);
  writeJSON(usersFile, users);
  res.json({ ok: true });
});

app.get('/posts', (req, res) => {
  const username = req.cookies.username;
  const users = readJSON(usersFile);
  const blocked = users[username]?.blocked || [];
  const allPosts = readJSON(postsFile);
  const filteredPosts = allPosts.filter(p => !blocked.includes(p.username));
  res.json(filteredPosts);
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

app.get('/search-users', (req, res) => {
  const q = (req.query.query || '').trim().toLowerCase();
  const users = readJSON(usersFile);
  if (!q) return res.json({ users: [] });
  const matches = Object.keys(users).filter(u => u.toLowerCase().includes(q));
  res.json({ users: matches });
});

app.get('/me', (req, res) => {
  const username = req.cookies.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });
  const users = readJSON(usersFile);
  const user = users[username];
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    username,
    bio: user.bio || '',
    age: user.age || null,
    dob: user.dob || '',
    relationshipStatus: user.relationshipStatus || '',
    createdAt: user.createdAt,
    profilePic: user.profilePic,
    profileComplete: user.profileComplete || false,
    lastLoggedIn: user.lastLoggedIn,
    privacy: user.privacy
  });
});

app.get('/user/:username', (req, res) => {
  const target = req.params.username;
  const users = readJSON(usersFile);
  const user = users[target];
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    username: target,
    bio: user.bio || '',
    age: user.age || null,
    dob: user.dob || '',
    relationshipStatus: user.relationshipStatus || '',
    createdAt: user.createdAt,
    profilePic: user.profilePic,
    lastLoggedIn: user.lastLoggedIn,
    status: user.isOnline ? 'online 🟢' : 'offline 🔴'
  });
});

app.post('/complete-profile', upload.single('profilePic'), (req, res) => {
  const username = req.cookies.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });
  const users = readJSON(usersFile);
  const user = users[username];
  user.age = req.body.age;
  user.dob = req.body.dob;
  user.bio = req.body.bio;
  user.profilePic = req.file ? `/uploads/${req.file.filename}` : user.profilePic;
  user.profileComplete = true;
  writeJSON(usersFile, users);
  res.json({ success: true });
});

app.post('/account', async (req, res) => {
  const { password } = req.body;
  const username = req.cookies.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });
  const users = readJSON(usersFile);
  const user = users[username];
  if (!user) return res.status(404).json({ error: 'User not found' });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ error: 'Incorrect password' });
  delete users[username];
  Object.keys(users).forEach(u => {
    if (users[u].friends) users[u].friends = users[u].friends.filter(f => f !== username);
    if (users[u].blocked) users[u].blocked = users[u].blocked.filter(b => b !== username);
  });
  writeJSON(usersFile, users);
  res.clearCookie('username', { path: '/' });
  res.json({ success: true });
});

app.post('/edit-profile', upload.single('profilePic'), (req, res) => {
  const username = req.cookies.username;
  const users = readJSON(usersFile);
  const user = users[username];
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (req.body.bio) user.bio = req.body.bio;
  if (req.body.relationshipStatus) user.relationshipStatus = req.body.relationshipStatus;
  if (req.file) user.profilePic = `/uploads/${req.file.filename}`;
  writeJSON(usersFile, users);
  res.json({ success: true });
});

app.get('/privacy-settings', (req, res) => {
  const username = req.cookies.username;
  const users = readJSON(usersFile);
  const user = users[username];
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user.privacy || {
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
  if (!users[username]) return res.status(404).json({ error: 'User not found' });
  users[username].privacy = req.body;
  writeJSON(usersFile, users);
  res.json({ success: true });
});

app.post('/notify', (req, res) => {
  const sender = req.cookies.username;
  const { friend } = req.body;
  if (!sender || !friend) return res.status(400).json({ error: 'Missing data' });
  const users = readJSON(usersFile);
  if (!users[friend]) return res.status(404).json({ error: 'Friend not found' });
  const notifications = readJSON(notificationsFile);
  if (!notifications[friend]) notifications[friend] = [];
  notifications[friend].push({
    from: sender,
    type: 'sound',
    message: `${sender} sent you a notification`,
    createdAt: new Date().toISOString()
  });
  writeJSON(notificationsFile, notifications);
  res.json({ ok: true });
});

app.get('/notifications', (req, res) => {
  const username = req.cookies.username;
  if (!username) return res.status(401).json({ error: 'Not logged in' });
  const notifications = readJSON(notificationsFile);
  const userNotifications = notifications[username] || [];
  notifications[username] = [];
  writeJSON(notificationsFile, notifications);
  res.json({ notifications: userNotifications });
});

app.post('/account/change-password', async (req, res) => {
  const username = req.cookies.username;
  const { currentPassword, newPassword } = req.body;
  if (!username) return res.status(401).json({ error: 'Not logged in' });
  const users = readJSON(usersFile);
  const user = users[username];
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (newPassword.toLowerCase() === username.toLowerCase()) {
    return res.status(400).json({ error: "Password and username can't be the same" });
  }
  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) return res.status(400).json({ error: 'Current password incorrect' });
  user.password = await bcrypt.hash(newPassword, 10);
  writeJSON(usersFile, users);
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

