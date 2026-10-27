import {
  loadData, subscribe, slotSprites, slotName, isShiny, spriteFilter, isPixelArt, setSprite, pad,
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
  return data.pokedex.map((p) => ({
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
    update((s) => (s.settings[seg.dataset.setting] = parseSettingValue(button.dataset.value)));
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
  update((s) => s.slots.forEach((slot, i) => (s.slots[i] = { id: null, head: null, body: null, shiny: false, nickname: '' })));
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
  // PNG styles do nothing while GIFs are on (except as a fallback for missing GIFs).
  document.querySelector('[data-setting=style]').closest('.field').style.opacity = settings.animated ? 0.55 : 1;
}

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
      onSelect: (value) => update((s) => (s.slots[index][field] = value)),
    });
  });

  el.querySelector('.shiny-btn').addEventListener('click', () => update((s) => (s.slots[index].shiny = !s.slots[index].shiny)));
  el.querySelector('.clear-btn').addEventListener('click', () =>
    update((s) => (s.slots[index] = { id: null, head: null, body: null, shiny: false, nickname: '' })),
  );
  el.querySelector('.swap-btn').addEventListener('click', () =>
    update((s) => {
      const slot = s.slots[index];
      if (!slot.body) return;
      [slot.head, slot.body] = [slot.body, slot.head];
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
  return { el, pickers, nickname, preview: el.querySelector('.preview'), sprite: el.querySelector('.sprite') };
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
    card.preview.classList.toggle('pixel', isPixelArt(settings));
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
