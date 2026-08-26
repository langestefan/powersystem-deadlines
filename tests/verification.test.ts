import { describe, expect, it } from 'vitest';

import { flattenEdition, type ConferenceEdition } from '@/lib/edition';
import {
  DEFAULT_MAX_AGE_DAYS,
  editionVerification,
  URGENT_MAX_AGE_DAYS,
  URGENT_WINDOW_DAYS,
  verificationStatus,
} from '@/lib/verification';

/**
 * Freshness is what separates this project from the aggregators it warns about,
 * so the tiers are pinned at their boundaries: an off-by-one here either nags
 * contributors about entries that are fine, or stays quiet about the ones that
 * are about to mislead somebody.
 */

const NOW = new Date('2026-08-26T12:00:00Z');
const DAY = 86_400_000;

const daysFromNow = (days: number) => new Date(NOW.getTime() + days * DAY);
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

describe('verificationStatus', () => {
  it('reports the age in whole days', () => {
    expect(verificationStatus(daysAgo(12), daysFromNow(200), true, NOW).ageDays).toBe(12);
    expect(verificationStatus(NOW, daysFromNow(200), true, NOW).ageDays).toBe(0);
  });

  it('exempts an edition with nothing upcoming', () => {
    // Nobody needs to re-read a call for papers that closed last year.
    const status = verificationStatus(daysAgo(900), null, false, NOW);
    expect(status.stale).toBe(false);
    expect(status.maxAgeDays).toBe(Infinity);
  });

  describe(`with a deadline inside ${URGENT_WINDOW_DAYS} days`, () => {
    const soon = daysFromNow(10);

    it('allows a recent check', () => {
      expect(verificationStatus(daysAgo(URGENT_MAX_AGE_DAYS - 1), soon, true, NOW).stale).toBe(
        false,
      );
    });

    it('treats an age exactly at the limit as still fresh', () => {
      expect(verificationStatus(daysAgo(URGENT_MAX_AGE_DAYS), soon, true, NOW).stale).toBe(false);
    });

    it('flags one day past the limit', () => {
      const status = verificationStatus(daysAgo(URGENT_MAX_AGE_DAYS + 1), soon, true, NOW);
      expect(status.stale).toBe(true);
      expect(status.maxAgeDays).toBe(URGENT_MAX_AGE_DAYS);
    });
  });

  describe('at the window boundary', () => {
    it(`treats a deadline exactly ${URGENT_WINDOW_DAYS} days out as urgent`, () => {
      const status = verificationStatus(daysAgo(40), daysFromNow(URGENT_WINDOW_DAYS), true, NOW);
      expect(status.maxAgeDays).toBe(URGENT_MAX_AGE_DAYS);
      expect(status.stale).toBe(true);
    });

    it(`treats a deadline just beyond ${URGENT_WINDOW_DAYS} days as routine`, () => {
      const status = verificationStatus(
        daysAgo(40),
        daysFromNow(URGENT_WINDOW_DAYS + 1),
        true,
        NOW,
      );
      expect(status.maxAgeDays).toBe(DEFAULT_MAX_AGE_DAYS);
      expect(status.stale).toBe(false);
    });
  });

  describe('with no dated deadline yet', () => {
    it('still expects routine re-checking, because that is how a TBA becomes a date', () => {
      const status = verificationStatus(daysAgo(DEFAULT_MAX_AGE_DAYS + 1), null, true, NOW);
      expect(status.maxAgeDays).toBe(DEFAULT_MAX_AGE_DAYS);
      expect(status.stale).toBe(true);
    });

    it('leaves a recently checked TBA edition alone', () => {
      expect(verificationStatus(daysAgo(30), null, true, NOW).stale).toBe(false);
    });
  });

  it('ignores a deadline that has already passed when choosing the tier', () => {
    // A passed deadline must not drag the edition into the urgent tier.
    const status = verificationStatus(daysAgo(60), daysFromNow(-5), true, NOW);
    expect(status.maxAgeDays).toBe(DEFAULT_MAX_AGE_DAYS);
    expect(status.stale).toBe(false);
  });
});

describe('editionVerification', () => {
  function edition(overrides: {
    verified: string;
    deadlines: Array<{ type: string; label: string; date: string }>;
    end?: string;
  }): ConferenceEdition {
    return flattenEdition(
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
        verified: overrides.verified,
        end: overrides.end,
        format: 'in-person',
        cancelled: false,
        timezone: 'AoE',
        deadlines: overrides.deadlines,
      },
      NOW,
    );
  }

  it('still expects re-checking when every deadline is TBA', () => {
    // A TBA becoming a real date is the change nobody announces.
    const status = editionVerification(
      edition({
        verified: '2025-01-01',
        deadlines: [{ type: 'paper', label: 'Paper', date: 'TBA' }],
      }),
      NOW,
    );
    expect(status.stale).toBe(true);
  });

  it('exempts an edition whose deadlines and event are all behind us', () => {
    const status = editionVerification(
      edition({
        verified: '2025-01-01',
        end: '2026-01-10',
        deadlines: [{ type: 'paper', label: 'Paper', date: '2025-06-01 23:59:59' }],
      }),
      NOW,
    );
    expect(status.stale).toBe(false);
  });

  it('applies the urgent tier when a deadline is imminent', () => {
    const status = editionVerification(
      edition({
        verified: '2026-07-01',
        deadlines: [{ type: 'paper', label: 'Paper', date: '2026-09-05 23:59:59' }],
      }),
      NOW,
    );
    expect(status.maxAgeDays).toBe(URGENT_MAX_AGE_DAYS);
    expect(status.stale).toBe(true);
  });
});
