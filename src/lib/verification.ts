/**
 * How recently an edition was checked against its official call for papers.
 *
 * Dates entered correctly can still go wrong on their own: a deadline gets
 * extended, a venue moves, a TBA finally gets a date. Nothing in the data
 * reveals that, which is how an aggregator quietly starts lying. Every edition
 * therefore carries a `verified:` date, and this module decides when that date
 * has aged far enough to be worth warning about.
 *
 * Pure and free of any astro:content import, so both scripts/validate.ts and
 * the pages can use it and it can be unit tested directly.
 */

import type { ConferenceEdition } from './edition';

const DAY_MS = 86_400_000;

/** A deadline this close deserves a recently checked entry. */
export const URGENT_WINDOW_DAYS = 60;

/** Maximum age of a check for an edition inside that window. */
export const URGENT_MAX_AGE_DAYS = 30;

/** Maximum age of a check for everything else still ahead of us. */
export const DEFAULT_MAX_AGE_DAYS = 120;

export interface VerificationStatus {
  /** Whole days since the edition was last checked. */
  ageDays: number;
  /** The limit that applies to this edition; Infinity when it is exempt. */
  maxAgeDays: number;
  stale: boolean;
}

/** Whether the next deadline is close enough to demand a fresher check. */
function isUrgent(nextDeadline: Date | null, now: Date): boolean {
  if (!nextDeadline) return false;

  const msAway = nextDeadline.getTime() - now.getTime();
  // A deadline already behind us says nothing about how stale the entry is.
  if (msAway < 0) return false;

  return msAway <= URGENT_WINDOW_DAYS * DAY_MS;
}

/**
 * @param verified     the date someone last checked this edition's CFP
 * @param nextDeadline soonest future deadline, or null when none is dated yet
 * @param upcoming     whether the edition still lies ahead; a finished one is exempt
 */
export function verificationStatus(
  verified: Date,
  nextDeadline: Date | null,
  upcoming: boolean,
  now: Date,
): VerificationStatus {
  const ageDays = Math.floor((now.getTime() - verified.getTime()) / DAY_MS);

  // Nobody needs to re-read a call for papers that has already closed.
  if (!upcoming) return { ageDays, maxAgeDays: Infinity, stale: false };

  const maxAgeDays = isUrgent(nextDeadline, now) ? URGENT_MAX_AGE_DAYS : DEFAULT_MAX_AGE_DAYS;

  return { ageDays, maxAgeDays, stale: ageDays > maxAgeDays };
}

/** "today", "3 days ago", "2 months ago" - for the freshness line on a page. */
export function describeAge(ageDays: number): string {
  if (ageDays <= 0) return 'today';
  if (ageDays === 1) return 'yesterday';
  if (ageDays < 45) return `${ageDays} days ago`;

  const months = Math.round(ageDays / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}

/**
 * The same rule applied to a flattened edition.
 *
 * "Upcoming" is deliberately generous: an edition with only TBA dates still
 * needs re-checking, because a TBA turning into a real date is precisely the
 * change nobody gets told about.
 */
export function editionVerification(
  edition: ConferenceEdition,
  now: Date = new Date(),
): VerificationStatus {
  const upcoming =
    edition.hasUpcomingDeadline ||
    edition.deadlines.some((deadline) => deadline.tba) ||
    edition.isUpcomingEvent;

  return verificationStatus(edition.verified, edition.nextAnyDeadline?.utc ?? null, upcoming, now);
}
