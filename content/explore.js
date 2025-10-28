let friends = [];
let posts = [];
let lastPostsData = [];

async function loadFriends() {
  try {
    const res = await fetch('/friends', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Failed to load friends.');
    const data = await res.json();
    friends = data.friends || [];
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
      preview.innerHTML = `<img src="${f.profilePic || '/img/default.jpg'}">`;
      previews.appendChild(preview);
    });
  } catch (err) {
    console.error('Error loading friends:', err);
  }
}

async function loadPosts() {
  try {
    const res = await fetch('/posts', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Failed to load posts.');
    const data = await res.json();
    const postsDiv = document.getElementById('posts');
    const wrapper = document.getElementById('explorePostInputContainerWrapper');
    postsDiv.innerHTML = '';
    if (!data.length) {
      postsDiv.innerHTML = '';
      return;
    }
    const shouldUpdate = JSON.stringify(data) !== JSON.stringify(lastPostsData);
    if (!shouldUpdate) return;
    lastPostsData = data;
    data.forEach(p => {
      const post = document.createElement('div');
      post.className = 'post';
      const profileImg = p.profilePic || '/img/default.jpg';
      const postDate = p.createdAt
        ? (() => {
            const d = new Date(p.createdAt);
            return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(
              d.getDate()
            ).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(
              2,
              '0'
            )}:${String(d.getMinutes()).padStart(2, '0')}`;
          })()
        : '';
      post.innerHTML = `
        <div class="post-header" style="display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:8px;">
            <img src="${profileImg}" class="profile-img">
            <strong>${p.username}</strong>
          </div>
          <button class="like-btn" data-id="${p.id}" style="border:none;background:none;cursor:pointer;font-size:1rem;">❤️ ${p.likes?.length || 0}</button>
        </div>
        <div class="post-content">${p.message || ''}</div>
        ${p.image ? `<br><img src="${p.image}" class="post-img">` : ''}
        <div class="comments" id="comments-${p.id}">
          ${(p.comments || []).map(c => `<p><b>${c.user}:</b> ${c.text}</p>`).join('')}
          <input type="text" placeholder="Write a comment..." class="comment-input" data-id="${p.id}" style="width:21vh;">
        </div>
        <div style="text-align:left;font-size:0.65rem;color:gray;margin-top:4px;">${postDate}</div>
      `;
      postsDiv.prepend(post);
    });
    document.querySelectorAll('.like-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const postId = btn.dataset.id;
        await fetch('/like', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ postId })
        });
        loadPosts();
      });
    });
    document.querySelectorAll('.comment-input').forEach(input => {
      input.addEventListener('keypress', async e => {
        if (e.key === 'Enter') {
          const text = e.target.value.trim();
          if (!text) return;
          const postId = e.target.dataset.id;
          await fetch('/comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ postId, text })
          });
          e.target.value = '';
          loadPosts();
        }
      });
    });
  } catch (err) {
    console.error('Error loading posts:', err);
  }
}



async function importHomePopups() {
  try {
    const res = await fetch('/content/home.html');
    const html = await res.text();
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const popups = ['#notificationsPopup','#privacyPopup','#profilePopup','#editProfilePopup'];
    popups.forEach(selector => {
      const el = temp.querySelector(selector);
      if (el) document.body.appendChild(el.cloneNode(true));
    });
    setupPopupLinks();
  } catch (err) {
    console.error('Error importing popups:', err);
  }
}

function setupPopupLinks() {
  const notifLink=document.querySelector('a[href="/notifications"]');
  const privacyLink=document.querySelector('a[href="/privacy"]');
  const profileLink=document.querySelector('a[href="/profile"]');
  function hideAllPopups(){
    document.querySelectorAll('#notificationsPopup,#privacyPopup,#profilePopup').forEach(popup=>popup.classList.add('hidden'));
  }
  notifLink?.addEventListener('click',e=>{e.preventDefault();hideAllPopups();document.getElementById('notificationsPopup')?.classList.remove('hidden');});
  privacyLink?.addEventListener('click',e=>{e.preventDefault();hideAllPopups();document.getElementById('privacyPopup')?.classList.remove('hidden');});
  profileLink?.addEventListener('click',e=>{e.preventDefault();hideAllPopups();document.getElementById('profilePopup')?.classList.remove('hidden');});
  document.addEventListener('click',e=>{
    document.querySelectorAll('#notificationsPopup,#privacyPopup,#profilePopup').forEach(popup=>{
      if(!popup.contains(e.target)&&!e.target.closest('a[href="/notifications"]')&&!e.target.closest('a[href="/privacy"]')&&!e.target.closest('a[href="/profile"]')) popup.classList.add('hidden');
    });
  });
}

document.querySelector('a[href="/account"]').addEventListener('click',e=>{
  e.preventDefault();
  document.getElementById('accountPopup').classList.remove('hidden');
  loadBlockedContacts();
});

document.getElementById('closeAccountPopup').addEventListener('click',()=>{
  document.getElementById('accountPopup').classList.add('hidden');
});

document.getElementById('changePasswordBtn').addEventListener('click',async()=>{
  const oldPassword=document.getElementById('oldPassword').value.trim();
  const newPassword=document.getElementById('newPassword').value.trim();
  const username=document.getElementById('usernameDisplay')?.textContent?.trim()||'';
  const status=document.getElementById('passwordStatus');status.textContent='';
  if(newPassword.length<6){status.textContent='Password must be at least 6 characters';status.style.color='red';return;}
  if(oldPassword===newPassword){status.textContent='New password cannot be the same as the old password';status.style.color='red';return;}
  if(username&&newPassword===username){status.textContent='Password and username cannot be the same';status.style.color='red';return;}
  try{
    const res=await fetch('/account/change-password',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({currentPassword:oldPassword,newPassword})});
    if(res.ok){
      status.textContent='✅ Password updated successfully.';
      status.style.color='green';
      document.getElementById('oldPassword').value='';
      document.getElementById('newPassword').value='';
    } else {
      const data=await res.json().catch(()=>({}));
      status.textContent=data.error||'❌ Failed to update password.';
      status.style.color='red';
    }
  }catch(err){
    console.error('Password update error:',err);
    status.textContent='❌ Server error.';
    status.style.color='red';
  }
});

async function loadBlockedContacts(){
  const blockedList=document.getElementById('blockedList');
  blockedList.innerHTML='<li>Loading...</li>';
  try{
    const res=await fetch('/account/blocked',{credentials:'same-origin'});
    if(!res.ok)throw new Error('Failed to load blocked list.');
    const blocked=await res.json();
    blockedList.innerHTML='';
    if(!blocked.length){blockedList.innerHTML='<li>No blocked contacts.</li>';return;}
    blocked.forEach(user=>{
      const li=document.createElement('li');
      li.style.display='flex';
      li.style.justifyContent='space-between';
      li.style.alignItems='center';
      const name=document.createElement('span');name.textContent=user.username;
      const unblockCheckbox=document.createElement('input');
      unblockCheckbox.type='checkbox';
      unblockCheckbox.checked=true;
      unblockCheckbox.title='Uncheck to unblock';
      unblockCheckbox.addEventListener('change',async()=>{
        if(!unblockCheckbox.checked){
          await fetch('/account/unblock',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({user:user.username})});
          loadBlockedContacts();loadFriends();loadPosts();
        }
      });
      li.appendChild(name);li.appendChild(unblockCheckbox);blockedList.appendChild(li);
    });
  }catch(err){console.error('Error fetching blocked list:',err);blockedList.innerHTML='<li>Error loading blocked list.</li>';}
}

document.getElementById('deleteAccountBtn').addEventListener('click',async()=>{
  const password=prompt('Enter your password to confirm account deletion:');if(!password)return;
  const confirmed=confirm('Are you sure you want to permanently delete your account? This cannot be undone.');if(!confirmed)return;
  try{
    const res=await fetch('/account',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({password})});
    if(res.ok){alert('Your account has been deleted.');window.location.href='/index.html';}
    else{const data=await res.json().catch(()=>({}));alert(data.error||'Failed to delete account.');}
  }catch(err){console.error('Account deletion error:',err);alert('Server error. Try again later.');}
});

function createExplorePostInput() {
  const wrapper = document.getElementById('explorePostInputContainerWrapper');
  wrapper.innerHTML = '';
  const container = document.createElement('div');
  container.id = 'explorePostInputContainer';
  container.style.border = '2px solid green';
  container.style.padding = '10px';
  container.style.marginBottom = '15px';
  container.style.backgroundColor = '#f9fff9';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '6px';
  const textInput = document.createElement('textarea');
  textInput.id = 'explorePostText';
  textInput.placeholder = 'Write a post ...';
  textInput.rows = 7;
  textInput.style.resize = 'none';
  textInput.style.width = '98%';
  textInput.style.padding = '6px';
  textInput.style.fontFamily = "'Fredoka', sans-serif";
  textInput.style.fontSize = '0.85rem';
  const inputContainer = document.createElement('div');
  inputContainer.style.display = 'flex';
  inputContainer.style.alignItems = 'center';
  inputContainer.style.gap = '6px';
  const imageInputLabel = document.createElement('label');
  imageInputLabel.textContent = '📷';
  imageInputLabel.style.cursor = 'pointer';
  imageInputLabel.style.fontSize = '1.3rem';
  const imageInput = document.createElement('input');
  imageInput.type = 'file';
  imageInput.id = 'explorePostImage';
  imageInput.accept = 'image/*';
  imageInput.style.display = 'none';
  imageInputLabel.appendChild(imageInput);
  const uploadBtn = document.createElement('button');
  uploadBtn.textContent = 'Upload';
  uploadBtn.style.backgroundColor = 'green';
  uploadBtn.style.fontFamily = "'Fredoka', sans-serif";
  uploadBtn.style.color = 'white';
  uploadBtn.style.border = 'none';
  uploadBtn.style.padding = '6px 12px';
  uploadBtn.style.cursor = 'pointer';
  uploadBtn.addEventListener('click', async () => {
    const message = textInput.value.trim();
    const imageFile = imageInput.files[0];
    if (!message && !imageFile) return;
    const formData = new FormData();
    formData.append('message', message);
    if (imageFile) formData.append('image', imageFile);
    await fetch('/posts', {
      method: 'POST',
      credentials: 'same-origin',
      body: formData
    });
    textInput.value = '';
    imageInput.value = '';
    loadPosts();
  });
  inputContainer.appendChild(uploadBtn);
  inputContainer.appendChild(imageInputLabel);
  container.appendChild(textInput);
  container.appendChild(inputContainer);
  wrapper.appendChild(container);
}

loadFriends();
loadPosts();
importHomePopups();
createExplorePostInput();

