/**
 * Daily check of every upcoming edition against its official pages.
 *
 * Fetches each edition's link (plus per-deadline links, plus one level of
 * "call for papers" / "key dates" style links on the same site), strips the
 * HTML to text and hands it to checkEdition() in src/lib/cfpCheck.ts.
 *
 * It never edits data. It writes a JSON report for the Claude step in
 * .github/workflows/check-deadlines.yml, a Markdown list of what needs a human,
 * and a summary for the Actions run page. A finding is not a failure: the
 * script exits 0 unless it cannot run at all.
 *
 *   npm run check-cfps
 *   npm run check-cfps -- --only dpsp-europe27
 *   npm run check-cfps -- --out cfp-report.json --human-out cfp-human.md \
 *                         --skip id1,id2 --max-propose 8
 *   npm run check-cfps -- --only icit27 --dump /tmp/cfp-text   # see what it read
 */

import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { parse } from 'yaml';

import type { ConferenceSeriesData, EditionData } from '../src/content.config.ts';
import {
  checkEdition,
  HUMAN_ONLY_KINDS,
  isActionable,
  needsChecking,
  type Finding,
} from '../src/lib/cfpCheck.ts';
import { flattenEdition, type ConferenceEdition } from '../src/lib/edition.ts';
import { datesLinks, htmlToText } from '../src/lib/pageText.ts';

const NOW = new Date();
const CONFERENCES_DIR = fileURLToPath(new URL('../conferences', import.meta.url));

const FETCH_TIMEOUT_MS = 20_000;
const CONCURRENCY = 4;
/** Linked pages followed from each edition's own pages. */
const MAX_FOLLOWED = 5;
/** Less text than this and the response was not really the page. */
const MIN_TEXT_CHARS = 200;
const RETRY_DELAY_MS = 3_000;
/** A CFP page is tens of kilobytes; anything past this is not one, or is hostile. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const USER_AGENT = 'Mozilla/5.0 (compatible; conference-deadline-checker/1.0)';
const { values: args } = parseArgs({
  options: {
    only: { type: 'string' },
    skip: { type: 'string', default: '' },
    out: { type: 'string' },
    'human-out': { type: 'string' },
    'max-propose': { type: 'string', default: '10' },
    /** Write each edition's extracted page text here, to see what the checker saw. */
    dump: { type: 'string' },
  },
});

// --- fetching ---------------------------------------------------------------

interface FetchedPage {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
  html?: string;
}

const pageCache = new Map<string, Promise<FetchedPage>>();

async function fetchOnce(url: string): Promise<FetchedPage> {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*;q=0.5' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return { url, ok: false, status: response.status };

    const type = response.headers.get('content-type') ?? '';
    if (!/html|text\/plain/.test(type)) {
      return { url, ok: false, status: response.status, error: `unreadable type ${type}` };
    }
    const html = await readCapped(response);
    if (html === null) {
      return { url, ok: false, status: response.status, error: 'page too large' };
    }
    // Some sites answer a burst of requests with an empty 200; that is not the page.
    if (htmlToText(html).length < MIN_TEXT_CHARS) {
      return { url, ok: false, status: response.status, error: 'empty page' };
    }
    return { url: response.url || url, ok: true, status: response.status, html };
  } catch (error) {
    return { url, ok: false, error: (error as Error).message };
  }
}

/** The body as text, or null once it passes MAX_BODY_BYTES (stops downloading there). */
async function readCapped(response: Response): Promise<string | null> {
  if (Number(response.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    await response.body?.cancel();
    return null;
  }
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function fetchPage(url: string): Promise<FetchedPage> {
  const cached = pageCache.get(url);
  if (cached) return cached;

  const promise = (async () => {
    const first = await fetchOnce(url);
    // One retry for the transient failures (timeouts, 5xx, empty bodies); a 4xx is an answer.
    if (first.ok || (first.status !== undefined && first.status < 500 && !first.error))
      return first;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return fetchOnce(url);
  })();

  pageCache.set(url, promise);
  return promise;
}

async function pagesFor(edition: ConferenceEdition): Promise<FetchedPage[]> {
  const direct = [
    ...new Set([edition.link, ...edition.deadlines.flatMap((d) => (d.link ? [d.link] : []))]),
  ];
  const first = await Promise.all(direct.map(fetchPage));

  const followed = new Set<string>();
  for (const page of first) {
    if (!page.html) continue;
    for (const link of datesLinks(page.html, page.url, MAX_FOLLOWED)) {
      if (!direct.includes(link)) followed.add(link);
    }
  }
  const second = await Promise.all([...followed].map(fetchPage));
  return [...first, ...second];
}

async function pool<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index]!);
      }
    }),
  );
  return results;
}

// --- loading ------------------------------------------------------------------

interface Target {
  file: string;
  edition: ConferenceEdition;
}

function loadTargets(): Target[] {
  const targets: Target[] = [];
  const files = readdirSync(CONFERENCES_DIR)
    .filter((name) => /\.ya?ml$/.test(name) && !name.startsWith('_'))
    .sort();

  for (const name of files) {
    const data = parse(readFileSync(join(CONFERENCES_DIR, name), 'utf8')) as ConferenceSeriesData;
    // The YAML before Zod: apply the two schema defaults flattenEdition relies on.
    const series = { ...data, kind: data.kind ?? 'conference' } as ConferenceSeriesData;
    for (const raw of data.editions ?? []) {
      const edition = flattenEdition(
        series,
        name.replace(/\.ya?ml$/, ''),
        {
          ...raw,
          cancelled: raw.cancelled ?? false,
          deadlines: raw.deadlines ?? [],
        } as EditionData,
        NOW,
      );
      targets.push({ file: `conferences/${name}`, edition });
    }
  }
  return targets;
}

// --- main -----------------------------------------------------------------------

interface EditionReport {
  id: string;
  file: string;
  name: string;
  year: number;
  /** Soonest future deadline, for ordering by urgency. */
  nextDeadline: string | null;
  urls: Array<{ url: string; ok: boolean; status?: number; error?: string }>;
  findings: Finding[];
  /** Whether this edition goes to the Claude step today. */
  propose: boolean;
}

const skip = new Set(
  args
    .skip!.split(',')
    .map((id) => id.trim())
    .filter(Boolean),
);
const maxPropose = Number(args['max-propose']);

let targets = loadTargets().filter(({ edition }) => needsChecking(edition));
if (args.only) targets = targets.filter(({ edition }) => edition.id === args.only);
if (args.only && targets.length === 0) {
  console.error(`No upcoming edition with id "${args.only}".`);
  process.exit(1);
}

const reports = await pool(
  targets,
  CONCURRENCY,
  async ({ file, edition }): Promise<EditionReport> => {
    const pages = await pagesFor(edition);
    const readable = pages.filter((page) => page.html);
    if (args.dump) {
      mkdirSync(args.dump, { recursive: true });
      writeFileSync(
        join(args.dump, `${edition.id}.txt`),
        readable.map((page) => `===== ${page.url}\n${htmlToText(page.html!)}`).join('\n\n'),
      );
    }
    const findings: Finding[] = readable.length
      ? checkEdition(
          edition,
          readable.map((page) => ({ url: page.url, text: htmlToText(page.html!) })),
          NOW,
        )
      : [{ kind: 'fetch-failed', message: 'None of the official pages could be fetched.' }];

    return {
      id: edition.id,
      file,
      name: edition.name,
      year: edition.year,
      nextDeadline: edition.nextAnyDeadline?.raw ?? null,
      urls: pages.map(({ url, ok, status, error }) => ({ url, ok, status, error })),
      findings,
      propose: false,
    };
  },
);

// The Claude step gets the most urgent actionable editions, capped for cost,
// minus any that already have an open pull request.
const actionable = reports
  .filter((report) => isActionable(report.findings) && !skip.has(report.id))
  .sort((a, b) => (a.nextDeadline ?? '9999').localeCompare(b.nextDeadline ?? '9999'));
for (const report of actionable.slice(0, maxPropose)) report.propose = true;

const proposed = reports.filter((report) => report.propose);
const human = reports.filter((report) => report.findings.some((f) => HUMAN_ONLY_KINDS.has(f.kind)));
const deferred = actionable.filter((report) => !report.propose);

// --- output ------------------------------------------------------------------------

for (const report of reports) {
  if (report.findings.length === 0) continue;
  console.log(`\n${report.id} (${report.file})${report.propose ? '  → propose' : ''}`);
  for (const finding of report.findings) {
    console.log(`  ${finding.kind.padEnd(17)} ${finding.message}`);
    if (finding.evidence)
      console.log(`  ${''.padEnd(17)} “${finding.evidence.replace(/\s+/g, ' ')}”`);
  }
}
console.log(
  `\n${reports.length} upcoming edition(s) checked: ${proposed.length} to propose, ` +
    `${deferred.length} deferred (cap or open PR), ${human.length} need a human.`,
);

if (args.out) {
  writeFileSync(
    args.out,
    JSON.stringify(
      { generated: NOW.toISOString(), editions: reports.filter((r) => r.findings.length) },
      null,
      2,
    ),
  );
}

const line = (report: EditionReport, kinds?: ReadonlySet<string>) =>
  `- **${report.id}** (\`${report.file}\`): ` +
  report.findings
    .filter((f) => !kinds || kinds.has(f.kind))
    .map((f) => `${f.kind}: ${f.message}`)
    .join('; ') +
  `\n  Pages: ${report.urls.map((u) => (u.ok ? u.url : `${u.url} (${u.status ?? u.error})`)).join(', ')}`;

if (args['human-out']) {
  writeFileSync(
    args['human-out'],
    human.length
      ? `The daily CFP check could not read these editions' official pages. ` +
          `Please check them by hand and bump \`verified:\`.\n\n` +
          human.map((report) => line(report, HUMAN_ONLY_KINDS)).join('\n') +
          `\n\n_Updated ${NOW.toISOString().slice(0, 10)}._\n`
      : '',
  );
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const section = (title: string, list: EditionReport[]) =>
    list.length ? `### ${title}\n\n${list.map((r) => line(r)).join('\n')}\n\n` : '';
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## CFP check, ${NOW.toISOString().slice(0, 10)}\n\n` +
      `${reports.length} upcoming edition(s) checked.\n\n` +
      section('Sent to Claude', proposed) +
      section('Deferred (cap reached or PR already open)', deferred) +
      section('Needs a human', human),
  );
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `propose=${proposed.length > 0}\nhuman=${human.length > 0}\n` +
      // The matrix of the Claude jobs: one isolated job per edition.
      `ids=${JSON.stringify(proposed.map((report) => report.id))}\n`,
  );
}
