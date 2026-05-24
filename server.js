const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// 每次重启生成随机密钥，旧 token 失效
const SECRET = crypto.randomBytes(16).toString('hex');
const TOKEN_VALID_MS = 30 * 60 * 1000; // 30 分钟

// 静态文件（但排除 music 目录，强制走代理）
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.mp3')) {
      res.set('X-Content-Type-Options', 'nosniff');
    }
  }
}));

// 生成 token（服务端 + 前端共用同一算法）
function makeToken(albumId, trackIndex) {
  const exp = Date.now() + TOKEN_VALID_MS;
  const raw = `${albumId}:${trackIndex}:${exp}:${SECRET}`;
  const sig = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12);
  return `${exp}-${sig}`;
}

function verifyToken(albumId, trackIndex, token) {
  try {
    const [exp, sig] = token.split('-');
    if (Date.now() > parseInt(exp)) return false;
    const raw = `${albumId}:${trackIndex}:${exp}:${SECRET}`;
    const expected = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12);
    return sig === expected;
  } catch { return false; }
}

// ==================== API ====================

app.get('/api/albums', (req, res) => {
  const data = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'public', 'data', 'albums.json'), 'utf-8')
  );
  // 返回时注入每个 track 的 token
  data.forEach(album => {
    album.tracks.forEach((track, i) => {
      track.token = makeToken(album.id, i);
    });
  });
  res.json(data);
});

app.get('/api/albums/:id', (req, res) => {
  const data = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'public', 'data', 'albums.json'), 'utf-8')
  );
  const album = data.find(a => a.id === parseInt(req.params.id));
  if (!album) return res.status(404).json({ error: 'Album not found' });
  // 注入 token
  album.tracks.forEach((track, i) => {
    track.token = makeToken(album.id, i);
  });
  res.json(album);
});

// 音频流代理端点（验证 token + 防盗链）
app.get('/api/stream/:albumId/:trackIndex', (req, res) => {
  const { albumId, trackIndex } = req.params;
  const token = req.query.t;

  // 验证 token
  if (!token || !verifyToken(parseInt(albumId), parseInt(trackIndex), token)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // 可选：Referer 检查
  const referer = req.get('Referer') || '';
  const origin = req.get('Origin') || '';
  if (referer && !referer.includes(req.hostname) && !referer.includes('localhost')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const data = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'public', 'data', 'albums.json'), 'utf-8')
  );
  const album = data.find(a => a.id === parseInt(albumId));
  if (!album || !album.tracks[parseInt(trackIndex)]) {
    return res.status(404).json({ error: 'Not found' });
  }

  const filePath = path.join(__dirname, 'public', album.tracks[parseInt(trackIndex)].url);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // 允许 CDN 缓存
  res.set({
    'Content-Type': 'audio/mpeg',
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'public, max-age=31536000, immutable'
  });

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

app.listen(PORT, () => {
  console.log(`iTunes CD Showcase running at http://localhost:${PORT}`);
});
