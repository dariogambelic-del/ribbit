const friendsList = document.getElementById('friendsList');
const searchInput = document.getElementById('friendSearch');
const searchResults = document.getElementById('searchResults');
const activePopups = new Set();
const sound = new Audio('/content/sounds/sound.mp3');
const unreadMessages = new Set();

function showFriendRequestPopup(sender) {
  if (activePopups.has(sender)) return;
  activePopups.add(sender);
  sound.play();

  const overlay = document.createElement('div');
  overlay.id = `friend-request-${sender}`;
  overlay.className = 'friend-request-popup';
  overlay.innerHTML = `
    <div class="popup-content" style="background-color: #f0fff0; border-color: green;">
      <p>${sender} sent you a friend request</p>
      <button class="accept-btn" style="background-color: #2ecc71; color: white;">Accept</button>
      <button class="deny-btn" style="background-color: #e74c3c; color: white;">Deny</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.accept-btn').addEventListener('click', async () => {
    await respondToRequest(sender, true);
    overlay.remove();
    activePopups.delete(sender);
  });

  overlay.querySelector('.deny-btn').addEventListener('click', async () => {
    await respondToRequest(sender, false);
    overlay.remove();
    activePopups.delete(sender);
  });
}

async function respondToRequest(sender, accept) {
  await fetch('/friend-request/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ from: sender, accept })
  });
}

async function loadFriends() {
  const res = await fetch('/friends', { credentials: 'same-origin' });
  const data = await res.json();
  friendsList.innerHTML = '';

  const friendCount = document.getElementById('friendCount');
  friendCount.textContent = `(${data.friends.length})`;

  for (let f of data.friends) {
    const username = typeof f === 'string' ? f : f.username;
    const profilePic = f.profilePic && f.profilePic.trim() !== '' ? f.profilePic : '/img/default.jpg';

    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.alignItems = 'center';
    li.style.justifyContent = 'space-between';
    li.style.position = 'relative';

    const friendInfo = document.createElement('div');
    friendInfo.style.display = 'flex';
    friendInfo.style.alignItems = 'center';
    friendInfo.style.cursor = 'pointer';

    const img = document.createElement('img');
    img.src = profilePic;
    img.alt = username;
    img.className = 'friend-avatar';
    img.style.width = '25px';
    img.style.height = '25px';
    img.style.borderRadius = '50%';
    img.style.marginRight = '8px';

    const span = document.createElement('span');
    span.textContent = username;

    friendInfo.appendChild(img);
    friendInfo.appendChild(span);
    li.appendChild(friendInfo);

    if (unreadMessages.has(username)) {
      const notifSquare = document.createElement('div');
      notifSquare.className = 'message-notif';
      notifSquare.style.width = '8px';
      notifSquare.style.height = '8px';
      notifSquare.style.backgroundColor = 'red';
      notifSquare.style.borderRadius = '2px';
      notifSquare.style.marginLeft = '6px';
      li.appendChild(notifSquare);
    }

    friendInfo.addEventListener('click', async () => {
      window.currentFriend = username;
      const postsHeader = document.getElementById('postsHeader');
      postsHeader.textContent = `MSG ${username}`;
      unreadMessages.delete(username);
      const existingSquare = li.querySelector('.message-notif');
      if (existingSquare) existingSquare.remove();
      const existingBtn = document.querySelector('.friend-remove-btn');
      if (existingBtn) existingBtn.remove();

      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.className = 'remove-btn friend-remove-btn';
      removeBtn.style.marginLeft = '5px';
      removeBtn.style.fontSize = '0.6rem';

      removeBtn.addEventListener('click', e => {
        e.stopPropagation();
        showRemoveFriendPopup(username);
      });

      postsHeader.appendChild(removeBtn);

      if (typeof window.loadPosts === 'function') window.loadPosts();
      const res = await fetch(`/user/${username}`, { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();

      if (typeof window.updateUserInfoContainerWithData === 'function') {
        window.updateUserInfoContainerWithData(data);
      }

      const rightFarDiv = document.querySelector('.right-far');
      if (rightFarDiv) {
        rightFarDiv.innerHTML = '';
        const img = document.createElement('img');
        img.src = data.profilePic || '/img/default.jpg';
        img.alt = username;
        rightFarDiv.appendChild(img);
      }
    });

    friendsList.appendChild(li);
  }
}

function showRemoveFriendPopup(username) {
  const overlay = document.createElement('div');
  overlay.className = 'popup';
  overlay.innerHTML = `
    <div class="popup-content" style="background-color: #fff0f0; border-color: #e74c3c;">
      <p>Remove ${username} as a friend?</p>
      <button id="confirmRemove" style="background-color: #e74c3c; color: white;">Yes</button>
      <button id="cancelRemove" style="background-color: #95a5a6; color: white;">No</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#confirmRemove').addEventListener('click', async () => {
    await fetch('/friends', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ friend: username })
    });
    overlay.remove();
    window.currentFriend = null;
    loadFriends();
    if (typeof window.loadPosts === 'function') window.loadPosts();
    if (typeof window.updateUserInfoContainerWithData === 'function')
      window.updateUserInfoContainerWithData({});
    const rightFarDiv = document.querySelector('.right-far');
    if (rightFarDiv) rightFarDiv.innerHTML = '';
  });

  overlay.querySelector('#cancelRemove').addEventListener('click', () => {
    overlay.remove();
  });
}

async function sendFriendRequest(username) {
  const overlay = document.createElement('div');
  overlay.className = 'popup';
  overlay.innerHTML = `
    <div class="popup-content" style="background-color: #f0fff0; border-color: green;">
      <p>Send friend request to ${username}?</p>
      <button id="confirmSend" style="background-color: #2ecc71; color: white;">Yes</button>
      <button id="cancelSend" style="background-color: #e74c3c; color: white;">No</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#confirmSend').addEventListener('click', async () => {
    sound.play();
    await fetch('/friend-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ recipient: username })
    });
    overlay.remove();

    const notif = document.createElement('div');
    notif.className = 'sent-notification';
    notif.textContent = `Friend request sent to ${username}`;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 2000);
  });

  overlay.querySelector('#cancelSend').addEventListener('click', () => {
    overlay.remove();
  });
}

searchInput.addEventListener('input', async e => {
  const query = e.target.value.trim();
  searchResults.innerHTML = '';
  if (!query) {
    searchResults.style.display = 'none';
    return;
  }

  const res = await fetch(`/search-users?query=${encodeURIComponent(query)}`, { credentials: 'same-origin' });
  const data = await res.json();

  for (let username of data.users) {
    if (username !== query) continue;

    let profilePic = '/img/default.jpg';
    try {
      const userRes = await fetch(`/user/${username}`, { credentials: 'same-origin' });
      if (userRes.ok) {
        const userData = await userRes.json();
        profilePic = userData.profilePic || profilePic;
      }
    } catch {}

    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.alignItems = 'center';
    li.style.justifyContent = 'space-between';
    li.style.cursor = 'pointer';
    li.style.padding = '2px 2px';

    const friendInfo = document.createElement('div');
    friendInfo.style.display = 'flex';
    friendInfo.style.alignItems = 'center';

    const img = document.createElement('img');
    img.src = profilePic;
    img.alt = username;
    img.className = 'friend-avatar';
    img.style.width = '25px';
    img.style.height = '25px';
    img.style.borderRadius = '50%';
    img.style.marginRight = '8px';

    const span = document.createElement('span');
    span.textContent = username;

    friendInfo.appendChild(img);
    friendInfo.appendChild(span);
    li.appendChild(friendInfo);

    li.addEventListener('click', () => sendFriendRequest(username));
    searchResults.appendChild(li);
  }

  searchResults.style.display = searchResults.childElementCount > 0 ? 'block' : 'none';
});

document.addEventListener('click', e => {
  if (!searchResults.contains(e.target) && e.target !== searchInput) searchResults.style.display = 'none';
});

async function checkFriendRequests() {
  const res = await fetch('/friend-requests', { credentials: 'same-origin' });
  if (!res.ok) return;
  const data = await res.json();
  if (!data.requests) return;
  data.requests.forEach(sender => showFriendRequestPopup(sender));
}

async function updateUserInfo(username) {
  const res = await fetch(`/user/${username}`, { credentials: 'same-origin' });
  if (!res.ok) return;
  const data = await res.json();
  if (typeof window.updateUserInfoContainerWithData === 'function') {
    window.updateUserInfoContainerWithData(data);
  }
  const rightFarDiv = document.querySelector('.right-far');
  if (rightFarDiv) {
    rightFarDiv.innerHTML = '';
    const img = document.createElement('img');
    img.src = data.profilePic || '/img/default.jpg';
    img.alt = username;
    rightFarDiv.appendChild(img);
  }
}

function markUnread(username) {
  unreadMessages.add(username);
  loadFriends();
}

window.addEventListener('load', () => {
  checkFriendRequests();
  setInterval(checkFriendRequests, 3000);
  loadFriends();
});

