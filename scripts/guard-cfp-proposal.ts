/**
 * Refuses a CFP-check proposal that edits more than it may (src/lib/cfpGuard.ts).
 *
 *   tsx scripts/guard-cfp-proposal.ts --id dpsp-europe27 --before main.yml --after proposed.yml
 *
 * Exit 0: the proposal may become a pull request. Exit 1: it may not.
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { parse } from 'yaml';

import { proposalViolations } from '../src/lib/cfpGuard.ts';

const { values } = parseArgs({
  options: {
    id: { type: 'string' },
    before: { type: 'string' },
    after: { type: 'string' },
  },
});

if (!values.id || !values.before || !values.after) {
  console.error('Usage: guard-cfp-proposal --id <edition> --before <file> --after <file>');
  process.exit(2);
}

let violations: string[];
try {
  violations = proposalViolations(
    parse(readFileSync(values.before, 'utf8')),
    parse(readFileSync(values.after, 'utf8')),
    values.id,
  );
} catch (error) {
  violations = [`Could not read the proposal: ${(error as Error).message}`];
}

if (violations.length) {
  console.error(`Proposal for ${values.id} refused:`);
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(1);
}
console.log(`Proposal for ${values.id} stays within the allowed fields.`);
