/**
 * Minimal static server for the SDK 55 FLAT web export: serves D:\test-app\dist
 * (index.html at the root, route HTML files beside it, _expo static assets and
 * assets/ underneath). Used by tools/live-web-check.cjs to prove the
 * *deployed artifact* boots, not just the dev bundle.
 *
 * Usage: node tools/static-web.cjs   (port 8090; Ctrl-C or kill to stop)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.STATIC_PORT || 8090);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (urlPath === '/') urlPath = '/index.html';
    let file = path.join(ROOT, urlPath);
    // expo-router static routes: /foo.html is also reachable as /foo
    if (!fs.existsSync(file) && !path.extname(file)) {
      const withHtml = path.join(ROOT, urlPath.replace(/\/?$/, '') + '.html');
      if (fs.existsSync(withHtml)) file = withHtml;
    }
    if (!file.startsWith(ROOT)) return res.end('forbidden'), 403 && undefined, res;
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        res.statusCode = 404;
        return res.end('404 ' + urlPath);
      }
      res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-cache');
      fs.createReadStream(file).pipe(res);
    });
  } catch (e) {
    res.statusCode = 500;
    res.end(String(e));
  }
}).listen(PORT, () => console.log('static dist server on ' + PORT + ' (serving ' + ROOT + ')'));
