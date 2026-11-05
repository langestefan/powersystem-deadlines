import type {
  ConferenceSeriesData,
  DeadlineData,
  EditionData,
  ProgramItemData,
} from '../content.config';
import { regionForCountry } from './regions';
import {
  kindLabel,
  REGIONS,
  SOCIETIES,
  SUBMISSION_DEADLINE_TYPES,
  TAGS,
  tagLabel,
  type EntryKind,
  type Region,
  type Society,
  type TagId,
} from './taxonomy';
import { isTba, timezoneLabel, toUtc, UNSTATED_TIMEZONE, urgencyOf } from './time';

/**
 * Conference edition types and the pure functions that derive them from the raw
 * YAML shape.
 *
 * Deliberately free of any `astro:content` import so this module can be unit
 * tested directly. src/lib/conferences.ts is the thin layer that reads the
 * content collection and calls into here.
 */

/**
 * Shown wherever an assumed zone appears, so the reader knows the site chose it
 * rather than the call for papers.
 */
export const UNSTATED_TIMEZONE_NOTE =
  'The call for papers states no timezone. This is counted as UTC+12, the earliest ' +
  'it could plausibly mean, so the countdown runs out before the real deadline ' +
  'rather than after it.';

export interface ResolvedDeadline {
  type: string;
  label: string;
  /** The raw YAML value, so "TBA" can be shown verbatim. */
  raw: string;
  tba: boolean;
  timezone: string;
  /**
   * False when no call for papers stated a zone and UNSTATED_TIMEZONE was
   * assumed, which the UI has to disclose rather than pass off as fact.
   */
  timezoneStated: boolean;
  /** Null when the deadline is TBA. */
  utc: Date | null;
  link?: string;
}

/** One changed field of an edition, as shown in the /changelog table. */
export interface EditionChange {
  /** The day the entry was changed, at UTC midnight. */
  date: Date;
  field: string;
  /** Undefined when the value was added rather than replaced. */
  old?: string;
  /** Undefined when the value was removed. */
  new?: string;
}

export interface ConferenceEdition {
  /** Unique across the whole site; used in URLs and ICS UIDs. */
  id: string;
  /** Collection entry id of the series file, e.g. "pscc". */
  seriesId: string;
  /** "conference", or "event" for a meeting listed on /events instead of the homepage. */
  kind: EntryKind;
  name: string;
  fullName: string;
  description?: string;
  year: number;
  link: string;
  society: Society[];
  frequency: ConferenceSeriesData['frequency'];
  tags: TagId[];
  city?: string;
  country?: string;
  region?: Region;
  venue?: string;
  /** Human-readable event dates as written in the CFP. */
  dateLabel: string;
  /** Date this edition was last checked against its call for papers. */
  verified: Date;
  start?: Date;
  end?: Date;
  format: EditionData['format'];
  proceedings?: string;
  submissionType?: EditionData['submission_type'];
  note?: string;
  /** Changes made since the edition was added, newest first. */
  changes: EditionChange[];
  /** The programme in the order it runs, empty when none is listed. */
  program: ProgramItemData[];
  cancelled: boolean;
  deadlines: ResolvedDeadline[];
  /** Soonest future deadline of a submission kind, driving the headline countdown. */
  nextDeadline: ResolvedDeadline | null;
  /** Soonest future deadline of any kind, used for sorting when nextDeadline is null. */
  nextAnyDeadline: ResolvedDeadline | null;
  hasUpcomingDeadline: boolean;
  /** True while the event itself has not finished. */
  isUpcomingEvent: boolean;
}

export function resolveDeadline(
  deadline: DeadlineData,
  editionTimezone: string | undefined,
): ResolvedDeadline {
  const stated = deadline.timezone ?? editionTimezone;
  const timezone = stated ?? UNSTATED_TIMEZONE;
  const tba = isTba(deadline.date);

  return {
    type: deadline.type,
    label: deadline.label,
    raw: deadline.date,
    tba,
    timezone,
    timezoneStated: stated !== undefined,
    utc: tba ? null : toUtc(deadline.date, timezone),
    link: deadline.link,
  };
}

function parseDay(value: string | undefined): Date | undefined {
  return value ? new Date(`${value}T00:00:00Z`) : undefined;
}

export function flattenEdition(
  series: ConferenceSeriesData,
  seriesId: string,
  edition: EditionData,
  now: Date,
): ConferenceEdition {
  const deadlines = edition.deadlines
    .map((deadline) => resolveDeadline(deadline, edition.timezone))
    .sort((a, b) => {
      // TBA sinks to the bottom; everything else is chronological.
      if (!a.utc) return b.utc ? 1 : 0;
      if (!b.utc) return -1;
      return a.utc.getTime() - b.utc.getTime();
    });

  const future = deadlines.filter((d) => d.utc !== null && d.utc.getTime() > now.getTime());
  const nextDeadline = future.find((d) => SUBMISSION_DEADLINE_TYPES.has(d.type)) ?? null;
  const nextAnyDeadline = future[0] ?? null;

  const changes = (edition.changes ?? [])
    .map((change) => ({ ...change, date: new Date(`${change.date}T00:00:00Z`) }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const end = parseDay(edition.end);
  const start = parseDay(edition.start);

  return {
    id: edition.id,
    seriesId,
    kind: series.kind,
    name: series.name,
    fullName: series.full_name,
    description: series.description,
    year: edition.year,
    link: edition.link ?? series.link,
    society: [...series.society],
    frequency: series.frequency,
    tags: [...new Set([...series.tags, ...(edition.tags ?? [])])] as TagId[],
    city: edition.city,
    country: edition.country,
    region: edition.region ?? regionForCountry(edition.country),
    venue: edition.venue,
    dateLabel: edition.date,
    verified: new Date(`${edition.verified}T00:00:00Z`),
    start,
    end,
    format: edition.format,
    proceedings: edition.proceedings,
    submissionType: edition.submission_type,
    note: edition.note,
    changes,
    program: edition.program ?? [],
    cancelled: edition.cancelled,
    deadlines,
    nextDeadline,
    nextAnyDeadline,
    hasUpcomingDeadline: future.length > 0,
    isUpcomingEvent: end ? end.getTime() >= now.getTime() : true,
  };
}

/**
 * Sort key: conferences with a live submission deadline first (soonest first),
 * then anything else with a future date, then everything without one.
 */
function sortKey(edition: ConferenceEdition): number {
  const next = edition.nextDeadline ?? edition.nextAnyDeadline;
  if (next?.utc) return next.utc.getTime();
  if (edition.start) return edition.start.getTime() + 1e12; // after all real deadlines
  return Number.MAX_SAFE_INTEGER;
}

export function sortEditions(editions: ConferenceEdition[]): ConferenceEdition[] {
  return [...editions].sort((a, b) => sortKey(a) - sortKey(b) || a.name.localeCompare(b.name));
}

/**
 * Events in the order they take place, undated ones last. For a meeting the
 * day it happens is the thing to plan around; a poster deadline, if it has one,
 * still shows on its card.
 */
export function sortByStart(editions: ConferenceEdition[]): ConferenceEdition[] {
  const key = (edition: ConferenceEdition) => edition.start?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return [...editions].sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name));
}

/** Every tag that at least one edition uses, in taxonomy order. */
export function tagsInUse(editions: ConferenceEdition[]): TagId[] {
  const used = new Set<TagId>();
  for (const edition of editions) for (const tag of edition.tags) used.add(tag);
  return [...used];
}

/**
 * How a deadline's zone reads next to it: "AoE", "CET", "UTC+12 (assumed)".
 *
 * Every surface goes through this rather than timezoneLabel() directly, so an
 * assumed zone can never be printed as though the call for papers said it.
 */
export function deadlineZoneLabel(deadline: ResolvedDeadline): string {
  const label = timezoneLabel(deadline.timezone);
  return deadline.timezoneStated ? label : `${label} (assumed)`;
}

/**
 * Where an edition stands for somebody who wants to submit to it.
 *
 * `closed` and `unannounced` are deliberately separate: a conference whose call
 * has shut and one whose call has not opened are opposite situations, and
 * showing both under "dates not announced" tells a reader the wrong thing about
 * each.
 */
export type SubmissionStatus = 'urgent' | 'soon' | 'later' | 'closed' | 'unannounced';

export function submissionStatus(
  edition: ConferenceEdition,
  now: Date = new Date(),
): SubmissionStatus {
  const next = edition.nextDeadline ?? edition.nextAnyDeadline;

  if (next?.utc) {
    const urgency = urgencyOf(next.utc, now);
    if (urgency !== 'passed') return urgency;
  }

  // A dated deadline that has been and gone means submission is over, even if
  // some later milestone is still TBA.
  const hasPassedDeadline = edition.deadlines.some(
    (deadline) => deadline.utc !== null && deadline.utc.getTime() <= now.getTime(),
  );

  return hasPassedDeadline ? 'closed' : 'unannounced';
}

/**
 * What the edition's `link` is called. A conference links its call for papers;
 * an event often has none, only a page with the programme and a sign-up form.
 */
export function officialLinkLabel(edition: ConferenceEdition): string {
  return edition.kind === 'event' ? 'Website' : 'Call for papers';
}

/** "Delft, Netherlands" / "Online": the one-line location shown on a card. */
export function locationLabel(edition: ConferenceEdition): string {
  if (edition.format === 'online') return 'Online';
  return [edition.city, edition.country].filter(Boolean).join(', ') || 'Location TBA';
}

/**
 * The data-* attributes the homepage filter reads, for anything it filters:
 * upcoming cards and the archive rows alike. One definition, so a conference
 * found by one cannot be missed by the other.
 */
export function filterAttributes(edition: ConferenceEdition) {
  const search = [
    edition.name,
    edition.fullName,
    String(edition.year),
    edition.city,
    edition.country,
    edition.venue,
    kindLabel(edition.kind),
    ...edition.society,
    ...edition.tags.map(tagLabel),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return {
    'data-tags': edition.tags.join(' '),
    'data-societies': edition.society.join('|'),
    'data-region': edition.region ?? '',
    'data-country': edition.country ?? '',
    'data-search': search,
  };
}

/** One chip in the filter bar, with how many listed editions it would match. */
export interface FilterOptionCount {
  id: string;
  label: string;
  className?: string;
  count: number;
}

/**
 * The tag, society and region chips for a list of editions, in taxonomy order,
 * leaving out any that would match nothing.
 */
export function filterOptions(editions: ConferenceEdition[]): {
  tags: FilterOptionCount[];
  societies: FilterOptionCount[];
  regions: FilterOptionCount[];
} {
  const count = (predicate: (edition: ConferenceEdition) => boolean) =>
    editions.filter(predicate).length;
  const nonEmpty = (option: FilterOptionCount) => option.count > 0;

  return {
    tags: TAGS.map((tag) => ({
      id: tag.id,
      label: tag.label,
      className: tag.className,
      count: count((edition) => edition.tags.includes(tag.id)),
    })).filter(nonEmpty),
    societies: SOCIETIES.map((society) => ({
      id: society,
      label: society,
      count: count((edition) => edition.society.includes(society)),
    })).filter(nonEmpty),
    regions: REGIONS.map((region) => ({
      id: region,
      label: region,
      count: count((edition) => edition.region === region),
    })).filter(nonEmpty),
  };
}
