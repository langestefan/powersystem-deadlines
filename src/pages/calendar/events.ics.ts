import type { APIRoute } from 'astro';

import { conferenceEvents } from '@/lib/calendar';
import { getAllEditions } from '@/lib/conferences';
import { EVENTS_FEED, feedUrl } from '@/lib/feeds';
import { buildCalendar, icsResponse } from '@/lib/ics';
import { SITE_DOMAIN, SITE_URL } from '@/lib/site';

/** The conferences themselves as all-day events, for people who travel to them. */
export const GET: APIRoute = async () => {
  const editions = await getAllEditions();

  return icsResponse(
    buildCalendar({
      name: EVENTS_FEED.name,
      description: EVENTS_FEED.description,
      domain: SITE_DOMAIN,
      url: feedUrl(EVENTS_FEED.path),
      events: conferenceEvents(editions, SITE_URL, SITE_DOMAIN),
    }),
  );
};
