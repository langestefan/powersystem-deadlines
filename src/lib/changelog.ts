/**
 * The changelog: every recorded change to an edition, gathered into one list.
 *
 * Deadlines get extended and venues get announced after an entry is written,
 * and a reader who looked last month has no way to tell which dates moved.
 * Each edition therefore records its own `changes:`, and this module turns
 * those into the newest-first, day-by-day list the /changelog page shows.
 *
 * Pure and free of any astro:content import, like edition.ts, so it can be unit
 * tested directly.
 */

import type { ConferenceEdition } from './edition';

export interface ChangelogEntry {
  date: Date;
  summary: string;
  edition: ConferenceEdition;
}

export interface ChangelogDay {
  date: Date;
  entries: ChangelogEntry[];
}

/** Every recorded change, grouped by day, newest day first. */
export function changelogDays(editions: ConferenceEdition[]): ChangelogDay[] {
  const entries: ChangelogEntry[] = editions.flatMap((edition) =>
    edition.changes.map((change) => ({ date: change.date, summary: change.summary, edition })),
  );

  // Within a day, by conference and then year, so the order does not depend on
  // which file the collection happened to read first.
  entries.sort(
    (a, b) =>
      b.date.getTime() - a.date.getTime() ||
      a.edition.name.localeCompare(b.edition.name) ||
      a.edition.year - b.edition.year,
  );

  const days: ChangelogDay[] = [];
  for (const entry of entries) {
    const last = days[days.length - 1];
    if (last && last.date.getTime() === entry.date.getTime()) last.entries.push(entry);
    else days.push({ date: entry.date, entries: [entry] });
  }
  return days;
}

/** "13 October 2026". Change dates are calendar days, so always read in UTC. */
export function formatChangeDate(date: Date, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
