import type { APIRoute, GetStaticPaths } from 'astro';

import { deadlineEvents } from '@/lib/calendar';
import { getAllEditions, tagsInUse } from '@/lib/conferences';
import { feedUrl, tagFeed } from '@/lib/feeds';
import { buildCalendar, icsResponse } from '@/lib/ics';
import { SITE_DOMAIN, SITE_URL } from '@/lib/site';
import type { TagId } from '@/lib/taxonomy';

/** One feed per tag, so people can subscribe to just their sub-field. */
export const getStaticPaths: GetStaticPaths = async () => {
  const editions = await getAllEditions();
  return tagsInUse(editions).map((tag) => ({ params: { tag } }));
};

export const GET: APIRoute = async ({ params }) => {
  const tag = params.tag as TagId;
  const editions = (await getAllEditions()).filter((edition) => edition.tags.includes(tag));
  const feed = tagFeed(tag);

  return icsResponse(
    buildCalendar({
      name: feed.name,
      description: feed.description,
      domain: SITE_DOMAIN,
      url: feedUrl(feed.path),
      events: deadlineEvents(editions, SITE_URL, SITE_DOMAIN),
    }),
  );
};
