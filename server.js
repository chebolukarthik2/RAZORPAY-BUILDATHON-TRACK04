import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8080;
const FRONTEND_DIR = path.join(__dirname, 'frontend');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function serveFile(res, filePath, ext) {
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const headers = { 'Content-Type': contentType };

    if (ext === '.js') {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    }

    res.writeHead(200, headers);
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath.startsWith('/')) urlPath = urlPath.substring(1);

  if (!urlPath) {
    res.writeHead(302, { 'Location': '/login.html' });
    res.end();
    return;
  }

  const fullPath = path.join(FRONTEND_DIR, urlPath);
  const ext = path.extname(fullPath);

  if (ext) {
    serveFile(res, fullPath, ext);
    return;
  }

  // No extension — try .html fallback for SPA-like routing
  fs.readFile(fullPath, (err, data) => {
    if (!err) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
      return;
    }
    fs.readFile(fullPath + '.html', (err2, data2) => {
      if (!err2) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data2);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`ReconAI Frontend serving on http://localhost:${PORT}`);
  console.log(`Pages:`);
  console.log(`  Dashboard:      http://localhost:${PORT}/dashboard.html`);
  console.log(`  Reconciliation: http://localhost:${PORT}/reconciliation.html`);
  console.log(`  Exceptions:     http://localhost:${PORT}/exceptions.html`);
  console.log(`  Audit Trail:    http://localhost:${PORT}/audit.html`);
  console.log(`  Finance Q&A:    http://localhost:${PORT}/finance-qna.html`);
});
