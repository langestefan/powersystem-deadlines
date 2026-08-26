import type { APIRoute } from 'astro';

import { absoluteUrl, withBase } from '@/lib/site';

/**
 * Generated rather than kept in public/ so the sitemap URL follows SITE_URL.
 * otherwise it would silently point at the old host the day the custom domain
 * is switched on.
 */
export const GET: APIRoute = () =>
  new Response(
    ['User-agent: *', 'Allow: /', '', `Sitemap: ${absoluteUrl(withBase('/sitemap-index.xml'))}`].join(
      '\n',
    ) + '\n',
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
