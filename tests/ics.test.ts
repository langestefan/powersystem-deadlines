import { describe, expect, it } from 'vitest';

import { buildCalendar, escapeText, foldLine, formatDay, formatUtc } from '@/lib/ics';

const NOW = new Date('2026-08-26T12:00:00Z');

function lines(calendar: string): string[] {
  return calendar.split('\r\n');
}

/** Undo folding so a logical property can be asserted as one string. */
function unfold(calendar: string): string {
  return calendar.replace(/\r\n /g, '');
}

describe('escapeText', () => {
  it('escapes the four characters RFC 5545 reserves, backslash first', () => {
    expect(escapeText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
  });

  it('normalises CRLF and bare CR to the literal \\n escape', () => {
    expect(escapeText('a\r\nb\rc')).toBe('a\\nb\\nc');
  });
});

describe('foldLine', () => {
  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short');
  });

  it('keeps every physical line within 75 octets', () => {
    const folded = foldLine(`DESCRIPTION:${'x'.repeat(500)}`);
    for (const line of folded.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });

  it('starts continuation lines with a single space', () => {
    const folded = foldLine(`DESCRIPTION:${'x'.repeat(200)}`).split('\r\n');
    expect(folded.length).toBeGreaterThan(1);
    for (const line of folded.slice(1)) expect(line.startsWith(' ')).toBe(true);
  });

  it('never splits a multi-byte character', () => {
    // Em dashes and accents are common in conference names.
    const folded = foldLine(`SUMMARY:${'é—'.repeat(60)}`);
    expect(folded.replace(/\r\n /g, '')).toBe(`SUMMARY:${'é—'.repeat(60)}`);
    for (const line of folded.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });
});

describe('formatUtc and formatDay', () => {
  it('emits the compact UTC form with a Z suffix', () => {
    expect(formatUtc(new Date('2026-10-15T23:59:59.000Z'))).toBe('20261015T235959Z');
  });

  it('emits date-only values without a time part', () => {
    expect(formatDay(new Date('2026-10-15T00:00:00.000Z'))).toBe('20261015');
  });
});

describe('buildCalendar', () => {
  const calendar = buildCalendar({
    name: 'Test feed',
    description: 'A feed',
    domain: 'example.org',
    url: 'https://example.org/calendar/all.ics',
    now: NOW,
    events: [
      {
        uid: 'conf26-paper@example.org',
        start: new Date('2026-10-15T23:59:59Z'),
        summary: 'CONF 2026 — Paper submission',
        description: 'Line one\nLine two; with punctuation, and more',
        location: 'Delft, Netherlands',
        url: 'https://conf.example.org/',
        categories: ['Power Systems', 'Smart Grid'],
        alarms: [{ trigger: '-P7D', description: 'One week to go' }],
      },
    ],
  });

  it('uses CRLF line endings throughout and terminates the final line', () => {
    expect(calendar.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(calendar.includes('\n\n')).toBe(false);
  });

  it('opens and closes the calendar object', () => {
    expect(lines(calendar)[0]).toBe('BEGIN:VCALENDAR');
    expect(calendar).toContain('VERSION:2.0');
    expect(calendar).toContain('PRODID:-//example.org//powersystems-deadlines//EN');
  });

  it('advertises a refresh interval in both the standard and vendor spellings', () => {
    expect(calendar).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT12H');
    expect(calendar).toContain('X-PUBLISHED-TTL:PT12H');
  });

  it('writes the deadline as a UTC instant with a 30 minute default duration', () => {
    expect(calendar).toContain('DTSTART:20261015T235959Z');
    expect(calendar).toContain('DTEND:20261016T002959Z');
  });

  it('stamps every event with the build time', () => {
    expect(calendar).toContain('DTSTAMP:20260826T120000Z');
  });

  it('escapes description text and joins categories with commas', () => {
    const flat = unfold(calendar);
    expect(flat).toContain('DESCRIPTION:Line one\\nLine two\\; with punctuation\\, and more');
    expect(flat).toContain('CATEGORIES:Power Systems,Smart Grid');
  });

  it('carries the alarm through', () => {
    expect(calendar).toContain('BEGIN:VALARM');
    expect(calendar).toContain('TRIGGER:-P7D');
    expect(calendar).toContain('ACTION:DISPLAY');
  });

  it('keeps every physical line inside the octet limit', () => {
    for (const line of lines(calendar)) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });

  it('renders all-day events with an exclusive end date', () => {
    const allDay = buildCalendar({
      name: 'Events',
      domain: 'example.org',
      now: NOW,
      events: [
        {
          uid: 'conf26-event@example.org',
          start: new Date('2026-06-08T00:00:00Z'),
          allDay: true,
          allDayEnd: new Date('2026-06-12T00:00:00Z'),
          summary: 'CONF 2026',
        },
      ],
    });

    expect(allDay).toContain('DTSTART;VALUE=DATE:20260608');
    // DTEND is exclusive, so a conference ending on the 12th ends on the 13th.
    expect(allDay).toContain('DTEND;VALUE=DATE:20260613');
  });
});
