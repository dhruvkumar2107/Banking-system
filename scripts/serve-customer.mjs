/**
 * Static file server for the built Flutter web app (apps/customer/build/web).
 *
 * Node's event loop serves Flutter's parallel asset fetches concurrently. A
 * single-threaded server (python -m http.server) deadlocks here: it hands over
 * index.html, then blocks on main.dart.js while CanvasKit requests more assets,
 * and the page dies with ERR_EMPTY_RESPONSE.
 *
 * CanvasKit also refuses to instantiate unless .wasm arrives as application/wasm,
 * so the MIME table below is load-bearing, not decoration.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..', 'apps', 'customer', 'build', 'web');
const PORT = Number(process.env.CUSTOMER_PORT || 5000);
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.bin': 'application/octet-stream',
  '.data': 'application/octet-stream',
  '.symbols': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

if (!existsSync(join(ROOT, 'index.html'))) {
  console.error(`\n  No build found at ${ROOT}`);
  console.error('  Build it first:  cd apps/customer  &&  flutter build web --release\n');
  process.exit(1);
}

createServer((req, res) => {
  // Strip the query/hash and refuse anything that climbs out of the web root.
  const raw = decodeURIComponent((req.url || '/').split(/[?#]/)[0]);
  const rel = normalize(raw).replace(/^([/\\])+/, '');
  if (rel.startsWith('..')) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  let file = join(ROOT, rel || 'index.html');
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found: ' + rel);
    return;
  }

  res.writeHead(200, {
    'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': statSync(file).size,
    // The dev loop rebuilds these constantly; a cached main.dart.js is a debugging trap.
    'Cache-Control': 'no-store',
  });
  createReadStream(file).pipe(res);
})
  .on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  Port ${PORT} is already in use. Run STOP-ALL.bat first.\n`);
      process.exit(1);
    }
    throw err;
  })
  .listen(PORT, HOST, () => {
    console.log('  Customer app  ->  http://' + HOST + ':' + PORT);
    console.log('  serving ' + ROOT);
    console.log('  (leave this window open; Ctrl+C to stop)\n');
  });
