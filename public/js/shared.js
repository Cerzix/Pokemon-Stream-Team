// Logic shared by the control panel and the overlay: data loading, display
// names, and the ordered list of sprite URLs to try for a slot.

const POKEAPI = '/img/pokeapi/sprites/pokemon';
const SHOWDOWN = '/img/showdown';
const FUSION = '/img/fusion';

export const POKEBALL = '/img/pokeapi/sprites/items/poke-ball.png';
export const EMPTY_SLOT = { id: null, head: null, body: null, alt: null, shiny: false, nickname: '' };

export async function loadData() {
  const [pokedex, fusionDex, local] = await Promise.all([
    fetch('/data/pokedex.json').then((r) => r.json()),
    fetch('/data/fusion-dex.json').then((r) => r.json()),
    fetch('/api/local-icons').then((r) => r.json()),
  ]);
  const byId = new Map(pokedex.map((p) => [p.id, p]));
  const fusionById = new Map(fusionDex.map((p) => [p.id, p]));
  return { pokedex, fusionDex, byId, fusionById, localIcons: new Set(local.icons), localAvailable: local.available };
}

export function pad(n) {
  return String(n).padStart(3, '0');
}

// ---- Infinite Fusion details (official name + custom sprite variants) ----------

const fusionInfoCache = new Map(); // "head.body" -> info | Promise
const fusionInfoListeners = new Set();

export function fusionKey(head, body) {
  return body ? `${head}.${body}` : String(head);
}

// Returns the cached info, or null while it loads (listeners fire once it arrives).
export function fusionInfo(head, body) {
  const key = fusionKey(head, body);
  const cached = fusionInfoCache.get(key);
  if (cached && !(cached instanceof Promise)) return cached;
  if (!cached) {
    const request = fetch(`/api/fusion/${key}`)
      .then((r) => (r.ok ? r.json() : { name: null, alts: [] }))
      .catch(() => ({ name: null, alts: [] }))
      .then((info) => {
        fusionInfoCache.set(key, info);
        fusionInfoListeners.forEach((fn) => fn(key, info));
        return info;
      });
    fusionInfoCache.set(key, request);
  }
  return null;
}

export function onFusionInfo(fn) {
  fusionInfoListeners.add(fn);
}

// ---- names -----------------------------------------------------------------------

export function pokemonName(data, id, lang) {
  const p = data.byId.get(id);
  return p ? p.name[lang] ?? p.name.en : '';
}

// Fusion dex names are English only; use the PokeAPI translation for plain species.
export function fusionName(data, fid, lang) {
  const f = data.fusionById.get(fid);
  if (!f) return '';
  if (lang === 'en' || f.name.includes('(')) return f.name;
  return pokemonName(data, f.nat, lang) || f.name;
}

// Fallback while the official name loads: first half of the head + second half of the body.
function approximateFusedName(data, head, body, lang) {
  const h = fusionName(data, head, lang).replace(/\s*\(.*\)$/, '');
  const b = fusionName(data, body, lang).replace(/\s*\(.*\)$/, '');
  if (!h || !b) return h || b;
  if (head === body) return h;
  return h.slice(0, Math.ceil(h.length / 2)) + b.slice(Math.floor(b.length / 2)).toLowerCase();
}

export function slotName(data, slot, settings) {
  if (slot.nickname) return slot.nickname;
  if (settings.mode === 'fusion') {
    if (!slot.head) return '';
    if (!slot.body) return fusionName(data, slot.head, settings.language);
    return fusionInfo(slot.head, slot.body)?.name ?? approximateFusedName(data, slot.head, slot.body, settings.language);
  }
  return slot.id ? pokemonName(data, slot.id, settings.language) : '';
}

export function isEmpty(slot, settings) {
  return settings.mode === 'fusion' ? !slot.head : !slot.id;
}

export function isShiny(slot, settings) {
  return settings.shiny || slot.shiny;
}

// ---- sprite URLs ---------------------------------------------------------------

function localIconUrls(data, id, shiny) {
  const p = data.byId.get(id);
  if (!p) return [];
  // Icon packs name forms like "025-pikachu-alola"; fall back to the base species icon.
  const species = data.byId.get(p.species);
  const keys = [`${pad(p.species)}-${p.slug}`, species && `${pad(p.species)}-${species.slug}`]
    .filter((k) => k && data.localIcons.has(k));
  const suffix = shiny ? '-shiny' : '';
  return keys.flatMap((k) => [`/img/local/3x/${k}${suffix}@3x.png`, `/img/local/1x/${k}${suffix}.png`]);
}

// Ordered candidate URLs for a standard (non-fusion) Pokemon; the <img> walks the list on error.
export function standardSprites(data, id, settings, shiny) {
  const s = shiny ? 'shiny/' : '';
  const sd = data.byId.get(id)?.sd;
  const urls = [];
  if (settings.animated) {
    const gif3d = sd && `${SHOWDOWN}/ani${shiny ? '-shiny' : ''}/${sd}.gif`;
    const gen5 = [`${POKEAPI}/other/showdown/${s}${id}.gif`, `${POKEAPI}/versions/generation-v/black-white/animated/${s}${id}.gif`];
    if (settings.gifStyle === '3d') urls.push(gif3d, ...gen5);
    else urls.push(...gen5, gif3d);
  }
  if (settings.style === 'local') urls.push(...localIconUrls(data, id, shiny));
  if (settings.style === 'home') urls.push(`${POKEAPI}/other/home/${s}${id}.png`);
  if (settings.style === 'artwork') urls.push(`${POKEAPI}/other/official-artwork/${s}${id}.png`);
  urls.push(`${POKEAPI}/${s}${id}.png`, `${POKEAPI}/${id}.png`);
  return [...new Set(urls.filter(Boolean))];
}

// Infinite Fusion sprites. `alt` picks a variant: a custom-sprite suffix ("", "a", "ab", ...),
// "generated" for the auto-generated sprite, or null for the default (main custom art first).
// The game has no shiny sprite files; it hue-shifts them instead (see spriteFilter).
export function fusionSprites(data, head, body, alt = null) {
  const key = fusionKey(head, body);
  const custom = `${FUSION}/custom/${key}.png`;
  const generated = body && `${FUSION}/generated/${key}.png`;
  const nat = !body && data.fusionById.get(head)?.nat;
  const plain = nat && `${POKEAPI}/${nat}.png`;

  const variantKey = fusionInfo(head, body)?.key ?? key;
  let urls;
  if (alt === 'generated') urls = [generated, custom];
  else if (alt) urls = [`${FUSION}/custom/${variantKey}${alt}.png`, custom, generated];
  else urls = [custom, generated];
  return [...urls, plain].filter(Boolean);
}

export function slotSprites(data, slot, settings) {
  if (isEmpty(slot, settings)) return [];
  if (settings.mode === 'fusion') return fusionSprites(data, slot.head, slot.body, slot.alt);
  return standardSprites(data, slot.id, settings, isShiny(slot, settings));
}

export function spriteFilter(slot, settings) {
  if (settings.mode === 'fusion' && isShiny(slot, settings)) return `hue-rotate(${settings.fusionShinyHue}deg) saturate(1.15)`;
  return '';
}

// Rendered/high-res sources scale smoothly; everything else is pixel art and stays crisp.
function isSmoothSource(url) {
  return /\/showdown\/ani|\/other\/home\/|\/official-artwork\//.test(url);
}

const UPGRADE_RETRIES = [3000, 6000, 12000, 25000, 50000];

// Points an <img> at the first candidate URL that loads, and marks pixel art for crisp scaling.
// If the preferred sprite failed (often just slow: the server keeps downloading it in the
// background), retry it a little later and swap it in once it is available.
export function setSprite(img, urls) {
  const key = urls.join('|');
  if (img.dataset.key === key) return;
  img.dataset.key = key;
  let i = 0;
  const show = (index) => {
    i = index;
    img.classList.toggle('pixel', !isSmoothSource(urls[i]));
    img.src = urls[i];
  };
  const tryUpgrade = (attempt) => {
    if (attempt >= UPGRADE_RETRIES.length) return;
    setTimeout(() => {
      if (img.dataset.key !== key || i === 0) return;
      const probe = new Image();
      probe.onload = () => img.dataset.key === key && show(0);
      probe.onerror = () => tryUpgrade(attempt + 1);
      probe.src = urls[0];
    }, UPGRADE_RETRIES[attempt]);
  };
  img.onerror = () => {
    if (i === 0) tryUpgrade(0);
    if (i + 1 < urls.length) show(i + 1);
    else img.removeAttribute('src');
  };
  if (urls.length) show(0);
  else img.removeAttribute('src');
}

// Keeps a live copy of the shared state via Server-Sent Events.
export function subscribe(onState, onStatus = () => {}) {
  const source = new EventSource('/events');
  source.onopen = () => onStatus(true);
  source.onerror = () => onStatus(false);
  source.onmessage = (e) => onState(JSON.parse(e.data));
  return source;
}
