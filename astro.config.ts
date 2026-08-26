import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

import { SITE_URL, BASE_PATH } from './src/lib/site';

// Astro wants the bare origin in `site` and the sub-path (if any) in `base`.
// Both are derived from the single SITE_URL constant in src/lib/site.ts.
const origin = new URL(SITE_URL).origin;

export default defineConfig({
  site: origin,
  base: BASE_PATH || undefined,
  trailingSlash: 'ignore',
  // /overview lands on the year we are actually in. Recomputed every build, and
  // deploy.yml rebuilds daily, so it rolls over on its own at new year.
  redirects: {
    '/overview': `${BASE_PATH}/overview/${new Date().getUTCFullYear()}`,
  },
  // Astro 7 defaults to 'jsx', which strips the whitespace between prose and an
  // inline <a>, running words together. These templates are prose-heavy.
  compressHTML: true,
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
