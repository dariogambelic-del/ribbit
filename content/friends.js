const friendsList = document.getElementById('friendsList');
const searchInput = document.getElementById('friendSearch');
const searchResults = document.getElementById('searchResults');

// Track which popups are currently displayed
const activePopups = new Set();

// Popup creation for incoming requests
function showFriendRequestPopup(sender) {
  if (activePopups.has(sender)) return;
  activePopups.add(sender);

  const overlay = document.createElement('div');
  overlay.id = `friend-request-${sender}`;
  overlay.className = 'friend-request-popup';

  overlay.innerHTML = `
    <div class="popup-content">
      <p>${sender} sent you a friend request</p>
      <button class="accept-btn">Accept</button>
      <button class="deny-btn">Deny</button>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('.accept-btn').addEventListener('click', async () => {
    await respondToRequest(sender, true);
    overlay.remove();
    activePopups.delete(sender);
    loadFriends();
  });

  overlay.querySelector('.deny-btn').addEventListener('click', async () => {
    await respondToRequest(sender, false);
    overlay.remove();
    activePopups.delete(sender);
  });
}

// Respond to friend request backend call
async function respondToRequest(sender, accept) {
  await fetch('/friend-request/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ from: sender, accept })
  });
}

// Load friends list
async function loadFriends() {
  const res = await fetch('/friends', { credentials: 'same-origin' });
  const data = await res.json();
  friendsList.innerHTML = '';

  data.friends.forEach(f => {
    const li = document.createElement('li');
    li.textContent = f;

    // Click friend to open DM
    li.addEventListener('click', () => {
      window.currentFriend = f;
      const postsHeader = document.getElementById('postsHeader');
      if (postsHeader) postsHeader.textContent = `DM with ${f}`;
      if (typeof window.loadPosts === 'function') window.loadPosts();
    });

    const btn = document.createElement('button');
    btn.textContent = 'Remove';
    btn.style.marginLeft = '10px';
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      await fetch('/friends', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ friend: f })
      });
      if (window.currentFriend === f) window.currentFriend = null;
      loadFriends();
      if (typeof window.loadPosts === 'function') window.loadPosts();
    });

    li.appendChild(btn);
    friendsList.appendChild(li);
  });
}

// Send friend request
async function sendFriendRequest(username) {
  const confirmSend = confirm(`Send friend request to ${username}?`);
  if (!confirmSend) return;

  await fetch('/friend-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ recipient: username })
  });

  const notif = document.createElement('div');
  notif.className = 'sent-notification';
  notif.textContent = `Friend request sent to ${username}`;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 2000);
}

// Search users (exact match)
searchInput.addEventListener('input', async e => {
  const query = e.target.value.trim();
  searchResults.innerHTML = '';
  if (!query) {
    searchResults.style.display = 'none';
    return;
  }

  const res = await fetch(`/search-users?query=${encodeURIComponent(query)}`, { credentials: 'same-origin' });
  const data = await res.json();

  data.users.forEach(u => {
    if (u !== query) return; // exact match only
    const li = document.createElement('li');
    li.textContent = u;
    li.addEventListener('click', () => sendFriendRequest(u));
    searchResults.appendChild(li);
  });

  searchResults.style.display = searchResults.childElementCount > 0 ? 'block' : 'none';
});

// Hide search results when clicking outside
document.addEventListener('click', e => {
  if (!searchResults.contains(e.target) && e.target !== searchInput) {
    searchResults.style.display = 'none';
  }
});

// Poll incoming friend requests
async function checkFriendRequests() {
  const res = await fetch('/friend-requests', { credentials: 'same-origin' });
  if (!res.ok) return;

  const data = await res.json();
  if (!data.requests) return;

  data.requests.forEach(sender => showFriendRequestPopup(sender));
}

// Start polling immediately on page load
window.addEventListener('load', () => {
  checkFriendRequests(); // immediate
  setInterval(checkFriendRequests, 3000);
});

// Initial friends load
loadFriends();

