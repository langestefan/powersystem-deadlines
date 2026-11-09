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

```sh
npm run check-cfps                                   # compare upcoming editions with their pages
npm run check-cfps -- --only dpsp-europe27 --dump /tmp/cfp   # one edition, keep the page text
```

## Architecture

Data flows one way: YAML → content-collection schema → flattened editions → pages and feeds.

```
conferences/*.yml, events/*.yml   one file per SERIES, one entry per year under `editions:`
  ↓ validated by
src/content.config.ts          the Zod schema; a violation fails `astro build`, so CI rejects bad YAML
  ↓ read by
src/lib/conferences.ts         the ONLY module that imports `astro:content`; caches + sorts
  ↓ shaped by
src/lib/edition.ts             pure functions: raw YAML shape → ConferenceEdition, resolved deadlines
  ↓ consumed by
src/lib/{calendar,overview,addToCalendar}.ts   editions → .ics events, calendar cells, deep links
  ↓ rendered by
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
  are deliberately fixed offsets, never DST-resolved. A deadline whose YAML states **no** zone is
  not AoE: it resolves at `UNSTATED_TIMEZONE` (UTC+12), errs a day early rather than a day late,
  and carries `timezoneStated: false` so every surface can disclose the guess. Print a zone through
  `deadlineZoneLabel()`, never `timezoneLabel()` directly, or an assumption gets shown as fact.
- **`overview.ts`** is the year calendar's data layer: editions → twelve months of day cells,
  Monday-first, with the week padding and month/year-crossing runs that are where the off-by-ones
  live. Pure and `astro:content`-free like `edition.ts`, so `tests/overview.test.ts` can drive it
  directly. It also resolves each mark's Tailwind colour (`dotClass`, `barClass`) so no template
  interpolates one.
- **`feeds.ts`** defines each published feed once, so the endpoints that generate them and the
  `/subscribe` page that lists them cannot drift.
- **`verification.ts`** owns the freshness rule: every edition carries a required `verified:`
  date, and this module decides when that check has aged enough to warn about. Pure, so both
  `scripts/validate.ts` and the pages share one definition of "stale".

- **`map.ts`** is the map's data layer: editions → one marker per city per conference year (two
  conferences in one city share a marker), plus the legend and the list of every edition that
  year. Pure like `overview.ts`. Markers are coloured by the same lead tag as the calendar's
  conference bars, through `markerClass` in `taxonomy.ts`.
- **`places.ts`** is city → coordinates, keyed `"City, Country"` as written in the YAML. Like
  `regions.ts`, an unknown city is a validation error, not a guess or a geocoder call.

- **`changelog.ts`** gathers every edition's `changes:` (date, field, old value, new value) into
  the newest-first cards on `/changelog`, one per edition per day. Pure, like `edition.ts`. The entries are
  recorded in the YAML, not derived from git, because CI checks out shallow.

- **`cfpCheck.ts`** is the deterministic half of the daily deadline check: it reads dates out of
  page text (`extractDates`) and compares an edition with them (`checkEdition`), matching each
  deadline on the day the CFP states via `deadlineDay()` from `calendar.ts`. `labelDates()` also
  attributes each page date to the deadline wording beside it (layout inferred per page), so a
  page giving a *different* date for the same deadline is a `conflicting-date` even when the old
  date still appears on some stale page. Its findings are
  reasons to re-read a CFP, never a decision about the right date. **`pageText.ts`** is the
  domain-free HTML → text and "call for papers" link discovery it reads from. Both are pure;
  `scripts/check-cfps.ts` does the fetching.

A series' `kind` is `conference` or `event` (research meetings, PhD days), and the **directory
decides it**: `conferences/` or `events/`, each its own content collection with its own
`_TEMPLATE.yml`. There is no `kind:` field in the YAML; `validate.ts` rejects one, and a file name
used in both directories, because the file name is the series id. `KINDS` in `taxonomy.ts` maps
each kind to its directory (`kindDir()`), and every reader (`conferences.ts`, `validate.ts`,
`check-cfps.ts`, `tests/places.test.ts`) iterates it rather than naming the folders. Both flow
through the same pipeline, edition page (`/conference/<id>`), calendar and feeds; only the listing
splits: the homepage shows conferences, `/events` shows events ordered by start date, and an event
card with no deadline ahead counts down to its start instead. An edition may carry an optional
`program:` (local `HH:MM` times, never converted), shown on its page.

`submissionStatus()` in `edition.ts` decides the homepage bucket. `closed` (every dated deadline
has passed) and `unannounced` (TBA, or nothing listed) are deliberately separate states: they are
opposite situations and reading one as the other is what a single "dates not announced" bucket did.

A deadline is published as an **all-day event on the date the CFP states**, taken from the raw
YAML string, never from the resolved UTC instant: `2026-07-31 23:59:59 AoE` is 1 August in UTC, and
filing it there is how somebody submits a day late. Three places have to agree on this — `deadlineDay()`
in `calendar.ts` (the feeds), `deadlineDay()` in `overview.ts` (the calendar grid) and `addToCalendar.ts`
(the Google/Outlook deep links, computed at build time so they work without JavaScript). Changing one
means changing all three.

### Single sources of truth

- `src/lib/site.ts` — `SITE_URL` drives the Astro `site`/`base` config, canonical URLs and every
  feed URL. Changing hosting means editing that one constant (and `cname:` in `deploy.yml`).
  `SITE_URL` in the environment overrides it for one build, which is the whole mechanism behind
  `preview.yml`: a pull request is built for `/preview/pr-<n>/` and published to that sub-path of
  the same `gh-pages` branch the live site uses. Previews set `IS_PREVIEW`, which adds a noindex,
  publish with `keep_files: true` so they can never delete from the live site, and are carried
  across a production deploy by a step in `deploy.yml`.
  Link internal paths through `withBase()`, never by hand: it adds the base prefix and the trailing
  slash GitHub Pages would otherwise 301 to.
- `src/lib/taxonomy.ts` — `TAGS`, `SOCIETIES` and `REGIONS` feed the schema enums, so adding a tag
  here is what makes it usable in YAML; it also automatically creates a `/calendar/<tag>.ics` feed.
  Update the tag list in `CONTRIBUTING.md` in the same change. A deadline's `type` is deliberately
  *not* an enum — a conference may invent one — so `DEADLINE_TYPES` is only the recommended list and
  `deadlineTypeStyle()` falls back to "Other" for anything else. `DEADLINE_TYPE_STYLES` gives each
  type its calendar colour and legend label, with types that mean the same thing to an author sharing
  both (every `*_proposal` reads "Proposal"). `SUBMISSION_DEADLINE_TYPES` decides which deadline
  drives the headline countdown — a notification date must never hide a paper deadline.
- `src/lib/regions.ts` — country → region. An unknown country is a validation error, not a guess.

### Validation is split in two

`src/content.config.ts` covers per-field rules and runs as part of `astro sync`/`astro build`.
`scripts/validate.ts` covers what a per-entry schema cannot see: duplicate edition IDs across files,
ID/year disagreement, deadlines out of order, a deadline after the conference starts, unknown
country, and a `verified:` date that has gone stale. It distinguishes **errors** (exit 1, block CI)
from **warnings** (advisory).

Staleness is deliberately a *warning*: an entry ageing out is the passage of time, not a fault in
the pull request at hand, and failing on it would block every open PR at once for something none of
them did. A *missing* `verified:` is an error, enforced by the schema.

### Rendering model

Every page must survive a 375px viewport with no horizontal scroll, which is checked by measuring
`documentElement.scrollWidth` against `clientWidth`, not by eye. Two rules earn their keep: a grid
or flex child holding something wide needs `min-w-0` or it grows the page instead of scrolling
inside its own `overflow-x-auto`, and the header nav only shares a row with the brand and controls
from `lg` up, because the seven links plus everything else need about 985px. Subscribe is the
primary button among the controls, not a nav link, and stays visible at every width (icon-only
on a phone).

Cards, tables, countdowns and the year calendar are server-rendered HTML. Interactivity is added on
top of that DOM, never by re-rendering it:

- `FilterBar.tsx` (`client:load`) filters the *existing* DOM by toggling `data-*`-tagged card slots
  and mirrors state into the query string. It does not re-render the list, so cards stay static and
  indexable.
- A single `setInterval` in `BaseLayout.astro` ticks every `[data-countdown]` node on the page. Do
  not add a per-card React root for this.
- `YearCalendar.astro` carries one inline `<script>`: a delegated listener that positions the day
  popover from each cell's `data-detail` JSON, and a legend that doubles as switches hiding marks
  already in the DOM. Same rule — one listener for the whole grid, not an island per day.
- `ConferenceMap.astro` is the one exception to "server-rendered first": a MapLibre GL map,
  loaded only on `/map`, over OpenFreeMap's vector tiles (OpenStreetMap data, no API key), with
  the `positron` or `dark` style picked by the theme. Its script takes the markers as JSON from
  the container's `data-markers`, retunes the style before use (bold country borders, dashed
  admin-level-4 borders, English labels) and clusters markers through a GeoJSON source, drawn
  as DOM markers so they keep the site's colour classes. The plain-HTML list under the map has
  the same conferences, for anyone without JavaScript; with it, a plain click on a list entry
  flies the map to that city and opens its popup instead (`data-edition-id`), and a modified
  click or an unplaced conference still follows the link. MapLibre 6 loads its worker by URL, so
  it is imported with `?worker&url` and passed to `setWorkerUrl()`; without that the map is
  blank in production.
- `SubscribeLinks.tsx` (`client:visible`) is the only other React island, for the copy buttons.

`/overview` renders the current year itself instead of redirecting to `/overview/<year>`: GitHub
Pages has no server-side redirect, so Astro would emit a meta-refresh stub. `/overview/<year>` pages
are generated from `yearsWithData()`, so adding an edition in a new year creates its page.
`/map` and `/map/<year>` follow the same pattern, by conference year (`mapYears()`).

Time-dependent grouping ("next 7 days", upcoming vs. archive) is decided at **build** time, which is
why `deploy.yml` also rebuilds on a daily cron.

### Daily deadline check

`.github/workflows/check-deadlines.yml` runs `npm run check-cfps` every morning over every
upcoming edition (a future deadline, a TBA, or an event still ahead). It fetches the edition's
link, its per-deadline links and one level of same-edition "call for papers / key dates" links.
Editions whose pages disagree with the YAML (up to 8 a day, most urgent first, skipping any with
an open `cfp-bot/<id>` PR) go to Claude. Pages that can't be read (`fetch-failed`, `no-dates`) go
into one rolling "CFP check: needs a human" issue. The Claude step is off unless
`vars.CFP_PROPOSE == 'true'`. To see what the checker read for one edition:
`npm run check-cfps -- --only <id> --dump <dir>`.

Claude reads untrusted web pages, so the workflow is three jobs with deliberately separated
privileges. Keep it that way:

- **`detect`**: no Claude; read-only contents, writes only the human issue.
- **`propose`**: one matrix job per edition running `anthropics/claude-code-action`
  (pinned by commit SHA) with `.github/cfp-check-prompt.md`. Read-only token,
  `persist-credentials: false`, no Bash, `Edit` limited to that edition's file and `WebFetch`
  to the hosts the detector read for it. Its only output is a patch and a PR description.
- **`open-prs`**: no Claude; the only job that can write. `scripts/open-cfp-prs.sh` refuses any
  patch that touches more than one `conferences/` or `events/` YAML file or fails
  `scripts/guard-cfp-proposal.ts`, then runs validate + tests and opens the PR.
  **`cfpGuard.ts`** is that envelope: one edition's dates, labels, venue, note and an
  append-only `changes:`, with no new links anywhere. Widening it widens what a hostile page
  can put in front of a reviewer.

The bot never commits to main: `verified:` only moves inside a PR, and merging it is the human
check.

### Tests

`tests/*.test.ts` mirrors `src/lib/*` one file per module, and covers exactly the modules that keep
away from `astro:content`: `time`, `ics`, `calendar`, `overview`, `feeds`, `verification`,
`addToCalendar`, `changelog`, `map`, `places`, `cfpCheck`, `pageText`, `cfpGuard`. `tests/places.test.ts` also reads every
`conferences/*.yml` and `events/*.yml` to check each city has coordinates. `tests/ics.test.ts` asserts RFC 5545 details (75-octet folding, escaping order,
CRLF) that are easy to regress invisibly, since a malformed feed still looks fine on the page.

## Working with conference data

- One file per series; a new year is an appended entry under `editions:`. Never edit a past
  edition — the archive is built from it and calendars may still be subscribed to it.
- Deadline timestamps **must be quoted** in YAML (`'2026-10-15 23:59:59'`). Unquoted, YAML parses
  them as UTC `Date`s and the `timezone` field is silently ignored; both the schema and
  `validate.ts` reject this explicitly.
- Use the literal `'TBA'` for an announced-but-undated milestone.
- **Omit `timezone:` unless the call for papers states one.** The omission is the record that it
  said nothing, and the site then reads the time as UTC+12 and labels it `(assumed)`. Writing `AoE`
  on a call that never said AoE claims the latest reading on earth and hands a submitter up to a
  day and a half that may not exist — that is how a live countdown once outlasted CIRED's abstract
  deadline by fourteen hours.
- Edition `id` is unique site-wide and appears in URLs *and* in ICS UIDs. Changing an ID breaks
  every subscriber's calendar entry. Convention: lowercase slug + two-digit year (`pscc26`).
- ICS UIDs are `<id>-<type>[-<n>]@<domain>`, deliberately independent of dates and array order, so
  editing a date moves an existing calendar entry instead of creating a duplicate. Anything that
  changes UID composition is a breaking change for subscribers.
- Every date must come from the official call for papers; `CONTRIBUTING.md` is the field reference.
- When an existing edition's data changes, add an entry per changed field to its `changes:`
  (`date` of the edit, `field`, `old`, `new`; a deadline's `type` is its field name). `/changelog`
  and the edition page show them as a table. A new edition or a bare `verified:` bump needs none.
- `verified:` records when a human last checked an edition against its CFP. Bump it on every
  re-check, including one that finds nothing changed — "still correct on this date" is the whole
  point, and it is the one thing the data cannot show on its own.

## Conventions

- `@/*` maps to `src/*` (declared in both `tsconfig.json` and `vitest.config.ts`).
- `astro/tsconfigs/strict`. Prefer deriving types from the schemas (`ConferenceSeriesData`,
  `EditionData`) over redeclaring shapes.
- Tailwind class strings in `taxonomy.ts` are kept literal so the JIT compiler can see them; do not
  build them by interpolation.
- `cn()` in `lib/utils.ts` for conditional/conflicting classes.
