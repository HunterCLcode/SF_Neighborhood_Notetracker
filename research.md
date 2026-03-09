# SF Neighborhood Picker — Research & Implementation Plan

## Overview

A single-page web app (HTML/CSS/JS, no backend) that lets a user explore San Francisco neighborhoods on an interactive map, write notes on each neighborhood, and cross off neighborhoods they've eliminated from consideration. State is persisted to `localStorage` so notes and eliminations survive page refreshes.

---

## Tech Stack

| Concern | Choice | Reason |
|---|---|---|
| App type | Static web app (HTML/CSS/JS) | No server needed, runs from file system or simple HTTP server |
| Map library | **Leaflet.js 1.9.x** (CDN) | Free, lightweight, excellent GeoJSON support, no API key |
| Tile layer | **OpenStreetMap** (via Leaflet default CDN) | Free, no API key, good detail level |
| Neighborhood boundaries | **SF Open Data GeoJSON** (fetched at runtime) | Official city data, free, public CORS-enabled API |
| State persistence | **localStorage** | Simple key/value store, survives page reload, no backend |
| Styling | Plain CSS (no framework) | No build tools needed, keeps project simple |

---

## File Structure

```
sanfran_planning/
├── index.html        ← App shell, imports CSS/JS, defines layout HTML
├── styles.css        ← All visual styling
├── app.js            ← All application logic
└── research.md       ← This file
```

No build step. No package.json. Open `index.html` directly in a browser or serve with `python -m http.server 8080`.

---

## SF Neighborhood GeoJSON Data

### Source
**SF Open Data — Analysis Neighborhoods**
- URL: `https://data.sfgov.org/api/geojson?method=export&type=GeoJSON&id=p5b7-5n3h`
- ~41 neighborhoods (district-level, practical granularity for this use case)
- Contains polygon geometry + `nhood` property (neighborhood name string)
- CORS headers are enabled — can be fetched from `file://` or any origin
- No API key required

### Why not the other SF neighborhood dataset?
SF Open Data also has a finer-grained dataset with ~117 micro-neighborhoods. That's too granular for a "pick where to live" tool. The ~41 analysis neighborhoods map to what people actually mean when they say "the Mission" or "Noe Valley."

### Fetch strategy in app.js
```js
const GEOJSON_URL = "https://data.sfgov.org/api/geojson?method=export&type=GeoJSON&id=p5b7-5n3h";

async function loadNeighborhoods() {
  const res = await fetch(GEOJSON_URL);
  if (!res.ok) throw new Error(`Failed to load GeoJSON: ${res.status}`);
  return res.json();
}
```

If the fetch fails (offline, API down), show a visible error banner and disable map interaction.

---

## Layout Design

### Visual Layout (Desktop)

```
┌─────────────────────────────────────────────────────────────┐
│  SF Neighborhood Picker                             [header] │
├────────────────────────────────────┬────────────────────────┤
│                                    │  SIDE PANEL             │
│                                    │  ─────────────────────  │
│          LEAFLET MAP               │  [ Search/filter... ]   │
│                                    │                         │
│   (scrollable, zoomable SF map     │  ○ Castro               │
│    with neighborhood polygons)     │  ○ Chinatown            │
│                                    │  ✗ Civic Center  (X'd)  │
│   Click any polygon to select      │  ○ Cole Valley          │
│   a neighborhood                   │  ● Haight Ashbury  ◀ selected│
│                                    │    ┌──────────────────┐ │
│                                    │    │ Notes:           │ │
│                                    │    │ Great vibes,     │ │
│                                    │    │ close to park    │ │
│                                    │    └──────────────────┘ │
│                                    │  ○ Inner Richmond       │
│                                    │  ...                    │
└────────────────────────────────────┴────────────────────────┘
```

### Proportions
- Map panel: **65%** of viewport width
- Side panel: **35%** of viewport width
- Both panels: **100vh** height (full browser window height)
- Side panel: `overflow-y: scroll` — independently scrollable
- Map panel: Leaflet handles its own scroll/zoom

### Responsive consideration
On narrow screens (< 768px), stack vertically: map on top (50vh), side panel below (50vh).

---

## State Model

All state lives in a single JS object and is serialized to `localStorage`.

```js
const state = {
  selected: null,        // string | null — currently selected neighborhood name
  notes: {},             // { [neighborhoodName: string]: string }
  crossedOff: {},        // { [neighborhoodName: string]: boolean }
};

const STORAGE_KEY = "sf_picker_state";

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const saved = JSON.parse(raw);
    state.notes = saved.notes || {};
    state.crossedOff = saved.crossedOff || {};
    // Do NOT restore `selected` — always start with no selection
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    notes: state.notes,
    crossedOff: state.crossedOff,
  }));
}
```

`selected` is intentionally not persisted — the user starts fresh each session with no neighborhood highlighted.

---

## Leaflet Map Integration

### Initialization
```js
const map = L.map("map-container").setView([37.7749, -122.4194], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 18,
}).addTo(map);
```

Center `[37.7749, -122.4194]` is downtown SF. Zoom level 12 shows the entire city comfortably.

### GeoJSON Layer
```js
let geoLayer; // module-level reference to update styles later

function addNeighborhoodLayer(geojson) {
  geoLayer = L.geoJSON(geojson, {
    style: styleFeature,
    onEachFeature: (feature, layer) => {
      const name = feature.properties.nhood;
      layer.on("click", () => selectNeighborhood(name));
      layer.on("mouseover", () => {
        if (state.selected !== name) layer.setStyle(STYLES.hover);
      });
      layer.on("mouseout", () => {
        geoLayer.resetStyle(layer);
      });
    },
  }).addTo(map);
}
```

### Style Function
```js
const STYLES = {
  default:    { color: "#3388ff", weight: 1.5, fillOpacity: 0.15, fillColor: "#3388ff" },
  selected:   { color: "#ff6600", weight: 3,   fillOpacity: 0.40, fillColor: "#ff8800" },
  crossedOff: { color: "#aaaaaa", weight: 1,   fillOpacity: 0.30, fillColor: "#cccccc" },
  hover:      { color: "#3388ff", weight: 2.5, fillOpacity: 0.30, fillColor: "#3388ff" },
};

function styleFeature(feature) {
  const name = feature.properties.nhood;
  if (state.crossedOff[name]) return STYLES.crossedOff;
  if (state.selected === name) return STYLES.selected;
  return STYLES.default;
}

function refreshMapStyles() {
  if (geoLayer) geoLayer.setStyle(styleFeature);
}
```

---

## Core Functions (app.js)

| Function | Purpose |
|---|---|
| `init()` | Entry point: loadState → initMap → loadNeighborhoods → renderSidePanel |
| `initMap()` | Create Leaflet map, add tile layer |
| `loadNeighborhoods()` | Fetch GeoJSON, call `addNeighborhoodLayer()`, extract neighborhood name list |
| `addNeighborhoodLayer(geojson)` | Create Leaflet GeoJSON layer with styles and click handlers |
| `selectNeighborhood(name)` | Update `state.selected`, refresh map styles, scroll side panel to neighborhood, expand notes |
| `toggleCrossOff(name)` | Flip `state.crossedOff[name]`, saveState, refresh map styles, re-render side panel item |
| `saveNote(name, text)` | Update `state.notes[name]`, saveState (debounced) |
| `renderSidePanel(names)` | Build the full neighborhood list HTML |
| `scrollToNeighborhood(name)` | Scroll the side panel so the selected neighborhood is visible |
| `panMapTo(name)` | Pan/zoom map to the selected neighborhood's bounds |
| `styleFeature(feature)` | Return Leaflet style object based on current state |
| `refreshMapStyles()` | Re-apply styleFeature to entire GeoJSON layer |
| `loadState()` / `saveState()` | localStorage read/write |
| `debounce(fn, ms)` | Utility to debounce note-saving on keyup |

---

## Side Panel UX Details

### Neighborhood List Item
Each neighborhood renders as:
```
[ ✗ ] Mission                        ← cross-off button (toggle)
      ┌────────────────────────────┐
      │ Notes: (textarea, hidden   │  ← only shown when selected
      │ unless this neighborhood   │
      │ is selected)               │
      └────────────────────────────┘
```

- **Cross-off button**: clicking it toggles the crossed-off state. When crossed off:
  - Neighborhood name gets CSS `text-decoration: line-through; opacity: 0.5`
  - Map polygon turns gray
  - Neighborhood moves to a "Crossed Off" section at the bottom of the list (optional — discuss below)

- **Selection**: clicking anywhere on the neighborhood row (except the cross-off button) selects it. The notes textarea expands inline below the name.

- **Notes**: Auto-save on keyup (debounced 500ms). Notes persist to localStorage.

### Optional: Separate "Crossed Off" Section
Two layout options for crossed-off neighborhoods:

**Option A** (simpler): Crossed-off neighborhoods stay in their alphabetical position but are visually dimmed with strikethrough.

**Option B** (cleaner): Crossed-off neighborhoods collapse to a "Eliminated (N)" section at the bottom, expandable.

**Recommendation**: Start with Option A (simpler), can upgrade to B later.

### Search/Filter Bar
A simple text input at the top of the side panel that filters the neighborhood list by name. Not persisted. Pure string `.includes()` match.

---

## Visual Design

### Color Scheme
- Background: `#1a1a2e` (dark navy) or light gray `#f5f5f5` — pick based on preference
- Map panel: handled by Leaflet/OSM tiles
- Side panel: white background, subtle border-left
- Selected neighborhood row: light orange tint `#fff3e0`
- Crossed-off row: `opacity: 0.5`, `text-decoration: line-through`
- Cross-off button: red X icon (unicode ✕ or × character, styled as a button)
- Notes textarea: full width, resizable vertically, subtle border

### Fonts
System font stack — no external font needed:
```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

---

## HTML Structure (index.html sketch)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SF Neighborhood Picker</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div id="app">
    <header id="app-header">
      <h1>SF Neighborhood Picker</h1>
    </header>
    <div id="main">
      <div id="map-container"></div>
      <aside id="side-panel">
        <input type="text" id="search" placeholder="Filter neighborhoods..." />
        <div id="neighborhood-list">
          <!-- rendered by app.js -->
        </div>
      </aside>
    </div>
  </div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

---

## CSS Layout Approach

```css
* { box-sizing: border-box; margin: 0; padding: 0; }

body, html { height: 100%; overflow: hidden; }

#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

#app-header {
  height: 50px;
  flex-shrink: 0;
  /* title bar */
}

#main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

#map-container {
  flex: 65;          /* 65% */
  height: 100%;
}

#side-panel {
  flex: 35;          /* 35% */
  height: 100%;
  overflow-y: auto;
  border-left: 1px solid #ddd;
}
```

---

## Interaction Flow

### Selecting a neighborhood via map click
1. User clicks polygon on map
2. `layer.on("click")` fires → `selectNeighborhood(name)`
3. `state.selected = name`
4. `refreshMapStyles()` → selected polygon turns orange, previous deselects
5. `renderSidePanel()` or just update DOM to expand notes for `name`
6. `scrollToNeighborhood(name)` → side panel scrolls to the item

### Selecting a neighborhood via side panel click
1. User clicks neighborhood row in side panel
2. `selectNeighborhood(name)` fires
3. Same as above steps 3-5
4. Additionally: `panMapTo(name)` → Leaflet pans to the neighborhood's bounding box

### Crossing off a neighborhood
1. User clicks the ✕ button on a side panel row
2. `toggleCrossOff(name)` fires
3. `state.crossedOff[name] = !state.crossedOff[name]`
4. `saveState()`
5. `refreshMapStyles()` → polygon turns gray (or back to blue)
6. Update that row's CSS classes (strikethrough / normal)

### Writing notes
1. User selects a neighborhood (notes textarea visible)
2. User types in textarea
3. `textarea.addEventListener("input", debounce(() => saveNote(name, textarea.value), 500))`
4. `state.notes[name] = text` → `saveState()`

---

## Error Handling

| Scenario | Behavior |
|---|---|
| GeoJSON fetch fails (offline) | Show error banner: "Could not load map data. Check your internet connection." |
| localStorage unavailable | Silently degrade — notes won't persist, no crash |
| Unknown neighborhood in saved state | Ignored (stale data cleaned on first interaction) |

---

## Running the App

### Option 1: Open directly (simplest)
Double-click `index.html` or drag into browser. Works for CDN resources (Leaflet). The GeoJSON fetch from `data.sfgov.org` should also work since it's an external HTTPS URL.

### Option 2: Local HTTP server (recommended)
```bash
# Python
python -m http.server 8080

# Node (if npx available)
npx serve .
```
Then open `http://localhost:8080`.

---

## Implementation Order

1. **index.html** — skeleton layout with Leaflet CDN imports
2. **styles.css** — two-panel layout, side panel list styles, crossed-off styles
3. **app.js** — in this order:
   a. State model + localStorage helpers
   b. `initMap()` — Leaflet setup
   c. `loadNeighborhoods()` — fetch GeoJSON + `addNeighborhoodLayer()`
   d. `renderSidePanel()` — build neighborhood list HTML
   e. `selectNeighborhood()` — wire up map ↔ side panel interaction
   f. `toggleCrossOff()` — cross-off logic
   g. `saveNote()` + debounce — note persistence
   h. Polish: search filter, scroll-to, pan-to, error banner

---

## Open Questions / Future Enhancements

- **Ratings**: Add a 1-5 star rating per neighborhood alongside notes
- **Color coding by status**: Custom color per neighborhood (e.g., green = top pick, yellow = maybe, red = eliminated)
- **Export**: Download notes as JSON or Markdown
- **Comparison view**: Side-by-side two neighborhood notes
- **Map labels**: Toggle neighborhood name labels on the map polygons
- **Collapsed "Eliminated" section**: Move crossed-off neighborhoods to a collapsible section at bottom of side panel
