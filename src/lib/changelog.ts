/**
 * The changelog: every recorded change to an edition, gathered into one list.
 *
 * Deadlines get extended and venues get announced after an entry is written,
 * and a reader who looked last month has no way to tell which dates moved.
 * Each edition therefore records its own `changes:` as field, old value and
 * new value, and this module turns those into the newest-first cards the
 * /changelog page shows, one per edition per day.
 *
 * Pure and free of any astro:content import, like edition.ts, so it can be unit
 * tested directly.
 */

import type { ConferenceEdition, EditionChange } from './edition';

export interface ChangelogEntry extends EditionChange {
  edition: ConferenceEdition;
}

/** One edition's changes as table rows, newest first. */
export function editionChangelog(edition: ConferenceEdition): ChangelogEntry[] {
  return edition.changes.map((change) => ({ ...change, edition }));
}

/** Every recorded change across all editions, newest first. */
export function changelogEntries(editions: ConferenceEdition[]): ChangelogEntry[] {
  // Within a day, by conference and then year, so the order does not depend on
  // which file the collection happened to read first. The sort is stable, so
  // one edition's changes on one day stay in the order its YAML lists them.
  return editions
    .flatMap(editionChangelog)
    .sort(
      (a, b) =>
        b.date.getTime() - a.date.getTime() ||
        a.edition.name.localeCompare(b.edition.name) ||
        a.edition.year - b.edition.year,
    );
}

/** The changes made to one edition on one day, shown together as one card. */
export interface ChangelogGroup {
  edition: ConferenceEdition;
  date: Date;
  entries: ChangelogEntry[];
}

/**
 * Every recorded change, newest first, with one edition's changes on one day
 * gathered into a single group. A venue announcement touches city, country and
 * venue at once, and that reads as one event, not three.
 */
export function changelogGroups(editions: ConferenceEdition[]): ChangelogGroup[] {
  const groups: ChangelogGroup[] = [];
  for (const entry of changelogEntries(editions)) {
    const last = groups[groups.length - 1];
    if (last && last.edition.id === entry.edition.id && last.date.getTime() === entry.date.getTime()) {
      last.entries.push(entry);
    } else {
      groups.push({ edition: entry.edition, date: entry.date, entries: [entry] });
    }
  }
  return groups;
}

/** "13 Oct 2026". Change dates are calendar days, so always read in UTC. */
export function formatChangeDate(date: Date, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
