#!/usr/bin/env node
// Regenerates the bundled data snapshots in data/:
//   pokedex.json     - every Pokemon/form from PokeAPI with English + German names and Showdown sprite ids
//   fusion-dex.json  - the Pokemon Infinite Fusion dex (fusion id <-> national id)
// Run with `npm run update-data` when a new game/fusion release adds Pokemon.

const fs = require('node:fs/promises');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const GRAPHQL = 'https://beta.pokeapi.co/graphql/v1beta';
const REST = 'https://pokeapi.co/api/v2';
const SHOWDOWN_DEX = 'https://play.pokemonshowdown.com/data/pokedex.json';
const FUSION_DEX_PAGE = 'https://infinitefusiondex.com/pokedex';
const LANG = { en: 9, de: 6 };
const USER_AGENT = 'Mozilla/5.0 PokemonStreamTeam';

async function graphql(query) {
  const res = await fetch(GRAPHQL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`PokeAPI GraphQL: HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors) throw new Error(`PokeAPI GraphQL: ${JSON.stringify(body.errors)}`);
  return body.data;
}

function titleCase(slug) {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function buildPokedex() {
  const data = await graphql(`{
    pokemon: pokemon_v2_pokemon(order_by: {id: asc}) {
      id name is_default pokemon_species_id
      forms: pokemon_v2_pokemonforms(limit: 1) {
        names: pokemon_v2_pokemonformnames(where: {language_id: {_in: [${LANG.en}, ${LANG.de}]}}) { language_id pokemon_name name }
      }
    }
    species: pokemon_v2_pokemonspeciesname(where: {language_id: {_in: [${LANG.en}, ${LANG.de}]}}) {
      pokemon_species_id language_id name
    }
  }`);

  const speciesNames = new Map();
  for (const s of data.species) {
    const entry = speciesNames.get(s.pokemon_species_id) ?? {};
    entry[s.language_id === LANG.de ? 'de' : 'en'] = s.name;
    speciesNames.set(s.pokemon_species_id, entry);
  }

  const entries = data.pokemon.map((p) => {
    const species = speciesNames.get(p.pokemon_species_id) ?? {};
    const formNames = p.forms[0]?.names ?? [];
    const formName = (lang) => {
      const f = formNames.find((n) => n.language_id === LANG[lang]);
      return f?.pokemon_name || null;
    };
    const en = p.is_default ? species.en : formName('en') ?? titleCase(p.name);
    const de = p.is_default ? species.de : formName('de') ?? en;
    return {
      id: p.id,
      slug: p.name,
      species: p.pokemon_species_id,
      name: { en: en ?? titleCase(p.name), de: de ?? en ?? titleCase(p.name) },
    };
  });

  // The GraphQL mirror lags behind the REST API, so pick up any newer forms from REST.
  const known = new Set(entries.map((e) => e.id));
  const rest = await (await fetch(`${REST}/pokemon?limit=100000`)).json();
  for (const { name, url } of rest.results) {
    const id = Number(url.match(/\/(\d+)\/$/)[1]);
    if (known.has(id)) continue;
    const detail = await (await fetch(url)).json();
    const species = Number(detail.species.url.match(/\/(\d+)\/$/)[1]);
    const base = speciesNames.get(species) ?? {};
    const suffix = titleCase(name.replace(detail.species.name, '').replace(/^-/, ''));
    const label = (n) => (n ? (suffix ? `${n} (${suffix})` : n) : titleCase(name));
    entries.push({ id, slug: name, species, name: { en: label(base.en), de: label(base.de ?? base.en) } });
  }
  return entries.sort((a, b) => a.id - b.id);
}

// Showdown's server sits behind Cloudflare and intermittently answers 522.
async function fetchJsonWithRetry(url, attempts = 5) {
  for (let i = 1; ; i++) {
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } }).catch((err) => ({ ok: false, status: err.message }));
    if (res.ok) return res.json();
    if (i >= attempts) throw new Error(`${url}: HTTP ${res.status}`);
    console.log(`  ${url}: HTTP ${res.status}, retrying (${i}/${attempts - 1})…`);
    await new Promise((r) => setTimeout(r, 2000 * i));
  }
}

const toId =(text) => String(text).toLowerCase().replace(/[^a-z0-9]/g, '');

// Adds `sd`: the Pokemon Showdown sprite id (e.g. "charizard-megax") used for the 3D animated GIFs.
async function addShowdownIds(entries) {
  const dex = await fetchJsonWithRetry(SHOWDOWN_DEX);
  const byNum = new Map(); // dex number -> [{ id, forme }]
  for (const p of Object.values(dex)) {
    if (p.num <= 0) continue;
    const base = toId(p.baseSpecies ?? p.name);
    const forme = p.forme ? toId(p.forme) : '';
    const list = byNum.get(p.num) ?? [];
    list.push({ id: forme ? `${base}-${forme}` : base, forme });
    byNum.set(p.num, list);
  }

  const defaults = new Map(entries.filter((e) => e.id === e.species).map((e) => [e.species, e]));
  for (const entry of entries) {
    const candidates = byNum.get(entry.species) ?? [];
    const base = candidates.find((c) => !c.forme);
    if (entry.id === entry.species) {
      entry.sd = base?.id ?? null;
      continue;
    }
    // Form suffix = what differs from the default form's slug ("giratina-altered" vs "giratina-origin").
    const defaultParts = (defaults.get(entry.species)?.slug ?? '').split('-');
    const parts = entry.slug.split('-');
    let i = 0;
    while (i < parts.length && parts[i] === defaultParts[i]) i++;
    const suffix = toId(parts.slice(Math.max(i, 1)).join(''));
    const match =
      candidates.find((c) => c.forme === suffix) ??
      candidates.find((c) => c.forme && (c.forme.startsWith(suffix) || suffix.startsWith(c.forme)));
    entry.sd = match?.id ?? null;
  }
  return entries;
}

async function buildFusionDex() {
  const res = await fetch(FUSION_DEX_PAGE, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Fusion dex: HTTP ${res.status}`);
  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Fusion dex: page layout changed, __NEXT_DATA__ not found');
  const list = JSON.parse(match[1]).props.pageProps.pokemon;
  return list
    .map((p) => ({ id: p.pokemon_id, nat: p.nat_id, name: p.real_name }))
    .sort((a, b) => a.id - b.id);
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const pokedex = await addShowdownIds(await buildPokedex());
  await fs.writeFile(path.join(DATA_DIR, 'pokedex.json'), JSON.stringify(pokedex));
  console.log(`pokedex.json: ${pokedex.length} entries`);

  const fusionDex = await buildFusionDex();
  await fs.writeFile(path.join(DATA_DIR, 'fusion-dex.json'), JSON.stringify(fusionDex));
  console.log(`fusion-dex.json: ${fusionDex.length} entries`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
