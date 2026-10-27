import {
  loadData, subscribe, slotSprites, slotName, isEmpty, isShiny, spriteFilter, setSprite, onFusionInfo, POKEBALL,
} from './shared.js';

// URL parameters override the shared settings for this one browser source:
//   /overlay?direction=vertical&lines=2&size=96&names=0&frame=0   full party, own layout
//   /overlay?slot=3                                              only party slot 3 (fills the source)
//   /overlay?slot=3&only=name&font=40&align=left                 only slot 3's name, as text
const params = new URLSearchParams(location.search);
const LEGACY_LAYOUTS = { row: ['horizontal', 1], grid3: ['horizontal', 2], grid2: ['horizontal', 3], column: ['vertical', 1] };
const legacy = LEGACY_LAYOUTS[params.get('layout')] ?? [];
const single = Number(params.get('slot')) || null; // 1-based slot index
const nameOnly = single && params.get('only') === 'name';

const OVERRIDES = {
  direction: params.get('direction') ?? legacy[0] ?? null,
  lines: params.has('lines') ? Number(params.get('lines')) : legacy[1] ?? null,
  size: params.has('size') ? Number(params.get('size')) : null,
  // A single slot is meant as a building block for your own UI: bare sprite unless asked otherwise.
  showNames: params.has('names') ? params.get('names') !== '0' : single ? false : null,
  showFrame: params.has('frame') ? params.get('frame') !== '0' : single ? false : null,
  emptySlots: params.get('empty'),
};

const party = document.getElementById('party');
const data = await loadData();
let state = null;
const previousKeys = [];

function applyOverrides(settings) {
  const out = { ...settings };
  for (const [key, value] of Object.entries(OVERRIDES)) {
    if (value !== null && !Number.isNaN(value)) out[key] = value;
  }
  return out;
}

function createSlot() {
  const el = document.createElement('div');
  el.className = 'slot';
  el.innerHTML = '<img class="sprite" alt=""><img class="ball" alt=""><span class="name"></span><span class="star">★</span>';
  el.querySelector('.ball').src = POKEBALL;
  el.addEventListener('animationend', () => el.classList.remove('changed'));
  return el;
}

function renderSlot(el, slot, i, settings) {
  const empty = isEmpty(slot, settings);
  const name = settings.showNames && !empty ? slotName(data, slot, settings) : '';
  const sprite = el.querySelector('.sprite');
  const urls = slotSprites(data, slot, settings);

  const key = urls.join('|');
  if (previousKeys[i] !== undefined && previousKeys[i] !== key && !empty) el.classList.add('changed');
  previousKeys[i] = key;

  setSprite(sprite, urls);
  sprite.style.filter = spriteFilter(slot, settings);
  el.classList.toggle('hidden', empty && settings.emptySlots === 'hidden');
  el.classList.toggle('named', Boolean(name));
  el.querySelector('.ball').hidden = !(empty && settings.emptySlots === 'pokeball');
  el.querySelector('.name').textContent = name;
  el.querySelector('.star').hidden = empty || !isShiny(slot, settings);
}

function renderNameOnly(slot, settings) {
  document.body.classList.add('text-source');
  party.className = 'name-source';
  party.style.fontSize = `${Number(params.get('font')) || 32}px`;
  party.style.textAlign = params.get('align') ?? 'center';
  party.textContent = slot && !isEmpty(slot, settings) ? slotName(data, slot, settings) : '';
}

function render() {
  if (!state) return;
  const settings = applyOverrides(state.settings);

  if (nameOnly) return renderNameOnly(state.slots[single - 1], settings);

  const slots = single ? [state.slots[single - 1]].filter(Boolean) : state.slots;
  party.classList.toggle('single', Boolean(single));
  party.classList.toggle('framed', settings.showFrame);
  party.style.setProperty('--size', single ? 'min(100vw, 100vh)' : `${settings.size}px`);

  // Horizontal fills rows left to right; vertical fills columns top to bottom.
  const perLine = Math.ceil(slots.length / Math.min(Math.max(settings.lines, 1), 3));
  const vertical = settings.direction === 'vertical';
  party.style.gridAutoFlow = vertical ? 'column' : 'row';
  party.style.gridTemplateColumns = vertical ? '' : `repeat(${perLine}, var(--size))`;
  party.style.gridTemplateRows = vertical ? `repeat(${perLine}, var(--size))` : '';

  while (party.children.length < slots.length) party.append(createSlot());
  slots.forEach((slot, i) => renderSlot(party.children[i], slot, single ? single - 1 : i, settings));
}

onFusionInfo(render); // official fusion names arrive asynchronously
subscribe((next) => {
  state = next;
  render();
});
