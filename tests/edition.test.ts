import { describe, expect, it } from 'vitest';

import {
  deadlineZoneLabel,
  flattenEdition,
  resolveDeadline,
  submissionStatus,
  type ConferenceEdition,
} from '@/lib/edition';

/**
 * The fallback chain behind a deadline's timezone, and what the site is then
 * allowed to claim about it. An unstated zone read as AoE is how this site
 * once showed a live countdown for fourteen hours after CIRED's abstract
 * deadline had actually closed.
 */

const NOW = new Date('2026-09-16T12:00:00Z');

const SERIES = {
  name: 'TESTCONF',
  full_name: 'Test Conference on Power Systems',
  link: 'https://testconf.example.org/',
  society: ['IEEE PES'] as const,
  frequency: 'annual' as const,
  tags: ['power-systems'] as const,
  editions: [],
};

function edition(o: {
  timezone?: string;
  deadlines?: Array<{ type: string; label: string; date: string; timezone?: string }>;
  end?: string;
}): ConferenceEdition {
  return flattenEdition(
    { ...SERIES, society: [...SERIES.society], tags: [...SERIES.tags] },
    'testconf',
    {
      year: 2027,
      id: 'testconf27',
      date: 'June 8-12, 2027',
      verified: '2026-09-16',
      format: 'in-person',
      cancelled: false,
      timezone: o.timezone,
      end: o.end,
      deadlines: o.deadlines ?? [],
    },
    NOW,
  );
}

const deadline = (date: string, timezone?: string) => ({
  type: 'paper',
  label: 'Full paper submission',
  date,
  timezone,
});

describe('resolveDeadline', () => {
  it('prefers the deadline\'s own zone over the edition default', () => {
    const resolved = resolveDeadline(
      deadline('2026-10-15 23:59:59', 'Europe/Amsterdam'),
      'AoE',
    );
    expect(resolved.timezone).toBe('Europe/Amsterdam');
    expect(resolved.timezoneStated).toBe(true);
  });

  it('falls back to the edition zone when the deadline states none', () => {
    const resolved = resolveDeadline(deadline('2026-10-15 23:59:59'), 'AoE');
    expect(resolved.timezone).toBe('AoE');
    expect(resolved.timezoneStated).toBe(true);
    expect(resolved.utc?.toISOString()).toBe('2026-10-16T11:59:59.000Z');
  });

  it('assumes UTC+12, not AoE, when nothing states a zone', () => {
    const resolved = resolveDeadline(deadline('2026-10-15 23:59:59'), undefined);
    expect(resolved.timezone).toBe('UTC+12');
    expect(resolved.timezoneStated).toBe(false);
    // A full day earlier than the AoE reading above, which is the whole point.
    expect(resolved.utc?.toISOString()).toBe('2026-10-15T11:59:59.000Z');
  });

  it('keeps an explicit AoE at UTC-12, because a call that says AoE means it', () => {
    const stated = resolveDeadline(deadline('2026-09-14 23:59:59', 'AoE'), undefined);
    const unstated = resolveDeadline(deadline('2026-09-14 23:59:59'), undefined);
    expect(stated.utc!.getTime() - unstated.utc!.getTime()).toBe(24 * 3_600_000);
  });

  it('leaves a TBA deadline without an instant whatever the zone', () => {
    const resolved = resolveDeadline(deadline('TBA'), undefined);
    expect(resolved.tba).toBe(true);
    expect(resolved.utc).toBeNull();
  });
});

describe('deadlineZoneLabel', () => {
  it('prints a stated zone as it stands', () => {
    expect(deadlineZoneLabel(resolveDeadline(deadline('2026-10-15 23:59:59'), 'AoE'))).toBe('AoE');
    expect(
      deadlineZoneLabel(resolveDeadline(deadline('2026-10-15 23:59:59', 'CET'), undefined)),
    ).toBe('CET');
  });

  it('never passes an assumed zone off as stated', () => {
    expect(deadlineZoneLabel(resolveDeadline(deadline('2026-10-15 23:59:59'), undefined))).toBe(
      'UTC+12 (assumed)',
    );
  });
});

describe('submissionStatus', () => {
  it('buckets a live deadline by how close it is', () => {
    expect(submissionStatus(edition({ deadlines: [deadline('2026-09-20 23:59:59', 'AoE')] }), NOW))
      .toBe('urgent');
    expect(submissionStatus(edition({ deadlines: [deadline('2026-10-05 23:59:59', 'AoE')] }), NOW))
      .toBe('soon');
    expect(submissionStatus(edition({ deadlines: [deadline('2027-01-05 23:59:59', 'AoE')] }), NOW))
      .toBe('later');
  });

  it('calls a conference with only passed deadlines closed, not unannounced', () => {
    const past = edition({
      deadlines: [deadline('2026-08-01 23:59:59', 'AoE')],
      end: '2027-06-12',
    });
    expect(past.isUpcomingEvent).toBe(true);
    expect(submissionStatus(past, NOW)).toBe('closed');
  });

  it('calls a TBA deadline unannounced', () => {
    expect(submissionStatus(edition({ deadlines: [deadline('TBA')] }), NOW)).toBe('unannounced');
  });

  it('calls an edition with no deadlines at all unannounced', () => {
    expect(submissionStatus(edition({}), NOW)).toBe('unannounced');
  });

  it('is still closed when a passed deadline sits alongside a TBA one', () => {
    const mixed = edition({
      deadlines: [deadline('2026-08-01 23:59:59', 'AoE'), deadline('TBA')],
    });
    expect(submissionStatus(mixed, NOW)).toBe('closed');
  });
});
