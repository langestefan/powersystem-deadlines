import { locationLabel, type ConferenceEdition } from './edition';
import { leadTag } from './overview';
import { coordinatesFor, placeKey, type LatLon } from './places';
import { getTag, tagLabel, type TagId } from './taxonomy';

/**
 * The map's data layer: editions -> one marker per city per conference year,
 * with everything the popover and legend need already resolved.
 *
 * Pure and free of astro:content like overview.ts, so tests can drive it. The
 * page serialises these markers into the DOM and a Leaflet script places
 * them on the map; the list under the map carries the same data for anyone
 * without JavaScript.
 */

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
  lat: number;
  lon: number;
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
        lat: place[0],
        lon: place[1],
        editions: [entry],
        markerClass: entry.markerClass,
        topics: [entry.topic],
      });
    }
  }

  return [...markers.values()];
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
