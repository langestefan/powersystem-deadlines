# Contributing

Every conference is one YAML file in [`conferences/`](conferences/).

No Git? Open an issue instead: [Add a conference](../../issues/new?template=new-conference.yml) or
[Correct a deadline](../../issues/new?template=update-deadline.yml).

## The one rule

**Every date must come from the official conference website**, and the pull request must link the
page it came from. Not from another aggregator, which is how stale dates spread.

## Adding a conference

1. Copy [`conferences/_TEMPLATE.yml`](conferences/_TEMPLATE.yml) to
   `conferences/<slug>.yml`, where `<slug>` is the conference's short name in lowercase
   (`pscc.yml`, `isgt-europe.yml`, `ecce-europe.yml`).
2. Fill it in from the call for papers.
3. Run `npm run validate`.
4. Open a pull request.

## Adding a new year to a conference that is already listed

Append a new entry under `editions:` in the existing file. **Do not edit last year's entry**: the
archive is built from it, and calendars may still be subscribed to it.

```yaml
editions:
  - year: 2026 # ← leave this alone
    id: pscc26
    # ...
  - year: 2028 # ← add this
    id: pscc28
    # ...
```

## Field reference

### Series level

| Field         | Required | Notes                                                        |
| ------------- | -------- | ------------------------------------------------------------ |
| `name`        | yes      | Short name, as people say it: `PSCC`, `ISGT Europe`          |
| `full_name`   | yes      | Spelled out in full                                           |
| `link`        | yes      | Series homepage                                               |
| `society`     | yes      | One or more organisers, from the list below                   |
| `frequency`   | no       | `annual` (default), `biennial`, `irregular`                   |
| `tags`        | yes      | One or more topics, from the list below                       |
| `description` | no       | A sentence or two, shown on the conference page               |
| `editions`    | yes      | One entry per year the conference runs                        |

### Edition level

| Field             | Required | Notes                                                          |
| ----------------- | -------- | -------------------------------------------------------------- |
| `year`            | yes      | The year the conference takes place                             |
| `id`              | yes      | Unique site-wide. Lowercase name + two-digit year: `pscc26`     |
| `date`            | yes      | Human-readable, shown verbatim: `June 8-12, 2026`               |
| `verified`        | yes      | Date you last checked this edition against the official CFP     |
| `link`            | no       | Only when this edition has its own site                         |
| `city`, `country` | no       | `country` must be one this repo knows, see below                |
| `region`          | no       | Derived from `country`; set it only when derivation fails       |
| `venue`           | no       | Building or campus                                              |
| `start`, `end`    | no       | `YYYY-MM-DD`. Drives the archive and the conference-dates feed  |
| `format`          | no       | `in-person` (default), `hybrid`, `online`                       |
| `proceedings`     | no       | Where accepted papers appear, e.g. `IEEE Xplore`                |
| `submission_type` | no       | `full-paper`, `abstract-first`, `extended-abstract`             |
| `timezone`        | no       | Default timezone for this edition's deadlines                   |
| `deadlines`       | no       | See below. An edition with none shows as "dates not announced"  |
| `tags`            | no       | Extra tags on top of the series tags                            |
| `note`            | no       | Anything a submitter should know                                |
| `cancelled`       | no       | `true` if the edition was called off                            |

### Deadlines

```yaml
deadlines:
  - type: paper
    label: Full paper submission
    date: '2026-10-15 23:59:59'
    timezone: AoE
```

- `date` **must be quoted.** Unquoted, YAML reads it as a UTC timestamp and silently ignores the
  timezone. Validation rejects this.
- Use the literal `'TBA'` when a milestone is announced but not yet dated, so the site can show
  that it is still expected.
- `label` is shown to readers, so copy the wording from the call for papers.
- `type` drives the icons, the headline countdown and the sort order. Recommended values:

  `abstract` · `paper` · `notification` · `rebuttal_start` · `rebuttal_end` · `camera_ready` ·
  `early_registration` · `author_registration` · `tutorial_proposal` · `panel_proposal` ·
  `workshop_proposal` · `poster` · `presentation_upload`

  The headline countdown uses the soonest deadline that is something an author has to *submit*, so
  a notification date never hides a paper deadline.

### Keeping entries fresh

`verified:` is the date someone last opened the conference's own call for papers and confirmed
the dates in the entry. It is required on every edition, and a pull request without it fails the
build.

Bump it whenever you re-check, **even when nothing changed** — "these dates were still correct on
this date" is exactly the information a reader needs, and it is the one thing the data cannot show
on its own. Validation warns when an entry is going stale:

| Next deadline        | Re-check within |
| -------------------- | --------------- |
| 60 days away or less | 30 days         |
| further out, or TBA  | 120 days        |

Editions whose deadlines and event have all passed are exempt. Staleness is a warning, not an
error, so it never blocks an unrelated pull request.

### Timezones

In order of preference:

1. `AoE`, Anywhere on Earth (UTC-12), what most calls for papers mean by "end of day".
2. An IANA name: `Europe/Amsterdam`, `America/New_York`, `Asia/Shanghai`. Handles daylight saving.
3. An offset: `UTC+2`, `GMT-5`, `UTC+05:30`.
4. An abbreviation: `CET`, `EST`, `JST`. These are read as **fixed** offsets, so `CET` is always
   UTC+1 even in summer. Validation warns and suggests an IANA zone instead.

If the call for papers does not state a timezone, leave it as `AoE` and say so in the `note`. Do
not guess.

### Tags

`power-systems` · `power-electronics` · `machines-drives` · `smart-grid` · `microgrids` ·
`protection-automation` · `hvdc-facts` · `distribution` · `transmission` · `energy-markets` ·
`renewables` · `energy-storage` · `ev-transportation` · `power-quality` · `reliability-planning` ·
`computation-optimization` · `cyber-physical-security`

Each tag has its own calendar feed, so tag accurately rather than exhaustively. Adding a tag means
editing `TAGS` in [`src/lib/taxonomy.ts`](src/lib/taxonomy.ts).

### Societies

`IEEE PES` · `IEEE PELS` · `IEEE IAS` · `IEEE IES` · `IEEE VTS` · `IEEE ComSoc` · `CIGRE` ·
`CIRED` · `IET` · `EPE` · `ACM` · `PSCC` · `VDE ETG` · `Other`

### Countries

`country` is mapped to a region by [`src/lib/regions.ts`](src/lib/regions.ts). If yours is not
listed, add it there in the same pull request (one line), or set `region:` explicitly.

## Running it locally

Node 22 or newer.

```sh
npm install
npm run dev        # http://localhost:4321
npm run validate   # schema + cross-file checks
npm test           # timezone and calendar-format tests
npm run build      # full static build, including the .ics feeds
```

Run `npm run validate` before opening a pull request. **Errors** block the build; **warnings** do
not fail CI.

## What CI checks

Every pull request runs `npm run validate`, `npm run check`, `npm test` and `npm run build`. A
schema violation, unknown tag, duplicate `id`, unquoted timestamp or bad timezone fails the build.

## Scope

Conferences and workshops with peer-reviewed submission, anywhere in power and energy systems.

Not in scope: trade shows without a call for papers, journal special issues, summer schools, and
events with no public submission deadline.
