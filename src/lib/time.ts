import { fromZonedTime } from 'date-fns-tz';

/**
 * Deadline timestamps live in YAML as a wall-clock string plus a timezone name.
 * Everything downstream (countdowns, sorting, .ics generation) needs a real UTC
 * instant, and getting that conversion wrong is the single most common bug in
 * the deadline-tracker projects this one is modelled on. All of it lives here.
 */

/** Literal used in the YAML when a deadline is announced but not yet dated. */
export const TBA = 'TBA';

export type DeadlineDate = string;

const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
const OFFSET_RE = /^(?:UTC|GMT)(?:([+-])(\d{1,2})(?::?(\d{2}))?)?$/i;

/**
 * Timezone abbreviations we accept, mapped to their literal fixed offset in
 * minutes. These are deliberately *fixed* rather than resolved through an IANA
 * zone: "CET" means UTC+1 by definition, and guessing that a CFP saying "CET"
 * in July really meant CEST would silently move a deadline by an hour.
 * scripts/validate.ts warns when one of these is used and suggests an IANA zone.
 */
const ABBREVIATION_OFFSETS: Record<string, number> = {
  UT: 0,
  UTC: 0,
  GMT: 0,
  WET: 0,
  WEST: 60,
  BST: 60,
  CET: 60,
  CEST: 120,
  EET: 120,
  EEST: 180,
  MSK: 180,
  IST: 330, // India Standard Time
  JST: 540,
  KST: 540,
  AEST: 600,
  AEDT: 660,
  NZST: 720,
  NZDT: 780,
  HST: -600,
  AKST: -540,
  AKDT: -480,
  PST: -480,
  PDT: -420,
  MST: -420,
  MDT: -360,
  CST: -360, // US Central. For China Standard Time use the IANA zone Asia/Shanghai.
  CDT: -300,
  EST: -300,
  EDT: -240,
  AST: -240,
  BRT: -180,
};

/** Anywhere on Earth: the last timezone on the planet, UTC-12. */
export const AOE_OFFSET_MINUTES = -12 * 60;

export function isTba(value: string | null | undefined): boolean {
  return !value || value.trim().toUpperCase() === TBA;
}

/** Fixed UTC offset in minutes for a timezone label, or null if it is an IANA zone. */
export function fixedOffsetMinutes(timezone: string): number | null {
  const tz = timezone.trim();
  if (tz.toUpperCase() === 'AOE') return AOE_OFFSET_MINUTES;

  const offsetMatch = OFFSET_RE.exec(tz);
  if (offsetMatch) {
    const [, sign, hours, minutes] = offsetMatch;
    if (!sign) return 0; // bare "UTC" / "GMT"
    const magnitude = Number(hours) * 60 + Number(minutes ?? 0);
    return sign === '-' ? -magnitude : magnitude;
  }

  const abbreviation = ABBREVIATION_OFFSETS[tz.toUpperCase()];
  return abbreviation === undefined ? null : abbreviation;
}

/** True if the label names a zone the Intl database knows about. */
export function isIanaZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Accepted by the content schema: AoE, an IANA zone, a UTC/GMT offset, or an abbreviation. */
export function isValidTimezone(timezone: string): boolean {
  return fixedOffsetMinutes(timezone) !== null || isIanaZone(timezone);
}

/**
 * Convert a `YYYY-MM-DD HH:mm:ss` wall-clock string in `timezone` to a UTC instant.
 * Throws on malformed input so a bad YAML entry fails the build rather than
 * silently producing an Invalid Date in a published calendar feed.
 */
export function toUtc(dateString: string, timezone: string): Date {
  const match = DATETIME_RE.exec(dateString.trim());
  if (!match) {
    throw new Error(
      `Invalid deadline "${dateString}": expected "YYYY-MM-DD HH:mm:ss" or "${TBA}".`,
    );
  }

  const [, year, month, day, hour, minute, second] = match;

  const offset = fixedOffsetMinutes(timezone);
  if (offset !== null) {
    const asIfUtc = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second ?? '0'),
    );
    return new Date(asIfUtc - offset * 60_000);
  }

  if (!isIanaZone(timezone)) {
    throw new Error(`Unknown timezone "${timezone}".`);
  }

  // date-fns-tz handles the DST-aware IANA case, including ambiguous local times.
  const normalised = `${year}-${month}-${day}T${hour}:${minute}:${second ?? '00'}`;
  const utc = fromZonedTime(normalised, timezone);
  if (Number.isNaN(utc.getTime())) {
    throw new Error(`Could not convert "${dateString}" in "${timezone}" to UTC.`);
  }
  return utc;
}

/** Human label for a timezone as it should appear next to a deadline. */
export function timezoneLabel(timezone: string): string {
  if (timezone.trim().toUpperCase() === 'AOE') return 'AoE';
  return timezone;
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
  passed: boolean;
}

/** Break the gap between `from` and `target` into calendar-ish units. */
export function countdownParts(target: Date, from: Date = new Date()): CountdownParts {
  const totalMs = target.getTime() - from.getTime();
  const abs = Math.abs(totalMs);
  return {
    days: Math.floor(abs / 86_400_000),
    hours: Math.floor(abs / 3_600_000) % 24,
    minutes: Math.floor(abs / 60_000) % 60,
    seconds: Math.floor(abs / 1000) % 60,
    totalMs,
    passed: totalMs <= 0,
  };
}

export type Urgency = 'passed' | 'urgent' | 'soon' | 'later';

/** Urgency bucket driving the colour of a countdown. */
export function urgencyOf(target: Date, from: Date = new Date()): Urgency {
  const ms = target.getTime() - from.getTime();
  if (ms <= 0) return 'passed';
  if (ms <= 7 * 86_400_000) return 'urgent';
  if (ms <= 30 * 86_400_000) return 'soon';
  return 'later';
}

/**
 * Just the clock time in a specific timezone, e.g. "23:59".
 *
 * Deadline events are all-day, so the stated time has nowhere to live except
 * the event title. Same zone handling as formatInZone: a fixed offset is
 * applied literally, an IANA zone goes through Intl so DST is honoured.
 */
export function formatTimeInZone(instant: Date, timezone: string, locale = 'en-GB'): string {
  const offset = fixedOffsetMinutes(timezone);

  if (offset !== null) {
    const shifted = new Date(instant.getTime() + offset * 60_000);
    return new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'UTC' }).format(shifted);
  }

  return new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: timezone }).format(
    instant,
  );
}

/** Render an instant in a specific timezone, e.g. "6 Oct 2025, 23:59". */
export function formatInZone(instant: Date, timezone: string, locale = 'en-GB'): string {
  const offset = fixedOffsetMinutes(timezone);

  if (offset !== null) {
    // Shift the instant and format as UTC so the fixed offset is honoured exactly.
    const shifted = new Date(instant.getTime() + offset * 60_000);
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(shifted);
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(instant);
}
