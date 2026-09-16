/**
 * Single source of truth for where this site lives.
 *
 * Changing SITE_URL here updates the Astro `site` config, every canonical URL,
 * and every calendar feed URL. When the custom domain is ready, change this line
 * and the `cname:` value in .github/workflows/deploy.yml. Nothing else.
 */
const PRODUCTION_URL = 'https://langestefan.github.io/powersystem-deadlines';

/**
 * A build can be pointed somewhere else with SITE_URL in the environment, which
 * is how .github/workflows/preview.yml puts a pull request at its own sub-path
 * without the canonical URLs, feed URLs and base prefix of the real site
 * leaking into it.
 *
 * Read from `process.env` rather than `import.meta.env` because astro.config.ts
 * needs the same value while it is still plain Node, before Vite exists. The
 * guard keeps this safe if the module is ever pulled into a client bundle;
 * today every URL an island needs is computed at build time and passed in.
 */
export const SITE_URL =
  (typeof process !== 'undefined' && process.env?.SITE_URL) || PRODUCTION_URL;

/** True when this build points somewhere other than the real site. */
export const IS_PREVIEW = SITE_URL !== PRODUCTION_URL;

export const SITE_DOMAIN = new URL(SITE_URL).hostname;

/** Repo-relative base path ('' when hosted at a domain root). */
export const BASE_PATH = new URL(SITE_URL).pathname.replace(/\/$/, '');

export const SITE_TITLE = 'Power System Deadlines';
export const SITE_DESCRIPTION =
  'Countdown timers and subscribable calendar feeds for power system conference deadlines.';
export const REPO_URL = 'https://github.com/langestefan/powersystem-deadlines';

/**
 * Prefix an absolute-from-root path with the deployment base path.
 *
 * Page paths get a trailing slash: GitHub Pages 301s `/subscribe` to
 * `/subscribe/`, so linking without it costs a redirect on every navigation and
 * makes the canonical URL disagree with the sitemap. Paths with a file
 * extension (`/calendar/all.ics`) are left exactly as they are.
 */
export function withBase(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  const lastSegment = clean.slice(clean.lastIndexOf('/') + 1);
  const isFile = lastSegment.includes('.');
  const suffix = isFile || clean.endsWith('/') ? '' : '/';
  return `${BASE_PATH}${clean}${suffix}`;
}

/** Scheme and host only, without the base path. */
export const SITE_ORIGIN = new URL(SITE_URL).origin;

/**
 * Fully-qualified URL for a path that already carries the base prefix. Pair it
 * with withBase(), e.g. absoluteUrl(withBase('/calendar/all.ics')).
 */
export function absoluteUrl(path: string): string {
  return `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}
