import { describe, expect, it } from 'vitest';

import { googleCalendarUrl, outlookCalendarUrl } from '@/lib/addToCalendar';
import { flattenEdition, type ConferenceEdition } from '@/lib/edition';

const NOW = new Date('2026-08-26T12:00:00Z');

/**
 * The per-deadline "Add to calendar" buttons have to agree with the subscribed
 * feed. If one files a deadline on 15 October and the other on the 16th, the
 * site contradicts itself about when the work is due.
 */
function fixture(): ConferenceEdition {
  return flattenEdition(
    {
      name: 'TESTCONF',
      full_name: 'Test Conference on Power Systems',
      link: 'https://testconf.example.org/',
      society: ['IEEE PES'],
      frequency: 'annual',
      tags: ['power-systems'],
      editions: [],
    },
    'testconf',
    {
      year: 2027,
      id: 'testconf27',
      city: 'Delft',
      country: 'Netherlands',
      date: 'June 8-12, 2027',
      verified: '2026-08-26',
      format: 'in-person',
      cancelled: false,
      timezone: 'AoE',
      deadlines: [
        { type: 'abstract', label: 'Abstract submission', date: '2026-10-15 23:59:59' },
        { type: 'notification', label: 'Notification', date: 'TBA' },
      ],
    },
    NOW,
  );
}

describe('add-to-calendar deep links', () => {
  const edition = fixture();
  const deadline = edition.deadlines[0]!;

  it('books Google as an all-day event on the stated date', () => {
    const url = new URL(googleCalendarUrl(edition, deadline)!);
    // 2026-10-15 23:59:59 AoE is 2026-10-16T11:59:59Z; the date must stay the 15th.
    // Google's end date is exclusive, so a single day is 15th -> 16th.
    expect(url.searchParams.get('dates')).toBe('20261015/20261016');
    expect(url.searchParams.get('text')).toBe('TESTCONF 2027: Abstract submission (23:59 AoE)');
  });

  it('books Outlook as an all-day event on the stated date', () => {
    const url = new URL(outlookCalendarUrl(edition, deadline)!);
    expect(url.searchParams.get('allday')).toBe('true');
    expect(url.searchParams.get('startdt')).toBe('2026-10-15');
    expect(url.searchParams.get('enddt')).toBe('2026-10-16');
  });

  it('has no link for a TBA deadline', () => {
    const tba = edition.deadlines[1]!;
    expect(googleCalendarUrl(edition, tba)).toBeNull();
    expect(outlookCalendarUrl(edition, tba)).toBeNull();
  });
});
