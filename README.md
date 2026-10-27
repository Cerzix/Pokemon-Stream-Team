# Pokémon Stream Team

Show your current Pokémon party on stream. Pick each slot from a searchable dropdown in a
control panel and the OBS overlay updates live. Built for randomizer and Nuzlocke runs, and it
supports **Pokémon Infinite Fusion**.

- 6 party slots, each with a searchable dropdown (by name, English or German, or dex number)
- **GIF** (animated) or **PNG** sprites, with Pixel, HOME 3D, official artwork or your own icon pack
- **Shiny** per slot, or all slots at once
- **Infinite Fusion mode**: pick head and body, using community custom sprites with auto-generated fallback
- Nicknames, drag & drop reordering, saved teams
- Layouts 1×6, 3×2, 2×3 and 6×1, plus size, frames, names and empty-slot style
- All sprites are cached on disk, so the overlay keeps working when GitHub or the CDN is slow

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

Each overlay can override the shared layout with URL parameters, for example a second, vertical
party bar in another scene:

```
http://localhost:8642/overlay?layout=column&size=96&names=0&frame=0
```

| Parameter | Values |
|-----------|--------|
| `layout`  | `row`, `grid3`, `grid2`, `column` |
| `size`    | slot size in px |
| `names`   | `0` / `1` |
| `frame`   | `0` / `1` |

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
| GIF | [PokeAPI sprites](https://github.com/PokeAPI/sprites): Showdown animations, falling back to Black/White animations, then PNG |
| PNG | PokeAPI: front sprites, HOME renders or official artwork |
| Infinite Fusion | [Infinite Fusion Dex](https://infinitefusiondex.com) CDN: custom art, falling back to the auto-generated fusion |

Infinite Fusion has no separate shiny sprites (the game recolours them), so shiny fusions are
approximated with a hue shift. You can adjust it with the *Shiny hue* slider.

## Updating the Pokémon lists

`data/pokedex.json` (PokeAPI, English + German names) and `data/fusion-dex.json` (Infinite Fusion
dex numbers) are bundled snapshots. Refresh them after a new game or fusion release:

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
