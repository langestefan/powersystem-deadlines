import { locationLabel, type ConferenceEdition, type ResolvedDeadline } from './edition';
import { formatUtc } from './ics';

/**
 * "Add to calendar" deep links for a single deadline.
 *
 * These are plain URLs computed at build time — no client-side JavaScript, no
 * blob downloads, and nothing to break when a viewer has scripts disabled. The
 * Apple/other case points at the conference's own .ics file, which has the
 * advantage of staying up to date if the deadline moves.
 */

const THIRTY_MINUTES = 30 * 60_000;

function eventWindow(deadline: ResolvedDeadline): { start: Date; end: Date } | null {
  if (!deadline.utc) return null;
  return { start: deadline.utc, end: new Date(deadline.utc.getTime() + THIRTY_MINUTES) };
}

function summaryFor(edition: ConferenceEdition, deadline: ResolvedDeadline): string {
  return `${edition.name} ${edition.year} — ${deadline.label}`;
}

function detailsFor(edition: ConferenceEdition, deadline: ResolvedDeadline): string {
  return [
    edition.fullName,
    `${deadline.label} for ${edition.name} ${edition.year}.`,
    `Call for papers: ${edition.link}`,
  ].join('\n\n');
}

export function googleCalendarUrl(
  edition: ConferenceEdition,
  deadline: ResolvedDeadline,
): string | null {
  const window = eventWindow(deadline);
  if (!window) return null;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: summaryFor(edition, deadline),
    dates: `${formatUtc(window.start)}/${formatUtc(window.end)}`,
    details: detailsFor(edition, deadline),
    location: locationLabel(edition),
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(
  edition: ConferenceEdition,
  deadline: ResolvedDeadline,
): string | null {
  const window = eventWindow(deadline);
  if (!window) return null;

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: summaryFor(edition, deadline),
    startdt: window.start.toISOString(),
    enddt: window.end.toISOString(),
    body: detailsFor(edition, deadline),
    location: locationLabel(edition),
  });

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}
