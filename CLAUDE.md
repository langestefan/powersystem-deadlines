# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A statically generated site (Astro 7 + Tailwind 4, React islands) listing submission deadlines for
power system conferences, plus subscribable `.ics` calendar feeds. Deployed to GitHub Pages from
`dist/`. Node 22+.

## Commands

```sh
npm run dev        # http://localhost:4321
npm run validate   # astro sync + scripts/validate.ts (cross-file data checks)
npm run check      # astro check (type check, includes .astro files)
npm test           # vitest run
npm run build      # full static build, including every .ics feed
```

Single test file or case:

```sh
npx vitest run tests/time.test.ts
npx vitest run tests/ics.test.ts -t 'within 75 octets'
npm run test:watch
```

CI (`.github/workflows/validate.yml`) runs validate → check → test → build on every PR and push.

## Architecture

Data flows one way: YAML → content-collection schema → flattened editions → pages and feeds.

```
src/data/conferences/*.yml     one file per conference SERIES, one entry per year under `editions:`
  ↓ validated by
src/content.config.ts          the Zod schema; a violation fails `astro build`, so CI rejects bad YAML
  ↓ read by
src/lib/conferences.ts         the ONLY module that imports `astro:content`; caches + sorts
  ↓ shaped by
src/lib/edition.ts             pure functions: raw YAML shape → ConferenceEdition, resolved deadlines
  ↓ consumed by
src/pages/**                   .astro pages and .ics.ts endpoints, all prerendered at build time
```

Layer boundaries that exist on purpose, and should stay:

- **`edition.ts` never imports `astro:content`**, so it is unit-testable outside Astro.
  `conferences.ts` is the thin adapter that does the collection read and re-exports `edition.ts`.
- **`ics.ts` is domain-free** RFC 5545 generation (folding, escaping, alarms, refresh hints, UTC
  formatting). It knows nothing about conferences. **`calendar.ts`** is the mapping layer that turns
  editions into `IcsEvent`s. Keep domain knowledge out of `ics.ts`.
- **`time.ts`** owns every timezone conversion. Deadlines are stored as a wall-clock string plus a
  zone name and only become real instants here (`toUtc`). AoE is UTC−12; abbreviations like `CET`
  are deliberately fixed offsets, never DST-resolved.
- **`feeds.ts`** defines each published feed once, so the endpoints that generate them and the
  `/subscribe` page that lists them cannot drift.

### Single sources of truth

- `src/lib/site.ts` — `SITE_URL` drives the Astro `site`/`base` config, canonical URLs and every
  feed URL. Changing hosting means editing that one constant (and `cname:` in `deploy.yml`).
  Link internal paths through `withBase()`, never by hand: it adds the base prefix and the trailing
  slash GitHub Pages would otherwise 301 to.
- `src/lib/taxonomy.ts` — `TAGS`, `SOCIETIES`, `REGIONS`, `DEADLINE_TYPES`. These feed the schema
  enums, so adding a tag here is what makes it usable in YAML; it also automatically creates a
  `/calendar/<tag>.ics` feed. Update the tag list in `CONTRIBUTING.md` in the same change.
  `SUBMISSION_DEADLINE_TYPES` decides which deadline drives the headline countdown — a notification
  date must never hide a paper deadline.
- `src/lib/regions.ts` — country → region. An unknown country is a validation error, not a guess.

### Validation is split in two

`src/content.config.ts` covers per-field rules and runs as part of `astro sync`/`astro build`.
`scripts/validate.ts` covers what a per-entry schema cannot see: duplicate edition IDs across files,
ID/year disagreement, deadlines out of order, a deadline after the conference starts, unknown
country. It distinguishes **errors** (exit 1, block CI) from **warnings** (advisory).

### Rendering model

Cards, tables and countdowns are server-rendered HTML. Two small pieces of interactivity:

- `FilterBar.tsx` (`client:load`) filters the *existing* DOM by toggling `data-*`-tagged card slots
  and mirrors state into the query string. It does not re-render the list, so cards stay static and
  indexable.
- A single `setInterval` in `BaseLayout.astro` ticks every `[data-countdown]` node on the page. Do
  not add a per-card React root for this.

Time-dependent grouping ("next 7 days", upcoming vs. archive) is decided at **build** time, which is
why `deploy.yml` also rebuilds on a daily cron.

## Working with conference data

- One file per series; a new year is an appended entry under `editions:`. Never edit a past
  edition — the archive is built from it and calendars may still be subscribed to it.
- Deadline timestamps **must be quoted** in YAML (`'2026-10-15 23:59:59'`). Unquoted, YAML parses
  them as UTC `Date`s and the `timezone` field is silently ignored; both the schema and
  `validate.ts` reject this explicitly.
- Use the literal `'TBA'` for an announced-but-undated milestone.
- Edition `id` is unique site-wide and appears in URLs *and* in ICS UIDs. Changing an ID breaks
  every subscriber's calendar entry. Convention: lowercase slug + two-digit year (`pscc26`).
- ICS UIDs are `<id>-<type>[-<n>]@<domain>`, deliberately independent of dates and array order, so
  editing a date moves an existing calendar entry instead of creating a duplicate. Anything that
  changes UID composition is a breaking change for subscribers.
- Every date must come from the official call for papers; `CONTRIBUTING.md` is the field reference.

## Conventions

- `@/*` maps to `src/*` (declared in both `tsconfig.json` and `vitest.config.ts`).
- `astro/tsconfigs/strict`. Prefer deriving types from the schemas (`ConferenceSeriesData`,
  `EditionData`) over redeclaring shapes.
- Tailwind class strings in `taxonomy.ts` are kept literal so the JIT compiler can see them; do not
  build them by interpolation.
- `cn()` in `lib/utils.ts` for conditional/conflicting classes.
