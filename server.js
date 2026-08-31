/* Lobby Welcome Display - Zero-Dependency Sync Server
 *
 * Melayani file statis aplikasi + API kecil agar semua perangkat
 * (laptop, HP, TV Android) berbagi konfigurasi display yang sama.
 * Data disimpan di DATA_DIR (default /data) sebagai config.json.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 80;
const DATA_DIR = process.env.DATA_DIR || '/data';
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const PUBLIC_DIR = __dirname;
const MAX_BODY_BYTES = 20 * 1024 * 1024; // 20 MB (logo base64)

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ts: String(parsed.ts || '0'),
      data: parsed.data || null,
    };
  } catch (_) {
    return { ts: '0', data: null };
  }
}

let lastTs = readConfig().ts;

function nextTs() {
  const now = Date.now();
  const ts = String(Math.max(now, Number(lastTs || '0') + 1));
  lastTs = ts;
  return ts;
}

function writeConfig(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const ts = nextTs();
  const tmpFile = CONFIG_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify({ ts, data }), 'utf8');
  fs.renameSync(tmpFile, CONFIG_FILE);
  return ts;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function sendStatic(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      // HTML selalu divalidasi ulang agar update langsung terlihat di semua perangkat
      'Cache-Control': ext === '.html' ? 'no-cache, must-revalidate' : 'public, max-age=3600',
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === '/api/config') {
    if (req.method === 'GET') {
      const { ts, data } = readConfig();
      const since = url.searchParams.get('since') || '0';
      if (data && since !== ts) {
        return sendJson(res, 200, { changed: true, ts, data });
      }
      return sendJson(res, 200, { changed: false, ts, data });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      let body = '';
      let tooLarge = false;
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > MAX_BODY_BYTES) {
          tooLarge = true;
          req.destroy();
        }
      });
      req.on('end', () => {
        if (tooLarge) return sendJson(res, 413, { ok: false, error: 'payload too large' });
        try {
          const payload = JSON.parse(body);
          const data = payload && payload.data !== undefined ? payload.data : payload;
          if (!data || typeof data !== 'object') throw new Error('invalid data');
          const ts = writeConfig(data);
          return sendJson(res, 200, { ok: true, ts });
        } catch (_) {
          return sendJson(res, 400, { ok: false, error: 'invalid JSON payload' });
        }
      });
      return;
    }

    return sendJson(res, 405, { ok: false, error: 'method not allowed' });
  }

  // Static files
  let filePath = path.normalize(path.join(PUBLIC_DIR, url.pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }
  return sendStatic(res, filePath);
});

server.listen(PORT, () => {
  console.log(`Welcome display server running on http://0.0.0.0:${PORT}`);
  console.log(`Config data directory: ${DATA_DIR}`);
});
