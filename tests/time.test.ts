import { describe, expect, it } from 'vitest';

import {
  countdownParts,
  fixedOffsetMinutes,
  formatInZone,
  formatTimeInZone,
  isTba,
  isValidTimezone,
  toUtc,
  urgencyOf,
} from '@/lib/time';

describe('fixedOffsetMinutes', () => {
  it('treats AoE as UTC-12', () => {
    expect(fixedOffsetMinutes('AoE')).toBe(-720);
    expect(fixedOffsetMinutes('aoe')).toBe(-720);
  });

  it('parses UTC and GMT offsets in every spelling a CFP uses', () => {
    expect(fixedOffsetMinutes('UTC')).toBe(0);
    expect(fixedOffsetMinutes('UTC+2')).toBe(120);
    expect(fixedOffsetMinutes('GMT-5')).toBe(-300);
    expect(fixedOffsetMinutes('UTC+05:30')).toBe(330);
    expect(fixedOffsetMinutes('UTC+0530')).toBe(330);
  });

  it('returns null for IANA zones so they take the DST-aware path', () => {
    expect(fixedOffsetMinutes('Europe/Amsterdam')).toBeNull();
    expect(fixedOffsetMinutes('America/New_York')).toBeNull();
  });
});

describe('toUtc', () => {
  it('shifts an AoE deadline forward by twelve hours', () => {
    // The classic case: 23:59:59 AoE on the 15th is 11:59:59 UTC on the 16th.
    expect(toUtc('2026-04-15 23:59:59', 'AoE').toISOString()).toBe('2026-04-16T11:59:59.000Z');
  });

  it('applies DST for IANA zones', () => {
    // Amsterdam is UTC+1 in January and UTC+2 in July.
    expect(toUtc('2026-01-15 23:59:59', 'Europe/Amsterdam').toISOString()).toBe(
      '2026-01-15T22:59:59.000Z',
    );
    expect(toUtc('2026-07-15 23:59:59', 'Europe/Amsterdam').toISOString()).toBe(
      '2026-07-15T21:59:59.000Z',
    );
  });

  it('honours a fixed abbreviation regardless of season', () => {
    // CET means UTC+1 by definition, even in July when Paris is on CEST.
    expect(toUtc('2026-07-15 12:00:00', 'CET').toISOString()).toBe('2026-07-15T11:00:00.000Z');
  });

  it('handles offsets east of Greenwich', () => {
    expect(toUtc('2026-05-15 23:59:59', 'UTC+8').toISOString()).toBe('2026-05-15T15:59:59.000Z');
    expect(toUtc('2026-05-15 23:59:59', 'Asia/Shanghai').toISOString()).toBe(
      '2026-05-15T15:59:59.000Z',
    );
  });

  it('rejects malformed input rather than producing an Invalid Date', () => {
    expect(() => toUtc('15/04/2026', 'AoE')).toThrow(/Invalid deadline/);
    expect(() => toUtc('2026-04-15 23:59:59', 'Middle/Earth')).toThrow(/Unknown timezone/);
  });
});

describe('isValidTimezone', () => {
  it('accepts the four forms the schema documents', () => {
    for (const zone of ['AoE', 'Europe/Amsterdam', 'UTC+2', 'CET']) {
      expect(isValidTimezone(zone)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(isValidTimezone('Anywhere')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
  });
});

describe('isTba', () => {
  it('recognises the literal in any casing, and treats missing as TBA', () => {
    expect(isTba('TBA')).toBe(true);
    expect(isTba('tba')).toBe(true);
    expect(isTba(undefined)).toBe(true);
    expect(isTba('2026-04-15 23:59:59')).toBe(false);
  });
});

describe('countdownParts and urgencyOf', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('breaks the gap into days, hours, minutes and seconds', () => {
    const parts = countdownParts(new Date('2026-01-03T04:05:06Z'), now);
    expect(parts).toMatchObject({ days: 2, hours: 4, minutes: 5, seconds: 6, passed: false });
  });

  it('marks an elapsed deadline as passed', () => {
    expect(countdownParts(new Date('2025-12-31T00:00:00Z'), now).passed).toBe(true);
  });

  it('buckets by urgency at the seven and thirty day boundaries', () => {
    expect(urgencyOf(new Date('2025-12-31T00:00:00Z'), now)).toBe('passed');
    expect(urgencyOf(new Date('2026-01-05T00:00:00Z'), now)).toBe('urgent');
    expect(urgencyOf(new Date('2026-01-20T00:00:00Z'), now)).toBe('soon');
    expect(urgencyOf(new Date('2026-06-01T00:00:00Z'), now)).toBe('later');
  });
});

describe('formatInZone', () => {
  it('renders a fixed-offset instant in that offset, not the machine timezone', () => {
    const instant = toUtc('2026-04-15 23:59:59', 'AoE');
    expect(formatInZone(instant, 'AoE')).toMatch(/15 Apr 2026/);
    expect(formatInZone(instant, 'AoE')).toMatch(/23:59/);
  });

  it('renders an IANA instant in that zone', () => {
    const instant = toUtc('2026-07-15 23:59:59', 'Europe/Amsterdam');
    expect(formatInZone(instant, 'Europe/Amsterdam')).toMatch(/23:59/);
  });
});

describe('formatTimeInZone', () => {
  const aoeDeadline = new Date('2026-10-16T11:59:59Z'); // 2026-10-15 23:59:59 AoE

  it('renders the clock time in the deadline\u2019s own zone, without the date', () => {
    expect(formatTimeInZone(aoeDeadline, 'AoE')).toBe('23:59');
  });

  it('honours daylight saving for an IANA zone', () => {
    const summer = new Date('2026-07-31T21:59:59Z'); // 23:59:59 CEST
    const winter = new Date('2026-12-01T22:59:59Z'); // 23:59:59 CET
    expect(formatTimeInZone(summer, 'Europe/Amsterdam')).toBe('23:59');
    expect(formatTimeInZone(winter, 'Europe/Amsterdam')).toBe('23:59');
  });

  it('handles a half-hour offset zone', () => {
    const ist = new Date('2026-10-15T18:29:59Z'); // 23:59:59 IST (UTC+5:30)
    expect(formatTimeInZone(ist, 'UTC+05:30')).toBe('23:59');
  });
});
