import type { ExpressionSpecification, StyleSpecification, LayerSpecification } from 'maplibre-gl';

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

/** The vector source the style points at; fetched alongside the style so its tile URLs arrive inline. */
const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';

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
  // Nearly invisible in this palette, but the heaviest thing a phone draws
  // on a street-level map.
  /^building/,
];

/**
 * Latin names only. The stock labels add the local-script name on a second
 * line, which pulls a dozen extra glyph files on any map wide enough to show
 * a border.
 */
const LATIN_NAME: ExpressionSpecification = ['coalesce', ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']];

/**
 * Place labels drop their little black dot: the markets are the only dots on
 * the map, and with no icons left the sprite sheet need not load at all.
 */
function withoutIcons(layout: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(layout)) {
    if (key.startsWith('icon-') || key === 'text-offset') continue;
    next[key] = value;
  }
  if (next['text-anchor'] === 'bottom') next['text-anchor'] = 'center';
  if (Array.isArray(next['text-field']) && JSON.stringify(next['text-field']).includes('name:nonlatin')) {
    next['text-field'] = LATIN_NAME;
  }
  return next;
}

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
    const layout = withoutIcons({ ...(layer.layout ?? {}) });
    return { ...layer, layout, paint } as LayerSpecification;
  }

  return { ...layer, paint } as LayerSpecification;
}

interface TileJson {
  tiles: string[];
  minzoom?: number;
  maxzoom?: number;
  bounds?: [number, number, number, number];
  attribution?: string;
}

function fetchJson<T>(url: string): Promise<T> {
  return fetch(url).then((response) => {
    if (!response.ok) throw new Error(`${url} ${response.status}`);
    return response.json() as Promise<T>;
  });
}

/** The style's vector source with its tile URLs inline, so MapLibre goes straight to tiles. */
function inlineTiles(
  sources: StyleSpecification['sources'],
  tilejson: TileJson | undefined
): StyleSpecification['sources'] {
  const entries = Object.entries(sources)
    .filter(([, source]) => source.type !== 'raster')
    .map(([id, source]) => {
      if (!tilejson || source.type !== 'vector' || source.url !== TILEJSON_URL) return [id, source];
      const { tiles, minzoom, maxzoom, bounds, attribution } = tilejson;
      return [id, { type: 'vector', tiles, minzoom, maxzoom, bounds, attribution }];
    });
  return Object.fromEntries(entries);
}

const styleCache = new Map<string, Promise<StyleSpecification>>();

/**
 * The base style, fetched once per page and recoloured for the theme.
 * The style and its tile index load in parallel, and the sprite is dropped,
 * so a phone waits on one round trip before tiles instead of three.
 * Falls back to the untouched URL if the fetch fails, so a map still draws.
 */
export function loadMapStyle(dark: boolean): Promise<StyleSpecification | string> {
  const key = dark ? 'dark' : 'light';
  const cached = styleCache.get(key);
  if (cached) return cached;
  const palette = dark ? DARK : LIGHT;
  // A missing tile index only costs the round trip it was meant to save.
  const tilejson = fetchJson<TileJson>(TILEJSON_URL).catch(() => undefined);
  const promise = Promise.all([fetchJson<StyleSpecification>(MAP_STYLE_URL), tilejson]).then(
    ([style, index]) => {
      const next: StyleSpecification = {
        ...style,
        sources: inlineTiles(style.sources, index),
        layers: style.layers
          .map((layer) => recolor(layer, palette))
          .filter((layer): layer is LayerSpecification => Boolean(layer)),
      };
      delete next.sprite;
      return next;
    }
  );
  styleCache.set(key, promise);
  promise.catch(() => styleCache.delete(key));
  return promise.catch(() => MAP_STYLE_URL);
}

/** True when the site is showing its dark theme. */
export function prefersDarkMap(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

/**
 * Map options that keep a phone fast. Phones report a pixel ratio of 3, which
 * is 2.25x the pixels of 2 for no visible gain on a calm base map; the style
 * is built here, so MapLibre need not re-validate it on the main thread; and
 * tiles appear at once instead of fading in.
 */
export function mapPerfOptions() {
  const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return { pixelRatio: Math.min(ratio, 2), validateStyle: false, fadeDuration: 0 };
}

/** Start the style download early, while the map's own code is still loading. */
export function preloadMapStyle(): void {
  if (typeof window === 'undefined') return;
  void loadMapStyle(prefersDarkMap());
}
