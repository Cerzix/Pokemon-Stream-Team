const fs = require('node:fs');
const path = require('node:path');

// Upstream hosts the overlay may load sprites from, keyed by the first path segment.
const SOURCES = {
  pokeapi: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/',
  fusion: 'https://ifd-spaces.sfo2.cdn.digitaloceanspaces.com/',
  showdown: 'https://play.pokemonshowdown.com/sprites/',
};

const SAFE_PATH = /^[A-Za-z0-9_\-./]+\.(png|gif|svg)$/;
const CONTENT_TYPES = { png: 'image/png', gif: 'image/gif', svg: 'image/svg+xml' };
const MISS_TTL = 6 * 60 * 60 * 1000; // re-check missing sprites after 6h (new fusion art gets added)
const ERROR_RETRY = 60 * 1000; // upstream errors (e.g. Showdown's intermittent 522) are retried sooner
const UPSTREAM_TIMEOUT = 45 * 1000;
const SLOW_RESPONSE = 4000;
const SLOW = Symbol('slow');
const FAILED = Symbol('failed');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fetches sprites once, keeps them on disk, and serves them from there afterwards.
// Keeps the overlay working offline and avoids GitHub rate limits mid-stream.
function createSpriteProxy(cacheDir) {
  const misses = new Map(); // key -> timestamp of last 404
  const inflight = new Map(); // key -> Promise<Buffer | null (404) | FAILED>

  async function fetchUpstream(source, relPath, filePath) {
    const res = await fetch(SOURCES[source] + relPath, {
      headers: { 'user-agent': 'Mozilla/5.0 PokemonStreamTeam' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
    });
    if (res.status === 404 || res.status === 403) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, data);
    return data;
  }

  async function handle(route, res) {
    const [source, ...rest] = route.split('/');
    const relPath = rest.join('/');
    if (!SOURCES[source] || !SAFE_PATH.test(relPath) || relPath.includes('..')) {
      res.writeHead(400).end('Bad sprite path');
      return;
    }

    const key = `${source}/${relPath}`;
    const type = CONTENT_TYPES[path.extname(relPath).slice(1)];
    const filePath = path.join(cacheDir, source, ...relPath.split('/'));

    const reply = (data) => {
      if (!data) {
        res.writeHead(404, { 'cache-control': 'no-store' }).end();
        return;
      }
      res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=604800' });
      res.end(data);
    };

    try {
      return reply(await fs.promises.readFile(filePath));
    } catch {
      // not cached yet
    }

    const missedAt = misses.get(key);
    if (missedAt && Date.now() - missedAt < MISS_TTL) return reply(null);

    if (!inflight.has(key)) {
      const download = fetchUpstream(source, relPath, filePath)
        .then((data) => {
          if (!data) misses.set(key, Date.now());
          return data;
        })
        .catch((err) => {
          console.warn(`Sprite fetch failed for ${key}: ${err.message}`);
          misses.set(key, Date.now() - MISS_TTL + ERROR_RETRY); // let the overlay fall back for a minute
          return FAILED;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, download);
    }

    // Slow upstreams (Showdown can take ~20s for a cold file) shouldn't stall the overlay:
    // answer "try later" so the client shows its fallback, and let the download finish into the cache.
    const result = await Promise.race([inflight.get(key), wait(SLOW_RESPONSE).then(() => SLOW)]);
    if (result === SLOW || result === FAILED) {
      res.writeHead(503, { 'cache-control': 'no-store', 'retry-after': '15' }).end();
      return;
    }
    reply(result);
  }

  return { handle };
}

module.exports = { createSpriteProxy };
