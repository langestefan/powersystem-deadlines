import type { ConferenceSeriesData, DeadlineData, EditionData } from '../content.config';
import { regionForCountry } from './regions';
import { SUBMISSION_DEADLINE_TYPES, type Region, type Society, type TagId } from './taxonomy';
import { isTba, toUtc, urgencyOf, type Urgency } from './time';

/**
 * Conference edition types and the pure functions that derive them from the raw
 * YAML shape.
 *
 * Deliberately free of any `astro:content` import so this module can be unit
 * tested directly. src/lib/conferences.ts is the thin layer that reads the
 * content collection and calls into here.
 */

export const DEFAULT_TIMEZONE = 'AoE';

export interface ResolvedDeadline {
  type: string;
  label: string;
  /** The raw YAML value, so "TBA" can be shown verbatim. */
  raw: string;
  tba: boolean;
  timezone: string;
  /** Null when the deadline is TBA. */
  utc: Date | null;
  link?: string;
}

export interface ConferenceEdition {
  /** Unique across the whole site; used in URLs and ICS UIDs. */
  id: string;
  /** Collection entry id of the series file, e.g. "pscc". */
  seriesId: string;
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
  const timezone = deadline.timezone ?? editionTimezone ?? DEFAULT_TIMEZONE;
  const tba = isTba(deadline.date);

  return {
    type: deadline.type,
    label: deadline.label,
    raw: deadline.date,
    tba,
    timezone,
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

  const end = parseDay(edition.end);
  const start = parseDay(edition.start);

  return {
    id: edition.id,
    seriesId,
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

/** Every tag that at least one edition uses, in taxonomy order. */
export function tagsInUse(editions: ConferenceEdition[]): TagId[] {
  const used = new Set<TagId>();
  for (const edition of editions) for (const tag of edition.tags) used.add(tag);
  return [...used];
}

export function urgencyFor(edition: ConferenceEdition, now: Date = new Date()): Urgency {
  const next = edition.nextDeadline ?? edition.nextAnyDeadline;
  return next?.utc ? urgencyOf(next.utc, now) : 'passed';
}

/** "Delft, Netherlands" / "Online": the one-line location shown on a card. */
export function locationLabel(edition: ConferenceEdition): string {
  if (edition.format === 'online') return 'Online';
  return [edition.city, edition.country].filter(Boolean).join(', ') || 'Location TBA';
}
