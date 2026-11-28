// Fast static server for local play (node tools/serve.mjs [port]). The game loads ~260 ES module files: a slow or one-request-at-a-time server
// (python3 -m http.server on some machines: ~0.8 s a request, 2+ min to the menu) makes the title crawl. This one is async, keep-alive, caches by mtime (304),
// binds IPv4 + IPv6. Open http://127.0.0.1:8000 (not localhost) if your browser stalls on the ::1 connection.
import { createServer } from 'node:http'; import { stat, readFile } from 'node:fs/promises'; import { join, extname, dirname, normalize } from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), PORT = +(process.argv[2] || 8000);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.exr': 'application/octet-stream', '.hdr': 'application/octet-stream', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(req.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html';
    const f = join(ROOT, p); if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const s = await stat(f); if (!s.isFile()) throw 0;
    const tag = `"${s.size}-${Math.round(s.mtimeMs)}"`;
    if (req.headers['if-none-match'] === tag) { res.writeHead(304); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'content-length': s.size, etag: tag, 'cache-control': 'no-cache' });
    res.end(await readFile(f));
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(PORT, () => console.log(`serving ${ROOT} on http://127.0.0.1:${PORT} (and [::1]:${PORT})`));
