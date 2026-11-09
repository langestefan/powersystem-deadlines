/**
 * HTML → plain text and link discovery for the daily CFP check.
 *
 * Domain-free and pure, like `ics.ts`: scripts/check-cfps.ts does the
 * fetching, this only reads the markup it got back. Deliberately a few regular
 * expressions rather than a DOM parser. The checker only needs the words and
 * dates a reader would see, and a page this cannot read is reported for a
 * human rather than guessed at.
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  rarr: '→',
  copy: '©',
  hellip: '…',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const point =
        code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/**
 * Plain text of a page, one line per block element.
 *
 * Struck-through text is dropped: a site that extends a deadline usually
 * strikes the old date out, and it would otherwise still "appear" on the page.
 */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|svg|template|noscript|del|s|strike)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/td|\/th|\/section|\/dt|\/dd)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\r\f\v ]+/g, ' ')
    .replace(/\n\s*/g, '\n')
    .trim();
}

/** Link text or path that suggests the page holds the deadlines. */
export const DATES_LINK =
  /call[\s_-]+for[\s_-]+(papers|submissions|abstracts|contributions)|cfp|key[\s_-]+dates|important[\s_-]+dates|deadlines|authors?\b|submission/i;

/**
 * Same-site links worth following one level down, because the landing page
 * often only says "Call for papers →".
 */
export function datesLinks(html: string, base: string, limit = 5): string[] {
  const baseUrl = new URL(base);
  const origin = baseUrl.origin;
  // One site often hosts several editions (dpsp.theiet.org/2027-europe and
  // /2027-apac). Below an edition's own path, stay inside it, or another
  // edition's dates read as a change to this one.
  const scope = baseUrl.pathname.replace(/[^/]*\.[a-z]+$/i, '').replace(/\/?$/, '');
  const links = new Set<string>();
  const anchors = html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi);

  for (const [, , href = '', inner = ''] of anchors) {
    if (!DATES_LINK.test(htmlToText(inner)) && !DATES_LINK.test(href)) continue;
    try {
      const url = new URL(decodeEntities(href), base);
      if (url.origin !== origin || !/^https?:$/.test(url.protocol)) continue;
      if (scope && url.pathname !== scope && !url.pathname.startsWith(`${scope}/`)) continue;
      if (/\.(pdf|docx?|zip|png|jpe?g|ics)$/i.test(url.pathname)) continue;
      url.hash = '';
      if (url.href !== base) links.add(url.href);
    } catch {
      // A malformed href is the site's problem, not a finding.
    }
  }
  return [...links].slice(0, limit);
}
