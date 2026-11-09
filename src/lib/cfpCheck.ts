/**
 * Compares an edition against the text of its official pages, to notice a
 * deadline that moved without anybody telling us.
 *
 * This is the cheap, deterministic half of the daily check: it reads dates out
 * of plain text and reports where they disagree with the YAML. It never decides
 * what the right date is. Every finding is a reason for someone (a human, or
 * the Claude step in check-deadlines.yml whose pull request a human merges) to
 * re-read the call for papers.
 *
 * Pure: no network, no `astro:content`. scripts/check-cfps.ts does the
 * fetching and hands the page text in here, so tests can drive this directly.
 */

import { deadlineDay } from './calendar';
import type { ConferenceEdition } from './edition';
import { editionVerification } from './verification';

const DAY_MS = 86_400_000;

/** A deadline this far behind us is no longer worth checking for a change. */
export const PAST_DEADLINE_GRACE_DAYS = 30;

/** Characters of page text kept either side of a date, as evidence. */
const CONTEXT_CHARS = 80;

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

// Longest names first, so "June" wins over "Jun" in the alternation.
const MONTH = `(${Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join('|')})\\.?`;
const DAY = '(\\d{1,2})(?:st|nd|rd|th)?';
const YEAR = '(\\d{4})';
const DASH = '\\s*(?:-|–|—|to|until)\\s*';

export interface ExtractedDate {
  /** `YYYY-MM-DD`, or null when the page gave no year. */
  day: string | null;
  /** `MM-DD`, always set, so a year-less date can still be matched. */
  monthDay: string;
  /** Page text around the date. */
  context: string;
  /** The few words just before the date, to tell "extended to" from "extended from". */
  before: string;
  /** Offset of the match in the text. */
  index: number;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Rejects 31 February and friends rather than letting Date roll them over. */
function validDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function monthNumber(name: string): number {
  return MONTHS[name.toLowerCase().replace(/\.$/, '')] ?? 0;
}

interface Pattern {
  regex: RegExp;
  /** Turns a match into zero or more [year | null, month, day] triples. */
  read: (m: RegExpExecArray) => Array<[number | null, number, number]>;
}

/**
 * Most specific first. A span claimed by an earlier pattern is not re-read by a
 * later one, so "27 November 2026" is never also counted as a year-less
 * "27 November".
 */
const PATTERNS: Pattern[] = [
  // 14 - 16 April 2027
  {
    regex: new RegExp(`\\b${DAY}${DASH}${DAY}\\s+(?:of\\s+)?${MONTH},?\\s+${YEAR}\\b`, 'gi'),
    read: (m) => [
      [Number(m[4]), monthNumber(m[3]!), Number(m[1])],
      [Number(m[4]), monthNumber(m[3]!), Number(m[2])],
    ],
  },
  // April 14 - 16, 2027
  {
    regex: new RegExp(`\\b${MONTH}\\s+${DAY}${DASH}${DAY},?\\s+${YEAR}\\b`, 'gi'),
    read: (m) => [
      [Number(m[4]), monthNumber(m[1]!), Number(m[2])],
      [Number(m[4]), monthNumber(m[1]!), Number(m[3])],
    ],
  },
  // 27 November 2026, 27th of November, 2026
  {
    regex: new RegExp(`\\b${DAY}\\s+(?:of\\s+)?${MONTH},?\\s+${YEAR}\\b`, 'gi'),
    read: (m) => [[Number(m[3]), monthNumber(m[2]!), Number(m[1])]],
  },
  // November 27, 2026
  {
    regex: new RegExp(`\\b${MONTH}\\s+${DAY},?\\s+${YEAR}\\b`, 'gi'),
    read: (m) => [[Number(m[3]), monthNumber(m[1]!), Number(m[2])]],
  },
  // 27-Oct-2026, 27/Oct/2026
  {
    regex: new RegExp(`\\b${DAY}[-/]${MONTH}[-/]${YEAR}\\b`, 'gi'),
    read: (m) => [[Number(m[3]), monthNumber(m[2]!), Number(m[1])]],
  },
  // 2026-11-27
  {
    regex: /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    read: (m) => [[Number(m[1]), Number(m[2]), Number(m[3])]],
  },
  // 27/11/2026 or 11/27/2026, read only when one part rules the other order out.
  {
    regex: /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g,
    read: (m) => {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const year = Number(m[3]);
      if (a > 12 && b <= 12) return [[year, b, a]];
      if (b > 12 && a <= 12) return [[year, a, b]];
      return [];
    },
  },
  // 27 November (no year)
  {
    regex: new RegExp(`\\b${DAY}\\s+(?:of\\s+)?${MONTH}(?![a-z])`, 'gi'),
    read: (m) => [[null, monthNumber(m[2]!), Number(m[1])]],
  },
  // November 27 (no year)
  {
    regex: new RegExp(`\\b${MONTH}\\s+${DAY}\\b`, 'gi'),
    read: (m) => [[null, monthNumber(m[1]!), Number(m[2])]],
  },
];

/** Every date a page states, in the order they appear. */
export function extractDates(text: string): ExtractedDate[] {
  const taken: Array<[number, number]> = [];
  const found: ExtractedDate[] = [];

  const overlaps = (start: number, end: number) => taken.some(([s, e]) => start < e && end > s);

  for (const { regex, read } of PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (overlaps(start, end)) continue;

      const triples = read(match).filter(([year, month, day]) =>
        validDay(year ?? 2000 /* a leap year, so 29 Feb survives */, month, day),
      );
      if (triples.length === 0) continue;

      taken.push([start, end]);
      const context = text
        .slice(Math.max(0, start - CONTEXT_CHARS), Math.min(text.length, end + CONTEXT_CHARS))
        .trim();

      for (const [year, month, day] of triples) {
        found.push({
          day: year === null ? null : `${year}-${pad(month)}-${pad(day)}`,
          monthDay: `${pad(month)}-${pad(day)}`,
          context,
          before: text.slice(Math.max(0, start - 30), start),
          index: start,
        });
      }
    }
  }

  return found.sort((a, b) => a.index - b.index);
}

/** Whether a page date can be the given `YYYY-MM-DD` day. */
function sameDay(found: ExtractedDate, day: string): boolean {
  return found.day === null ? found.monthDay === day.slice(5) : found.day === day;
}

export type FindingKind =
  /** A deadline in the YAML that the pages no longer state. */
  | 'missing-date'
  /** "Extended", "postponed" and the like, next to a date the YAML lacks. */
  | 'extension-notice'
  /** A TBA in the YAML, and the pages now give a dated deadline. */
  | 'tba-now-dated'
  /** Neither the start nor the end day of the event appears on the pages. */
  | 'conference-dates'
  /** The `verified:` date has aged past its limit; a re-check is due anyway. */
  | 'stale'
  /** The pages were fetched but no date could be read from them at all. */
  | 'no-dates'
  /** No page could be fetched. */
  | 'fetch-failed';

export interface Finding {
  kind: FindingKind;
  message: string;
  /** Page text that triggered the finding, when there is some. */
  evidence?: string;
}

/**
 * Kinds a person has to look at themselves: there is nothing on the page for
 * an automated reader to work from.
 */
export const HUMAN_ONLY_KINDS: ReadonlySet<FindingKind> = new Set(['no-dates', 'fetch-failed']);

/**
 * An extension, worded the ways CFPs word it. Bare "extended" is not enough:
 * "extended digest" and "extended abstract" are formats, not news.
 */
const EXTENSION_WORDS =
  /\b(deadlines?\s+(?:has\s+been\s+|have\s+been\s+|is\s+|are\s+)?extended|extended\s+(?:deadlines?|to|until|till|by)\b|extension|postponed|new\s+deadline|moved\s+to|deferred)\b/i;

/** "Extended from 25 September": the date that follows is the old one. */
const OLD_DATE_LEAD = /\b(from|was|originally|previously|formerly)\s*:?\s*(?:\w+day,?\s*)?$/i;
const DEADLINE_WORDS =
  /\b(deadline|submission|submit|due|notification|abstract|paper|camera[- ]ready|registration|proposal)s?\b/i;

/**
 * Whether the edition is still worth checking at all. The same "upcoming" as
 * editionVerification(): a TBA counts, because that is the change nobody
 * announces. Past editions are never touched.
 */
export function needsChecking(edition: ConferenceEdition): boolean {
  if (edition.cancelled) return false;
  return (
    edition.hasUpcomingDeadline ||
    edition.deadlines.some((deadline) => deadline.tba) ||
    edition.isUpcomingEvent
  );
}

function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Compare an edition with the combined text of its official pages.
 *
 * @param pageText every fetched page for this edition, concatenated
 */
export function checkEdition(
  edition: ConferenceEdition,
  pageText: string,
  now: Date = new Date(),
): Finding[] {
  const findings: Finding[] = [];
  const dates = extractDates(pageText);
  const today = dayString(now);

  const verification = editionVerification(edition, now);
  if (verification.stale) {
    findings.push({
      kind: 'stale',
      message:
        `Last verified ${verification.ageDays} days ago ` +
        `(limit ${verification.maxAgeDays}); due for a re-check.`,
    });
  }

  if (dates.length === 0) {
    findings.push({
      kind: 'no-dates',
      message:
        'No date could be read from the official pages. They may be rendered by ' +
        'JavaScript, moved, or the dates may live on a page the checker does not follow.',
    });
    return findings;
  }

  // The day the CFP states, from the raw string: the same rule as the feeds.
  const grace = new Date(now.getTime() - PAST_DEADLINE_GRACE_DAYS * DAY_MS);
  const known = new Set<string>();
  for (const deadline of edition.deadlines) {
    if (deadline.tba) continue;
    const day = dayString(deadlineDay(deadline));
    known.add(day);

    // A deadline long gone can drop off the page without anything being wrong.
    if (deadline.utc && deadline.utc.getTime() < grace.getTime()) continue;

    if (!dates.some((found) => sameDay(found, day))) {
      findings.push({
        kind: 'missing-date',
        message: `${deadline.label} (${day}) is not stated on the official pages any more.`,
      });
    }
  }

  const eventDays = [edition.start, edition.end]
    .filter((date): date is Date => date !== undefined)
    .map(dayString);
  for (const day of eventDays) known.add(day);

  const isKnown = (found: ExtractedDate) => [...known].some((day) => sameDay(found, day));

  // Dates relevant to this edition: from about a year before it up to its end.
  const firstYear = edition.year - 1;
  const inWindow = (found: ExtractedDate) => {
    if (found.day === null) return true;
    const year = Number(found.day.slice(0, 4));
    return year >= firstYear && year <= edition.year;
  };

  const reported = new Set<string>();
  for (const found of dates) {
    if (isKnown(found) || !inWindow(found)) continue;
    if (!EXTENSION_WORDS.test(found.context) || OLD_DATE_LEAD.test(found.before)) continue;
    const key = found.day ?? found.monthDay;
    if (reported.has(key)) continue;
    reported.add(key);
    findings.push({
      kind: 'extension-notice',
      message: `The pages mention an extension or change near ${key}, which is not in the data.`,
      evidence: found.context,
    });
  }

  if (edition.deadlines.some((deadline) => deadline.tba)) {
    const startDay = edition.start ? dayString(edition.start) : null;
    const candidates = dates.filter(
      (found) =>
        found.day !== null &&
        !isKnown(found) &&
        found.day >= today &&
        (startDay === null || found.day < startDay) &&
        DEADLINE_WORDS.test(found.context),
    );
    const first = candidates[0];
    if (first) {
      findings.push({
        kind: 'tba-now-dated',
        message:
          `The data still has TBA deadlines, and the pages now show ` +
          `${[...new Set(candidates.map((found) => found.day))].join(', ')} near deadline wording.`,
        evidence: first.context,
      });
    }
  }

  if (
    eventDays.length > 0 &&
    !eventDays.some((day) => dates.some((found) => sameDay(found, day)))
  ) {
    findings.push({
      kind: 'conference-dates',
      message: `Neither event day (${eventDays.join(' to ')}) appears on the official pages.`,
    });
  }

  return findings;
}

/** Whether any finding is one the Claude step can act on. */
export function isActionable(findings: Finding[]): boolean {
  return findings.some((finding) => !HUMAN_ONLY_KINDS.has(finding.kind));
}
