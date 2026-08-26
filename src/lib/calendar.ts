import { locationLabel, type ConferenceEdition, type ResolvedDeadline } from './edition';
import type { IcsEvent } from './ics';
import { formatInZone, timezoneLabel } from './time';
import { tagLabel } from './taxonomy';

/**
 * Maps conference editions onto calendar events. Kept separate from ics.ts so
 * the RFC-5545 layer stays domain-free and independently testable.
 */

/** Reminders attached to every deadline event. */
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

      events.push({
        uid: deadlineUid(edition, deadline, ordinal, domain),
        start: deadline.utc,
        summary: `${edition.name} ${edition.year} — ${deadline.label}`,
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
