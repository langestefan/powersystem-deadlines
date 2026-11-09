// Prints the "Official pages" and "Why it was flagged" sections of a CFP-check pull
// request, from the detector's report, so a reviewer can open the CFP in one click.
//
// Built from cfp-report.json rather than from Claude's text, so the links are there
// even when Claude wrote no description, and come from the data and the detector
// rather than from anything a fetched page said.
//
//   node scripts/cfp-pr-sources.mjs cfp-report.json <edition id>
//   node scripts/cfp-pr-sources.mjs cfp-report.json <edition id> --title   # fallback PR title
//
// Plain Node (no dependencies), because it runs in the workflow job that has no npm ci.

import { readFileSync } from 'node:fs';

const [reportPath, id, flag] = process.argv.slice(2);
if (!reportPath || !id) {
  console.error('Usage: node scripts/cfp-pr-sources.mjs <cfp-report.json> <edition id>');
  process.exit(2);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const edition = report.editions.find((entry) => entry.id === id);
if (!edition) {
  console.error(`No report entry for ${id}.`);
  process.exit(1);
}

if (flag === '--title') {
  console.log(`CFP check: ${edition.name} ${edition.year}`);
  process.exit(0);
}

/** Only well-formed http(s) URLs, printed as autolinks so nothing else renders. */
function link(url) {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? `<${parsed.href}>` : null;
  } catch {
    return null;
  }
}

const lines = [
  `**${edition.name} ${edition.year}** (\`${id}\`, \`${edition.file}\`)`,
  '',
  '### Official pages',
  '',
];
for (const page of edition.urls) {
  const target = link(page.url);
  if (!target) continue;
  lines.push(
    page.ok ? `- ${target}` : `- ${target} (could not be read: ${page.status ?? page.error})`,
  );
}

lines.push('', '### Why the daily check flagged it', '');
for (const finding of edition.findings) {
  // Messages are built from the YAML and dates, never page text (that is in `evidence`).
  lines.push(`- \`${finding.kind}\`: ${finding.message}`);
}

console.log(lines.join('\n'));
