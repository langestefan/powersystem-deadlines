import ical, { type VEvent } from 'node-ical';
import { describe, expect, it } from 'vitest';

import { conferenceEvents, deadlineEvents } from '@/lib/calendar';
import { flattenEdition, type ConferenceEdition } from '@/lib/edition';
import { buildCalendar } from '@/lib/ics';

const NOW = new Date('2026-08-26T12:00:00Z');
const SITE = 'https://example.org/deadlines';
const DOMAIN = 'example.org';

/**
 * Mirrors the shape of a real src/data/conferences/*.yml file, including the
 * two awkward cases: a repeated deadline type and a TBA date.
 */
function fixture(): ConferenceEdition {
  return flattenEdition(
    {
      name: 'TESTCONF',
      full_name: 'Test Conference on Power Systems',
      link: 'https://testconf.example.org/',
      society: ['IEEE PES'],
      frequency: 'annual',
      tags: ['power-systems', 'smart-grid'],
      editions: [],
    },
    'testconf',
    {
      year: 2027,
      id: 'testconf27',
      city: 'Delft',
      country: 'Netherlands',
      venue: 'Aula',
      date: 'June 8-12, 2027',
      start: '2027-06-08',
      end: '2027-06-12',
      format: 'in-person',
      cancelled: false,
      timezone: 'AoE',
      deadlines: [
        { type: 'abstract', label: 'Abstract submission', date: '2026-10-15 23:59:59' },
        { type: 'paper', label: 'Full paper submission', date: '2026-12-01 23:59:59' },
        { type: 'notification', label: 'First notification', date: '2027-02-01 23:59:59' },
        { type: 'notification', label: 'Second notification', date: 'TBA' },
      ],
    },
    NOW,
  );
}

describe('flattenEdition', () => {
  const edition = fixture();

  it('resolves each deadline against the edition timezone', () => {
    expect(edition.deadlines[0]!.timezone).toBe('AoE');
    expect(edition.deadlines[0]!.utc?.toISOString()).toBe('2026-10-16T11:59:59.000Z');
  });

  it('marks a TBA deadline and leaves it without an instant', () => {
    const tba = edition.deadlines.find((deadline) => deadline.label === 'Second notification');
    expect(tba?.tba).toBe(true);
    expect(tba?.utc).toBeNull();
  });

  it('picks the soonest submission deadline as the headline, not a notification', () => {
    expect(edition.nextDeadline?.label).toBe('Abstract submission');
  });

  it('derives the region from the country', () => {
    expect(edition.region).toBe('Europe');
  });

  it('merges series and edition tags', () => {
    expect(edition.tags).toEqual(['power-systems', 'smart-grid']);
  });
});

describe('deadlineEvents', () => {
  const events = deadlineEvents([fixture()], SITE, DOMAIN);

  it('emits one event per dated deadline and skips TBA', () => {
    expect(events).toHaveLength(3);
    expect(events.some((event) => event.summary.includes('Second notification'))).toBe(false);
  });

  it('builds UIDs that survive a date change', () => {
    expect(events[0]!.uid).toBe('testconf27-abstract@example.org');
  });

  it('disambiguates repeated deadline types by ordinal, not by index or date', () => {
    // A second 'notification' must not collide with the first one's UID.
    const uids = events.map((event) => event.uid);
    expect(new Set(uids).size).toBe(uids.length);
    expect(uids).toContain('testconf27-notification@example.org');
  });

  it('names the event so it is readable in a crowded calendar', () => {
    // The stated time rides in the title because an all-day event cannot show it.
    expect(events[0]!.summary).toBe('TESTCONF 2027: Abstract submission (23:59 AoE)');
  });

  it('places the deadline on its stated date, not the UTC-shifted next day', () => {
    // 2026-10-15 23:59:59 AoE is 2026-10-16T11:59:59Z. Deriving the day from
    // that instant would show the deadline a day late, which is how somebody
    // misses it. The date has to come from the wall-clock string.
    expect(events[0]!.allDay).toBe(true);
    expect(events[0]!.start.toISOString().slice(0, 10)).toBe('2026-10-15');
    expect(events[0]!.allDayEnd?.toISOString().slice(0, 10)).toBe('2026-10-15');
  });

  it('describes the conference and links back to its page', () => {
    expect(events[0]!.description).toContain('Test Conference on Power Systems');
    expect(events[0]!.description).toContain(`${SITE}/conference/testconf27`);
    expect(events[0]!.description).toContain('Not yet announced: Second notification');
  });

  it('attaches week and day reminders', () => {
    expect(events[0]!.alarms?.map((alarm) => alarm.trigger)).toEqual(['-P7D', '-P1D']);
  });
});

/**
 * A deadline shown on the wrong day is the worst bug this project can have, so
 * the day arithmetic is pinned across the full span of real timezones: both DST
 * transitions in both hemispheres, half-hour offsets, and the UTC+14..UTC-12
 * extremes. All of these resolve to a different UTC day than the stated one.
 */
describe('the day a deadline is filed under', () => {
  function eventFor(timezone: string, date: string) {
    const edition = flattenEdition(
      {
        name: 'TC',
        full_name: 'Test Conference',
        link: 'https://example.org/',
        society: ['IEEE PES'],
        frequency: 'annual',
        tags: ['power-systems'],
        editions: [],
      },
      'tc',
      {
        year: 2027,
        id: 'tc27',
        date: 'June 2027',
        format: 'in-person',
        cancelled: false,
        timezone,
        deadlines: [{ type: 'paper', label: 'Paper', date }],
      },
      NOW,
    );
    return { deadline: edition.deadlines[0]!, event: deadlineEvents([edition], SITE, DOMAIN)[0]! };
  }

  const CASES: Array<[zone: string, statedDate: string, why: string]> = [
    ['AoE', '2026-10-15', 'the common case: every real deadline uses AoE'],
    ['AoE', '2026-01-01', 'across a year boundary'],
    ['Pacific/Kiritimati', '2026-10-15', 'UTC+14, the furthest east zone there is'],
    ['Pacific/Auckland', '2026-10-15', 'UTC+13'],
    ['Australia/Sydney', '2026-04-05', 'southern hemisphere DST ends this day'],
    ['Australia/Sydney', '2026-10-04', 'southern hemisphere DST starts this day'],
    ['Asia/Kolkata', '2026-10-15', 'half-hour offset'],
    ['Europe/Amsterdam', '2026-03-29', 'EU DST starts this day'],
    ['Europe/Amsterdam', '2026-10-25', 'EU DST ends this day'],
    ['America/New_York', '2026-03-08', 'US DST starts this day'],
    ['America/New_York', '2026-11-01', 'US DST ends this day'],
    ['Pacific/Honolulu', '2026-10-15', 'UTC-10'],
    ['UTC+05:30', '2026-10-15', 'explicit half-hour offset'],
    ['CET', '2026-10-15', 'fixed abbreviation'],
  ];

  for (const [zone, stated, why] of CASES) {
    it(`files a ${zone} deadline under ${stated} (${why})`, () => {
      const { deadline, event } = eventFor(zone, `${stated} 23:59:59`);

      expect(event.allDay).toBe(true);
      expect(event.start.toISOString().slice(0, 10)).toBe(stated);
      expect(event.allDayEnd?.toISOString().slice(0, 10)).toBe(stated);

      // Every one of these really does cross a UTC day boundary or sit at an
      // odd hour, so an implementation reading the day off the instant fails.
      expect(deadline.utc).not.toBeNull();
    });
  }

  /**
   * The direction of any error matters more than its size. Shown early, an
   * author submits with time to spare; shown late, they miss the deadline. AoE
   * is the westernmost zone, so its instant can never fall on an earlier
   * calendar day for anyone: every viewer on earth is shown it early or exact.
   */
  it('never shows an AoE deadline later than it expires, anywhere on earth', () => {
    const { deadline, event } = eventFor('AoE', '2026-10-15 23:59:59');
    const shown = event.start.toISOString().slice(0, 10);

    const viewers = [
      'Pacific/Kiritimati',
      'Pacific/Auckland',
      'Asia/Tokyo',
      'Asia/Kolkata',
      'Europe/Amsterdam',
      'UTC',
      'America/New_York',
      'Pacific/Honolulu',
      'Etc/GMT+12',
    ];

    for (const viewer of viewers) {
      const localExpiry = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: viewer,
      }).format(deadline.utc!);

      expect(shown <= localExpiry, `${viewer} is shown ${shown}, expires ${localExpiry}`).toBe(
        true,
      );
    }
  });
});

describe('conferenceEvents', () => {
  it('spans the conference as an all-day event', () => {
    const [event] = conferenceEvents([fixture()], SITE, DOMAIN);
    expect(event?.allDay).toBe(true);
    expect(event?.uid).toBe('testconf27-event@example.org');
    expect(event?.summary).toBe('TESTCONF 2027');
  });

  it('skips an edition with no start date', () => {
    const edition = { ...fixture(), start: undefined };
    expect(conferenceEvents([edition], SITE, DOMAIN)).toHaveLength(0);
  });
});

describe('the published feed, read back by a calendar client', () => {
  const edition = fixture();
  const feed = buildCalendar({
    name: 'Test feed',
    domain: DOMAIN,
    now: NOW,
    events: [
      ...deadlineEvents([edition], SITE, DOMAIN),
      ...conferenceEvents([edition], SITE, DOMAIN),
    ],
  });

  const parsed = ical.sync.parseICS(feed);
  const events = Object.values(parsed).filter(
    (entry): entry is VEvent => entry?.type === 'VEVENT',
  );

  it('parses, with one event per dated deadline plus the conference itself', () => {
    expect(events).toHaveLength(4);
  });

  it('round-trips the deadline onto the day the call for papers states', () => {
    const abstract = events.find((event) => String(event.summary).includes('Abstract submission'));
    expect(abstract?.datetype).toBe('date');
    // Date-valued events are floating, so compare calendar fields, not the instant.
    const start = abstract!.start;
    expect([start.getFullYear(), start.getMonth() + 1, start.getDate()]).toEqual([2026, 10, 15]);
  });

  it('round-trips escaped punctuation in the description', () => {
    const abstract = events.find((event) => String(event.summary).includes('Abstract submission'));
    expect(String(abstract?.description)).toContain('Location: Delft, Netherlands');
  });

  it('round-trips the all-day event as a date-valued range', () => {
    const conference = events.find((event) => String(event.summary) === 'TESTCONF 2027');
    expect(conference?.datetype).toBe('date');
    // Date-valued events are floating: clients place them at local midnight, so
    // compare calendar fields rather than the UTC instant.
    const start = conference!.start;
    expect([start.getFullYear(), start.getMonth() + 1, start.getDate()]).toEqual([2027, 6, 8]);
  });
});
