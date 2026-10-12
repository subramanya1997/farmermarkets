import type { CircleMarkerOptions } from 'leaflet';

/**
 * The one look every map on the site shares: OpenStreetMap tiles with green
 * dots. The explorer, the state hubs, the city pages and the market pages all
 * read these, so a market looks the same wherever it is drawn.
 */
export const MAP_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export const MAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const MAP_DOT: CircleMarkerOptions = {
  radius: 6,
  color: '#ffffff',
  weight: 1.5,
  fillColor: '#15803d',
  fillOpacity: 0.9,
};

/** The dot a list row is pointing at, or the only dot on a one-market map. */
export const MAP_DOT_ACTIVE: CircleMarkerOptions = {
  radius: 10,
  color: '#ffffff',
  weight: 2.5,
  fillColor: '#14532d',
  fillOpacity: 1,
};
