// 開発・テスト用の静的ファイルサーバー。
// GitHub Pages と同じく /camera_test/ の下で配信し、絶対パス参照のミスに気づけるようにする。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BASE = '/camera_test/';
const PORT = Number(process.env.PORT ?? 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'cache-control': 'no-store', ...headers });
  res.end(body);
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/' || pathname === BASE.slice(0, -1)) {
    send(res, 301, '', { location: BASE });
    return;
  }
  if (!pathname.startsWith(BASE)) {
    send(res, 404, 'Not Found');
    return;
  }

  let relative = decodeURIComponent(pathname.slice(BASE.length));
  if (relative === '' || relative.endsWith('/')) relative += 'index.html';

  const file = resolve(ROOT, relative);
  if (!file.startsWith(ROOT + sep)) {
    send(res, 403, 'Forbidden');
    return;
  }

  try {
    const body = await readFile(file);
    send(res, 200, body, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  } catch {
    send(res, 404, 'Not Found');
  }
}).listen(PORT, () => {
  console.log(`http://localhost:${PORT}${BASE}`);
});
