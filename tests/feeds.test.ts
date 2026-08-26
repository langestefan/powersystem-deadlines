import { describe, expect, it } from 'vitest';

import { feedUrl, googleSubscribeUrl, webcalUrl } from '@/lib/feeds';
import { SITE_URL } from '@/lib/site';

/**
 * These assertions look pedantic, but each one corresponds to a way the
 * subscribe buttons have silently stopped working.
 */
describe('feed URLs', () => {
  const path = '/calendar/all.ics';

  it('builds an absolute https URL that includes the deployment base path once', () => {
    const url = feedUrl(path);
    expect(url).toBe(`${SITE_URL}/calendar/all.ics`);
    expect(url.startsWith('https://')).toBe(true);
    // A doubled base path is the failure mode when withBase and absoluteUrl overlap.
    expect(url.split('/calendar/').length).toBe(2);
  });

  it('swaps only the scheme for the webcal form', () => {
    expect(webcalUrl(path)).toBe(feedUrl(path).replace(/^https:/, 'webcal:'));
    expect(webcalUrl(path).startsWith('webcal://')).toBe(true);
  });

  it("uses the one shape Google's add-by-URL flow accepts", () => {
    const url = googleSubscribeUrl(path);
    expect(url.startsWith('https://www.google.com/calendar/render?cid=')).toBe(true);
    // Must be the webcal:// form, raw. https:// or percent-encoding both fail
    // with "Can't add calendar, check the URL".
    expect(url).toContain('cid=webcal://');
    expect(url).not.toContain('cid=https');
    expect(url).not.toContain('%3A%2F%2F');
  });
});
