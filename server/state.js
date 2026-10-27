const fs = require('node:fs');

const SLOT_COUNT = 6;

const DEFAULT_SETTINGS = {
  mode: 'standard', // 'standard' | 'fusion'
  animated: true, // GIF vs PNG
  shiny: false, // forces every slot shiny
  style: 'pixel', // PNG style: 'pixel' | 'home' | 'artwork' | 'local'
  language: 'en', // 'en' | 'de'
  layout: 'row', // 'row' | 'column' | 'grid3' | 'grid2'
  size: 128, // slot size in px
  showNames: true,
  showFrame: true,
  emptySlots: 'pokeball', // 'pokeball' | 'frame' | 'hidden'
  fusionShinyHue: 120, // hue rotation (deg) used to fake shiny fusions
};

const EMPTY_SLOT = { id: null, head: null, body: null, shiny: false, nickname: '' };

const ENUMS = {
  mode: ['standard', 'fusion'],
  style: ['pixel', 'home', 'artwork', 'local'],
  language: ['en', 'de'],
  layout: ['row', 'column', 'grid3', 'grid2'],
  emptySlots: ['pokeball', 'frame', 'hidden'],
};

function int(value, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function sanitizeSettings(input = {}) {
  const out = { ...DEFAULT_SETTINGS };
  for (const [key, allowed] of Object.entries(ENUMS)) {
    if (allowed.includes(input[key])) out[key] = input[key];
  }
  for (const key of ['animated', 'shiny', 'showNames', 'showFrame']) {
    if (typeof input[key] === 'boolean') out[key] = input[key];
  }
  out.size = int(input.size, 48, 512) ?? DEFAULT_SETTINGS.size;
  out.fusionShinyHue = int(input.fusionShinyHue, 0, 359) ?? DEFAULT_SETTINGS.fusionShinyHue;
  return out;
}

function sanitizeSlot(input = {}) {
  return {
    id: int(input.id, 1, 99999), // PokeAPI id (standard mode)
    head: int(input.head, 1, 9999), // fusion dex id (fusion mode)
    body: int(input.body, 1, 9999),
    shiny: input.shiny === true,
    nickname: typeof input.nickname === 'string' ? input.nickname.slice(0, 24) : '',
  };
}

function sanitizeSlots(input) {
  const slots = Array.isArray(input) ? input : [];
  return Array.from({ length: SLOT_COUNT }, (_, i) => sanitizeSlot(slots[i] ?? EMPTY_SLOT));
}

function sanitize(input = {}) {
  return { settings: sanitizeSettings(input.settings), slots: sanitizeSlots(input.slots) };
}

// Holds the team state, persists it to disk and notifies listeners on change.
function createStore(filePath) {
  let state;
  try {
    state = sanitize(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    state = sanitize();
  }

  const listeners = new Set();
  let saveTimer = null;

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      fs.writeFile(filePath, JSON.stringify(state, null, 2), (err) => {
        if (err) console.error(`Could not save state: ${err.message}`);
      });
    }, 250);
  }

  return {
    get: () => state,
    set(next) {
      state = sanitize(next);
      persist();
      for (const fn of listeners) fn(state);
      return state;
    },
    onChange(fn) {
      listeners.add(fn);
    },
  };
}

module.exports = { createStore, sanitize, sanitizeSlots };
