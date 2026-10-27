import {
  loadData, subscribe, slotSprites, slotName, isShiny, spriteFilter, setSprite, pad,
  fusionInfo, onFusionInfo, fusionKey, EMPTY_SLOT,
} from './shared.js';
import { Combobox, normalize } from './combobox.js';

const data = await loadData();
const slotsEl = document.getElementById('slots');
const template = document.getElementById('slot-template');

let state = null;
let saveTimer = null;
let pendingSave = false;
let optionsLanguage = null;
const cards = [];

// ---- dropdown options -------------------------------------------------------

function standardOptions(lang) {
  // Forms (ids 10001+) are listed right after their base species.
  const sorted = [...data.pokedex].sort((a, b) => a.species - b.species || a.id - b.id);
  return sorted.map((p) => ({
    value: p.id,
    no: p.species,
    label: p.name[lang] ?? p.name.en,
    icon: `/img/pokeapi/sprites/pokemon/${p.id}.png`,
    terms: [...new Set([p.name.en, p.name.de, p.slug])].map(normalize),
  }));
}

function fusionOptions(lang) {
  return data.fusionDex.map((f) => {
    const translated = data.byId.get(f.nat)?.name;
    const label = lang === 'de' && translated && !f.name.includes('(') ? translated.de : f.name;
    return {
      value: f.id,
      no: f.id,
      label,
      icon: `/img/pokeapi/sprites/pokemon/${f.nat}.png`,
      terms: [...new Set([f.name, translated?.en, translated?.de].filter(Boolean))].map(normalize),
    };
  });
}

// ---- state sync --------------------------------------------------------------

function update(mutator) {
  mutator(state);
  render();
  pendingSave = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await fetch('/api/state', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(state),
      });
    } finally {
      pendingSave = false;
    }
  }, 120);
}

subscribe(
  (incoming) => {
    // Our own edits echo back via SSE; ignore them while a save is still queued.
    if (pendingSave && state) return;
    state = incoming;
    render();
  },
  (online) => {
    const status = document.getElementById('status');
    status.textContent = online ? 'live' : 'offline';
    status.classList.toggle('live', online);
  },
);

// ---- settings bar ----------------------------------------------------------

function parseSettingValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw;
}

document.querySelectorAll('.seg[data-setting]').forEach((seg) => {
  seg.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-value]');
    if (!button || button.disabled) return;
    const value = 'number' in seg.dataset ? Number(button.dataset.value) : parseSettingValue(button.dataset.value);
    update((s) => (s.settings[seg.dataset.setting] = value));
  });
});
document.querySelectorAll('input[type=range][data-setting]').forEach((input) => {
  input.addEventListener('input', () => update((s) => (s.settings[input.dataset.setting] = Number(input.value))));
});
document.querySelectorAll('input[type=checkbox][data-setting]').forEach((input) => {
  input.addEventListener('change', () => update((s) => (s.settings[input.dataset.setting] = input.checked)));
});

const localButton = document.getElementById('style-local');
localButton.disabled = !data.localAvailable;
localButton.title = data.localAvailable
  ? 'Your old icon pack (localIconDir in config.json)'
  : 'Set "localIconDir" in config.json to use your own icon pack';

document.getElementById('copy-url').addEventListener('click', async (e) => {
  const url = `${location.origin}/overlay`;
  try {
    await navigator.clipboard.writeText(url);
    e.target.textContent = 'Copied!';
  } catch {
    prompt('Overlay URL for the OBS Browser Source:', url);
  }
  setTimeout(() => (e.target.textContent = 'Copy overlay URL'), 1500);
});

document.getElementById('clear-all').addEventListener('click', () => {
  if (!confirm('Remove all Pokémon from the party?')) return;
  update((s) => (s.slots = s.slots.map(() => ({ ...EMPTY_SLOT }))));
});

// ---- saved teams -------------------------------------------------------------

const teamSelect = document.getElementById('team-select');
let savedTeams = {};

function renderTeams(teams, selected = teamSelect.value) {
  savedTeams = teams;
  teamSelect.length = 1;
  for (const name of Object.keys(teams).sort((a, b) => a.localeCompare(b))) teamSelect.add(new Option(name, name));
  teamSelect.value = teams[selected] ? selected : '';
}

async function teamsRequest(method, name, body) {
  const res = await fetch(`/api/teams/${encodeURIComponent(name)}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  renderTeams(await res.json(), name);
}

fetch('/api/teams').then((r) => r.json()).then((t) => renderTeams(t));

document.getElementById('team-save').addEventListener('click', async () => {
  const name = prompt('Save the current party as:', teamSelect.value || '');
  if (!name?.trim()) return;
  if (savedTeams[name.trim()] && !confirm(`Overwrite "${name.trim()}"?`)) return;
  await teamsRequest('PUT', name.trim(), state.slots).catch((err) => alert(err.message));
});
document.getElementById('team-load').addEventListener('click', () => {
  const slots = savedTeams[teamSelect.value];
  if (slots) update((s) => (s.slots = structuredClone(slots)));
});
document.getElementById('team-delete').addEventListener('click', async () => {
  const name = teamSelect.value;
  if (!name || !confirm(`Delete saved team "${name}"?`)) return;
  await teamsRequest('DELETE', name).catch((err) => alert(err.message));
});

function renderSettings() {
  const { settings } = state;
  document.querySelectorAll('.seg[data-setting]').forEach((seg) => {
    const current = String(settings[seg.dataset.setting]);
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.value === current));
  });
  document.querySelectorAll('input[data-setting]').forEach((input) => {
    if (input.type === 'checkbox') input.checked = settings[input.dataset.setting];
    else if (document.activeElement !== input) input.value = settings[input.dataset.setting];
  });
  document.getElementById('size-out').textContent = `${settings.size}px`;
  document.getElementById('hue-out').textContent = `${settings.fusionShinyHue}°`;
  document.querySelectorAll('[data-hide-in]').forEach((el) => (el.hidden = el.dataset.hideIn === settings.mode));
  document.querySelectorAll('[data-show-in]').forEach((el) => (el.hidden = el.dataset.showIn !== settings.mode));
  document.querySelectorAll('[data-when]').forEach((el) => {
    const relevant = el.dataset.when === 'animated' ? settings.animated : !settings.animated;
    el.hidden = el.hidden || !relevant;
  });
  document.getElementById('lines-label').textContent = settings.direction === 'vertical' ? 'Columns' : 'Rows';
}

// ---- OBS source URLs -----------------------------------------------------------

function renderSources() {
  const base = `${location.origin}/overlay`;
  const sources = [['Full party', base]];
  for (let i = 1; i <= 6; i++) sources.push([`Slot ${i} sprite`, `${base}?slot=${i}`]);
  for (let i = 1; i <= 6; i++) sources.push([`Slot ${i} name`, `${base}?slot=${i}&only=name`]);

  const list = document.getElementById('source-list');
  for (const [label, url] of sources) {
    const row = document.createElement('div');
    row.className = 'source';
    row.innerHTML = '<b></b><code></code><button type="button" class="btn ghost">Copy</button>';
    row.querySelector('b').textContent = label;
    row.querySelector('code').textContent = url.replace(location.origin, '');
    row.querySelector('code').title = url;
    row.querySelector('button').addEventListener('click', (e) => copyText(url, e.target));
    list.append(row);
  }
}

async function copyText(text, button) {
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied!';
  } catch {
    prompt('Copy this URL:', text);
  }
  setTimeout(() => (button.textContent = original), 1500);
}

renderSources();

// ---- slot cards --------------------------------------------------------------

let dragFrom = null;

function createCard(index) {
  const el = template.content.firstElementChild.cloneNode(true);
  el.querySelector('.slot-no').textContent = `Slot ${index + 1}`;

  const pickers = {};
  el.querySelectorAll('.picker').forEach((host) => {
    const field = host.dataset.field;
    pickers[field] = new Combobox(host, {
      placeholder: host.dataset.placeholder,
      onSelect: (value) =>
        update((s) => {
          const slot = s.slots[index];
          if (slot[field] !== value && field !== 'id') slot.alt = null; // variants differ per fusion
          slot[field] = value;
        }),
    });
  });

  el.querySelector('.shiny-btn').addEventListener('click', () => update((s) => (s.slots[index].shiny = !s.slots[index].shiny)));
  el.querySelector('.clear-btn').addEventListener('click', () =>
    update((s) => (s.slots[index] = { ...EMPTY_SLOT })),
  );
  el.querySelector('.swap-btn').addEventListener('click', () =>
    update((s) => {
      const slot = s.slots[index];
      if (!slot.body) return;
      [slot.head, slot.body] = [slot.body, slot.head];
      slot.alt = null;
    }),
  );
  const nickname = el.querySelector('.nickname');
  nickname.addEventListener('input', () => update((s) => (s.slots[index].nickname = nickname.value)));

  // Drag & drop swaps two slots. Inputs inside the card must stay selectable.
  el.addEventListener('dragstart', (e) => {
    if (e.target.closest('input')) return e.preventDefault();
    dragFrom = index;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    cards.forEach((c) => c.el.classList.remove('drop-target'));
  });
  el.addEventListener('dragover', (e) => {
    if (dragFrom === null) return;
    e.preventDefault();
    el.classList.add('drop-target');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    const from = dragFrom;
    dragFrom = null;
    if (from === null || from === index) return;
    update((s) => ([s.slots[from], s.slots[index]] = [s.slots[index], s.slots[from]]));
  });

  slotsEl.append(el);
  const variants = el.querySelector('.variants');
  variants.querySelector('.variant-strip').addEventListener('click', (e) => {
    const button = e.target.closest('.variant');
    if (!button) return;
    const alt = button.dataset.alt === 'auto' ? null : button.dataset.alt;
    update((s) => (s.slots[index].alt = alt));
  });

  return { el, pickers, nickname, variants, sprite: el.querySelector('.sprite') };
}

// Thumbnail strip of every custom sprite for this fusion plus the auto-generated one.
function renderVariants(card, slot, settings) {
  const show = settings.mode === 'fusion' && Boolean(slot.head);
  card.variants.hidden = !show;
  if (!show) return;

  const key = fusionKey(slot.head, slot.body);
  const info = fusionInfo(slot.head, slot.body);
  const strip = card.variants.querySelector('.variant-strip');
  const stripKey = `${key}|${info ? 'ready' : 'loading'}`;

  if (strip.dataset.key !== stripKey) {
    strip.dataset.key = stripKey;
    if (!info) {
      strip.innerHTML = '<span class="loading">Loading sprite variants…</span>';
    } else {
      const options = info.alts.map((a) => ({
        alt: a.ext,
        src: `/img/fusion/custom/${info.key ?? key}${a.ext}.png`,
        tag: a.ext || 'main',
        title: `Custom sprite${a.artist ? ` by ${a.artist}` : ''}`,
      }));
      if (slot.body) {
        options.push({ alt: 'generated', src: `/img/fusion/generated/${key}.png`, tag: 'auto', title: 'Auto-generated sprite' });
      }
      strip.innerHTML = '';
      for (const o of options) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'variant';
        button.dataset.alt = o.alt;
        button.title = o.title;
        button.innerHTML = '<img loading="lazy" alt=""><span class="tag"></span>';
        button.querySelector('img').src = o.src;
        button.querySelector('.tag').textContent = o.tag;
        strip.append(button);
      }
      if (!options.length) strip.innerHTML = '<span class="loading">No sprites found for this combination.</span>';
    }
  }

  // With no explicit choice the overlay shows the main custom sprite, else the generated one.
  const customCount = info ? info.alts.length : 0;
  const effective = slot.alt ?? (customCount ? '' : 'generated');
  strip.querySelectorAll('.variant').forEach((b) => b.classList.toggle('on', b.dataset.alt === effective));
  const chosen = info?.alts.find((a) => a.ext === effective);
  card.variants.querySelector('.variant-info').textContent = !info
    ? ''
    : effective === 'generated'
      ? `auto-generated · ${customCount} custom`
      : `${customCount} custom${chosen?.artist ? ` · by ${chosen.artist}` : ''}`;
}

function renderSlots() {
  const { settings } = state;
  const fusion = settings.mode === 'fusion';

  if (optionsLanguage !== settings.language) {
    optionsLanguage = settings.language;
    const standard = standardOptions(settings.language);
    const fused = fusionOptions(settings.language);
    while (cards.length < state.slots.length) cards.push(createCard(cards.length));
    for (const card of cards) {
      card.pickers.id.setOptions(standard);
      card.pickers.head.setOptions(fused);
      card.pickers.body.setOptions(fused);
    }
  }

  state.slots.forEach((slot, i) => {
    const card = cards[i];
    card.pickers.id.setValue(slot.id);
    card.pickers.head.setValue(slot.head);
    card.pickers.body.setValue(slot.body);
    card.el.querySelector('[data-field=id]').hidden = fusion;
    card.el.querySelector('[data-field=head]').hidden = !fusion;
    card.el.querySelector('[data-field=body]').hidden = !fusion;
    card.el.querySelector('.swap-btn').hidden = !fusion;
    if (document.activeElement !== card.nickname) card.nickname.value = slot.nickname;

    const shinyBtn = card.el.querySelector('.shiny-btn');
    shinyBtn.classList.toggle('on', slot.shiny);
    shinyBtn.classList.toggle('forced', settings.shiny && !slot.shiny);
    shinyBtn.title = settings.shiny ? 'All slots are shiny (global setting)' : 'Shiny';

    setSprite(card.sprite, slotSprites(data, slot, settings));
    card.sprite.style.filter = spriteFilter(slot, settings);
    renderVariants(card, slot, settings);
    const name = slotName(data, slot, settings);
    const dex = fusion ? (slot.head ? `#${pad(slot.head)}${slot.body ? `/${pad(slot.body)}` : ''}` : '') : slot.id ? `#${pad(data.byId.get(slot.id)?.species ?? slot.id)}` : '';
    card.el.querySelector('.preview-name').textContent = name ? `${dex} ${name}${isShiny(slot, settings) ? ' ★' : ''}` : 'empty';
  });
}

function render() {
  if (!state) return;
  renderSettings();
  renderSlots();
}

onFusionInfo(render); // official fusion names and sprite variants arrive asynchronously
