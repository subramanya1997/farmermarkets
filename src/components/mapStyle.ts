import type { StyleSpecification, LayerSpecification } from 'maplibre-gl';

/**
 * The one look every map on the site shares.
 *
 * Vector tiles from OpenFreeMap (OpenStreetMap data, free, no key, commercial
 * use allowed) restyled into a quiet, paper-like base: soft neutrals, pale
 * sage parks, muted water, no shops or road shields, and only place names
 * and the main street names as labels. The markets are the only saturated
 * thing on the map, so the eye goes straight to them. The explorer, state
 * hubs, city pages and market pages all draw through here, so a market looks
 * the same wherever it appears.
 */

export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

export const MAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>';

/** Brand greens for the market layers (Tailwind green-700 / green-900 / lime-300). */
export const MARKET_GREEN = '#15803d';
export const MARKET_GREEN_DARK = '#14532d';
export const MARKET_GREEN_GLOW = '#86efac';

interface Palette {
  background: string;
  land: string;
  park: string;
  water: string;
  waterLine: string;
  building: string;
  road: string;
  roadMajor: string;
  roadCasing: string;
  rail: string;
  boundary: string;
  label: string;
  labelMuted: string;
  halo: string;
}

const LIGHT: Palette = {
  background: '#f6f6f2',
  land: '#f1f1ec',
  park: '#e3ecda',
  water: '#cde2ea',
  waterLine: '#c6dadf',
  building: '#ebebe5',
  road: '#ffffff',
  roadMajor: '#ffffff',
  roadCasing: '#e2e2db',
  rail: '#dcdcd4',
  boundary: '#cfcfc6',
  label: '#52525b',
  labelMuted: '#8a8a93',
  halo: '#f6f6f2',
};

const DARK: Palette = {
  background: '#141416',
  land: '#18181b',
  park: '#17221a',
  water: '#13202a',
  waterLine: '#1b2c36',
  building: '#1e1e22',
  road: '#26262b',
  roadMajor: '#2e2e34',
  roadCasing: '#1c1c20',
  rail: '#2a2a2f',
  boundary: '#3f3f46',
  label: '#d4d4d8',
  labelMuted: '#8b8b94',
  halo: '#141416',
};

/** Layers that add noise without helping anyone find a market. */
const DROP = [
  /shield/,
  /^airport$/,
  /^aeroway/,
  /dashline$/,
  /^highway-name-path$/,
  /^highway-name-minor$/,
  /^waterway_line_label$/,
  /^label_other$/,
  /^tunnel_/,
  /^landcover_(ice|glacier)/,
];

function recolor(layer: LayerSpecification, p: Palette): LayerSpecification | undefined {
  const id = layer.id;
  if (DROP.some((pattern) => pattern.test(id))) return undefined;
  // Raster shaded relief at low zooms reads as smudges on a calm base.
  if (layer.type === 'raster') return undefined;

  const paint = { ...(('paint' in layer && layer.paint) || {}) } as Record<string, unknown>;
  const set = (key: string, value: unknown) => {
    paint[key] = value;
  };

  if (layer.type === 'background') set('background-color', p.background);
  else if (layer.type === 'fill') {
    if (/park|wood/.test(id)) set('fill-color', p.park);
    else if (/water/.test(id)) set('fill-color', p.water);
    else if (/building/.test(id)) set('fill-color', p.building);
    else set('fill-color', p.land);
    set('fill-outline-color', 'rgba(0,0,0,0)');
  } else if (layer.type === 'line') {
    if (/waterway/.test(id)) set('line-color', p.waterLine);
    else if (/boundary/.test(id)) {
      set('line-color', p.boundary);
      set('line-opacity', 0.6);
    } else if (/rail/.test(id)) set('line-color', p.rail);
    else if (/casing/.test(id)) set('line-color', p.roadCasing);
    else if (/motorway|major/.test(id)) set('line-color', p.roadMajor);
    else set('line-color', p.road);
  } else if (layer.type === 'symbol') {
    const muted = /highway|water/.test(id);
    set('text-color', muted ? p.labelMuted : p.label);
    set('text-halo-color', p.halo);
    set('text-halo-width', 1.4);
    set('text-halo-blur', 0.5);
  }

  return { ...layer, paint } as LayerSpecification;
}

const styleCache = new Map<string, Promise<StyleSpecification>>();

/**
 * The base style, fetched once per page and recoloured for the theme.
 * Falls back to the untouched URL if the fetch fails, so a map still draws.
 */
export function loadMapStyle(dark: boolean): Promise<StyleSpecification | string> {
  const key = dark ? 'dark' : 'light';
  const cached = styleCache.get(key);
  if (cached) return cached;
  const palette = dark ? DARK : LIGHT;
  const promise = fetch(MAP_STYLE_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`map style ${response.status}`);
      return response.json() as Promise<StyleSpecification>;
    })
    .then((style) => ({
      ...style,
      sources: Object.fromEntries(
        Object.entries(style.sources).filter(([, source]) => source.type !== 'raster')
      ),
      layers: style.layers
        .map((layer) => recolor(layer, palette))
        .filter((layer): layer is LayerSpecification => Boolean(layer)),
    }));
  styleCache.set(key, promise);
  promise.catch(() => styleCache.delete(key));
  return promise.catch(() => MAP_STYLE_URL);
}

/** True when the site is showing its dark theme. */
export function prefersDarkMap(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}
