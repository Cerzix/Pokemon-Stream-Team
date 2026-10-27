const fs = require('node:fs');
const path = require('node:path');

const DETAILS_URL = 'https://infinitefusiondex.com/details/';
const FRESH_FOR = 24 * 60 * 60 * 1000; // new sprite packs land monthly; refresh daily
const VALID_ID = /^\d{1,4}(\.\d{1,4})?$/;

// Official fusion name and the list of custom sprite variants ("", "a", "b", ...) with their
// artists, scraped from the Infinite Fusion Dex detail page and cached on disk.
function createFusionInfo(cacheDir) {
  const memory = new Map();
  const inflight = new Map();

  async function fetchInfo(id) {
    const res = await fetch(DETAILS_URL + id, {
      headers: { 'user-agent': 'Mozilla/5.0 PokemonStreamTeam' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404) return { key: id, name: null, alts: [] };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    const pokemon = match && JSON.parse(match[1]).props?.pageProps?.pokemon?.[0];
    if (!pokemon) return { key: id, name: null, alts: [] };
    return {
      // Sprite file key the variants belong to. Usually `id`, but the dex folds
      // self-fusions ("149.149") into the base Pokemon ("149").
      key: pokemon.real_id ?? id,
      name: pokemon.real_name ?? null,
      alts: (pokemon.alts ?? []).map((a) => ({ ext: a.extension, artist: a.real_contributor_name ?? '' })),
    };
  }

  async function get(id) {
    if (!VALID_ID.test(id)) throw new Error('Invalid fusion id');
    const cached = memory.get(id);
    if (cached && Date.now() - cached.at < FRESH_FOR) return cached.info;

    const file = path.join(cacheDir, `${id}.json`);
    try {
      const disk = JSON.parse(await fs.promises.readFile(file, 'utf8'));
      if (Date.now() - disk.at < FRESH_FOR) {
        memory.set(id, disk);
        return disk.info;
      }
    } catch {
      // not cached yet
    }

    if (!inflight.has(id)) {
      inflight.set(
        id,
        fetchInfo(id)
          .then(async (info) => {
            const entry = { at: Date.now(), info };
            memory.set(id, entry);
            await fs.promises.mkdir(cacheDir, { recursive: true });
            await fs.promises.writeFile(file, JSON.stringify(entry));
            return info;
          })
          .catch((err) => {
            // Serve stale data rather than nothing when the dex is unreachable.
            if (cached) return cached.info;
            throw err;
          })
          .finally(() => inflight.delete(id)),
      );
    }
    return inflight.get(id);
  }

  return { get };
}

module.exports = { createFusionInfo };
