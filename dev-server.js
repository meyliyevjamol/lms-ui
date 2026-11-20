#!/usr/bin/env node
'use strict';
/*
 * Lokal dev-server (tashqi kutubxonasiz).
 *  - public/ papkadagi fayllarni beradi (har safar yangidan — kesh yo'q, F5 yetarli)
 *  - /api/* so'rovlarini backend'ga proksi qiladi (cookie'lar bilan)
 *
 *   npm run dev                                  → jonli demo serverga ulanadi
 *   API_URL=http://localhost:3000 npm run dev    → lokal lms-backend'ga ulanadi
 */
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT) || 5173;
const API = new URL(process.env.API_URL || 'https://lms.194-163-139-167.sslip.io');
const ROOT = path.join(__dirname, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json',
  '.woff2': 'font/woff2', '.webp': 'image/webp',
};

function proxy(req, res) {
  const client = API.protocol === 'https:' ? https : http;
  const headers = { ...req.headers, host: API.host };
  delete headers.origin;
  delete headers.referer;
  const up = client.request({
    protocol: API.protocol, hostname: API.hostname, port: API.port || (API.protocol === 'https:' ? 443 : 80),
    path: req.url, method: req.method, headers,
  }, (r) => {
    const h = { ...r.headers };
    // localhost http da ishlashi uchun cookie'dan Secure/Domain olib tashlanadi
    if (h['set-cookie']) h['set-cookie'] = h['set-cookie'].map((c) => c.replace(/;\s*secure/gi, '').replace(/;\s*domain=[^;]*/gi, ''));
    res.writeHead(r.statusCode, h);
    r.pipe(res);
  });
  up.on('error', (e) => {
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: `Backend'ga ulanib bo'lmadi (${API.origin}): ${e.message}` }));
  });
  req.pipe(up);
}

function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { // SPA: noma'lum yo'l → index.html
      return fs.readFile(path.join(ROOT, 'index.html'), (e2, html) => {
        res.writeHead(e2 ? 404 : 200, { 'content-type': TYPES['.html'], 'cache-control': 'no-store' });
        res.end(e2 ? 'Not found' : html);
      });
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  });
}

http.createServer((req, res) => (req.url.startsWith('/api/') ? proxy(req, res) : serveStatic(req, res)))
  .listen(PORT, () => {
    console.log(`\n  Malaka LMS — frontend dev-server\n`);
    console.log(`  ➜  http://localhost:${PORT}`);
    console.log(`  ➜  API: ${API.origin}\n`);
  });
