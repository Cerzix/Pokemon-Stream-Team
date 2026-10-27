// Logic shared by the control panel and the overlay: data loading, display
// names, and the ordered list of sprite URLs to try for a slot.

const POKEAPI = '/img/pokeapi/sprites/pokemon';
const FUSION = '/img/fusion';

export const POKEBALL = '/img/pokeapi/sprites/items/poke-ball.png';

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

// Infinite Fusion names fuse the first half of the head with the second half of the body.
export function fusedName(data, head, body, lang) {
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
    return slot.body ? fusedName(data, slot.head, slot.body, settings.language) : fusionName(data, slot.head, settings.language);
  }
  return slot.id ? pokemonName(data, slot.id, settings.language) : '';
}

export function isEmpty(slot, settings) {
  return settings.mode === 'fusion' ? !slot.head : !slot.id;
}

export function isShiny(slot, settings) {
  return settings.shiny || slot.shiny;
}

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
  const urls = [];
  if (settings.animated) {
    urls.push(`${POKEAPI}/other/showdown/${s}${id}.gif`);
    urls.push(`${POKEAPI}/versions/generation-v/black-white/animated/${s}${id}.gif`);
  }
  if (settings.style === 'local') urls.push(...localIconUrls(data, id, shiny));
  if (settings.style === 'home') urls.push(`${POKEAPI}/other/home/${s}${id}.png`);
  if (settings.style === 'artwork') urls.push(`${POKEAPI}/other/official-artwork/${s}${id}.png`);
  urls.push(`${POKEAPI}/${s}${id}.png`, `${POKEAPI}/${id}.png`);
  return [...new Set(urls)];
}

// Fusion sprites: community custom art first, then the auto-generated sprite.
// Infinite Fusion has no shiny sprite files; the game hue-shifts them instead (see spriteFilter).
export function fusionSprites(data, head, body) {
  if (!body) {
    const nat = data.fusionById.get(head)?.nat;
    return [`${FUSION}/custom/${head}.png`, nat && `${POKEAPI}/${nat}.png`].filter(Boolean);
  }
  return [`${FUSION}/custom/${head}.${body}.png`, `${FUSION}/generated/${head}.${body}.png`, `${FUSION}/custom/${head}.png`];
}

export function slotSprites(data, slot, settings) {
  if (isEmpty(slot, settings)) return [];
  if (settings.mode === 'fusion') return fusionSprites(data, slot.head, slot.body);
  return standardSprites(data, slot.id, settings, isShiny(slot, settings));
}

export function spriteFilter(slot, settings) {
  if (settings.mode === 'fusion' && isShiny(slot, settings)) return `hue-rotate(${settings.fusionShinyHue}deg) saturate(1.15)`;
  return '';
}

// Smooth scaling only suits the high-res artwork styles; pixel sprites stay crisp.
export function isPixelArt(settings) {
  return settings.mode === 'fusion' || settings.animated || !['home', 'artwork'].includes(settings.style);
}

// Points an <img> at the first candidate URL that loads.
export function setSprite(img, urls) {
  const key = urls.join('|');
  if (img.dataset.key === key) return;
  img.dataset.key = key;
  let i = 0;
  img.onerror = () => {
    i += 1;
    if (i < urls.length) img.src = urls[i];
    else img.removeAttribute('src');
  };
  if (urls.length) img.src = urls[0];
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
