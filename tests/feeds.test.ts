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

  it("uses the shape Google's add-by-URL flow accepts", () => {
    const url = googleSubscribeUrl(path);

    // The cid must carry the webcal:// scheme. Given an https:// value Google
    // reads it as a Google *calendar id*, not a feed, and answers "Can't add
    // calendar, check the URL".
    expect(url).toContain('cid=webcal');
    expect(url).not.toContain('cid=https');

    // calendar.google.com/calendar/r both subscribes and takes the calendar's
    // name from X-WR-CALNAME. www.google.com/calendar/render also subscribes,
    // but 302s to a legacy route that names the calendar after the .ics file.
    expect(url.startsWith('https://calendar.google.com/calendar/r?cid=')).toBe(true);

    expect(url).toBe(
      `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(path))}`,
    );
  });
});
