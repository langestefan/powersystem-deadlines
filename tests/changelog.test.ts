import { describe, expect, it } from 'vitest';

import { changelogDays, formatChangeDate } from '@/lib/changelog';
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
  changes?: Array<{ date: string; summary: string }>,
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

describe('flattenEdition changes', () => {
  it('gives an edition with no recorded changes an empty list', () => {
    expect(edition('AAA', 2027).changes).toEqual([]);
  });

  it('orders an edition\'s own changes newest first, whatever the YAML order', () => {
    const changes = edition('AAA', 2027, [
      { date: '2026-08-01', summary: 'first' },
      { date: '2026-10-13', summary: 'third' },
      { date: '2026-09-01', summary: 'second' },
    ]).changes;
    expect(changes.map((change) => change.summary)).toEqual(['third', 'second', 'first']);
  });
});

describe('changelogDays', () => {
  const editions = [
    edition('ZZZ', 2027, [{ date: '2026-10-13', summary: 'z today' }]),
    edition('AAA', 2027, [
      { date: '2026-09-01', summary: 'a earlier' },
      { date: '2026-10-13', summary: 'a today' },
    ]),
    edition('MMM', 2027),
  ];

  it('puts the newest day first', () => {
    const days = changelogDays(editions);
    expect(days.map((day) => day.date.toISOString().slice(0, 10))).toEqual([
      '2026-10-13',
      '2026-09-01',
    ]);
  });

  it('groups changes from different conferences made on the same day', () => {
    const [today] = changelogDays(editions);
    expect(today!.entries.map((entry) => entry.summary)).toEqual(['a today', 'z today']);
  });

  it('keeps every recorded change and nothing else', () => {
    const total = changelogDays(editions).reduce((sum, day) => sum + day.entries.length, 0);
    expect(total).toBe(3);
  });

  it('links each entry back to its edition', () => {
    const [today] = changelogDays(editions);
    expect(today!.entries[0]!.edition.id).toBe('aaa27');
  });

  it('orders two editions of one series by year within a day', () => {
    const days = changelogDays([
      edition('AAA', 2028, [{ date: '2026-10-13', summary: 'later edition' }]),
      edition('AAA', 2027, [{ date: '2026-10-13', summary: 'earlier edition' }]),
    ]);
    expect(days[0]!.entries.map((entry) => entry.summary)).toEqual([
      'earlier edition',
      'later edition',
    ]);
  });

  it('is empty when nothing has been recorded', () => {
    expect(changelogDays([edition('AAA', 2027)])).toEqual([]);
  });
});

describe('formatChangeDate', () => {
  it('reads the date in UTC, so it never slips to the previous day', () => {
    expect(formatChangeDate(new Date('2026-10-13T00:00:00Z'))).toBe('13 October 2026');
  });
});
