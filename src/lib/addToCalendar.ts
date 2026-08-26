import { deadlineDay, deadlineSummary } from './calendar';
import { locationLabel, type ConferenceEdition, type ResolvedDeadline } from './edition';

/**
 * "Add to calendar" deep links for a single deadline.
 *
 * These are plain URLs computed at build time: no client-side JavaScript, no
 * blob downloads, and nothing to break when a viewer has scripts disabled. The
 * Apple/other case points at the conference's own .ics file, which has the
 * advantage of staying up to date if the deadline moves.
 *
 * The event is all-day on the deadline's stated date, matching what the .ics
 * feed publishes. The two must agree: a button that files a deadline on a
 * different day from the subscribed feed makes the site contradict itself.
 */

const ONE_DAY = 86_400_000;

/** Start day plus the exclusive end day both services expect for an all-day event. */
function eventDays(deadline: ResolvedDeadline): { start: Date; endExclusive: Date } | null {
  if (!deadline.utc) return null;

  const start = deadlineDay(deadline);
  return { start, endExclusive: new Date(start.getTime() + ONE_DAY) };
}

/** YYYY-MM-DD. */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** YYYYMMDD, the compact form Google's template URL takes. */
function compactDay(date: Date): string {
  return isoDay(date).replace(/-/g, '');
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
  const days = eventDays(deadline);
  if (!days) return null;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: deadlineSummary(edition, deadline),
    dates: `${compactDay(days.start)}/${compactDay(days.endExclusive)}`,
    details: detailsFor(edition, deadline),
    location: locationLabel(edition),
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(
  edition: ConferenceEdition,
  deadline: ResolvedDeadline,
): string | null {
  const days = eventDays(deadline);
  if (!days) return null;

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: deadlineSummary(edition, deadline),
    allday: 'true',
    startdt: isoDay(days.start),
    enddt: isoDay(days.endExclusive),
    body: detailsFor(edition, deadline),
    location: locationLabel(edition),
  });

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}
