/**
 * City -> coordinates, so the map can place an edition from the `city:` and
 * `country:` it already states. Like regions.ts, an unknown place is a
 * validation error rather than a guess: scripts/validate.ts asks the
 * contributor to add the city here.
 *
 * Keyed "City, Country" exactly as written in conferences/*.yml. City-centre
 * coordinates to two decimals (about a kilometre), which is far finer than a
 * world map can show.
 */

/** [latitude, longitude] in degrees, north and east positive. */
export type LatLon = readonly [lat: number, lon: number];

const PLACES: Record<string, LatLon> = {
  // Europe
  'Aachen, Germany': [50.78, 6.08],
  'Birmingham, United Kingdom': [52.49, -1.89],
  'Bologna, Italy': [44.49, 11.34],
  'Bruges, Belgium': [51.21, 3.22],
  'Brussels, Belgium': [50.85, 4.35],
  'Budapest, Hungary': [47.5, 19.04],
  'Cagliari, Italy': [39.22, 9.12],
  'Cambridge, United Kingdom': [52.21, 0.12],
  'Ciudad Real, Spain': [38.99, -3.93],
  'Cluj-Napoca, Romania': [46.77, 23.59],
  'Delft, Netherlands': [52.01, 4.36],
  'Dresden, Germany': [51.05, 13.74],
  'Guimarães, Portugal': [41.44, -8.3],
  'Heidelberg, Germany': [49.4, 8.67],
  'Larnaca, Cyprus': [34.92, 33.62],
  'Limassol, Cyprus': [34.69, 33.04],
  'Lisbon, Portugal': [38.72, -9.14],
  'London, United Kingdom': [51.51, -0.13],
  'Madrid, Spain': [40.42, -3.7],
  'Munich, Germany': [48.14, 11.58],
  'Nuremberg, Germany': [49.45, 11.08],
  'Paris, France': [48.86, 2.35],
  'Rome, Italy': [41.9, 12.5],
  'Stockholm, Sweden': [59.33, 18.07],
  'Valencia, Spain': [39.47, -0.38],

  // North America
  'Atlanta, USA': [33.75, -84.39],
  'Austin, USA': [30.27, -97.74],
  'Banff, Canada': [51.18, -115.57],
  'Boulder, USA': [40.01, -105.27],
  'Chicago, USA': [41.88, -87.63],
  'College Station, USA': [30.63, -96.33],
  'Denver, USA': [39.74, -104.99],
  'Edmonton, Canada': [53.55, -113.49],
  'Honolulu, USA': [21.31, -157.86],
  'Houghton, USA': [47.12, -88.57],
  'Milwaukee, USA': [43.04, -87.91],
  'Monterrey, Mexico': [25.69, -100.32],
  'New Orleans, USA': [29.95, -90.07],
  'Novi, USA': [42.48, -83.48],
  'Philadelphia, USA': [39.95, -75.17],
  'Sacramento, USA': [38.58, -121.49],
  'Salt Lake City, USA': [40.76, -111.89],
  'San Francisco, USA': [37.77, -122.42],
  'Urbana-Champaign, USA': [40.11, -88.23],
  'Vancouver, Canada': [49.28, -123.12],
  'Waikoloa, USA': [19.94, -155.79],

  // Latin America
  'Florianópolis, Brazil': [-27.6, -48.55],
  'Medellín, Colombia': [6.24, -75.58],
  'Viña del Mar, Chile': [-33.02, -71.55],

  // Asia and the Middle East
  'Bangkok, Thailand': [13.76, 100.5],
  'Doha, Qatar': [25.29, 51.53],
  'Hiroshima, Japan': [34.39, 132.46],
  'Nagasaki, Japan': [32.75, 129.88],
  'Nagoya, Japan': [35.18, 136.91],
  'Seoul, South Korea': [37.57, 126.98],
  'Shanghai, China': [31.23, 121.47],
  'Wuhan, China': [30.59, 114.31],

  // Africa
  'Nairobi, Kenya': [-1.29, 36.82],
};

/** The key a place is stored under: "City, Country". */
export function placeKey(city: string, country: string): string {
  return `${city}, ${country}`;
}

/** Coordinates of a city, or undefined when it is not in the table. */
export function coordinatesFor(
  city: string | undefined,
  country: string | undefined,
): LatLon | undefined {
  if (!city || !country) return undefined;
  return PLACES[placeKey(city, country)];
}

export function knownPlaces(): string[] {
  return Object.keys(PLACES).sort();
}
