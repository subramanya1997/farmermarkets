import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  MapGeoJSONFeature,
} from 'maplibre-gl';
import { MARKET_GREEN, MARKET_GREEN_DARK, MARKET_GREEN_GLOW } from './mapStyle';

/** One market as a map point. `id` must be a stable positive integer for feature state. */
export interface MarketPoint {
  id: number;
  slug: string;
  name: string;
  /** "Brooklyn, New York" */
  place?: string;
  lat: number;
  lon: number;
}

export const SOURCE = 'markets';

export function toFeatureCollection(points: MarketPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((point) => ({
      type: 'Feature' as const,
      id: point.id,
      geometry: { type: 'Point' as const, coordinates: [point.lon, point.lat] },
      properties: { slug: point.slug, name: point.name, place: point.place ?? '' },
    })),
  };
}

/**
 * The market layers every map draws: soft green clusters with a count, and
 * single markets as a small green dot with a white ring. Hover and the
 * "active" market (the one a list row points at, or the market on its own
 * page) grow a darker dot inside a pale glow, driven by feature state so
 * nothing is re-rendered.
 */
export function addMarketLayers(
  map: MapLibreMap,
  points: MarketPoint[],
  { cluster }: { cluster: boolean }
) {
  map.addSource(SOURCE, {
    type: 'geojson',
    data: toFeatureCollection(points),
    cluster,
    clusterRadius: 44,
    clusterMaxZoom: 12,
  });

  if (cluster) {
    map.addLayer({
      id: 'market-clusters',
      type: 'circle',
      source: SOURCE,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': MARKET_GREEN,
        'circle-opacity': 0.92,
        'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 23, 200, 28],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 3,
        'circle-stroke-opacity': 0.9,
      },
    });
    map.addLayer({
      id: 'market-cluster-count',
      type: 'symbol',
      source: SOURCE,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 12,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#ffffff' },
    });
  }

  const single: FilterSpecification = ['!', ['has', 'point_count']];
  const emphasised: ExpressionSpecification = [
    'any',
    ['boolean', ['feature-state', 'hover'], false],
    ['boolean', ['feature-state', 'active'], false],
  ];

  map.addLayer({
    id: 'market-glow',
    type: 'circle',
    source: SOURCE,
    filter: single,
    paint: {
      'circle-color': MARKET_GREEN_GLOW,
      'circle-radius': ['case', emphasised, 18, 0],
      'circle-opacity': 0.45,
      'circle-blur': 0.2,
    },
  });
  map.addLayer({
    id: 'market-dots',
    type: 'circle',
    source: SOURCE,
    filter: single,
    paint: {
      'circle-color': ['case', emphasised, MARKET_GREEN_DARK, MARKET_GREEN],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 10, 6, 14, ['case', emphasised, 10, 8]],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 4, 1.5, 12, 2.5],
    },
  });
}

/** Zoom into a cluster on click; hand-cursor over anything clickable. */
export function wireClusterZoom(map: MapLibreMap) {
  map.on('click', 'market-clusters', async (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    const source = map.getSource(SOURCE) as GeoJSONSource;
    const zoom = await source.getClusterExpansionZoom(feature.properties.cluster_id as number);
    map.easeTo({
      center: (feature.geometry as { coordinates: [number, number] }).coordinates,
      zoom: zoom + 0.5,
    });
  });
  for (const layer of ['market-clusters', 'market-dots']) {
    map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
  }
}

/** Hover state on single markets. */
export function wireHover(map: MapLibreMap) {
  let hovered: number | string | undefined;
  map.on('mousemove', 'market-dots', (event) => {
    const id = event.features?.[0]?.id;
    if (id === undefined || id === hovered) return;
    if (hovered !== undefined) map.setFeatureState({ source: SOURCE, id: hovered }, { hover: false });
    hovered = id;
    map.setFeatureState({ source: SOURCE, id }, { hover: true });
  });
  map.on('mouseleave', 'market-dots', () => {
    if (hovered !== undefined) map.setFeatureState({ source: SOURCE, id: hovered }, { hover: false });
    hovered = undefined;
  });
}

export function featureProps(feature: MapGeoJSONFeature) {
  return feature.properties as { slug: string; name: string; place: string };
}

/** A stable positive integer from a slug, for feature ids. */
export function slugId(slug: string): number {
  let hash = 0;
  for (let index = 0; index < slug.length; index += 1) {
    hash = (hash * 31 + slug.charCodeAt(index)) | 0;
  }
  return (hash >>> 0) + 1;
}
