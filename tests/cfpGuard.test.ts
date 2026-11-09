import { describe, expect, it } from 'vitest';

import { proposalViolations } from '@/lib/cfpGuard';

/**
 * The guard is the security boundary between a page Claude read and a pull
 * request in the repo, so each refusal is pinned: if one of these starts
 * passing, a prompt-injected page can get that edit in front of a reviewer.
 */

function series() {
  return {
    name: 'DPSP',
    link: 'https://dpsp.theiet.org/',
    tags: ['protection-automation'],
    editions: [
      {
        year: 2026,
        id: 'dpsp-global26',
        city: 'London',
        verified: '2026-10-14',
        deadlines: [{ type: 'paper', label: 'Paper', date: '2025-10-31 23:59:59' }],
      },
      {
        year: 2027,
        id: 'dpsp-europe27',
        link: 'https://dpsp.theiet.org/2027-europe',
        city: 'Munich',
        venue: 'Hilton Munich City',
        verified: '2026-10-14',
        note: 'DPSP Europe 2027.',
        deadlines: [
          { type: 'paper', label: 'Full paper submission', date: '2026-10-30 23:59:59' },
          {
            type: 'notification',
            label: 'Author notification',
            date: '2027-01-22 23:59:59',
            link: 'https://dpsp.theiet.org/2027-europe/call-for-submissions',
          },
        ],
        changes: [{ date: '2026-10-01', field: 'venue', old: 'TBA', new: 'Hilton Munich City' }],
      },
    ],
  };
}

type Series = ReturnType<typeof series>;

function propose(edit: (doc: Series) => void): string[] {
  const after = series();
  edit(after);
  return proposalViolations(series(), after, 'dpsp-europe27');
}

const target = (doc: Series) => doc.editions[1]!;

describe('proposalViolations', () => {
  it('accepts the DPSP extension as a CFP check would write it', () => {
    expect(
      propose((doc) => {
        const edition = target(doc);
        edition.deadlines[0]!.date = '2026-11-27 23:59:59';
        edition.deadlines[0]!.label = 'Full paper submission (extended)';
        edition.verified = '2026-11-09';
        edition.changes!.push({
          date: '2026-11-09',
          field: 'paper',
          old: '2026-10-30',
          new: '2026-11-27',
        });
      }),
    ).toEqual([]);
  });

  it('ignores key order', () => {
    const after = series();
    const { id, ...rest } = target(after);
    after.editions[1] = { ...rest, id } as Series['editions'][number];
    expect(proposalViolations(series(), after, 'dpsp-europe27')).toEqual([]);
  });

  it('refuses a changed edition link', () => {
    expect(propose((doc) => (target(doc).link = 'https://evil.example/'))).toHaveLength(1);
  });

  it('refuses a changed series field', () => {
    expect(propose((doc) => (doc.link = 'https://evil.example/'))).toEqual([
      'Series field `link` changed.',
    ]);
  });

  it('refuses an edit to another edition', () => {
    expect(propose((doc) => (doc.editions[0]!.verified = '2026-11-09'))[0]).toContain(
      'dpsp-global26',
    );
  });

  it('refuses added or removed editions', () => {
    expect(propose((doc) => doc.editions.pop())).toEqual([
      'Editions were added, removed or reordered.',
    ]);
  });

  it('refuses a new deadline link', () => {
    const violations = propose(
      (doc) =>
        ((target(doc).deadlines[0] as { link?: string }).link = 'https://evil.example/submit'),
    );
    expect(violations[0]).toContain('may not add links');
  });

  it('keeps a deadline link main already had', () => {
    expect(propose((doc) => (target(doc).deadlines[1]!.date = '2027-01-29 23:59:59'))).toEqual([]);
  });

  it('refuses an unknown deadline field', () => {
    expect(
      propose((doc) => ((target(doc).deadlines[0] as Record<string, string>).url = 'x')),
    ).toHaveLength(1);
  });

  it('refuses a link smuggled into the note, venue or label', () => {
    expect(propose((doc) => (target(doc).note = 'Submit at evil.com now'))).toHaveLength(1);
    expect(propose((doc) => (target(doc).venue = 'See https://evil.example'))).toHaveLength(1);
    expect(
      propose((doc) => (target(doc).deadlines[0]!.label = 'Paper (www.evil.example)')),
    ).toHaveLength(1);
  });

  it('allows a plain-text note update', () => {
    expect(
      propose((doc) => (target(doc).note = 'DPSP Europe 2027, co-hosted with TU Munich.')),
    ).toEqual([]);
  });

  it('refuses rewriting the change log', () => {
    expect(propose((doc) => (target(doc).changes![0]!.new = 'Elsewhere'))[0]).toContain('changes');
  });
});
