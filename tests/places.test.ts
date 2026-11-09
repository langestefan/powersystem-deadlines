import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { coordinatesFor, knownPlaces } from '@/lib/places';
import { KINDS } from '@/lib/taxonomy';

const ROOT = join(__dirname, '..');

/** Every (city, country) an in-person edition states, straight from the YAML. */
function citiesInData(): Array<[string, string]> {
  return KINDS.flatMap(({ dir }) =>
    existsSync(join(ROOT, dir))
      ? readdirSync(join(ROOT, dir))
          .filter((file) => file.endsWith('.yml') && !file.startsWith('_'))
          .map((file) => join(ROOT, dir, file))
      : [],
  )
    .flatMap((path) => parse(readFileSync(path, 'utf8')).editions)
    .filter((e: any) => e.city && e.country && e.format !== 'online')
    .map((e: any) => [e.city, e.country] as [string, string]);
}

describe('places', () => {
  it('knows every city the conference data uses', () => {
    const missing = citiesInData().filter(([city, country]) => !coordinatesFor(city, country));
    expect(missing).toEqual([]);
  });

  it('stores only valid coordinates', () => {
    for (const key of knownPlaces()) {
      const [city, country] = key.split(', ');
      const [lat, lon] = coordinatesFor(city, country)!;
      expect(Math.abs(lat), key).toBeLessThanOrEqual(90);
      expect(Math.abs(lon), key).toBeLessThanOrEqual(180);
    }
  });

  it('returns nothing for an unknown or partial place', () => {
    expect(coordinatesFor('Atlantis', 'Nowhere')).toBeUndefined();
    expect(coordinatesFor('Delft', undefined)).toBeUndefined();
    expect(coordinatesFor(undefined, 'Netherlands')).toBeUndefined();
  });
});
