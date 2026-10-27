# Pokémon Stream Team

Show your current Pokémon party on stream. Pick each slot from a searchable dropdown in a
control panel and the OBS overlay updates live. Built for randomizer and Nuzlocke runs, and it
supports **Pokémon Infinite Fusion**.

- 6 party slots, each with a searchable dropdown of every Pokémon and every form that looks
  different (1315; by English or German name or dex number)
- **GIF** (animated: smooth 3D renders or Gen 5 pixel style) or **PNG** sprites (Pixel, HOME 3D,
  official artwork, or your own icon pack)
- **Shiny** per slot, or all slots at once
- **Infinite Fusion mode**: pick head and body, then any community custom sprite variant (with
  artist credit) or the auto-generated one; official fusion names
- **Horizontal or vertical** party, in 1–3 rows or columns
- **Single-slot sources**: one OBS source per slot (sprite or name) to build your own layout
- Nicknames, drag & drop reordering, saved teams, size, frames, names and empty-slot style
- All sprites are cached on disk, and the party's normal, shiny, GIF and PNG variants are
  downloaded in advance, so toggling shiny or GIF/PNG on stream is instant

## Requirements

[Node.js](https://nodejs.org) 20 or newer. There are no other dependencies and no `npm install` step.

## Start

Double-click `start.bat`, or run:

```sh
npm start
```

Then open the control panel at <http://localhost:8642/control>.

## OBS setup

1. **Overlay**: add a *Browser* source with URL `http://localhost:8642/overlay`. The background
   is transparent. Make it large enough for your layout, e.g. 900×180 for 1×6 at 128 px.
2. **Control panel inside OBS** (optional): go to *Docks → Custom Browser Docks…* and add
   `http://localhost:8642/control`.

### Build your own layout from single slots

The **OBS sources** panel in the control panel lists copyable URLs for every source:

| Source | URL |
|--------|-----|
| Full party | `/overlay` |
| One slot's sprite | `/overlay?slot=3` (bare sprite that fills the whole browser source) |
| One slot's name | `/overlay?slot=3&only=name` (plain text) |

Put the slot sources wherever you like on your own frame graphics. Restyle the name text with
the browser source's *Custom CSS* field, e.g. `.name-source { color: gold; font-family: Arial; }`.

### URL parameters

Any overlay URL can override the shared settings, so different scenes can show the party differently:

| Parameter   | Values |
|-------------|--------|
| `direction` | `horizontal`, `vertical` |
| `lines`     | `1`, `2`, `3` (rows when horizontal, columns when vertical) |
| `size`      | slot size in px (full party only) |
| `names`     | `0` / `1` (single slots default to `0`) |
| `frame`     | `0` / `1` (single slots default to `0`) |
| `empty`     | `pokeball`, `frame`, `hidden` |
| `slot`      | `1`–`6`: show only that slot |
| `only`      | `name` (with `slot`): show only the name as text |
| `font`      | font size in px for name sources (default 32) |
| `align`     | `left`, `center`, `right` for name sources |

Example, a vertical two-column bar without names: `/overlay?direction=vertical&lines=2&names=0`

## Configuration

`config.json` is created on first start:

```json
{
  "port": 8642,
  "host": "127.0.0.1",
  "localIconDir": "E:/Streaming/Stream Overlay/Pokemon Icons/SVGs"
}
```

- `localIconDir`: a folder with `1x/`, `2x/` and `3x/` subfolders named like `025-pikachu.png` /
  `025-pikachu-shiny@3x.png`. This enables the **My icons** style.
- `host`: set to `"0.0.0.0"` to control the team from your phone or a second PC on your network.

## Sprite sources

| Mode | Source |
|------|--------|
| GIF, 3D | [Pokémon Showdown](https://play.pokemonshowdown.com/sprites/ani/) animated 3D renders |
| GIF, Pixel | [PokeAPI sprites](https://github.com/PokeAPI/sprites): Gen 5 style animations |
| PNG | PokeAPI: front sprites, HOME renders or official artwork |
| Infinite Fusion | [Infinite Fusion Dex](https://infinitefusiondex.com) CDN: custom art variants or the auto-generated fusion |

Every GIF falls back to the other GIF style and then to PNG when a Pokémon has no animation
(e.g. the newest Gen 9 Pokémon have no 3D GIFs yet). Showdown's server can take ~20 s the first
time a sprite is requested; the overlay shows the fallback meanwhile and swaps the 3D GIF in once
it has downloaded. After that it is served from the local cache.

In Infinite Fusion mode the dropdowns list the 576 Pokémon the game contains, numbered by the
game's own fusion dex. Standard mode lists all 1351 Pokémon and forms.

Infinite Fusion has no separate shiny sprites (the game recolours them), so shiny fusions are
approximated with a hue shift. You can adjust it with the *Shiny hue* slider.

## Updating the Pokémon lists

`data/pokedex.json` (PokeAPI, English + German names, Showdown sprite ids) and `data/fusion-dex.json` (Infinite Fusion
dex numbers) are bundled snapshots. Forms whose sprite is pixel-identical to another form of
the same Pokémon (totems, Minior's meteor colours, Pumpkaboo sizes...) or that have no sprite
(Koraidon/Miraidon modes) are marked `hidden` and left out of the dropdown. Refresh the
snapshots after a new game or fusion release:

```sh
npm run update-data
```

## Project layout

```
server/        Node HTTP server: state + live updates (SSE), sprite cache proxy, saved teams
public/        control panel and overlay (plain HTML/CSS/JS modules)
data/          bundled Pokédex snapshots
scripts/       data snapshot generator
```

Local files that are not committed: `config.json`, `state.json` (current party), `teams.json`
(saved teams), `cache/` (downloaded sprites).

## History

Version 1 (2021) was a Java Swing app that wrote `1.png`…`6.png` into a folder for OBS image
sources. Version 2 is a rewrite as a live browser overlay.
