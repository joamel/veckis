// Mini static-server för lokal PWA-test. SPA-fallback: okända paths
// returnerar index.html så Expo Router kan ta över klient-side.
// Speglar Render-rewrite-konfigen så lokala bygget beter sig identiskt.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'dist');
const port = Number(process.env.PORT) || 8081;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  // Hindra path-traversal — bara within root
  const requested = path.normalize(path.join(root, url));
  if (!requested.startsWith(root)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  let filepath = requested;
  let exists = fs.existsSync(filepath);
  if (exists && fs.statSync(filepath).isDirectory()) {
    filepath = path.join(filepath, 'index.html');
    exists = fs.existsSync(filepath);
  }
  // SPA-fallback: okända paths → index.html
  if (!exists) filepath = path.join(root, 'index.html');

  const ext = path.extname(filepath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const stream = fs.createReadStream(filepath);
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  stream.pipe(res);
  stream.on('error', () => { res.writeHead(500); res.end(); });
});

server.listen(port, () => {
  console.log(`PWA serving on http://localhost:${port}`);
});
