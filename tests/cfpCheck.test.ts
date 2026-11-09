import { describe, expect, it } from 'vitest';

import {
  checkEdition,
  extractDates,
  isActionable,
  labelDates,
  needsChecking,
} from '@/lib/cfpCheck';
import { flattenEdition, type ConferenceEdition } from '@/lib/edition';
import type { DeadlineData } from '@/content.config';

const NOW = new Date('2026-11-09T12:00:00Z');

function edition(
  deadlines: DeadlineData[],
  extra: { verified?: string; timezone?: string; start?: string; end?: string } = {},
): ConferenceEdition {
  return flattenEdition(
    {
      name: 'DPSP',
      full_name: 'Developments in Power System Protection',
      kind: 'conference',
      link: 'https://dpsp.example.org/',
      society: ['IET'],
      frequency: 'annual',
      tags: ['protection-automation'],
      editions: [],
    },
    'dpsp',
    {
      year: 2027,
      id: 'dpsp-europe27',
      city: 'Munich',
      country: 'Germany',
      date: 'April 14-16, 2027',
      verified: extra.verified ?? '2026-11-01',
      start: extra.start ?? '2027-04-14',
      end: extra.end ?? '2027-04-16',
      format: 'in-person',
      cancelled: false,
      timezone: extra.timezone,
      deadlines,
    },
    NOW,
  );
}

const days = (text: string) => extractDates(text).map((found) => found.day ?? found.monthDay);

describe('extractDates', () => {
  it.each([
    ['27 November 2026', '2026-11-27'],
    ['Friday, 27 November 2026', '2026-11-27'],
    ['27th of November, 2026', '2026-11-27'],
    ['November 27, 2026', '2026-11-27'],
    ['Nov. 27, 2026', '2026-11-27'],
    ['Sept 3, 2026', '2026-09-03'],
    ['2026-11-27', '2026-11-27'],
    ['27/11/2026', '2026-11-27'],
    ['27-Oct-2026', '2026-10-27'],
    ['14.4.2027', '2027-04-14'],
    ['11/27/2026', '2026-11-27'],
  ])('reads %s', (text, expected) => {
    expect(days(text)).toEqual([expected]);
  });

  it('skips a numeric date whose order is ambiguous', () => {
    expect(days('05/06/2026')).toEqual([]);
  });

  it('reads both ends of a range', () => {
    expect(days('14 - 16 April 2027 | Munich')).toEqual(['2027-04-14', '2027-04-16']);
    expect(days('April 14–16, 2027')).toEqual(['2027-04-14', '2027-04-16']);
  });

  it('keeps a year-less date as month and day', () => {
    expect(days('Abstracts due Nov 27')).toEqual(['11-27']);
  });

  it('does not re-read a full date as a year-less one', () => {
    expect(extractDates('Deadline: 27 November 2026')).toHaveLength(1);
  });

  it('rejects impossible days', () => {
    expect(days('31 February 2027')).toEqual([]);
  });

  it('does not read the year as a day', () => {
    expect(days('Call opens November 2026')).toEqual([]);
  });

  it('keeps surrounding text as evidence', () => {
    const [found] = extractDates('The deadline has been extended to 27 November 2026 for all');
    expect(found?.context).toContain('extended');
  });
});

describe('checkEdition', () => {
  const dpspPage = `
    DPSP Europe 2027. 14 - 16 April 2027 | Munich, Germany.
    Call for Papers deadline: extended to 27 November 2026.
    Key dates: Full paper submission deadline: Friday, 27 November 2026.
    Author notification: Friday, 22 January 2027.
    Author registration deadline: Monday, 8 February 2027.
  `;

  it('catches the DPSP extension against the old date', () => {
    const findings = checkEdition(
      edition([
        { type: 'paper', label: 'Full paper submission', date: '2026-10-30 23:59:59' },
        { type: 'notification', label: 'Author notification', date: '2027-01-22 23:59:59' },
      ]),
      dpspPage,
      NOW,
    );
    const kinds = findings.map((finding) => finding.kind);
    expect(kinds).toContain('missing-date');
    expect(kinds).toContain('extension-notice');
    expect(findings.find((f) => f.kind === 'missing-date')?.message).toContain('2026-10-30');
    expect(isActionable(findings)).toBe(true);
  });

  it('does not read "extended digest" as an extension', () => {
    const findings = checkEdition(
      edition([{ type: 'paper', label: 'Digest', date: 'TBA' }], {
        start: '2027-09-06',
        end: '2027-09-09',
      }),
      'Important Dates 01 March 2027 : Deadline for submission of extended digest. 6 - 9 September 2027',
      NOW,
    );
    expect(findings.map((finding) => finding.kind)).not.toContain('extension-notice');
  });

  it('does not flag the old date in "extended from"', () => {
    const findings = checkEdition(
      edition([{ type: 'paper', label: 'Paper', date: '2026-10-02 23:59:59' }]),
      'October 2, 2026 Manuscript Submission Firm deadline - extended from September 25, 2026. ' +
        'April 14-16, 2027',
      NOW,
    );
    expect(findings).toEqual([]);
  });

  it('reports nothing once the data matches the page', () => {
    const findings = checkEdition(
      edition([
        { type: 'paper', label: 'Full paper submission', date: '2026-11-27 23:59:59' },
        { type: 'notification', label: 'Author notification', date: '2027-01-22 23:59:59' },
        { type: 'author_registration', label: 'Author registration', date: '2027-02-08 23:59:59' },
      ]),
      dpspPage,
      NOW,
    );
    expect(findings).toEqual([]);
  });

  it('matches an AoE deadline on the day the CFP states, not the UTC day', () => {
    // 2027-01-31 23:59:59 AoE is 1 February in UTC.
    const findings = checkEdition(
      edition([{ type: 'paper', label: 'Paper', date: '2027-01-31 23:59:59' }], {
        timezone: 'AoE',
      }),
      'Paper deadline: 31 January 2027. Conference 14-16 April 2027.',
      NOW,
    );
    expect(findings).toEqual([]);
  });

  it('matches a year-less date on the page', () => {
    const findings = checkEdition(
      edition([{ type: 'paper', label: 'Paper', date: '2026-11-27 23:59:59' }]),
      'Papers due Nov 27. April 14-16, 2027.',
      NOW,
    );
    expect(findings).toEqual([]);
  });

  it('notices a TBA that has become a date', () => {
    const findings = checkEdition(
      edition([{ type: 'paper', label: 'Paper submission', date: 'TBA' }]),
      'Full paper submission deadline: 15 January 2027. 14 - 16 April 2027.',
      NOW,
    );
    const tba = findings.find((finding) => finding.kind === 'tba-now-dated');
    expect(tba?.message).toContain('2027-01-15');
  });

  it('ignores a deadline long past that dropped off the page', () => {
    const findings = checkEdition(
      edition([
        { type: 'abstract', label: 'Abstract', date: '2026-06-01 23:59:59' },
        { type: 'paper', label: 'Paper', date: '2026-11-27 23:59:59' },
      ]),
      'Paper deadline 27 November 2026. 14-16 April 2027.',
      NOW,
    );
    expect(findings).toEqual([]);
  });

  it('flags event dates that no longer appear', () => {
    const findings = checkEdition(
      edition([{ type: 'paper', label: 'Paper', date: '2026-11-27 23:59:59' }]),
      'Paper deadline 27 November 2026. Conference 21 - 23 April 2027.',
      NOW,
    );
    expect(findings.map((finding) => finding.kind)).toEqual(['conference-dates']);
  });

  it('flags a stale entry even when the page agrees', () => {
    const findings = checkEdition(
      edition([{ type: 'paper', label: 'Paper', date: '2026-11-27 23:59:59' }], {
        verified: '2026-08-01',
      }),
      'Paper deadline 27 November 2026. 14-16 April 2027.',
      NOW,
    );
    expect(findings.map((finding) => finding.kind)).toEqual(['stale']);
  });

  it('hands a page without dates to a human', () => {
    const findings = checkEdition(
      edition([{ type: 'paper', label: 'Paper', date: '2026-11-27 23:59:59' }]),
      'Loading…',
      NOW,
    );
    expect(findings.map((finding) => finding.kind)).toEqual(['no-dates']);
    expect(isActionable(findings)).toBe(false);
  });
});

describe('needsChecking', () => {
  it('skips a finished edition', () => {
    const past = edition([{ type: 'paper', label: 'Paper', date: '2025-10-01 23:59:59' }], {
      start: '2026-03-02',
      end: '2026-03-06',
    });
    expect(needsChecking(past)).toBe(false);
  });

  it('keeps an edition with only TBA dates', () => {
    expect(needsChecking(edition([{ type: 'paper', label: 'Paper', date: 'TBA' }]))).toBe(true);
  });
});

describe('labelDates', () => {
  const labels = (text: string) =>
    [...labelDates(text, extractDates(text))].map(([date, kind]) => `${date.day}=${kind}`);

  it('takes the label after a date when that is how the page lays them out', () => {
    expect(
      labels(
        'November 15, 2026\nDigest Submission Deadline\nNovember 15, 2026\n' +
          'Special Session Proposal Submission Deadline\nNovember 15, 2026\nTutorial Proposal',
      ),
    ).toEqual(['2026-11-15=abstract', '2026-11-15=session', '2026-11-15=tutorial']);
  });

  it('takes the label before a date, and never across a sentence end', () => {
    expect(
      labels(
        'Full paper submission deadline: Friday, 27 November 2026. ' +
          'Author notification: Friday, 22 January 2027.',
      ),
    ).toEqual(['2026-11-27=paper', '2027-01-22=notification']);
  });

  it('leaves a date with no deadline wording nearby unlabelled', () => {
    expect(labels('The conference runs on 14 April 2027 in Munich.')).toEqual([]);
  });
});

describe('conflicting dates (IEMDC 2027)', () => {
  // The data as it stood before the fix, and the three pages as IEMDC served them.
  const iemdc = () =>
    edition(
      [
        { type: 'abstract', label: 'Digest submission', date: '2026-11-01 23:59:59' },
        {
          type: 'workshop_proposal',
          label: 'Special session proposal',
          date: '2026-11-01 23:59:59',
        },
        { type: 'tutorial_proposal', label: 'Tutorial proposal', date: '2026-11-15 23:59:59' },
        {
          type: 'notification',
          label: 'Digest acceptance notification',
          date: '2027-01-15 23:59:59',
        },
        { type: 'camera_ready', label: 'Final paper submission', date: '2027-03-15 23:59:59' },
      ],
      { start: '2027-05-17', end: '2027-05-20' },
    );
  const pages = [
    {
      url: 'https://www.iemdc.org/',
      text:
        'IEMDC-2027 will be held in Milwaukee, WI on May 17 – 20, 2027\n' +
        'November 15, 2026\nDigest Submission Deadline\nNovember 15, 2026\n' +
        'Special Session Proposal\nSubmission Deadline\nNovember 15, 2026\nTutorial Proposal\n' +
        'Submission Deadline',
    },
    {
      // Stale: still the old digest date.
      url: 'https://www.iemdc.org/authors-2027/',
      text:
        'Important Dates\nWhen Is It Due?\nNovember 1, 2026\nDigest Submission Deadline\n' +
        'January 15, 2027\nDigest Acceptance Notification\nMarch 15, 2027\n' +
        'Submission of final papers\nand early registration',
    },
  ];

  it('catches the digest deadline that the stale page hid', () => {
    const conflicts = checkEdition(iemdc(), pages, NOW).filter(
      (f) => f.kind === 'conflicting-date',
    );
    expect(conflicts.map((f) => f.message)).toEqual([
      'Special session proposal: the data says 2026-11-01, but https://www.iemdc.org/ gives 2026-11-15.',
      'Digest submission: the data says 2026-11-01, but https://www.iemdc.org/ gives 2026-11-15.',
    ]);
  });

  it('is quiet once the data matches', () => {
    const fixed = edition(
      [
        { type: 'abstract', label: 'Digest submission', date: '2026-11-15 23:59:59' },
        {
          type: 'workshop_proposal',
          label: 'Special session proposal',
          date: '2026-11-15 23:59:59',
        },
        { type: 'tutorial_proposal', label: 'Tutorial proposal', date: '2026-11-15 23:59:59' },
        {
          type: 'notification',
          label: 'Digest acceptance notification',
          date: '2027-01-15 23:59:59',
        },
        { type: 'camera_ready', label: 'Final paper submission', date: '2027-03-15 23:59:59' },
      ],
      { start: '2027-05-17', end: '2027-05-20' },
    );
    // Only the stale page disagrees now, and it is still worth flagging.
    expect(
      checkEdition(fixed, pages, NOW)
        .filter((f) => f.kind === 'conflicting-date')
        .map((f) => f.message),
    ).toEqual([
      'Digest submission: the data says 2026-11-15, but https://www.iemdc.org/authors-2027/ gives 2026-11-01.',
    ]);
  });
});
