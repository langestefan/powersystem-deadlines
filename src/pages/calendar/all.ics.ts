import type { APIRoute } from 'astro';

import { deadlineEvents } from '@/lib/calendar';
import { getAllEditions } from '@/lib/conferences';
import { ALL_DEADLINES_FEED, feedUrl } from '@/lib/feeds';
import { buildCalendar, icsResponse } from '@/lib/ics';
import { SITE_DOMAIN, SITE_URL } from '@/lib/site';

/** Every deadline on the site, as a subscribable calendar. */
export const GET: APIRoute = async () => {
  const editions = await getAllEditions();

  return icsResponse(
    buildCalendar({
      name: ALL_DEADLINES_FEED.name,
      description: ALL_DEADLINES_FEED.description,
      domain: SITE_DOMAIN,
      url: feedUrl(ALL_DEADLINES_FEED.path),
      events: deadlineEvents(editions, SITE_URL, SITE_DOMAIN),
    }),
  );
};
