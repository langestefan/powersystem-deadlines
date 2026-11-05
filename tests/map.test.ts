import { describe, expect, it } from 'vitest';

import { flattenEdition, type ConferenceEdition } from '@/lib/edition';
import {
  buildMapMarkers,
  mapEditions,
  mapLegend,
  mapYears,
  unplacedEditions,
} from '@/lib/map';
import { getTag } from '@/lib/taxonomy';

const NOW = new Date('2026-08-26T12:00:00Z');

function edition(o: {
  id: string;
  year?: number;
  city?: string;
  country?: string;
  start?: string;
  format?: 'in-person' | 'hybrid' | 'online';
  cancelled?: boolean;
  tags?: Array<'power-systems' | 'power-electronics'>;
}): ConferenceEdition {
  return flattenEdition(
    { name: o.id.toUpperCase(), full_name: 'Test Conference', kind: 'conference', link: 'https://example.org/',
      society: ['IEEE PES'], frequency: 'annual', tags: o.tags ?? ['power-systems'], editions: [] },
    o.id,
    { year: o.year ?? 2027, id: o.id, date: 'whenever', verified: '2026-08-26',
      format: o.format ?? 'in-person', cancelled: o.cancelled ?? false, city: o.city,
      country: o.country, start: o.start, deadlines: [] },
    NOW,
  );
}

describe('mapYears', () => {
  it('lists conference years ascending, skipping cancelled editions', () => {
    const years = mapYears([
      edition({ id: 'a28', year: 2028 }),
      edition({ id: 'b26', year: 2026 }),
      edition({ id: 'c29', year: 2029, cancelled: true }),
      edition({ id: 'd26', year: 2026 }),
    ]);
    expect(years).toEqual([2026, 2028]);
  });
});

describe('buildMapMarkers', () => {
  const all = [
    edition({ id: 'delft', city: 'Delft', country: 'Netherlands', start: '2027-06-01' }),
    edition({ id: 'paris-b', city: 'Paris', country: 'France', start: '2027-09-01',
      tags: ['power-electronics'] }),
    edition({ id: 'paris-a', city: 'Paris', country: 'France', start: '2027-03-01' }),
    edition({ id: 'online', format: 'online' }),
    edition({ id: 'tba' }),
    edition({ id: 'gone', city: 'Rome', country: 'Italy', cancelled: true }),
    edition({ id: 'other-year', year: 2026, city: 'Rome', country: 'Italy' }),
  ];

  it('places only this year’s non-cancelled editions with a known city', () => {
    const keys = buildMapMarkers(all, 2027).map((m) => m.key).sort();
    expect(keys).toEqual(['Delft, Netherlands', 'Paris, France']);
  });

  it('merges editions in one city into one marker, in date order', () => {
    const paris = buildMapMarkers(all, 2027).find((m) => m.key === 'Paris, France')!;
    expect(paris.editions.map((e) => e.id)).toEqual(['paris-a', 'paris-b']);
    expect(paris.topics).toEqual(['Power Systems', 'Power Electronics']);
    expect(paris.markerClass).toBe(getTag('power-systems')!.markerClass);
  });

  it('places a marker at the city’s coordinates', () => {
    const delft = buildMapMarkers(all, 2027).find((m) => m.key === 'Delft, Netherlands')!;
    expect([delft.lat, delft.lon]).toEqual([52.01, 4.36]);
  });

  it('lists online and location-TBA editions as unplaced', () => {
    expect(unplacedEditions(all, 2027).map((e) => e.id).sort()).toEqual(['online', 'tba']);
  });

  it('lists every edition of the year for the table under the map', () => {
    expect(mapEditions(all, 2027)).toHaveLength(5);
  });

  it('builds a legend with each lead topic once', () => {
    expect(mapLegend(buildMapMarkers(all, 2027)).map((l) => l.topic)).toEqual([
      'Power Systems',
      'Power Electronics',
    ]);
  });
});
