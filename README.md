# ⚡ Power System Deadlines

Countdown timers and subscribable calendar feeds for power system conference deadlines.

**<https://langestefan.github.io/powersystem-deadlines>**

Power system calls for papers are scattered across IEEE PES, PELS, CIGRE, CIRED, IET and a dozen
other society websites, each in its own format. This collects them in one place, and — unlike most
deadline trackers — treats calendar subscription as the point rather than an afterthought.

## Subscribe

The feeds are live: subscribe once and your calendar updates itself whenever a deadline is added,
moved or corrected here. Every deadline carries reminders one week and one day ahead.

| Feed              | URL                                                                          |
| ----------------- | ---------------------------------------------------------------------------- |
| All deadlines     | `https://langestefan.github.io/powersystem-deadlines/calendar/all.ics`      |
| Conference dates  | `https://langestefan.github.io/powersystem-deadlines/calendar/events.ics`   |
| One topic         | `…/calendar/<tag>.ics`, e.g. `power-electronics.ics`                          |
| One conference    | `…/conference/<id>.ics`, e.g. `pscc26.ics`                                    |

The [subscribe page](https://langestefan.github.io/powersystem-deadlines/subscribe) lists them all
with one-click links for Google Calendar, Apple Calendar and Outlook.

## Contributing

Every conference is one YAML file in [`src/data/conferences/`](src/data/conferences/). To add one:

- [Open an issue](../../issues/new?template=new-conference.yml) — no Git needed, and
- or open a pull request: copy [`_TEMPLATE.yml`](src/data/conferences/_TEMPLATE.yml), fill it in
  from the official call for papers, run `npm run validate`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full field reference. Automated checks validate the
schema, tags, timezones and dates on every pull request.

## Development

Node 22 or newer.

```sh
npm install
npm run dev        # http://localhost:4321
npm run validate   # schema + cross-file data checks
npm test           # timezone conversion and RFC 5545 output
npm run build      # static build into dist/, feeds included
```

### How it is put together

| Path                          | What it is                                                            |
| ----------------------------- | --------------------------------------------------------------------- |
| `src/data/conferences/*.yml`  | The data. One file per conference series, one entry per year.         |
| `src/content.config.ts`       | The schema. A file that violates it fails the build, and so fails CI. |
| `src/lib/time.ts`             | Timezone handling: AoE, IANA zones, UTC offsets, abbreviations.       |
| `src/lib/ics.ts`              | RFC 5545 generation — folding, escaping, alarms, refresh hints.       |
| `src/pages/calendar/*.ics.ts` | The feeds, generated as static files at build time.                   |
| `scripts/validate.ts`         | Cross-file checks the schema cannot express.                          |

Built with [Astro](https://astro.build/), React islands for the interactive parts, and Tailwind.
The site is static: the calendar feeds are plain files, with no server behind them.

Deployment is a GitHub Actions workflow that builds on every push to `main` and publishes `dist/`
to the `gh-pages` branch, plus a weekly rebuild so the feeds never go stale.

## Prior art

This follows a well-trodden path — [ai-deadlines](https://github.com/paperswithcode/ai-deadlines)
and its maintained successor
[huggingface/ai-deadlines](https://github.com/huggingface/ai-deadlines),
[ds-deadlines](https://github.com/ds-deadlines/ds-deadlines.github.io), and the many other forks in
that family. The data model and contribution workflow owe a lot to all of them.

## License

MIT
