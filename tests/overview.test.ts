import { describe, expect, it } from 'vitest';

import { flattenEdition, type ConferenceEdition } from '@/lib/edition';
import { buildYearOverview, deadlineTypesInUse, yearsWithData } from '@/lib/overview';
import { deadlineTypeStyle } from '@/lib/taxonomy';

/**
 * Calendar grids are where off-by-one errors live: week padding, runs that
 * cross a month or a year, and the difference between a deadline's stated date
 * and the UTC instant it resolves to.
 */

const NOW = new Date('2026-08-26T12:00:00Z');

function edition(o: {
  id: string;
  deadlines?: Array<{ type: string; label: string; date: string }>;
  start?: string;
  end?: string;
}): ConferenceEdition {
  return flattenEdition(
    { name: 'TC', full_name: 'Test Conference', link: 'https://example.org/',
      society: ['IEEE PES'], frequency: 'annual', tags: ['power-systems'], editions: [] },
    'tc',
    { year: 2026, id: o.id, date: 'whenever', verified: '2026-08-26', format: 'in-person',
      cancelled: false, timezone: 'AoE', start: o.start, end: o.end,
      deadlines: o.deadlines ?? [] },
    NOW,
  );
}

const findDay = (months: ReturnType<typeof buildYearOverview>, date: string) =>
  months.flatMap((m) => m.weeks.flat()).find((d) => d.date === date && d.inMonth);

describe('buildYearOverview', () => {
  it('lays out twelve months', () => {
    const months = buildYearOverview([], 2026, NOW);
    expect(months).toHaveLength(12);
    expect(months[0]!.label).toBe('January');
    expect(months[11]!.label).toBe('December');
  });

  it('pads the first week so the month starts on the right weekday', () => {
    // 1 January 2026 is a Thursday; weeks start on Monday.
    const january = buildYearOverview([], 2026, NOW)[0]!;
    const first = january.weeks[0]!;
    expect(first).toHaveLength(7);
    expect(first[0]!.date).toBe('2025-12-29');
    expect(first[0]!.inMonth).toBe(false);
    expect(first[3]!.date).toBe('2026-01-01');
    expect(first[3]!.inMonth).toBe(true);
  });

  it('places a deadline on its stated date, not the UTC instant', () => {
    // 2026-10-15 23:59:59 AoE resolves to 2026-10-16T11:59:59Z.
    const months = buildYearOverview(
      [edition({ id: 'a26', deadlines: [{ type: 'paper', label: 'Paper', date: '2026-10-15 23:59:59' }] })],
      2026,
      NOW,
    );
    expect(findDay(months, '2026-10-15')!.deadlines).toHaveLength(1);
    expect(findDay(months, '2026-10-16')!.deadlines).toHaveLength(0);
  });

  it('carries the label, time and zone a tooltip needs', () => {
    const months = buildYearOverview(
      [edition({ id: 'a26', deadlines: [{ type: 'paper', label: 'Paper', date: '2026-10-15 23:59:59' }] })],
      2026,
      NOW,
    );
    const [deadline] = findDay(months, '2026-10-15')!.deadlines;
    expect(deadline).toMatchObject({ editionId: 'a26', label: 'Paper', time: '23:59', timezone: 'AoE' });
  });

  it('ignores TBA deadlines, which have no day to sit on', () => {
    const months = buildYearOverview(
      [edition({ id: 'a26', deadlines: [{ type: 'paper', label: 'Paper', date: 'TBA' }] })],
      2026,
      NOW,
    );
    expect(months.flatMap((m) => m.weeks.flat()).filter((d) => d.deadlines.length)).toHaveLength(0);
  });

  it('fills every day a conference runs, inclusive of both ends', () => {
    const months = buildYearOverview(
      [edition({ id: 'a26', start: '2026-06-08', end: '2026-06-12' })],
      2026,
      NOW,
    );
    for (const day of ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12']) {
      expect(findDay(months, day)!.events, day).toHaveLength(1);
    }
    expect(findDay(months, '2026-06-07')!.events).toHaveLength(0);
    expect(findDay(months, '2026-06-13')!.events).toHaveLength(0);
  });

  it('splits a run that crosses a month boundary across both months', () => {
    const months = buildYearOverview(
      [edition({ id: 'a26', start: '2026-03-30', end: '2026-04-02' })],
      2026,
      NOW,
    );
    expect(findDay(months, '2026-03-31')!.events).toHaveLength(1);
    expect(findDay(months, '2026-04-01')!.events).toHaveLength(1);
  });

  it('shows only the part of a run that falls inside the year', () => {
    const spanning = edition({ id: 'a26', start: '2026-12-28', end: '2027-01-03' });
    expect(findDay(buildYearOverview([spanning], 2026, NOW), '2026-12-31')!.events).toHaveLength(1);
    expect(findDay(buildYearOverview([spanning], 2027, NOW), '2027-01-02')!.events).toHaveLength(1);
  });

  it('treats a single-day conference as a one-day run', () => {
    const months = buildYearOverview([edition({ id: 'a26', start: '2026-05-04' })], 2026, NOW);
    expect(findDay(months, '2026-05-04')!.events).toHaveLength(1);
    expect(findDay(months, '2026-05-05')!.events).toHaveLength(0);
  });

  it('marks today, and only today', () => {
    const months = buildYearOverview([], 2026, NOW);
    const flagged = months.flatMap((m) => m.weeks.flat()).filter((d) => d.isToday && d.inMonth);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.date).toBe('2026-08-26');
  });

  it('skips a cancelled edition', () => {
    const months = buildYearOverview([{ ...edition({ id: 'a26', start: '2026-06-08', end: '2026-06-09' }), cancelled: true }], 2026, NOW);
    expect(findDay(months, '2026-06-08')!.events).toHaveLength(0);
  });
});

describe('yearsWithData', () => {
  it('lists every year touched by a deadline or a conference, in order', () => {
    const years = yearsWithData([
      edition({ id: 'a26', deadlines: [{ type: 'paper', label: 'P', date: '2025-10-15 23:59:59' }] }),
      edition({ id: 'b26', start: '2027-06-08', end: '2027-06-12' }),
    ]);
    expect(years).toEqual([2025, 2027]);
  });
});

describe('deadline type styling', () => {
  it('gives each kind of submission its own colour', () => {
    const classes = ['abstract', 'paper', 'camera_ready', 'presentation_upload'].map(
      (type) => deadlineTypeStyle(type).dotClass,
    );
    expect(new Set(classes).size).toBe(4);
  });

  it('names each type the way an author would', () => {
    expect(deadlineTypeStyle('camera_ready').label).toBe('Camera-ready');
    expect(deadlineTypeStyle('presentation_upload').label).toBe('Upload');
    expect(deadlineTypeStyle('notification').label).toBe('Notification');
  });

  it('shares one colour where two types mean the same thing to an author', () => {
    expect(deadlineTypeStyle('author_registration').label).toBe('Registration');
    expect(deadlineTypeStyle('early_registration').label).toBe('Registration');
    expect(deadlineTypeStyle('author_registration').dotClass).toBe(
      deadlineTypeStyle('early_registration').dotClass,
    );
  });

  it('keeps the class strings literal so the JIT compiler can see them', () => {
    // Interpolating these would strip the colours out of the built CSS.
    expect(deadlineTypeStyle('paper').dotClass).toMatch(/^bg-[a-z]+-\d{3}$/);
  });

  it('falls back for a type nobody has invented yet', () => {
    // `type` is not enum-constrained in the schema, so this has to be total.
    expect(deadlineTypeStyle('some_new_milestone').label).toBe('Other');
    expect(deadlineTypeStyle('some_new_milestone').dotClass).toBeTruthy();
  });

  it('carries the colour on every deadline the calendar renders', () => {
    const months = buildYearOverview(
      [edition({ id: 'a26', deadlines: [{ type: 'paper', label: 'Paper', date: '2026-10-15 23:59:59' }] })],
      2026,
      NOW,
    );
    expect(findDay(months, '2026-10-15')!.deadlines[0]!.dotClass).toBe(
      deadlineTypeStyle('paper').dotClass,
    );
  });
});

describe('deadlineTypesInUse', () => {
  it('lists the types present, so the legend explains only what is shown', () => {
    const types = deadlineTypesInUse([
      edition({ id: 'a26', deadlines: [
        { type: 'paper', label: 'P', date: '2026-10-15 23:59:59' },
        { type: 'notification', label: 'N', date: '2026-11-15 23:59:59' },
        { type: 'paper', label: 'P2', date: '2026-12-15 23:59:59' },
        { type: 'abstract', label: 'A', date: 'TBA' },
      ] }),
    ]);
    expect(types).toEqual(['paper', 'notification']);
  });
});
