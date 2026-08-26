/**
 * RFC 5545 calendar generation.
 *
 * Written by hand rather than pulled from a package because the details that
 * matter here — stable UIDs across rebuilds, correct 75-octet line folding, and
 * the refresh hints that make a feed re-poll — are exactly the details the
 * available libraries either skip or get wrong, and Google Calendar rejects a
 * malformed feed silently. Everything below is covered by tests/ics.test.ts.
 */

export interface IcsAlarm {
  /** ISO 8601 duration relative to the event start, e.g. "-P7D". */
  trigger: string;
  description: string;
}

export interface IcsEvent {
  /** Stable across rebuilds so clients update rather than duplicate events. */
  uid: string;
  start: Date;
  /** Omit for a 30-minute default. Ignored for all-day events. */
  end?: Date;
  /** Render as a date-only event spanning whole days. */
  allDay?: boolean;
  /** Required when allDay is set: the last day, inclusive. */
  allDayEnd?: Date;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  categories?: string[];
  alarms?: IcsAlarm[];
}

export interface IcsCalendarOptions {
  /** Shown as the calendar's name once subscribed. */
  name: string;
  description?: string;
  /** Hostname used in PRODID and as the UID domain. */
  domain: string;
  events: IcsEvent[];
  /** Build timestamp; injectable so tests are deterministic. */
  now?: Date;
  /** How often clients should re-poll. Default 12 hours. */
  refreshInterval?: string;
  /** Feed self-reference, so clients can re-resolve it. */
  url?: string;
}

/** Identifies this generator in every feed's PRODID. */
const PRODUCT = 'powersystem-deadlines';

const CRLF = '\r\n';
const MAX_OCTETS = 75;

/** RFC 5545 §3.3.11 text escaping. Backslash must be escaped first. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * RFC 5545 §3.1 content line folding: no line may exceed 75 octets, and
 * continuation lines begin with a single space. Folding counts *octets*, not
 * characters, and must never split a multi-byte UTF-8 sequence.
 */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= MAX_OCTETS) return line;

  const parts: string[] = [];
  let offset = 0;
  let limit = MAX_OCTETS;

  while (offset < bytes.length) {
    let end = Math.min(offset + limit, bytes.length);

    // Back off if we landed inside a UTF-8 continuation byte (0b10xxxxxx).
    while (end > offset && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) {
      end -= 1;
    }

    parts.push(bytes.subarray(offset, end).toString('utf8'));
    offset = end;
    limit = MAX_OCTETS - 1; // continuation lines spend one octet on the leading space
  }

  return parts.join(`${CRLF} `);
}

/** UTC timestamp form: 20261015T235959Z. */
export function formatUtc(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

/** Date-only form for all-day events: 20261015. */
export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function renderEvent(event: IcsEvent, dtstamp: string): string[] {
  const lines: string[] = ['BEGIN:VEVENT', `UID:${event.uid}`, `DTSTAMP:${dtstamp}`];

  if (event.allDay) {
    // DTEND is exclusive for date-valued events, so add a day to the last day.
    const last = event.allDayEnd ?? event.start;
    lines.push(`DTSTART;VALUE=DATE:${formatDay(event.start)}`);
    lines.push(`DTEND;VALUE=DATE:${formatDay(addDays(last, 1))}`);
    lines.push('TRANSP:TRANSPARENT');
  } else {
    const end = event.end ?? new Date(event.start.getTime() + 30 * 60_000);
    lines.push(`DTSTART:${formatUtc(event.start)}`);
    lines.push(`DTEND:${formatUtc(end)}`);
    lines.push('TRANSP:TRANSPARENT');
  }

  lines.push(`SUMMARY:${escapeText(event.summary)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.url) lines.push(`URL;VALUE=URI:${event.url}`);
  if (event.categories?.length) {
    lines.push(`CATEGORIES:${event.categories.map(escapeText).join(',')}`);
  }
  lines.push('STATUS:CONFIRMED');
  // SEQUENCE stays 0: the UID identifies the event and clients re-read the feed.
  lines.push('SEQUENCE:0');

  for (const alarm of event.alarms ?? []) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `TRIGGER:${alarm.trigger}`,
      `DESCRIPTION:${escapeText(alarm.description)}`,
      'END:VALARM',
    );
  }

  lines.push('END:VEVENT');
  return lines;
}

/** Build a complete VCALENDAR document. */
export function buildCalendar(options: IcsCalendarOptions): string {
  const now = options.now ?? new Date();
  const dtstamp = formatUtc(now);
  const refresh = options.refreshInterval ?? 'PT12H';

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${options.domain}//${PRODUCT}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(options.name)}`,
    'X-WR-TIMEZONE:UTC',
    // Both spellings: REFRESH-INTERVAL is the standard, X-PUBLISHED-TTL is what
    // Outlook and Google actually honour.
    `REFRESH-INTERVAL;VALUE=DURATION:${refresh}`,
    `X-PUBLISHED-TTL:${refresh}`,
  ];

  if (options.description) lines.push(`X-WR-CALDESC:${escapeText(options.description)}`);
  if (options.url) lines.push(`SOURCE;VALUE=URI:${options.url}`);

  for (const event of options.events) lines.push(...renderEvent(event, dtstamp));

  lines.push('END:VCALENDAR');

  return `${lines.map(foldLine).join(CRLF)}${CRLF}`;
}

/** Serve a calendar string as a downloadable/subscribable response. */
export function icsResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
