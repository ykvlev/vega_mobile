// Test-only server for the exported React Native web build. It never selects a
// proxy destination from a request or forwards ambient browser cookies.
import { createServer } from 'node:http';
import { realpath, stat, readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(
  fileURLToPath(new URL('../apps/mobile/dist', import.meta.url)),
);
const origin = 'http://127.0.0.1:3106';
const api = 'http://127.0.0.1:3202';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
};
const baseHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
function finish(
  response,
  status,
  body = '',
  type = 'text/plain; charset=utf-8',
) {
  if (response.destroyed) return;
  if (response.headersSent) return response.destroy();
  response.writeHead(status, { ...baseHeaders, 'Content-Type': type });
  response.end(body);
}
async function requestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('Body limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function responseBody(response) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) throw new Error('Response limit');
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel().catch(() => {});
  }
}
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', origin);
    const path = decodeURIComponent(url.pathname);
    if (
      path.includes('\0') ||
      path.includes('\\') ||
      path.split('/').includes('..')
    )
      return finish(response, 400);
    if (path.startsWith('/api/v1/')) {
      if (!['GET', 'POST'].includes(request.method ?? ''))
        return finish(response, 405);
      if (
        request.method === 'POST' &&
        request.headers.origin &&
        request.headers.origin !== origin
      )
        return finish(response, 403);
      const headers = { Accept: 'application/json' };
      for (const name of ['authorization', 'content-type']) {
        const value = request.headers[name];
        if (typeof value === 'string' && value.length < 1024)
          headers[name] = value;
      }
      const body =
        request.method === 'POST' ? await requestBody(request) : undefined;
      const upstream = await fetch(new URL(path + url.search, api), {
        method: request.method,
        headers,
        body,
        redirect: 'error',
        signal: globalThis.AbortSignal.timeout(10000),
      });
      const bytes = await responseBody(upstream);
      return finish(
        response,
        upstream.status,
        bytes,
        upstream.headers.get('content-type') ?? 'application/octet-stream',
      );
    }
    if (!['GET', 'HEAD'].includes(request.method ?? ''))
      return finish(response, 405);
    const candidate = resolve(root, path === '/' ? 'index.html' : '.' + path);
    if (candidate !== root && !candidate.startsWith(root + sep))
      return finish(response, 404);
    const actual = await realpath(candidate).catch(() => null);
    if (!actual || !actual.startsWith(root + sep)) return finish(response, 404);
    const info = await stat(actual);
    if (!info.isFile() || info.size > 16 * 1024 * 1024)
      return finish(response, 404);
    const bytes = request.method === 'HEAD' ? '' : await readFile(actual);
    return finish(
      response,
      200,
      bytes,
      types[extname(actual)] ?? 'application/octet-stream',
    );
  } catch {
    finish(response, 503, 'Test service unavailable');
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(3106, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.closeAllConnections();
    server.close();
  });
}
