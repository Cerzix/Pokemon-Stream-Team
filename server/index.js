const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const { loadConfig, ROOT } = require('./config');
const { createStore, sanitizeSlots } = require('./state');
const { createTeams } = require('./teams');
const { createFusionInfo } = require('./fusion-info');
const { createPrefetcher } = require('./prefetch');
const { createSpriteProxy } = require('./sprites');
const { indexLocalIcons } = require('./local-icons');

const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const config = loadConfig();
const store = createStore(path.join(ROOT, 'state.json'));
const proxy = createSpriteProxy(path.join(ROOT, 'cache'));
const localIcons = indexLocalIcons(config.localIconDir);
const teams = createTeams(path.join(ROOT, 'teams.json'), sanitizeSlots);
const fusionInfo = createFusionInfo(path.join(ROOT, 'cache', 'fusion-info'));

createPrefetcher(proxy, ROOT)
  .then((prefetchParty) => {
    prefetchParty(store.get());
    store.onChange(prefetchParty);
  })
  .catch((err) => console.warn(`Sprite prefetching disabled: ${err.message}`));

const clients = new Set();
store.onChange((state) => {
  const payload = `data: ${JSON.stringify(state)}\n\n`;
  for (const res of clients) res.write(payload);
});

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value), MIME['.json']);
}

// Serves a file only if it resolves inside `baseDir`.
function serveFile(res, baseDir, relPath, cacheControl = 'no-cache') {
  const filePath = path.resolve(baseDir, '.' + path.posix.normalize('/' + relPath));
  if (!filePath.startsWith(path.resolve(baseDir) + path.sep)) return send(res, 403, 'Forbidden');
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': cacheControl,
    });
    res.end(data);
  });
}

function readBody(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Body too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const route = decodeURIComponent(url.pathname);

  if (route === '/') {
    res.writeHead(302, { location: '/control' });
    return res.end();
  }
  if (route === '/control' || route === '/overlay') {
    return serveFile(res, PUBLIC_DIR, `${route}.html`);
  }

  if (route === '/api/state') {
    if (req.method === 'GET') return sendJson(res, 200, store.get());
    if (req.method === 'PUT') {
      try {
        return sendJson(res, 200, store.set(JSON.parse(await readBody(req))));
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
    return send(res, 405, 'Method not allowed');
  }

  if (route === '/api/teams' && req.method === 'GET') return sendJson(res, 200, teams.list());
  if (route.startsWith('/api/teams/')) {
    const name = route.slice('/api/teams/'.length);
    try {
      if (req.method === 'PUT') return sendJson(res, 200, teams.put(name, JSON.parse(await readBody(req))));
      if (req.method === 'DELETE') return sendJson(res, 200, teams.remove(name));
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    return send(res, 405, 'Method not allowed');
  }

  if (route.startsWith('/api/fusion/')) {
    try {
      return sendJson(res, 200, await fusionInfo.get(route.slice('/api/fusion/'.length)));
    } catch (err) {
      return sendJson(res, err.message === 'Invalid fusion id' ? 400 : 502, { error: err.message });
    }
  }

  if (route === '/api/local-icons') {
    return sendJson(res, 200, { available: localIcons.available, icons: localIcons.keys });
  }

  if (route === '/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });
    res.write('retry: 2000\n\n');
    res.write(`data: ${JSON.stringify(store.get())}\n\n`);
    clients.add(res);
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(keepAlive);
      clients.delete(res);
    });
    return;
  }

  if (route.startsWith('/img/local/')) {
    if (!localIcons.available) return send(res, 404, 'Local icons not configured');
    return serveFile(res, localIcons.dir, route.slice('/img/local/'.length), 'public, max-age=86400');
  }
  if (route.startsWith('/img/')) {
    return proxy.handle(route.slice('/img/'.length), res);
  }

  if (route.startsWith('/data/')) return serveFile(res, DATA_DIR, route.slice('/data/'.length));
  return serveFile(res, PUBLIC_DIR, route);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) send(res, 500, 'Internal error');
  });
});

server.listen(config.port, config.host, () => {
  const base = `http://localhost:${config.port}`;
  console.log('Pokemon Stream Team is running.');
  console.log(`  Control panel : ${base}/control`);
  console.log(`  OBS overlay   : ${base}/overlay`);
  console.log(
    localIcons.available
      ? `  Local icons   : ${localIcons.keys.length} from ${localIcons.dir}`
      : '  Local icons   : not configured (set "localIconDir" in config.json)',
  );
});
