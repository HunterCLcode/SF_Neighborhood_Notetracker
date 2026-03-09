'use strict';

// ── Config ────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sf_picker_v1';

// Property key in the GeoJSON features that holds the neighborhood name.
// Matches the Click That Hood dataset loaded via sf_neighborhoods_data.js.
const NAME_PROP = 'name';

// ── Map style constants ────────────────────────────────────────────────────────

const STYLES = {
  default: {
    color: '#4a9eff',
    weight: 1,
    fillOpacity: 0.08,
    fillColor: '#4a9eff',
  },
  hover: {
    color: '#74b8ff',
    weight: 2,
    fillOpacity: 0.25,
    fillColor: '#74b8ff',
  },
  selected: {
    color: '#4f8ef7',
    weight: 2.5,
    fillOpacity: 0.45,
    fillColor: '#4f8ef7',
  },
  crossedOff: {
    color: '#c0392b',
    weight: 1.5,
    fillOpacity: 0.30,
    fillColor: '#8b0000',
  },
};

// ── Application state ─────────────────────────────────────────────────────────

const state = {
  selected: null,          // string | null — currently selected neighborhood name
  notes: {},               // { [name]: string }
  crossedOff: {},          // { [name]: true }
  filter: '',              // current search string
  neighborhoodNames: [],   // sorted array of all neighborhood names
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.notes      = saved.notes      || {};
    state.crossedOff = saved.crossedOff || {};
  } catch (e) {
    console.warn('[sf-picker] Could not load saved state:', e);
  }
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ notes: state.notes, crossedOff: state.crossedOff })
    );
  } catch (e) {
    console.warn('[sf-picker] Could not save state:', e);
  }
}

// ── Map ───────────────────────────────────────────────────────────────────────

let map;
let geoLayer = null;
const layerMap = {};  // { neighborhoodName: L.Layer }

function initMap() {
  map = L.map('map-container', {
    center: [37.7749, -122.4358],
    zoom: 12,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' +
      ' &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);
}

function styleFeature(feature) {
  const name = feature.properties[NAME_PROP];
  if (state.crossedOff[name])  return STYLES.crossedOff;
  if (state.selected === name) return STYLES.selected;
  return STYLES.default;
}

function refreshMapStyles() {
  if (!geoLayer) return;
  geoLayer.setStyle(styleFeature);
  // Raise selected polygon to the top so its border is fully visible
  if (state.selected && layerMap[state.selected]) {
    layerMap[state.selected].bringToFront();
  }
}

function addNeighborhoodLayer(geojson) {
  geoLayer = L.geoJSON(geojson, {
    style: styleFeature,

    onEachFeature(feature, layer) {
      const name = feature.properties[NAME_PROP];
      if (!name) return;

      layerMap[name] = layer;

      // Hover tooltip
      layer.bindTooltip(name, {
        sticky: true,
        className: 'neighborhood-tooltip',
        direction: 'auto',
      });

      // Hover highlight (skip if already selected or crossed off)
      layer.on('mouseover', () => {
        if (state.selected !== name && !state.crossedOff[name]) {
          layer.setStyle(STYLES.hover);
        }
      });

      layer.on('mouseout', () => {
        if (state.selected !== name) {
          geoLayer.resetStyle(layer);
        }
      });

      // Click to select
      layer.on('click', () => {
        selectNeighborhood(name, /* fromMap */ true);
      });
    },
  }).addTo(map);
}

function panToNeighborhood(name) {
  const layer = layerMap[name];
  if (!layer) return;
  try {
    const bounds = layer.getBounds();
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  } catch (_) { /* ignore if bounds unavailable */ }
}

// ── Core actions ──────────────────────────────────────────────────────────────

/**
 * Select a neighborhood.
 * @param {string}  name     - Neighborhood name
 * @param {boolean} fromMap  - true when triggered by map click (skip pan)
 */
function selectNeighborhood(name, fromMap = false) {
  state.selected = name;
  refreshMapStyles();
  renderSidePanel();
  updateStats();

  if (!fromMap) {
    panToNeighborhood(name);
  }

  // Small timeout so the DOM has re-rendered before scrolling
  setTimeout(() => scrollToNeighborhood(name), 30);
}

/**
 * Toggle cross-off status for a neighborhood.
 */
function toggleCrossOff(name) {
  state.crossedOff[name] = !state.crossedOff[name];

  // Deselect if we just crossed off the currently selected neighborhood
  if (state.crossedOff[name] && state.selected === name) {
    state.selected = null;
  }

  saveState();
  refreshMapStyles();
  renderSidePanel();
  updateStats();
}

/**
 * Persist a note for a neighborhood.
 */
function saveNote(name, text) {
  if (text.trim() === '') {
    delete state.notes[name];
  } else {
    state.notes[name] = text;
  }
  saveState();

  // Update the notes-dot indicator without re-rendering the full list
  const item = getItemElement(name);
  if (item) {
    const dot = item.querySelector('.notes-dot');
    if (dot) dot.classList.toggle('has-notes', !!state.notes[name]);
  }
}

// ── Side panel rendering ──────────────────────────────────────────────────────

function renderSidePanel() {
  const list = document.getElementById('neighborhood-list');
  const filterLower = state.filter.toLowerCase().trim();

  // Apply search filter
  const visible = state.neighborhoodNames.filter(
    (n) => !filterLower || n.toLowerCase().includes(filterLower)
  );

  if (visible.length === 0) {
    list.innerHTML = '<div id="no-results">No neighborhoods match your search.</div>';
    return;
  }

  // Split into active and eliminated, maintain alphabetical order within each group
  const active     = visible.filter((n) => !state.crossedOff[n]);
  const eliminated = visible.filter((n) =>  state.crossedOff[n]);

  let html = '';

  active.forEach((name) => { html += buildItemHTML(name); });

  if (eliminated.length > 0) {
    html += `<div class="section-divider">Eliminated &mdash; ${eliminated.length}</div>`;
    eliminated.forEach((name) => { html += buildItemHTML(name); });
  }

  list.innerHTML = html;

  // ── Attach event listeners ──
  // Neighborhood row click → select
  list.querySelectorAll('.neighborhood-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.crossoff-btn')) return; // handled separately
      const name = row.closest('.neighborhood-item').dataset.name;
      selectNeighborhood(name, /* fromMap */ false);
    });
  });

  // Cross-off button click
  list.querySelectorAll('.crossoff-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = btn.closest('.neighborhood-item').dataset.name;
      toggleCrossOff(name);
    });
  });

  // Notes textarea → auto-save (debounced)
  list.querySelectorAll('textarea').forEach((ta) => {
    const item      = ta.closest('.neighborhood-item');
    const name      = item.dataset.name;
    const savedEl   = item.querySelector('.notes-saved-indicator');

    ta.addEventListener('input', debounce(() => {
      saveNote(name, ta.value);
      if (savedEl) {
        savedEl.textContent = 'Saved';
        setTimeout(() => { savedEl.textContent = ''; }, 1600);
      }
    }, 450));
  });
}

/**
 * Build the HTML string for one neighborhood list item.
 */
function buildItemHTML(name) {
  const isSelected   = state.selected === name;
  const isCrossedOff = !!state.crossedOff[name];
  const hasNotes     = !!state.notes[name];
  const noteText     = state.notes[name] || '';

  const classes = [
    'neighborhood-item',
    isSelected   ? 'selected'    : '',
    isCrossedOff ? 'crossed-off' : '',
  ].filter(Boolean).join(' ');

  const btnIcon  = isCrossedOff ? '&#8629;' : '&#x2715;';   // ↩ or ✕
  const btnTitle = isCrossedOff ? 'Restore neighborhood' : 'Eliminate neighborhood';

  // Escape name for use as HTML attribute and text content
  const safeName = escAttr(name);
  const safeText = escHtml(noteText);

  return `
<div class="${classes}" data-name="${safeName}" role="listitem">
  <div class="neighborhood-row" role="button" tabindex="0" aria-label="${safeName}">
    <span class="notes-dot ${hasNotes ? 'has-notes' : ''}" title="Has notes"></span>
    <span class="neighborhood-name">${escHtml(name)}</span>
    <button class="crossoff-btn" title="${btnTitle}" aria-label="${btnTitle}">${btnIcon}</button>
  </div>
  <div class="notes-section" aria-label="Notes for ${safeName}">
    <div class="notes-label">Notes</div>
    <textarea placeholder="Add notes about ${escAttr(name)}&hellip;">${safeText}</textarea>
    <div class="notes-saved-indicator"></div>
  </div>
</div>`.trim();
}

// ── Side panel helpers ────────────────────────────────────────────────────────

function scrollToNeighborhood(name) {
  const item = getItemElement(name);
  if (item) {
    item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/**
 * Find a .neighborhood-item element by neighborhood name using dataset comparison.
 * Safer than CSS attribute selectors when names contain special characters.
 */
function getItemElement(name) {
  const items = document.querySelectorAll('.neighborhood-item');
  for (const el of items) {
    if (el.dataset.name === name) return el;
  }
  return null;
}

function updateStats() {
  const total      = state.neighborhoodNames.length;
  const nElim      = Object.values(state.crossedOff).filter(Boolean).length;
  const nActive    = total - nElim;

  const activeEl  = document.getElementById('active-count');
  const elimEl    = document.getElementById('eliminated-count');
  const headerEl  = document.getElementById('header-stats');

  if (activeEl)  activeEl.textContent  = `${nActive} remaining`;
  if (elimEl)    elimEl.textContent    = nElim > 0 ? `${nElim} eliminated` : '';
  if (headerEl)  headerEl.textContent  = total ? `${nActive} of ${total} neighborhoods` : '';
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Escape a string for safe use inside HTML text content. */
function escHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;');
}

/** Escape a string for safe use inside an HTML attribute (double-quoted). */
function escAttr(str) {
  return escHtml(str).replace(/"/g, '&quot;');
}

function showError(msg) {
  const banner = document.getElementById('error-banner');
  const msgEl  = document.getElementById('error-message');
  if (msgEl)    msgEl.textContent = msg;
  if (banner)   banner.classList.remove('hidden');
}

// ── Data loading ──────────────────────────────────────────────────────────────

/**
 * Return the GeoJSON data embedded by sf_neighborhoods_data.js.
 * No network request needed — works from file:// protocol.
 */
function loadNeighborhoodsGeoJSON() {
  if (!window.SF_NEIGHBORHOODS_DATA) {
    throw new Error(
      'sf_neighborhoods_data.js did not load. Make sure all files are in the same folder.'
    );
  }
  return window.SF_NEIGHBORHOODS_DATA;
}

// ── Initialisation ────────────────────────────────────────────────────────────

function init() {
  // Hide the loading overlay immediately — data is bundled locally, no async needed.
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) loadingOverlay.classList.add('hidden');

  loadState();

  try {
    initMap();

    const data = loadNeighborhoodsGeoJSON();

    // Extract unique, non-empty neighborhood names and sort alphabetically
    state.neighborhoodNames = [
      ...new Set(
        data.features
          .map((f) => f.properties[NAME_PROP])
          .filter((n) => typeof n === 'string' && n.trim() !== '')
      ),
    ].sort((a, b) => a.localeCompare(b));

    addNeighborhoodLayer(data);
    renderSidePanel();
    updateStats();

  } catch (err) {
    console.error('[sf-picker] Init error:', err);
    showError('Failed to initialize: ' + err.message);
  }

  // Search input
  document.getElementById('search').addEventListener('input', (e) => {
    state.filter = e.target.value;
    renderSidePanel();
  });

  // Error banner close button
  document.getElementById('error-close').addEventListener('click', () => {
    document.getElementById('error-banner').classList.add('hidden');
  });

  // Allow keyboard Enter/Space on neighborhood rows (accessibility)
  document.getElementById('neighborhood-list').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const row = e.target.closest('.neighborhood-row');
      if (row) {
        e.preventDefault();
        row.click();
      }
    }
  });
}

// Kick everything off once the DOM is ready
document.addEventListener('DOMContentLoaded', init);
