import type { APIRoute, GetStaticPaths } from 'astro';

import { conferenceEvents, deadlineEvents } from '@/lib/calendar';
import { getAllEditions } from '@/lib/conferences';
import { conferenceFeedPath, feedUrl } from '@/lib/feeds';
import { buildCalendar, icsResponse } from '@/lib/ics';
import { SITE_DOMAIN, SITE_TITLE, SITE_URL } from '@/lib/site';

/** A single conference's deadlines plus the event itself. */
export const getStaticPaths: GetStaticPaths = async () => {
  const editions = await getAllEditions();
  return editions.map((edition) => ({ params: { id: edition.id }, props: { edition } }));
};

export const GET: APIRoute = async ({ params }) => {
  const editions = await getAllEditions();
  const edition = editions.find((candidate) => candidate.id === params.id);

  if (!edition) return new Response('Not found', { status: 404 });

  const scope = [edition];

  return icsResponse(
    buildCalendar({
      name: `${edition.name} ${edition.year} — ${SITE_TITLE}`,
      description: `Deadlines and dates for ${edition.fullName} ${edition.year}.`,
      domain: SITE_DOMAIN,
      url: feedUrl(conferenceFeedPath(edition.id)),
      events: [
        ...deadlineEvents(scope, SITE_URL, SITE_DOMAIN),
        ...conferenceEvents(scope, SITE_URL, SITE_DOMAIN),
      ],
    }),
  );
};
