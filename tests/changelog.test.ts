import { describe, expect, it } from 'vitest';

import { changelogEntries, changelogGroups, editionChangelog, formatChangeDate } from '@/lib/changelog';
import { flattenEdition, type ConferenceEdition } from '@/lib/edition';

/**
 * The changelog is read by somebody asking "did the date I wrote down move?",
 * so what matters is that nothing recorded goes missing and that the newest
 * change is the first thing they see.
 */

const NOW = new Date('2026-10-13T12:00:00Z');

function edition(
  name: string,
  year: number,
  changes?: Array<{ date: string; field: string; old?: string; new?: string }>,
): ConferenceEdition {
  return flattenEdition(
    {
      name,
      full_name: `${name} Conference`,
      link: 'https://example.org/',
      society: ['IEEE PES'],
      frequency: 'annual',
      tags: ['power-systems'],
      editions: [],
    },
    name.toLowerCase(),
    {
      year,
      id: `${name.toLowerCase()}${year % 100}`,
      date: `June ${year}`,
      verified: '2026-10-13',
      format: 'in-person',
      cancelled: false,
      deadlines: [],
      changes,
    },
    NOW,
  );
}

const fields = (entries: Array<{ field: string }>) => entries.map((entry) => entry.field);

describe('flattenEdition changes', () => {
  it('gives an edition with no recorded changes an empty list', () => {
    expect(edition('AAA', 2027).changes).toEqual([]);
  });

  it('orders an edition\'s own changes newest first, whatever the YAML order', () => {
    const changes = edition('AAA', 2027, [
      { date: '2026-08-01', field: 'first', new: 'x' },
      { date: '2026-10-13', field: 'third', new: 'x' },
      { date: '2026-09-01', field: 'second', new: 'x' },
    ]).changes;
    expect(fields(changes)).toEqual(['third', 'second', 'first']);
  });

  it('carries the field, old value and new value through unchanged', () => {
    const [change] = edition('AAA', 2027, [
      { date: '2026-10-13', field: 'camera_ready', old: '2026-08-30', new: '2026-09-20' },
    ]).changes;
    expect(change).toEqual({
      date: new Date('2026-10-13T00:00:00Z'),
      field: 'camera_ready',
      old: '2026-08-30',
      new: '2026-09-20',
    });
  });

  it('leaves the old value undefined for a field that was added', () => {
    const [change] = edition('AAA', 2027, [
      { date: '2026-10-13', field: 'venue', new: 'Aula' },
    ]).changes;
    expect(change!.old).toBeUndefined();
    expect(change!.new).toBe('Aula');
  });
});

describe('changelogEntries', () => {
  const editions = [
    edition('ZZZ', 2027, [{ date: '2026-10-13', field: 'z today', new: 'x' }]),
    edition('AAA', 2027, [
      { date: '2026-09-01', field: 'a earlier', new: 'x' },
      { date: '2026-10-13', field: 'a today', new: 'x' },
    ]),
    edition('MMM', 2027),
  ];

  it('puts the newest change first, then orders a day by conference', () => {
    expect(fields(changelogEntries(editions))).toEqual(['a today', 'z today', 'a earlier']);
  });

  it('links each entry back to its edition', () => {
    expect(changelogEntries(editions)[0]!.edition.id).toBe('aaa27');
  });

  it('orders two editions of one series by year within a day', () => {
    const entries = changelogEntries([
      edition('AAA', 2028, [{ date: '2026-10-13', field: 'later edition', new: 'x' }]),
      edition('AAA', 2027, [{ date: '2026-10-13', field: 'earlier edition', new: 'x' }]),
    ]);
    expect(fields(entries)).toEqual(['earlier edition', 'later edition']);
  });

  it('keeps one edition\'s same-day changes in the order the YAML lists them', () => {
    const entries = changelogEntries([
      edition('AAA', 2027, [
        { date: '2026-10-13', field: 'city', new: 'Rome' },
        { date: '2026-10-13', field: 'country', new: 'Italy' },
        { date: '2026-10-13', field: 'venue', new: 'Hotel' },
      ]),
    ]);
    expect(fields(entries)).toEqual(['city', 'country', 'venue']);
  });

  it('is empty when nothing has been recorded', () => {
    expect(changelogEntries([edition('AAA', 2027)])).toEqual([]);
  });
});

describe('changelogGroups', () => {
  it('gathers one edition\'s changes on one day into a single group', () => {
    const groups = changelogGroups([
      edition('AAA', 2027, [
        { date: '2026-10-13', field: 'city', new: 'Rome' },
        { date: '2026-10-13', field: 'venue', new: 'Hotel' },
      ]),
    ]);
    expect(groups).toHaveLength(1);
    expect(fields(groups[0]!.entries)).toEqual(['city', 'venue']);
    expect(groups[0]!.edition.id).toBe('aaa27');
    expect(groups[0]!.date).toEqual(new Date('2026-10-13T00:00:00Z'));
  });

  it('keeps the same edition on different days apart, newest first', () => {
    const groups = changelogGroups([
      edition('AAA', 2027, [
        { date: '2026-09-01', field: 'paper', new: 'x' },
        { date: '2026-10-13', field: 'venue', new: 'x' },
      ]),
    ]);
    expect(groups.map((group) => fields(group.entries))).toEqual([['venue'], ['paper']]);
  });

  it('keeps different editions on the same day apart', () => {
    const groups = changelogGroups([
      edition('BBB', 2027, [{ date: '2026-10-13', field: 'b', new: 'x' }]),
      edition('AAA', 2027, [{ date: '2026-10-13', field: 'a', new: 'x' }]),
      edition('AAA', 2028, [{ date: '2026-10-13', field: 'a28', new: 'x' }]),
    ]);
    expect(groups.map((group) => group.edition.id)).toEqual(['aaa27', 'aaa28', 'bbb27']);
  });

  it('loses no change to the grouping', () => {
    const editions = [
      edition('AAA', 2027, [
        { date: '2026-10-13', field: 'one', new: 'x' },
        { date: '2026-09-01', field: 'two', new: 'x' },
        { date: '2026-10-13', field: 'three', new: 'x' },
      ]),
      edition('BBB', 2027, [{ date: '2026-10-13', field: 'four', new: 'x' }]),
    ];
    const total = changelogGroups(editions).reduce((sum, group) => sum + group.entries.length, 0);
    expect(total).toBe(4);
  });
});

describe('editionChangelog', () => {
  it('returns only that edition\'s changes', () => {
    const one = edition('AAA', 2027, [{ date: '2026-10-13', field: 'venue', new: 'Aula' }]);
    expect(fields(editionChangelog(one))).toEqual(['venue']);
    expect(editionChangelog(one)[0]!.edition).toBe(one);
  });
});

describe('formatChangeDate', () => {
  it('reads the date in UTC, so it never slips to the previous day', () => {
    expect(formatChangeDate(new Date('2026-10-13T00:00:00Z'))).toBe('13 Oct 2026');
  });
});
