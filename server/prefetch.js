const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Warms the sprite cache for everything the party could show next: normal and shiny,
// GIF and PNG. Toggling shiny or GIF/PNG on stream is then served from disk instantly
// instead of waiting on Showdown/GitHub. Uses the overlay's own URL logic (public/js/shared.js).
async function createPrefetcher(proxy, rootDir) {
  const shared = await import(pathToFileURL(path.join(rootDir, 'public', 'js', 'shared.js')).href);
  const read = (file) => JSON.parse(fs.readFileSync(path.join(rootDir, 'data', file), 'utf8'));
  const pokedex = read('pokedex.json');
  const fusionDex = read('fusion-dex.json');
  const data = {
    pokedex,
    fusionDex,
    byId: new Map(pokedex.map((p) => [p.id, p])),
    fusionById: new Map(fusionDex.map((p) => [p.id, p])),
    localIcons: new Set(), // local icons are served from disk already
  };

  return function prefetchParty(state) {
    const urls = new Set();
    for (const slot of state.slots) {
      if (state.settings.mode === 'fusion') {
        if (slot.head) shared.fusionSprites(data, slot.head, slot.body, slot.alt).forEach((u) => urls.add(u));
        continue;
      }
      if (!slot.id) continue;
      for (const animated of [true, false]) {
        for (const shiny of [false, true]) {
          const settings = { ...state.settings, animated };
          shared.standardSprites(data, slot.id, settings, shiny).forEach((u) => urls.add(u));
        }
      }
    }
    proxy.prefetch([...urls].filter((u) => u.startsWith('/img/')).map((u) => u.slice('/img/'.length)));
  };
}

module.exports = { createPrefetcher };
