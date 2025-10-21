let friends = [];
let posts = [];

async function loadFriends() {
  const res = await fetch('/friends', { credentials: 'same-origin' });
  if (res.ok) {
    friends = await res.json();
    document.getElementById('friendCount').textContent = `(${friends.length})`;
    const friendsList = document.getElementById('friendsList');
    const previews = document.getElementById('friendPreviews');
    friendsList.innerHTML = '';
    previews.innerHTML = '';
    friends.forEach(f => {
      const li = document.createElement('li');
      li.textContent = f.username;
      friendsList.appendChild(li);

      const preview = document.createElement('div');
      preview.className = 'friend-preview';
      preview.innerHTML = `<img src="${f.profilePic || '/img/default.jpg'}"><span>${f.username}</span>`;
      previews.appendChild(preview);
    });
  }
}

async function loadPosts() {
  const res = await fetch('/posts', { credentials: 'same-origin' });
  if (res.ok) {
    posts = await res.json();
    const postsDiv = document.getElementById('posts');
    postsDiv.innerHTML = '';
    if (!posts.length) postsDiv.innerHTML = '<p>No posts yet. Refresh to see updates.</p>';
    posts.forEach(p => {
      const post = document.createElement('div');
      post.className = 'post';
      post.innerHTML = `
        <div class="post-header">
          <img src="${p.profilePic || '/img/default.jpg'}">
          <strong>${p.username}</strong>
        </div>
        <div class="post-content">${p.message || ''}</div>
      `;
      postsDiv.appendChild(post);
    });
  }
}

document.getElementById('friendSearch').addEventListener('input', e => {
  const query = e.target.value.toLowerCase();
  const filtered = friends.filter(f => f.username.toLowerCase().includes(query));
  const results = document.getElementById('searchResults');
  results.innerHTML = '';
  filtered.forEach(f => {
    const li = document.createElement('li');
    li.textContent = f.username;
    results.appendChild(li);
  });
});

loadFriends();
loadPosts();

