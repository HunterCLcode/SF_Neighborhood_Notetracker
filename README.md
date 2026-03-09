# SF Neighborhood Picker

An interactive, zero-backend web app for exploring and evaluating San Francisco neighborhoods. Click polygons on a dark map, write notes on each neighborhood, and eliminate ones you've ruled out — all without creating an account or touching a server.

---

## Overview

Built for anyone apartment or house hunting in SF who wants a visual way to narrow down neighborhoods. The full city is rendered as clickable polygons on a dark map. A side panel lists every neighborhood alphabetically with a live count of how many you have remaining vs. eliminated.

Key behaviors:
- **Click a neighborhood** on the map or in the side panel to select it and open a notes field
- **Eliminate** a neighborhood with the ✕ button — it turns red on the map and moves to an "Eliminated" section at the bottom of the list
- **Restore** any eliminated neighborhood by clicking the ↩ button
- **Notes auto-save** as you type (debounced 450ms) and persist across page refreshes via `localStorage`
- A small **blue dot** appears next to any neighborhood that has notes
- **Search bar** filters the list in real time

---

## How to Run

No build step, no install, no API key.

**Option 1 — Open directly in browser (simplest)**

Double-click `index.html` or drag it into your browser. All assets are local so it works from `file://` with no server.

**Option 2 — Local HTTP server (recommended)**

```bash
# Python
python -m http.server 8080

# Node
npx serve .
```

Then open `http://localhost:8080` in your browser.

---

## How to Use

| Action | How |
|---|---|
| Select a neighborhood | Click its polygon on the map, or click its row in the side panel |
| Write notes | Select a neighborhood — a notes field appears below its name. Notes save automatically. |
| Eliminate a neighborhood | Click the **✕** button on any row |
| Restore an eliminated neighborhood | Click the **↩** button in the Eliminated section |
| Search | Type in the search bar at the top of the side panel |
| Pan map to a neighborhood | Click its row in the side panel |

Your notes and eliminations are saved automatically in your browser's `localStorage` and persist between sessions. No account needed.

---

## Tech Stack

| Concern | Technology |
|---|---|
| App type | Static HTML/CSS/JS — no server, no build step |
| Map | [Leaflet.js 1.9.x](https://leafletjs.com/) — lightweight, no API key required |
| Map tiles | [CARTO Dark Matter](https://carto.com/basemaps/) via OpenStreetMap data |
| Neighborhood boundaries | SF GeoJSON bundled locally (`sf_neighborhoods_data.js`) — works offline, no CORS issues |
| State persistence | Browser `localStorage` |
| Fonts | [Inter](https://fonts.google.com/specimen/Inter) + [Barlow Condensed](https://fonts.google.com/specimen/Barlow+Condensed) via Google Fonts |
| Styling | Plain CSS, no framework |

---

## File Structure

```
sanfran_planning/
├── index.html               — App shell and layout
├── styles.css               — All visual styling (dark theme)
├── app.js                   — All application logic
├── sf_neighborhoods_data.js — Bundled GeoJSON neighborhood boundaries
├── leaflet.js               — Leaflet map library (local copy)
└── leaflet.css              — Leaflet styles (local copy)
```

---

## Notes on Data

Neighborhood boundaries come from the [SF Open Data Analysis Neighborhoods dataset](https://data.sfgov.org/), which covers ~41 district-level neighborhoods. This is the practical granularity for a "pick where to live" tool — it maps to what people actually mean when they say "the Mission" or "Noe Valley," rather than the ~117 micro-neighborhood breakdown also available.

The GeoJSON is bundled as a local JS file so the app works from `file://` without any network requests for map data.
