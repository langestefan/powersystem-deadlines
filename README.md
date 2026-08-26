# ⚡ Power System Deadlines

Submission deadlines for power system conferences, with calendar feeds.

<https://langestefan.github.io/powersystem-deadlines>

## Feeds

| Feed             | URL                                                                        |
| ---------------- | -------------------------------------------------------------------------- |
| All deadlines    | `https://langestefan.github.io/powersystem-deadlines/calendar/all.ics`     |
| Conference dates | `https://langestefan.github.io/powersystem-deadlines/calendar/events.ics`  |
| One topic        | `.../calendar/<tag>.ics`, e.g. `power-electronics.ics`                      |
| One conference   | `.../conference/<id>.ics`, e.g. `pscc26.ics`                                |

The [subscribe page](https://langestefan.github.io/powersystem-deadlines/subscribe) has one-click
links for Google Calendar, Apple Calendar and Outlook.

## Contributing

Every conference is one YAML file in [`conferences/`](conferences/).

- [Open an issue](../../issues/new?template=new-conference.yml) with the dates, or
- open a pull request: copy [`_TEMPLATE.yml`](conferences/_TEMPLATE.yml), fill it in, run
  `npm run validate`.

Dates must come from the official call for papers, linked in the pull request.
[CONTRIBUTING.md](CONTRIBUTING.md) has the field reference.

## Development

Node 22 or newer.

```sh
npm install
npm run dev        # http://localhost:4321
npm run validate   # schema + cross-file data checks
npm test
npm run build
```

| Path                          | What it is                                                            |
| ----------------------------- | --------------------------------------------------------------------- |
| `conferences/*.yml`           | The data. One file per conference series, one entry per year.         |
| `src/content.config.ts`       | The schema. A file that violates it fails the build, and so fails CI. |
| `src/lib/time.ts`             | Timezones: AoE, IANA zones, UTC offsets, abbreviations.               |
| `src/lib/ics.ts`              | RFC 5545 generation: folding, escaping, alarms, refresh hints.        |
| `src/pages/calendar/*.ics.ts` | The feeds, generated as static files at build time.                   |
| `scripts/validate.ts`         | Cross-file checks the schema cannot express.                          |

Astro and Tailwind, with React islands for the filter bar and the copy buttons. A GitHub Actions
workflow builds on every push to `main`, publishes `dist/` to the `gh-pages` branch, and rebuilds
daily so the countdowns and the archive stay current.

## Prior art

[ai-deadlines](https://github.com/paperswithcode/ai-deadlines),
[huggingface/ai-deadlines](https://github.com/huggingface/ai-deadlines),
[ds-deadlines](https://github.com/ds-deadlines/ds-deadlines.github.io).

## License

MIT
