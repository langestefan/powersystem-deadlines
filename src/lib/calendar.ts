import { locationLabel, type ConferenceEdition, type ResolvedDeadline } from './edition';
import type { IcsEvent } from './ics';
import { formatInZone, formatTimeInZone, timezoneLabel } from './time';
import { tagLabel } from './taxonomy';

/**
 * Maps conference editions onto calendar events. Kept separate from ics.ts so
 * the RFC-5545 layer stays domain-free and independently testable.
 */

/**
 * Reminders attached to every deadline event. Whether these actually fire is up
 * to the subscriber's client: alarms on subscribed calendars are honoured
 * inconsistently, so treat them as a bonus rather than something to promise.
 */
const DEADLINE_ALARMS = [
  { trigger: '-P7D', description: 'One week until this submission deadline' },
  { trigger: '-P1D', description: 'One day until this submission deadline' },
];

/**
 * Stable event identifier. Uses the deadline's ordinal among same-typed
 * deadlines rather than its index or date, so editing a date moves the existing
 * calendar entry instead of creating a duplicate.
 */
export function deadlineUid(
  edition: ConferenceEdition,
  deadline: ResolvedDeadline,
  ordinal: number,
  domain: string,
): string {
  const suffix = ordinal === 0 ? '' : `-${ordinal + 1}`;
  return `${edition.id}-${deadline.type}${suffix}@${domain}`;
}

export function eventUid(edition: ConferenceEdition, domain: string): string {
  return `${edition.id}-event@${domain}`;
}

function editionUrl(edition: ConferenceEdition, siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, '')}/conference/${edition.id}`;
}

/** The DESCRIPTION body: everything a subscriber needs without opening a browser. */
function describeEdition(
  edition: ConferenceEdition,
  highlight: ResolvedDeadline | null,
  siteUrl: string,
): string {
  const lines: string[] = [`${edition.fullName} (${edition.name} ${edition.year})`];

  if (highlight?.utc) {
    lines.push(
      '',
      `${highlight.label}: ${formatInZone(highlight.utc, highlight.timezone)} ` +
        `${timezoneLabel(highlight.timezone)}`,
    );
  }

  lines.push('', `Conference: ${edition.dateLabel}`, `Location: ${locationLabel(edition)}`);
  if (edition.venue) lines.push(`Venue: ${edition.venue}`);

  const dated = edition.deadlines.filter((d) => d.utc);
  if (dated.length > 1) {
    lines.push('', 'All dates:');
    for (const deadline of dated) {
      lines.push(
        `  ${deadline.label}: ${formatInZone(deadline.utc!, deadline.timezone)} ` +
          `${timezoneLabel(deadline.timezone)}`,
      );
    }
  }

  const tba = edition.deadlines.filter((d) => d.tba);
  if (tba.length) {
    lines.push('', `Not yet announced: ${tba.map((d) => d.label).join(', ')}`);
  }

  if (edition.note) lines.push('', edition.note);

  lines.push('', `Call for papers: ${edition.link}`, `Details: ${editionUrl(edition, siteUrl)}`);

  return lines.join('\n');
}

/**
 * The deadline's own calendar date, read from the wall-clock string rather than
 * from the UTC instant.
 *
 * This distinction is the whole point of the all-day form. A deadline of
 * 2026-07-31 23:59:59 AoE is 2026-08-01 11:59:59Z, so deriving the day from the
 * instant would file it under 1 August when every call for papers, and every
 * author, calls it 31 July. Being a day late here is how somebody misses a
 * submission.
 */
export function deadlineDay(deadline: ResolvedDeadline): Date {
  return new Date(`${deadline.raw.slice(0, 10)}T00:00:00Z`);
}

/**
 * Title for a deadline event, carrying the stated time and zone.
 *
 * An all-day event has no clock position, so "23:59 AoE" would otherwise be
 * lost. Showing it in the deadline's own zone keeps it recognisable against the
 * call for papers, instead of a local time the reader has to convert back.
 */
export function deadlineSummary(
  edition: ConferenceEdition,
  deadline: ResolvedDeadline,
): string {
  const base = `${edition.name} ${edition.year}: ${deadline.label}`;
  if (!deadline.utc) return base;

  const time = formatTimeInZone(deadline.utc, deadline.timezone);
  return `${base} (${time} ${timezoneLabel(deadline.timezone)})`;
}

/** One VEVENT per dated deadline across the given editions. */
export function deadlineEvents(
  editions: ConferenceEdition[],
  siteUrl: string,
  domain: string,
): IcsEvent[] {
  const events: IcsEvent[] = [];

  for (const edition of editions) {
    if (edition.cancelled) continue;

    const seenTypes = new Map<string, number>();

    for (const deadline of edition.deadlines) {
      const ordinal = seenTypes.get(deadline.type) ?? 0;
      seenTypes.set(deadline.type, ordinal + 1);

      // TBA deadlines have no instant to place on a calendar.
      if (!deadline.utc) continue;

      const day = deadlineDay(deadline);

      events.push({
        uid: deadlineUid(edition, deadline, ordinal, domain),
        start: day,
        // All-day, so the deadline reads as the date the CFP states instead of
        // landing at whatever local clock time the AoE instant converts to.
        allDay: true,
        allDayEnd: day,
        summary: deadlineSummary(edition, deadline),
        description: describeEdition(edition, deadline, siteUrl),
        location: locationLabel(edition),
        url: deadline.link ?? edition.link,
        categories: edition.tags.map(tagLabel),
        alarms: DEADLINE_ALARMS,
      });
    }
  }

  return events;
}

/** One all-day VEVENT per conference, spanning the event itself. */
export function conferenceEvents(
  editions: ConferenceEdition[],
  siteUrl: string,
  domain: string,
): IcsEvent[] {
  const events: IcsEvent[] = [];

  for (const edition of editions) {
    if (edition.cancelled || !edition.start) continue;

    events.push({
      uid: eventUid(edition, domain),
      start: edition.start,
      allDay: true,
      allDayEnd: edition.end ?? edition.start,
      summary: `${edition.name} ${edition.year}`,
      description: describeEdition(edition, null, siteUrl),
      location: edition.venue
        ? `${edition.venue}, ${locationLabel(edition)}`
        : locationLabel(edition),
      url: edition.link,
      categories: edition.tags.map(tagLabel),
    });
  }

  return events;
}
