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
    expect(events[0]!.summary).toBe('TESTCONF 2027: Abstract submission');
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

  it('round-trips the deadline to the right instant', () => {
    const abstract = events.find((event) => String(event.summary).includes('Abstract submission'));
    expect(abstract?.start?.toISOString()).toBe('2026-10-16T11:59:59.000Z');
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
