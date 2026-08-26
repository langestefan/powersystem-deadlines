/**
 * Cross-file checks the content schema cannot express.
 *
 * `astro sync` (run first by `npm run validate`) already enforces the per-field
 * schema in src/content.config.ts. This script covers the rules that need to see
 * more than one entry at a time: duplicate IDs, chronological ordering, a year
 * that disagrees with the ID. It also carries the softer "this will probably confuse
 * someone" warnings that should not block a pull request.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

import { regionForCountry } from '../src/lib/regions.ts';
import { REGIONS, TAGS } from '../src/lib/taxonomy.ts';
import { fixedOffsetMinutes, isIanaZone, isTba, toUtc } from '../src/lib/time.ts';

const CONFERENCES_DIR = fileURLToPath(new URL('../src/data/conferences', import.meta.url));
const TAG_IDS = new Set(TAGS.map((tag) => tag.id));
const REGION_IDS = new Set<string>(REGIONS);

type Severity = 'error' | 'warning';

interface Issue {
  file: string;
  where: string;
  severity: Severity;
  message: string;
}

const issues: Issue[] = [];

function report(file: string, where: string, severity: Severity, message: string) {
  issues.push({ file, where, severity, message });
}

/** Pull the year out of an id like "pscc26" or "isgt-europe26". */
function yearFromId(id: string): number | null {
  const match = /(\d{2,4})$/.exec(id);
  if (!match) return null;
  const digits = match[1]!;
  if (digits.length === 4) return Number(digits);
  if (digits.length === 2) return 2000 + Number(digits);
  return null;
}

function asDay(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value;
  return null;
}

const files = readdirSync(CONFERENCES_DIR)
  .filter((name) => /\.ya?ml$/.test(name) && !name.startsWith('_'))
  .sort();

if (files.length === 0) {
  console.error(`No conference files found in ${CONFERENCES_DIR}`);
  process.exit(1);
}

const seenIds = new Map<string, string>();
let editionCount = 0;
let deadlineCount = 0;

for (const name of files) {
  const path = join(CONFERENCES_DIR, name);
  const file = relative(process.cwd(), path);

  let data: any;
  try {
    data = parse(readFileSync(path, 'utf8'));
  } catch (error) {
    report(file, name, 'error', `Could not parse YAML: ${(error as Error).message}`);
    continue;
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    report(file, name, 'error', 'File must contain a single conference object.');
    continue;
  }

  if (typeof data.link === 'string' && data.link.startsWith('http://')) {
    report(file, 'link', 'warning', 'Use the https:// form of the conference URL.');
  }

  const editions: any[] = Array.isArray(data.editions) ? data.editions : [];
  const years = editions.map((edition) => edition?.year).filter((year) => typeof year === 'number');
  if (years.some((year, index) => index > 0 && year < years[index - 1]!)) {
    report(file, 'editions', 'warning', 'List editions oldest first so diffs stay append-only.');
  }

  for (const edition of editions) {
    if (!edition || typeof edition !== 'object') continue;
    editionCount += 1;

    const id: string = edition.id ?? '(missing id)';
    const where = id;

    // --- uniqueness -------------------------------------------------------
    const existing = seenIds.get(id);
    if (existing) {
      report(file, where, 'error', `Duplicate id "${id}", already used in ${existing}.`);
    } else {
      seenIds.set(id, file);
    }

    // --- id / year agreement ---------------------------------------------
    const idYear = yearFromId(id);
    if (idYear !== null && typeof edition.year === 'number' && idYear !== edition.year) {
      report(
        file,
        where,
        'error',
        `id "${id}" ends in ${idYear} but year is ${edition.year}. One of them is wrong.`,
      );
    }

    // --- tags -------------------------------------------------------------
    for (const tag of [...(data.tags ?? []), ...(edition.tags ?? [])]) {
      if (!TAG_IDS.has(tag)) {
        report(file, where, 'error', `Unknown tag "${tag}". See CONTRIBUTING.md for the list.`);
      }
    }

    // --- location ---------------------------------------------------------
    if (edition.region && !REGION_IDS.has(edition.region)) {
      report(file, where, 'error', `Unknown region "${edition.region}".`);
    } else if (!edition.region && edition.format !== 'online') {
      if (!edition.country) {
        report(file, where, 'warning', 'No country set, so the region filter will skip it.');
      } else if (!regionForCountry(edition.country)) {
        report(
          file,
          where,
          'error',
          `Country "${edition.country}" is not in src/lib/regions.ts. ` +
            'Add it there, or set `region:` on this edition.',
        );
      }
    }

    // --- event dates ------------------------------------------------------
    const start = asDay(edition.start);
    const end = asDay(edition.end);
    if (start && end && start > end) {
      report(file, where, 'error', `start (${start}) is after end (${end}).`);
    }
    if (start && typeof edition.year === 'number' && !start.startsWith(String(edition.year))) {
      report(file, where, 'warning', `start (${start}) is not in ${edition.year}.`);
    }

    // --- deadlines --------------------------------------------------------
    const deadlines: any[] = Array.isArray(edition.deadlines) ? edition.deadlines : [];
    deadlineCount += deadlines.length;

    if (deadlines.length === 0) {
      report(file, where, 'warning', 'No deadlines listed, so it shows as "dates not announced".');
    }

    let previous: Date | null = null;
    for (const deadline of deadlines) {
      if (!deadline || typeof deadline !== 'object') continue;
      const label = deadline.label ?? deadline.type ?? '(unlabelled)';

      if (deadline.date instanceof Date) {
        report(
          file,
          where,
          'error',
          `Deadline "${label}" is unquoted. Wrap the timestamp in quotes, ` +
            'otherwise YAML reads it as UTC and the timezone field is ignored.',
        );
        continue;
      }

      const timezone = deadline.timezone ?? edition.timezone;
      if (!timezone) {
        report(
          file,
          where,
          'warning',
          `Deadline "${label}" has no timezone; AoE is assumed. Set one if the CFP states it.`,
        );
      } else if (fixedOffsetMinutes(timezone) !== null && !isIanaZone(timezone)) {
        const isOffsetForm = /^(AoE|UTC|GMT)/i.test(timezone);
        if (!isOffsetForm) {
          report(
            file,
            where,
            'warning',
            `Deadline "${label}" uses the abbreviation "${timezone}", which ignores ` +
              'daylight saving. Prefer an IANA zone such as "Europe/Amsterdam".',
          );
        }
      }

      if (isTba(deadline.date)) continue;

      let instant: Date;
      try {
        instant = toUtc(deadline.date, timezone ?? 'AoE');
      } catch (error) {
        report(file, where, 'error', `Deadline "${label}": ${(error as Error).message}`);
        continue;
      }

      if (previous && instant < previous) {
        report(
          file,
          where,
          'warning',
          `Deadline "${label}" is earlier than the one above it. List them in order.`,
        );
      }
      previous = instant;

      if (start && instant.toISOString().slice(0, 10) > start) {
        report(file, where, 'warning', `Deadline "${label}" falls after the conference starts.`);
      }
    }
  }
}

// --- output ---------------------------------------------------------------

const errors = issues.filter((issue) => issue.severity === 'error');
const warnings = issues.filter((issue) => issue.severity === 'warning');

for (const file of new Set(issues.map((issue) => issue.file))) {
  console.log(`\n${file}`);
  for (const issue of issues.filter((entry) => entry.file === file)) {
    const marker = issue.severity === 'error' ? 'error  ' : 'warning';
    console.log(`  ${marker}  ${issue.where}: ${issue.message}`);
  }
}

const summary =
  `\n${files.length} file(s), ${editionCount} edition(s), ${deadlineCount} deadline(s), ` +
  `${errors.length} error(s), ${warnings.length} warning(s).`;
console.log(summary);

if (errors.length > 0) process.exit(1);
