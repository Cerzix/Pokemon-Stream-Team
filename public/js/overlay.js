import {
  loadData, subscribe, slotSprites, slotName, isEmpty, isShiny, spriteFilter, isPixelArt, setSprite, POKEBALL,
} from './shared.js';

// URL parameters override the shared settings for this one browser source, e.g.
// /overlay?layout=column&size=96&names=0&frame=0 for a second, vertical party bar.
const params = new URLSearchParams(location.search);
const OVERRIDES = {
  layout: params.get('layout'),
  size: params.has('size') ? Number(params.get('size')) : null,
  showNames: params.has('names') ? params.get('names') !== '0' : null,
  showFrame: params.has('frame') ? params.get('frame') !== '0' : null,
};

const party = document.getElementById('party');
const data = await loadData();
let previousKeys = [];

function applyOverrides(settings) {
  const out = { ...settings };
  for (const [key, value] of Object.entries(OVERRIDES)) {
    if (value !== null && !Number.isNaN(value)) out[key] = value;
  }
  return out;
}

function render(state) {
  const settings = applyOverrides(state.settings);
  party.dataset.layout = settings.layout;
  party.style.setProperty('--size', `${settings.size}px`);
  party.classList.toggle('framed', settings.showFrame);
  party.classList.toggle('pixel', isPixelArt(settings));

  while (party.children.length < state.slots.length) {
    const el = document.createElement('div');
    el.className = 'slot';
    el.innerHTML = '<img class="sprite" alt=""><img class="ball" alt=""><span class="name"></span><span class="star">★</span>';
    el.querySelector('.ball').src = POKEBALL;
    el.addEventListener('animationend', () => el.classList.remove('changed'));
    party.append(el);
  }

  state.slots.forEach((slot, i) => {
    const el = party.children[i];
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
  });
}

subscribe(render);
