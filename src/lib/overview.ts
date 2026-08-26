import type { ConferenceEdition } from './edition';
import { deadlineTypeStyle, getTag, tagLabel, type TagId } from './taxonomy';
import { formatTimeInZone, timezoneLabel } from './time';

/**
 * Turns editions into a year of calendar cells.
 *
 * Pure and free of astro:content, because this is where the off-by-ones live:
 * week padding, runs that cross a month or a year, and the gap between a
 * deadline's stated date and the UTC instant it resolves to. The grid must
 * agree with the .ics feed about which day a deadline falls on, so both read
 * the stated wall-clock date rather than the instant.
 */

const DAY_MS = 86_400_000;

/** Weeks start on Monday: this is a European site, and ISO-8601 says so. */
const WEEK_START = 1;

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Weekday headings, Monday first. */
export const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export interface OverviewDeadline {
  editionId: string;
  /** "PSCC 2026", as shown in the popover. */
  editionName: string;
  label: string;
  /** The stated clock time, e.g. "23:59". */
  time: string;
  /** The zone as the CFP states it, e.g. "AoE". */
  timezone: string;
  /** Deadline kind, e.g. "paper". */
  type: string;
  /** How this kind of deadline reads in the legend, e.g. "Camera-ready". */
  typeLabel: string;
  /** Dot colour for this kind. Resolved here so no caller interpolates one. */
  dotClass: string;
}

export interface OverviewEvent {
  editionId: string;
  editionName: string;
  /** The run as the CFP writes it, e.g. "October 18-21, 2026". */
  dateLabel: string;
  location: string;
  /** The conference's leading topic, which colours its band. */
  topic: string;
  /** Tinted band for that topic. Resolved here so no caller interpolates one. */
  barClass: string;
  /** First day of the run, so the bar can be rounded at its start. */
  isStart: boolean;
  /** Last day of the run. */
  isEnd: boolean;
}

export interface OverviewDay {
  /** YYYY-MM-DD. */
  date: string;
  dayOfMonth: number;
  /** False for the padding cells that complete the first and last weeks. */
  inMonth: boolean;
  isToday: boolean;
  deadlines: OverviewDeadline[];
  events: OverviewEvent[];
}

export interface OverviewMonth {
  month: number;
  label: string;
  weeks: OverviewDay[][];
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDay(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Every day a conference runs, inclusive of both ends. */
function runDays(edition: ConferenceEdition): string[] {
  if (!edition.start) return [];

  const last = edition.end ?? edition.start;
  const days: string[] = [];

  for (let t = edition.start.getTime(); t <= last.getTime(); t += DAY_MS) {
    days.push(isoDay(new Date(t)));
  }

  return days;
}

/** The stated calendar date of a deadline, or null when it is TBA. */
function deadlineDay(raw: string): string | null {
  return raw.length >= 10 && raw[4] === '-' ? raw.slice(0, 10) : null;
}

/** Years that any deadline or conference touches, ascending. */
export function yearsWithData(editions: ConferenceEdition[]): number[] {
  const years = new Set<number>();

  for (const edition of editions) {
    if (edition.cancelled) continue;

    for (const deadline of edition.deadlines) {
      const day = deadline.tba ? null : deadlineDay(deadline.raw);
      if (day) years.add(Number(day.slice(0, 4)));
    }
    for (const day of runDays(edition)) years.add(Number(day.slice(0, 4)));
  }

  return [...years].sort((a, b) => a - b);
}

export function buildYearOverview(
  editions: ConferenceEdition[],
  year: number,
  now: Date,
): OverviewMonth[] {
  const deadlinesByDay = new Map<string, OverviewDeadline[]>();
  const eventsByDay = new Map<string, OverviewEvent[]>();

  for (const edition of editions) {
    if (edition.cancelled) continue;

    const editionName = `${edition.name} ${edition.year}`;

    for (const deadline of edition.deadlines) {
      if (deadline.tba || !deadline.utc) continue;

      const day = deadlineDay(deadline.raw);
      if (!day) continue;

      const list = deadlinesByDay.get(day) ?? [];
      list.push({
        editionId: edition.id,
        editionName,
        label: deadline.label,
        time: formatTimeInZone(deadline.utc, deadline.timezone),
        timezone: timezoneLabel(deadline.timezone),
        type: deadline.type,
        typeLabel: deadlineTypeStyle(deadline.type).label,
        dotClass: deadlineTypeStyle(deadline.type).dotClass,
      });
      deadlinesByDay.set(day, list);
    }

    const days = runDays(edition);
    days.forEach((day, index) => {
      const list = eventsByDay.get(day) ?? [];
      list.push({
        editionId: edition.id,
        editionName,
        dateLabel: edition.dateLabel,
        location: [edition.city, edition.country].filter(Boolean).join(', '),
        topic: leadTag(edition) ? tagLabel(leadTag(edition)!) : 'Conference',
        barClass: leadTag(edition) ? getTag(leadTag(edition)!)!.barClass : 'bg-primary/15',
        isStart: index === 0,
        isEnd: index === days.length - 1,
      });
      eventsByDay.set(day, list);
    });
  }

  const today = isoDay(now);

  return MONTH_LABELS.map((label, index) => ({
    month: index + 1,
    label,
    weeks: monthWeeks(year, index, today, deadlinesByDay, eventsByDay),
  }));
}

function monthWeeks(
  year: number,
  monthIndex: number,
  today: string,
  deadlinesByDay: Map<string, OverviewDeadline[]>,
  eventsByDay: Map<string, OverviewEvent[]>,
): OverviewDay[][] {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const last = new Date(Date.UTC(year, monthIndex + 1, 0));

  // Back up to the Monday on or before the 1st, then run whole weeks.
  const lead = (first.getUTCDay() - WEEK_START + 7) % 7;
  const cursor = new Date(first.getTime() - lead * DAY_MS);

  const weeks: OverviewDay[][] = [];

  while (cursor.getTime() <= last.getTime() || weeks.length === 0) {
    const week: OverviewDay[] = [];

    for (let i = 0; i < 7; i += 1) {
      const date = isoDay(cursor);
      week.push({
        date,
        dayOfMonth: cursor.getUTCDate(),
        inMonth: cursor.getUTCMonth() === monthIndex,
        isToday: date === today,
        deadlines: deadlinesByDay.get(date) ?? [],
        events: eventsByDay.get(date) ?? [],
      });
      cursor.setTime(cursor.getTime() + DAY_MS);
    }

    weeks.push(week);
  }

  return weeks;
}

/** A conference's leading topic: the first tag its series lists. */
function leadTag(edition: ConferenceEdition): TagId | undefined {
  return edition.tags[0];
}

/** Leading topics actually present, in first-seen order, for the legend. */
export function leadTagsInUse(editions: ConferenceEdition[]): TagId[] {
  const tags: TagId[] = [];

  for (const edition of editions) {
    if (edition.cancelled || !edition.start) continue;
    const tag = leadTag(edition);
    if (tag && !tags.includes(tag)) tags.push(tag);
  }

  return tags;
}

/** Deadline types actually present, in first-seen order, so the legend explains only what is shown. */
export function deadlineTypesInUse(editions: ConferenceEdition[]): string[] {
  const types: string[] = [];

  for (const edition of editions) {
    if (edition.cancelled) continue;
    for (const deadline of edition.deadlines) {
      if (deadline.tba || !deadline.utc) continue;
      if (!types.includes(deadline.type)) types.push(deadline.type);
    }
  }

  return types;
}

/** Whether a day has anything worth marking. */
export function hasMarks(day: OverviewDay): boolean {
  return day.inMonth && (day.deadlines.length > 0 || day.events.length > 0);
}

export { utcDay };
