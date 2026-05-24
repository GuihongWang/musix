/* ===== iTunes CD Showcase ===== */

let albums = [];
let featuredAlbumId = null;
let currentView = 'library';
let currentAlbum = null;
let currentTrackIndex = 0;
let isPlaying = false;
let isShuffled = false;
let repeatMode = 0; // 0=off, 1=all, 2=one
let volume = 0.7;
let filteredAlbums = [];
let historyStack = [];
let historyIndex = -1;

const audio = document.getElementById('audioPlayer');

// ==================== FORMAT ====================
function fmt(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function dur(t) {
  return fmt(t);
}

// ==================== API ====================
async function loadAlbums() {
  const r = await fetch('/api/albums');
  albums = await r.json();
  filteredAlbums = [...albums];
}

function recentAlbums(n) {
  return [...albums].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).slice(0, n);
}

// ==================== CONFIG ====================
async function loadConfig() {
  try {
    const r = await fetch('/data/config.json');
    const cfg = await r.json();
    if (cfg.siteTitle) document.title = cfg.siteTitle;
    if (cfg.brandName) {
      const el = document.querySelector('.sl-footer .sl-logo span');
      if (el) el.textContent = cfg.brandName;
    }
    if (cfg.accentColor) {
      document.documentElement.style.setProperty('--accent', cfg.accentColor);
      const c = cfg.accentColor;
      if (/^#[0-9a-f]{6}$/i.test(c)) {
        const r = Math.max(0, parseInt(c.slice(1,3),16) - 40);
        const g = Math.max(0, parseInt(c.slice(3,5),16) - 40);
        const b = Math.max(0, parseInt(c.slice(5,7),16) - 40);
        document.documentElement.style.setProperty('--accent-hover', `rgb(${r},${g},${b})`);
      }
    }
    if (cfg.musicBaseUrl) window.__musicBase = cfg.musicBaseUrl;
    if (cfg.featuredAlbumId != null) featuredAlbumId = cfg.featuredAlbumId;
    if (cfg.aiAgentMeta) {
      const el = document.getElementById('aiAgentMeta');
      if (el) el.setAttribute('content', cfg.aiAgentMeta);
    }
  } catch (e) {
    // config optional, silently ignore
  }
}

function streamUrl(album, trackIndex, track) {
  if (window.__musicBase) return window.__musicBase + track.url;
  return track.token ? '/api/stream/' + album.id + '/' + trackIndex + '?t=' + track.token : track.url;
}

// ==================== NAVIGATION ====================
function pushHistory(view, data) {
  historyStack = historyStack.slice(0, historyIndex + 1);
  historyStack.push({ view, data });
  historyIndex = historyStack.length - 1;
}

function navigate(view, data) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const el = document.getElementById(`view-${view}`);
  if (el) el.classList.remove('hidden');

  document.querySelectorAll('.sl-item').forEach(n => n.classList.remove('active'));
  const nav = document.querySelector(`.sl-item[data-view="${view}"]`);
  if (nav) nav.classList.add('active');

  currentView = view;
  pushHistory(view, data);
}

function goBack() {
  if (historyIndex > 0) {
    historyIndex--;
    const entry = historyStack[historyIndex];
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const el = document.getElementById(`view-${entry.view}`);
    if (el) el.classList.remove('hidden');
    document.querySelectorAll('.sl-item').forEach(n => n.classList.remove('active'));
    const nav = document.querySelector(`.sl-item[data-view="${entry.view}"]`);
    if (nav) nav.classList.add('active');
    currentView = entry.view;
  }
}

function goForward() {
  if (historyIndex < historyStack.length - 1) {
    historyIndex++;
    const entry = historyStack[historyIndex];
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const el = document.getElementById(`view-${entry.view}`);
    if (el) el.classList.remove('hidden');
    document.querySelectorAll('.sl-item').forEach(n => n.classList.remove('active'));
    const nav = document.querySelector(`.sl-item[data-view="${entry.view}"]`);
    if (nav) nav.classList.add('active');
    currentView = entry.view;
  }
}

function showDetail(albumId) {
  const album = albums.find(a => a.id === albumId);
  if (!album) return;
  currentAlbum = album;
  currentTrackIndex = 0;
  navigate('detail');
  renderDetail(album);
}

// ==================== SEARCH ====================
function doSearch(q) {
  if (!q.trim()) { filteredAlbums = [...albums]; }
  else {
    const s = q.toLowerCase();
    filteredAlbums = albums.filter(a =>
      a.title.toLowerCase().includes(s) ||
      a.artist.toLowerCase().includes(s) ||
      a.genre.toLowerCase().includes(s) ||
      (a.style && a.style.toLowerCase().includes(s))
    );
  }
  renderAllViews();
}

// ==================== FAVORITES ====================
// ==================== RENDER ====================
function renderAllViews() {
  renderCards('recentGrid', recentAlbums(6));
  renderCards('allGrid', albums);
  renderCards('albumsGrid', filteredAlbums);
  renderArtists();
  renderGenres();
  renderCards('recentAllGrid', recentAlbums(10));
  setFeatured();
  updateGenreFilters();
}

function makeCard(a) {
  const d = document.createElement('div');
  d.className = 'card';
  d.innerHTML = `
    <div class="card-img"><img src="${escAttr(a.cover)}" alt="" loading="lazy" onerror="this.outerHTML='<div style=width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#ddd;color:#999;font-size:28px>💿</div>'"></div>
    <div class="card-title">${escHtml(a.title)}</div>
    <div class="card-artist">${escHtml(a.artist)}</div>
    <div class="card-year">${a.year}</div>
  `;
  d.addEventListener('click', () => showDetail(a.id));
  return d;
}

function renderCards(id, list) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '';
  if (list.length === 0) {
    el.innerHTML = '<div class="empty-state"><h3>没有找到</h3></div>';
    return;
  }
  list.forEach(a => el.appendChild(makeCard(a)));
}

function escAttr(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escHtml(s) {
  const el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}

function setFeatured() {
  const a = albums.find(x => x.id === featuredAlbumId) || albums[0];
  if (!a) return;
  document.getElementById('libCover').src = a.cover;
  document.getElementById('libTitle').textContent = a.title;
  document.getElementById('libArtist').textContent = a.artist;
  document.getElementById('libMeta').innerHTML = `<span>${a.year}</span><span>·</span><span>${a.genre}</span><span>·</span><span>${a.tracks.length} 首</span>`;
  const descEl = document.getElementById('libDesc');
  if (descEl) descEl.textContent = a.description || '';
}

function renderArtists() {
  const el = document.getElementById('artistGrid');
  if (!el) return;
  el.innerHTML = '';
  const map = {};
  albums.forEach(a => { if (!map[a.artist]) map[a.artist] = []; map[a.artist].push(a); });
  Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).forEach(([artist, als]) => {
    const card = document.createElement('div');
    card.className = 'artist-card';
    card.innerHTML = `<div class="artist-avatar">${artist.charAt(0).toUpperCase()}</div><div class="artist-name">${escHtml(artist)}</div><div class="artist-count">${als.length} 张专辑</div>`;
    card.addEventListener('click', () => {
      filteredAlbums = [...als];
      navigate('albums');
      renderCards('albumsGrid', filteredAlbums);
      updateGenreFilters();
    });
    el.appendChild(card);
  });
}

function renderGenres() {
  const el = document.getElementById('genreGrid');
  if (!el) return;
  el.innerHTML = '';
  const map = {};
  albums.forEach(a => { if (!map[a.genre]) map[a.genre] = []; map[a.genre].push(a); });
  const icons = { '摇滚':'🎸','流行':'🎤','前卫摇滚':'🎹','爵士':'🎷','硬摇滚':'🤘','民谣摇滚':'🎵','流行/R&B':'🎶','另类流行':'🎧','另类摇滚':'🎸','垃圾摇滚':'🔥','独立摇滚':'⚡' };
  Object.entries(map).sort((a, b) => b[1].length - a[1].length).forEach(([genre, als]) => {
    const card = document.createElement('div');
    card.className = 'genre-card';
    card.innerHTML = `<div class="genre-icon">${icons[genre]||'💿'}</div><div class="genre-name">${genre}</div><div class="genre-count">${als.length} 张专辑</div>`;
    card.addEventListener('click', () => {
      filteredAlbums = [...als];
      navigate('albums');
      renderCards('albumsGrid', filteredAlbums);
      updateGenreFilters();
    });
    el.appendChild(card);
  });
}

function updateGenreFilters() {
  const el = document.getElementById('filterRow');
  if (!el) return;
  el.innerHTML = '<button class="filter-chip active" data-g="all">全部</button>';
  const genres = [...new Set(albums.map(a => a.genre))];
  genres.forEach(g => {
    const c = document.createElement('button');
    c.className = 'filter-chip'; c.dataset.g = g; c.textContent = g;
    el.appendChild(c);
  });
  el.querySelectorAll('.filter-chip').forEach(c => {
    c.addEventListener('click', () => {
      el.querySelectorAll('.filter-chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      filteredAlbums = c.dataset.g === 'all' ? [...albums] : albums.filter(a => a.genre === c.dataset.g);
      renderCards('albumsGrid', filteredAlbums);
    });
  });
}

function renderDetail(album) {
  const wrap = document.getElementById('detailWrap');
  if (!wrap) return;
  const trackRows = album.tracks.map((t, i) => `
    <div class="track-row" data-idx="${i}">
      <span class="track-num">${String(i+1).padStart(2,'0')}</span>
      <span class="track-name">${escHtml(t.title)}</span>
      <span class="track-time">${dur(t.duration)}</span>
    </div>
  `).join('');

  wrap.innerHTML = `
    <div class="detail-cover">
      <img src="${escAttr(album.cover)}" alt=""
        onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22260%22 height=%22260%22><rect fill=%22%23ddd%22 width=%22260%22 height=%22260%22/><text x=%22130%22 y=%22130%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2236%22>💿</text></svg>'">
      <div class="detail-actions">
        <button class="prim-btn" id="detPlayBtn">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>
          播放全部
        </button>
      </div>
    </div>
    <div class="detail-right">
      <h1>${escHtml(album.title)}</h1>
      <div class="detail-artist">${escHtml(album.artist)}</div>
      <div class="detail-meta">
        <span>${album.year}</span><span>·</span><span>${escHtml(album.genre)}</span><span>·</span><span>${album.tracks.length} 首</span>
        ${album.style ? `<span>·</span><span>${escHtml(album.style)}</span>` : ''}
      </div>
      ${album.purchaseDate ? `<div class="detail-purchase"><span class="purchase-label">购买时间</span><span>${album.purchaseDate}</span><span class="purchase-divider">|</span><span class="purchase-label">购买地点</span><span>${escHtml(album.purchaseLocation)}</span></div>` : ''}
      <p class="detail-desc">${escHtml(album.description)}</p>
      <div class="track-list">${trackRows}</div>
    </div>
  `;

  wrap.querySelector('#detPlayBtn').addEventListener('click', () => playAlbum(album, 0));

  wrap.querySelectorAll('.track-row').forEach(row => {
    row.addEventListener('click', () => {
      const idx = parseInt(row.dataset.idx);
      playAlbum(album, idx);
    });
  });
}

// ==================== AUDIO PLAYBACK ====================
function playAlbum(album, startIdx) {
  if (!album || !album.tracks.length) return;
  currentAlbum = album;
  currentTrackIndex = startIdx;
  isPlaying = true;

  const track = album.tracks[currentTrackIndex];
  audio.src = track.token ? `/api/stream/${album.id}/${currentTrackIndex}?t=${track.token}` : track.url;
  audio.volume = volume;
  audio.play().catch(() => {
    // audio not available, simulate
  });

  updatePlayerUI();
  updatePlayIcon();
  highlightTrack();
  toast(`播放: ${track.title}`);
}

function togglePlay() {
  if (!currentAlbum) {
    if (albums.length) { playAlbum(albums[0], 0); }
    return;
  }
  if (audio.src && audio.src !== window.location.href + 'music/placeholder.mp3') {
    if (isPlaying) { audio.pause(); } else { audio.play().catch(() => {}); }
  }
  isPlaying = !isPlaying;
  updatePlayIcon();
}

function nextTrack() {
  if (!currentAlbum || !currentAlbum.tracks.length) return;
  if (repeatMode === 2) {
    // repeat one: just restart same track
    audio.currentTime = 0;
    if (isPlaying) audio.play().catch(() => {});
    return;
  }
  let next;
  if (isShuffled) {
    next = Math.floor(Math.random() * currentAlbum.tracks.length);
  } else {
    next = (currentTrackIndex + 1) % currentAlbum.tracks.length;
    if (next === 0 && repeatMode === 0) {
      isPlaying = false;
      updatePlayIcon();
      return;
    }
  }
  currentTrackIndex = next;
  isPlaying = true;
  const track = currentAlbum.tracks[currentTrackIndex];
  audio.src = streamUrl(currentAlbum, currentTrackIndex, track);
  audio.volume = volume;
  audio.play().catch(() => {});
  updatePlayerUI();
  updatePlayIcon();
  highlightTrack();
  toast(track.title);
}

function prevTrack() {
  if (!currentAlbum) return;
  currentTrackIndex = (currentTrackIndex - 1 + currentAlbum.tracks.length) % currentAlbum.tracks.length;
  isPlaying = true;
  const track = currentAlbum.tracks[currentTrackIndex];
  audio.src = streamUrl(currentAlbum, currentTrackIndex, track);
  audio.volume = volume;
  audio.play().catch(() => {});
  updatePlayerUI();
  updatePlayIcon();
  highlightTrack();
  toast(track.title);
}

// Audio event listeners
audio.addEventListener('timeupdate', () => {
  const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  document.getElementById('progFill').style.width = pct + '%';
  document.getElementById('progThumb').style.left = pct + '%';
  document.getElementById('timeCurrent').textContent = fmt(audio.currentTime);
  const remaining = audio.duration ? audio.duration - audio.currentTime : 0;
  document.getElementById('timeTotal').textContent = '-' + fmt(remaining);
});

audio.addEventListener('ended', () => {
  nextTrack();
});

audio.addEventListener('play', () => { isPlaying = true; updatePlayIcon(); });
audio.addEventListener('pause', () => { isPlaying = false; updatePlayIcon(); });

// ==================== PLAYER UI ====================
function updatePlayerUI() {
  if (!currentAlbum) return;
  const t = currentAlbum.tracks[currentTrackIndex];
  if (t) {
    document.getElementById('infoTitle').textContent = t.title;
    document.getElementById('infoSub').textContent = `${currentAlbum.artist} — ${currentAlbum.title}`;
    // 设置小封面
    const ic = document.getElementById('infoCover');
    if (currentAlbum.cover) {
      ic.innerHTML = `<img src="${currentAlbum.cover}" alt="">`;
    }
    document.getElementById('timeCurrent').textContent = '0:00';
    document.getElementById('timeTotal').textContent = '-' + dur(t.duration);
    document.getElementById('progFill').style.width = '0%';
    document.getElementById('progThumb').style.left = '0%';
  }
  document.getElementById('albumCount').textContent = `${albums.length} 张专辑`;
}

function updatePlayIcon() {
  document.getElementById('playIcon').classList.toggle('hidden', isPlaying);
  document.getElementById('pauseIcon').classList.toggle('hidden', !isPlaying);
}

// ==================== VOLUME ====================
function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  audio.volume = volume;
  document.getElementById('volFill').style.width = (volume * 100) + '%';
  document.getElementById('volThumb').style.left = (volume * 100) + '%';
}

// ==================== TOAST ====================
let tTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(tTimer);
  tTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

// ==================== SEEK & VOLUME DRAG ====================
function setupDrag(wrapEl, fillEl, thumbEl, onChange) {
  if (!wrapEl) return;
  let dragging = false;

  const update = (clientX) => {
    const rect = wrapEl.getBoundingClientRect();
    let pct = (clientX - rect.left) / rect.width;
    pct = Math.max(0, Math.min(1, pct));
    onChange(pct);
  };

  wrapEl.addEventListener('mousedown', (e) => {
    dragging = true;
    update(e.clientX);
  });
  document.addEventListener('mousemove', (e) => { if (dragging) update(e.clientX); });
  document.addEventListener('mouseup', () => { dragging = false; });
}

// ==================== INIT ====================
async function init() {
  await loadConfig();
  await loadAlbums();
  renderAllViews();
  updatePlayerUI();

  // Navigation clicks
  document.querySelectorAll('.sl-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const v = item.dataset.view;
      filteredAlbums = [...albums];
      if (v === 'library') { renderAllViews(); }
      else if (v === 'albums') { renderCards('albumsGrid', filteredAlbums); updateGenreFilters(); }
      else if (v === 'artists') { renderArtists(); }
      else if (v === 'genres') { renderGenres(); }
      else if (v === 'recent') { renderCards('recentAllGrid', recentAlbums(10)); }
      navigate(v);
    });
  });

  document.querySelectorAll('.sec-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const v = link.dataset.view;
      if (v === 'recent') { renderCards('recentAllGrid', recentAlbums(10)); }
      navigate(v);
    });
  });

  // Back / Forward
  document.getElementById('backBtn').addEventListener('click', goBack);
  document.getElementById('forwardBtn').addEventListener('click', goForward);

  // Search
  let sTimer;
  document.getElementById('searchInput').addEventListener('input', e => {
    clearTimeout(sTimer);
    sTimer = setTimeout(() => doSearch(e.target.value), 300);
  });

  // Playback controls
  document.getElementById('playBtn').addEventListener('click', togglePlay);
  document.getElementById('nextBtn').addEventListener('click', nextTrack);
  document.getElementById('prevBtn').addEventListener('click', prevTrack);

  // Library play/shuffle
  document.getElementById('libPlayBtn').addEventListener('click', () => {
    if (albums.length) playAlbum(albums[0], 0);
  });
  document.getElementById('libShuffleBtn').addEventListener('click', () => {
    if (albums.length) {
      const idx = Math.floor(Math.random() * albums.length);
      playAlbum(albums[idx], 0);
    }
  });

  // Shuffle (if element exists)
  const shuffleEl = document.getElementById('shuffleBtn');
  if (shuffleEl) {
    shuffleEl.addEventListener('click', () => {
      isShuffled = !isShuffled;
      shuffleEl.classList.toggle('active', isShuffled);
      toast(isShuffled ? '随机播放 开' : '随机播放 关');
    });
  }
  // Repeat
  document.getElementById('repeatBtn').addEventListener('click', () => {
    repeatMode = (repeatMode + 1) % 3;
    const labels = ['关闭', '列表循环', '单曲循环'];
    document.getElementById('repeatBtn').classList.toggle('active', repeatMode > 0);
    toast(`重复播放: ${labels[repeatMode]}`);
  });

  // Volume
  setVolume(0.7);
  setupDrag(
    document.getElementById('volTrack'),
    document.getElementById('volFill'),
    document.getElementById('volThumb'),
    (v) => setVolume(v)
  );

  // Seek
  setupDrag(
    document.getElementById('progTrack'),
    document.getElementById('progFill'),
    document.getElementById('progThumb'),
    (pct) => {
      if (audio.duration) {
        audio.currentTime = pct * audio.duration;
      }
    }
  );

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowRight') nextTrack();
    if (e.code === 'ArrowLeft') prevTrack();
  });
}

document.addEventListener('DOMContentLoaded', init);
