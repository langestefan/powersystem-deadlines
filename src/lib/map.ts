import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import countries110m from 'world-atlas/countries-110m.json';

import { locationLabel, type ConferenceEdition } from './edition';
import { leadTag } from './overview';
import { coordinatesFor, placeKey, type LatLon } from './places';
import { getTag, tagLabel, type TagId } from './taxonomy';

/**
 * The world map's data layer: editions -> projected, merged markers, plus the
 * land outline and the zoom views, all computed at build time.
 *
 * Pure and free of astro:content like overview.ts, so tests can drive it. The
 * page ships an SVG with everything already in place: d3 never reaches the
 * browser, and the map reads fine with JavaScript off.
 */

/** Width of the SVG coordinate system; the height follows from the projection. */
export const MAP_WIDTH = 960;

/** Neither Antarctica nor the high Arctic hosts a conference, so the world view crops them. */
const WORLD_BOUNDS = { west: -170, east: 180, south: -56, north: 76 } as const;

const projection = geoNaturalEarth1().fitWidth(MAP_WIDTH, { type: 'Sphere' });
const path = geoPath(projection);

/** A lat/lon on the map, in SVG units. */
export function project([lat, lon]: LatLon): { x: number; y: number } {
  const [x, y] = projection([lon, lat])!;
  return { x: round(x), y: round(y) };
}

const round = (value: number) => Math.round(value * 10) / 10;

const world = countries110m as unknown as Topology<{
  countries: GeometryCollection;
  land: GeometryCollection;
}>;

/** The land masses as one SVG path. */
export const LAND_PATH = path(feature(world, world.objects.land)) ?? '';

/** Interior country borders only, so coastlines are not drawn twice. */
export const BORDERS_PATH =
  path(mesh(world, world.objects.countries, (a, b) => a !== b)) ?? '';

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Bounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

/**
 * The SVG box a lat/lon box projects into. Natural Earth curves the meridians,
 * so the edges are sampled rather than only the corners.
 */
function projectedBox(bounds: Bounds): ViewBox {
  const xs: number[] = [];
  const ys: number[] = [];
  const steps = 16;

  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const lon = bounds.west + ((bounds.east - bounds.west) * i) / steps;
      const lat = bounds.south + ((bounds.north - bounds.south) * j) / steps;
      const { x, y } = project([lat, lon]);
      xs.push(x);
      ys.push(y);
    }
  }

  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

const WORLD_BOX = projectedBox(WORLD_BOUNDS);

/** Width over height of every view, so switching views never resizes the map. */
export const MAP_ASPECT = WORLD_BOX.width / WORLD_BOX.height;

/** Grow the shorter side of a box around its centre until it has the map's aspect. */
function fitAspect(box: ViewBox): ViewBox {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const width = Math.max(box.width, box.height * MAP_ASPECT);
  const height = width / MAP_ASPECT;
  return {
    x: round(cx - width / 2),
    y: round(cy - height / 2),
    width: round(width),
    height: round(height),
  };
}

export interface MapView {
  id: string;
  label: string;
  box: ViewBox;
}

/**
 * The zoom buttons. Bounds are chosen around where these conferences are
 * actually held: Hawaii counts as North America, Doha as Asia.
 */
export const MAP_VIEWS: MapView[] = [
  { id: 'world', label: 'World', bounds: WORLD_BOUNDS },
  { id: 'europe', label: 'Europe', bounds: { west: -11, east: 35, south: 33, north: 61 } },
  {
    id: 'north-america',
    label: 'North America',
    bounds: { west: -160, east: -62, south: 16, north: 58 },
  },
  {
    id: 'latin-america',
    label: 'Latin America',
    bounds: { west: -95, east: -32, south: -42, north: 24 },
  },
  { id: 'asia', label: 'Asia', bounds: { west: 45, east: 145, south: 0, north: 50 } },
].map(({ id, label, bounds }) => ({ id, label, box: fitAspect(projectedBox(bounds)) }));

export function viewBoxAttr(box: ViewBox): string {
  return `${box.x} ${box.y} ${box.width} ${box.height}`;
}

export interface MapEdition {
  id: string;
  name: string;
  fullName: string;
  dateLabel: string;
  location: string;
  /** Lead topic, as a label, for the legend and the popover. */
  topic: string;
  tag?: TagId;
  markerClass: string;
}

export interface MapMarker {
  /** "City, Country". */
  key: string;
  x: number;
  y: number;
  /** Every edition held here this year, in date order. */
  editions: MapEdition[];
  /** Colour of the first edition's lead topic. */
  markerClass: string;
  /** Distinct lead topics, so the legend can hide a marker once all of them are off. */
  topics: string[];
}

/** Neutral fill for an edition whose lead tag has no colour. Literal for the JIT. */
const FALLBACK_MARKER = 'fill-slate-500 dark:fill-slate-400';

function mapEdition(edition: ConferenceEdition): MapEdition {
  const tag = leadTag(edition);
  return {
    id: edition.id,
    name: `${edition.name} ${edition.year}`,
    fullName: edition.fullName,
    dateLabel: edition.dateLabel,
    location: locationLabel(edition),
    topic: tag ? tagLabel(tag) : 'Other',
    tag,
    markerClass: (tag && getTag(tag)?.markerClass) || FALLBACK_MARKER,
  };
}

/** Years with at least one edition, ascending. The map is per conference year. */
export function mapYears(editions: ConferenceEdition[]): number[] {
  const years = new Set(editions.filter((e) => !e.cancelled).map((e) => e.year));
  return [...years].sort((a, b) => a - b);
}

const byStart = (a: ConferenceEdition, b: ConferenceEdition) =>
  (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity) ||
  a.name.localeCompare(b.name);

function editionsIn(editions: ConferenceEdition[], year: number): ConferenceEdition[] {
  return editions.filter((e) => e.year === year && !e.cancelled).sort(byStart);
}

function placeOf(edition: ConferenceEdition): LatLon | undefined {
  if (edition.format === 'online') return undefined;
  return coordinatesFor(edition.city, edition.country);
}

/**
 * One marker per city: two conferences in the same city the same year share a
 * marker that lists both, rather than one hiding exactly underneath the other.
 */
export function buildMapMarkers(editions: ConferenceEdition[], year: number): MapMarker[] {
  const markers = new Map<string, MapMarker>();

  for (const edition of editionsIn(editions, year)) {
    const place = placeOf(edition);
    if (!place) continue;

    const key = placeKey(edition.city!, edition.country!);
    const entry = mapEdition(edition);
    const marker = markers.get(key);

    if (marker) {
      marker.editions.push(entry);
      if (!marker.topics.includes(entry.topic)) marker.topics.push(entry.topic);
    } else {
      markers.set(key, {
        key,
        ...project(place),
        editions: [entry],
        markerClass: entry.markerClass,
        topics: [entry.topic],
      });
    }
  }

  // Largest last, so a cluster is drawn on top of a single neighbour.
  return [...markers.values()].sort((a, b) => a.editions.length - b.editions.length);
}

/** Editions this year that cannot be placed: online, or no city announced yet. */
export function unplacedEditions(editions: ConferenceEdition[], year: number): MapEdition[] {
  return editionsIn(editions, year)
    .filter((edition) => !placeOf(edition))
    .map(mapEdition);
}

/** Every edition this year in date order, placed or not, for the list under the map. */
export function mapEditions(editions: ConferenceEdition[], year: number): MapEdition[] {
  return editionsIn(editions, year).map(mapEdition);
}

/** Lead topics present this year, with their colour, for the legend. */
export function mapLegend(markers: MapMarker[]): Array<{ topic: string; markerClass: string }> {
  const legend = new Map<string, string>();
  for (const marker of markers) {
    for (const edition of marker.editions) {
      if (!legend.has(edition.topic)) legend.set(edition.topic, edition.markerClass);
    }
  }
  return [...legend].map(([topic, markerClass]) => ({ topic, markerClass }));
}
