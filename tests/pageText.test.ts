import { describe, expect, it } from 'vitest';

import { datesLinks, decodeEntities, htmlToText } from '@/lib/pageText';

describe('htmlToText', () => {
  it('drops scripts, styles and comments', () => {
    const html =
      '<p>Deadline</p><script>var d = "1 May 2026";</script><style>p{}</style><!-- 2 May 2026 -->';
    expect(htmlToText(html)).toBe('Deadline');
  });

  it('drops struck-through old dates', () => {
    expect(htmlToText('Paper: <del>30 October 2026</del> 27 November 2026')).toBe(
      'Paper: 27 November 2026',
    );
    expect(htmlToText('Paper: <s>30 Oct</s> 27 Nov')).toBe('Paper: 27 Nov');
  });

  it('keeps block boundaries as line breaks', () => {
    expect(htmlToText('<li>A</li><li>B</li>')).toBe('A\nB');
  });

  it('decodes entities', () => {
    expect(htmlToText('14&ndash;16&nbsp;April &amp; more &#8211; &#x2014;')).toBe(
      '14–16 April & more – —',
    );
  });

  it('does not let a long unrelated <s…> tag swallow the page', () => {
    expect(htmlToText('<section><span>27 November 2026</span></section>')).toBe('27 November 2026');
  });
});

describe('decodeEntities', () => {
  it('leaves an out-of-range code point alone instead of throwing', () => {
    expect(decodeEntities('&#99999999;')).toBe('&#99999999;');
  });
});

describe('datesLinks', () => {
  const base = 'https://dpsp.example.org/2027-europe';
  const html = `
    <a href="/2027-europe/call-for-submissions">Call for submissions</a>
    <a href="/2027-apac/author-information">Author information</a>
    <a href="/2027-europe/venue">Venue</a>
    <a href="https://elsewhere.org/cfp">Call for papers</a>
    <a href="/2027-europe/cfp.pdf">Call for papers (PDF)</a>
    <a class="x" href='/2027-europe/important-dates#top'><span>Key</span> dates</a>
  `;

  it('follows same-edition links that look like they hold the dates', () => {
    expect(datesLinks(html, base)).toEqual([
      'https://dpsp.example.org/2027-europe/call-for-submissions',
      'https://dpsp.example.org/2027-europe/important-dates',
    ]);
  });

  it('follows anything on the site from a root link', () => {
    expect(datesLinks(html, 'https://dpsp.example.org/')).toContain(
      'https://dpsp.example.org/2027-apac/author-information',
    );
  });

  it('respects the limit', () => {
    expect(datesLinks(html, base, 1)).toHaveLength(1);
  });
});
