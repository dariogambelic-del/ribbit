window.currentFriend = null;
let currentUser = null;
let currentUserBio = null;
let currentUserAge = null;
let currentUserRelationship = null;
let currentUserCreatedAt = null;
let currentUserDOB = null;
let currentUserLastLoggedIn = null;
let currentUserStatus = 'online 🟢';
let privacySettings = {
  showAge: true,
  showDOB: true,
  showRelationship: true,
  showLastLogin: true,
  showStatus: true
};

const userInfoContainer = document.createElement('div');
userInfoContainer.id = 'userInfoContainer';
userInfoContainer.style.position = 'fixed';
userInfoContainer.style.bottom = '41px';
userInfoContainer.style.right = '20px';
userInfoContainer.style.backgroundColor = '#f0fff0';
userInfoContainer.style.border = '4px solid green';
userInfoContainer.style.padding = '10px';
userInfoContainer.style.fontFamily = "'Silkscreen', sans-serif";
userInfoContainer.style.fontSize = '0.85rem';
userInfoContainer.style.wordWrap = 'break-word';
userInfoContainer.style.color = 'green';
userInfoContainer.style.height = '35%';
userInfoContainer.style.width = '30%';
userInfoContainer.style.boxShadow = '0px 2px 5px rgba(0,0,0,0.2)';
userInfoContainer.style.pointerEvents = 'none';
userInfoContainer.style.zIndex = '1';
document.body.appendChild(userInfoContainer);

const userInfoContent = document.createElement('div');
userInfoContent.id = 'userInfoContent';
userInfoContent.style.pointerEvents = 'auto';
userInfoContainer.appendChild(userInfoContent);

async function getUsername() {
  try {
    const res = await fetch('/me', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Not logged in');
    const data = await res.json();
    currentUser = data.username;
    currentUserBio = data.bio || '';
    currentUserAge = data.age || 'N/A';
    currentUserRelationship = data.relationshipStatus || 'Not specified';
    if (data.createdAt) {
      const created = new Date(data.createdAt);
      const mm = String(created.getMonth() + 1).padStart(2, '0');
      const dd = String(created.getDate()).padStart(2, '0');
      const yyyy = created.getFullYear();
      currentUserCreatedAt = `${mm}/${dd}/${yyyy}`;
    } else {
      currentUserCreatedAt = 'Unknown';
    }
    currentUserDOB = data.dob ? data.dob.trim() : 'N/A';
    currentUserStatus = 'online 🟢';
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const yyyy = today.getFullYear();
    currentUserLastLoggedIn = `${mm}/${dd}/${yyyy}`;
    document.getElementById('currentUserPic').src = data.profilePic || '/img/default.jpg';

    // Fetch saved privacy settings from server
    const privacyRes = await fetch('/privacy-settings', { credentials: 'same-origin' });
    if (privacyRes.ok) {
      const savedSettings = await privacyRes.json();
      privacySettings = savedSettings;
      for (let key in privacySettings) {
        document.getElementById(key)?.checked !== undefined && (document.getElementById(key).checked = privacySettings[key]);
      }
    }

    updateUserInfoContainer();

    await fetch('/update-last-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ lastLoggedIn: currentUserLastLoggedIn })
    });

    if (!data.profileComplete) document.getElementById('profilePopup').classList.remove('hidden');
    return data.username;
  } catch {
    currentUserStatus = 'offline 🔴';
  }
}

function updateUserInfoContainer() {
  userInfoContent.innerHTML = `
    <strong>Your Profile</strong><br>
    <strong>Username:</strong> ${currentUser}<br>
    <strong>Bio:</strong> ${currentUserBio}<br>
    ${privacySettings.showAge ? `<strong>Age:</strong> ${currentUserAge} years old<br>` : ''}
    ${privacySettings.showDOB ? `<strong>Date of Birth:</strong> ${currentUserDOB}<br>` : ''}
    ${privacySettings.showRelationship ? `<strong>Relationship Status:</strong> ${currentUserRelationship}<br>` : ''}
    <strong>Account Created:</strong> ${currentUserCreatedAt}<br>
    ${privacySettings.showLastLogin ? `<strong>Last Logged In:</strong> ${currentUserLastLoggedIn || 'Unknown'}<br>` : ''}
    ${privacySettings.showStatus ? `<strong>Status:</strong> ${currentUserStatus}<br>` : ''}
  `;
}

setInterval(async () => {
  if (!currentUser) return;
  await fetch('/keep-online', { method: 'POST', credentials: 'same-origin' });
  currentUserStatus = 'online 🟢';
  if (!window.currentFriend) updateUserInfoContainer();
}, 30000);

const profileError = document.getElementById('profileError');
document.getElementById('profileForm').addEventListener('submit', async e => {
  e.preventDefault();
  const dobInput = document.getElementById('dob').value.trim();
  const bio = document.getElementById('bio').value.trim();
  const pic = document.getElementById('profilePic').files[0];
  const dobRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/(19|20)\d{2}$/;
  if (!dobRegex.test(dobInput)) {
    profileError.textContent = 'Date must be in MM/DD/YYYY format';
    return;
  }
  const [month, day, year] = dobInput.split('/').map(Number);
  const birthDate = new Date(year, month - 1, day);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  if (age < 18) { profileError.textContent = 'You must be at least 18 years old'; return; }
  if (!bio || bio.length > 35) { profileError.textContent = 'Bio must be 1–35 characters'; return; }
  const formData = new FormData();
  formData.append('age', age);
  formData.append('dob', dobInput);
  formData.append('bio', bio);
  if (pic) formData.append('profilePic', pic);
  const res = await fetch('/complete-profile', { method: 'POST', credentials: 'same-origin', body: formData });
  if (res.ok) {
    currentUserDOB = dobInput;
    document.getElementById('profilePopup').classList.add('hidden');
    loadPosts();
    await getUsername();
  } else profileError.textContent = 'Error saving profile';
});

const editBtn = document.getElementById('editProfileBtn');
const editPopup = document.getElementById('editProfilePopup');
const editForm = document.getElementById('editProfileForm');
const editBioInput = document.getElementById('editBio');
const editRelationshipInput = document.getElementById('editRelationshipStatus');
const editError = document.getElementById('editProfileError');

editBtn.addEventListener('click', async () => {
  const res = await fetch('/me', { credentials: 'same-origin' });
  if (!res.ok) return;
  const data = await res.json();
  editBioInput.value = data.bio || '';
  editRelationshipInput.value = data.relationshipStatus || '';
  editPopup.classList.remove('hidden');
});

editForm.addEventListener('submit', async e => {
  e.preventDefault();
  const bio = editBioInput.value.trim();
  const relationshipStatus = editRelationshipInput.value.trim();
  const pic = document.getElementById('editProfilePic').files[0];
  if (!bio || bio.length > 35) { editError.textContent = 'Bio must be 1–35 characters'; return; }
  const formData = new FormData();
  formData.append('bio', bio);
  formData.append('relationshipStatus', relationshipStatus);
  if (pic) formData.append('profilePic', pic);
  const res = await fetch('/edit-profile', { method: 'POST', credentials: 'same-origin', body: formData });
  if (res.ok) {
    editPopup.classList.add('hidden');
    currentUserDOB = document.getElementById('editDOB')?.value?.trim() || currentUserDOB;
    loadPosts();
    await getUsername();
  } else editError.textContent = 'Error saving profile';
});

const notificationsBtn = document.getElementById('notificationsBtn');
const notificationsPopup = document.getElementById('notificationsPopup');
notificationsBtn.addEventListener('click', () => {
  notificationsPopup.classList.toggle('hidden');
  notificationsPopup.style.zIndex = 1000;
});
notificationsPopup.addEventListener('click', e => {
  if (e.target === notificationsPopup) notificationsPopup.classList.add('hidden');
});

const privacyBtn = document.getElementById('PrivacyBtn');
const privacyPopup = document.getElementById('privacyPopup');
privacyBtn.addEventListener('click', () => {
  privacyPopup.classList.remove('hidden');
});
privacyPopup.addEventListener('click', e => {
  if (e.target === privacyPopup) privacyPopup.classList.add('hidden');
});

const privacyForm = document.getElementById('privacyForm');
privacyForm.addEventListener('submit', async e => {
  e.preventDefault();
  privacySettings.showAge = document.getElementById('showAge').checked;
  privacySettings.showDOB = document.getElementById('showDOB').checked;
  privacySettings.showRelationship = document.getElementById('showRelationship').checked;
  privacySettings.showLastLogin = document.getElementById('showLastLogin').checked;
  privacySettings.showStatus = document.getElementById('showStatus').checked;
  await fetch('/update-privacy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(privacySettings)
  });
  updateUserInfoContainer();
  privacyPopup.classList.add('hidden');
});

const homeBtn = document.getElementById('homeBtn');
homeBtn.addEventListener('click', () => {
  window.location.href = '/content/home.html';
});

// ----------------- Posts Handling -----------------
async function loadPosts() {
  const postsDiv = document.getElementById('posts');
  postsDiv.innerHTML = '';
  const postsHeader = document.getElementById('postsHeader');
  let url = '/posts';
  if (window.currentFriend) url = `/dm?user=${encodeURIComponent(window.currentFriend)}`;
  const res = await fetch(url, { credentials: 'same-origin' });
  const data = await res.json();
  const postCount = data.length || 0;

  if (window.currentFriend) {
    postsHeader.textContent = `DM with ${window.currentFriend}`;
    let removeBtn = postsHeader.querySelector('.friend-remove-btn');
    if (!removeBtn) {
      removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.className = 'remove-btn friend-remove-btn';
      removeBtn.style.marginLeft = '5px';
      removeBtn.style.fontSize = '0.6rem';
      removeBtn.addEventListener('click', async () => {
        await fetch('/friends', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ friend: window.currentFriend }) });
        window.currentFriend = null;
        removeBtn.remove();
        loadFriends();
        loadPosts();
        updateUserInfoContainer();
      });
      postsHeader.appendChild(removeBtn);
    }
    const friendRes = await fetch(`/user/${encodeURIComponent(window.currentFriend)}`, { credentials: 'same-origin' });
    if (friendRes.ok) {
      const data = await friendRes.json();
      userInfoContent.innerHTML = `
        <strong>Friend's Profile</strong><br>
        <strong>Username:</strong> ${data.username || 'Unknown'}<br>
        <strong>Bio:</strong> ${data.bio || ''}<br>
        ${privacySettings.showAge ? `<strong>Age:</strong> ${data.age || 'N/A'} years old<br>` : ''}
        ${privacySettings.showDOB ? `<strong>Date of Birth:</strong> ${data.dob || 'N/A'}<br>` : ''}
        ${privacySettings.showRelationship ? `<strong>Relationship Status:</strong> ${data.relationshipStatus || 'Not specified'}<br>` : ''}
        <strong>Account Created:</strong> ${data.createdAt ? (() => {
            const created = new Date(data.createdAt);
            const mm = String(created.getMonth() + 1).padStart(2, '0');
            const dd = String(created.getDate()).padStart(2, '0');
            const yyyy = created.getFullYear();
            return `${mm}/${dd}/${yyyy}`;
        })() : 'Unknown'}<br>
        ${privacySettings.showLastLogin ? `<strong>Last Logged In:</strong> ${data.lastLoggedIn ? (() => {
            const last = new Date(data.lastLoggedIn);
            const mm = String(last.getMonth() + 1).padStart(2, '0');
            const dd = String(last.getDate()).padStart(2, '0');
            const yyyy = last.getFullYear();
            return `${mm}/${dd}/${yyyy}`;
        })() : 'Unknown'}<br>` : ''}
        ${privacySettings.showStatus ? `<strong>Status:</strong> ${data.status || 'offline 🔴'}<br>` : ''}
      `;
    } else {
      userInfoContent.innerHTML = '<strong>Error loading user info</strong>';
    }
  } else {
    postsHeader.textContent = `Recent Posts (${postCount})`;
    const oldBtn = postsHeader.querySelector('.friend-remove-btn');
    if (oldBtn) oldBtn.remove();
    updateUserInfoContainer();
  }

  if (!data.length && !window.currentFriend) {
    const noPosts = document.createElement('div');
    noPosts.className = 'no-posts';
    noPosts.textContent = 'No posts today.';
    postsDiv.appendChild(noPosts);
  } else {
    data.forEach(p => {
      const post = document.createElement('div');
      post.className = window.currentFriend ? `post dm ${p.username === currentUser ? 'dm-right' : 'dm-left'}` : 'post public';
      const profileImg = p.profilePic || '/img/default.jpg';
      const postDate = p.createdAt ? (() => {
          const d = new Date(p.createdAt);
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const yyyy = d.getFullYear();
          const hh = String(d.getHours()).padStart(2, '0');
          const min = String(d.getMinutes()).padStart(2, '0');
          return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
      })() : '';
      post.innerHTML = `
        <div class="post-header">
          <div style="display: flex; align-items: center;">
            <img src="${profileImg}" class="profile-img">
            <strong>${p.username}</strong>
          </div>
          ${!window.currentFriend ? `<button class="like-btn" data-id="${p.id}" style="border:none; background:none; cursor:pointer; font-size:1rem;">❤️ ${p.likes?.length || 0}</button>` : ''}
        </div>
        <div class="post-content">${p.message || ''}</div>
        ${p.image ? `<br><img src="${p.image}" class="post-img">` : ''}
        ${!window.currentFriend ? `<div class="comments" id="comments-${p.id}">${(p.comments || []).map(c => `<p><b>${c.user}:</b> ${c.text}</p>`).join('')}<input type="text" placeholder="Write a comment..." class="comment-input" data-id="${p.id}"></div>` : ''}
        <div style="text-align: right; font-size: 0.65rem; color: gray; margin-top: 4px;">${postDate}</div>
      `;
      postsDiv.appendChild(post);
    });
  }

  if (!window.currentFriend) {
    document.querySelectorAll('.like-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const postId = btn.dataset.id;
        await fetch('/like', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ postId }) });
        loadPosts();
      });
    });
    document.querySelectorAll('.comment-input').forEach(input => {
      input.addEventListener('keypress', async e => {
        if (e.key === 'Enter') {
          const text = e.target.value.trim();
          if (!text) return;
          const postId = e.target.dataset.id;
          await fetch('/comment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ postId, text }) });
          e.target.value = '';
          loadPosts();
        }
      });
    });
  }

  postsDiv.scrollTop = postsDiv.scrollHeight;
}

document.getElementById('postForm').addEventListener('submit', async e => {
  e.preventDefault();
  const message = document.getElementById('postInput').value.trim();
  const imageFile = document.getElementById('postImage').files[0];
  if (!message && !imageFile) return;
  const formData = new FormData();
  formData.append('message', message);
  if (imageFile) formData.append('image', imageFile);
  if (window.currentFriend) formData.append('friend', window.currentFriend);
  const endpoint = window.currentFriend ? '/dm' : '/posts';
  await fetch(endpoint, { method: 'POST', credentials: 'same-origin', body: formData });
  document.getElementById('postInput').value = '';
  document.getElementById('postImage').value = '';
  loadPosts();
});

getUsername();
loadPosts();

setInterval(() => {
  loadPosts();
}, 8000);

setInterval(() => {
  fetch('/reset-posts', { method: 'POST', credentials: 'same-origin' }).then(() => {
    const postsDiv = document.getElementById('posts');
    postsDiv.innerHTML = '';
    const postsHeader = document.getElementById('postsHeader');
    postsHeader.textContent = 'Recent Posts (0)';
    const noPosts = document.createElement('div');
    noPosts.className = 'no-posts';
    noPosts.textContent = 'No posts yet.';
    postsDiv.appendChild(noPosts);
  });
}, 24 * 60 * 60 * 1000);

