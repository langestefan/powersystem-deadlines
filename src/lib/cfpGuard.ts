/**
 * What an automated CFP-check proposal is allowed to change.
 *
 * The Claude step reads untrusted web pages, so its output is treated as
 * untrusted too. Before the workflow opens a pull request, it compares the
 * proposed YAML with main's version and refuses anything outside a narrow
 * envelope: one edition's dates, labels, venue, note and change log. A
 * prompt-injected page can then, at worst, propose a wrong date for a human to
 * reject, never a new link, a different edition, or a series-level edit.
 *
 * Pure: takes the two parsed YAML documents, returns the violations.
 */

/** Edition fields a proposal may change. Everything else must stay byte-identical. */
export const EDITABLE_EDITION_FIELDS: ReadonlySet<string> = new Set([
  'deadlines',
  'changes',
  'verified',
  'start',
  'end',
  'date',
  'venue',
  'note',
]);

/** Keys a proposed deadline may carry. `link` is allowed only if main already had it. */
const DEADLINE_FIELDS: ReadonlySet<string> = new Set(['type', 'label', 'date', 'timezone', 'link']);

/** Anything that would let a proposal smuggle in a link. */
const URL_LIKE = /https?:|www\.|\b[a-z0-9-]+\.(com|org|net|io|xyz|info|ru|cn|top|link|ly)\b/i;

/** JSON with sorted keys, so key order in the YAML never counts as a change. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

type Doc = Record<string, unknown>;

function asRecords(value: unknown): Doc[] {
  return Array.isArray(value) ? (value.filter((v) => v && typeof v === 'object') as Doc[]) : [];
}

/** Text fields that change must not gain anything link-shaped. */
function checkText(where: string, before: unknown, after: unknown, out: string[]) {
  if (same(before, after) || after === undefined) return;
  if (typeof after !== 'string') {
    out.push(`${where} must be text.`);
    return;
  }
  if (URL_LIKE.test(after) && !(typeof before === 'string' && URL_LIKE.test(before))) {
    out.push(`${where} gained something that looks like a link.`);
  }
}

/**
 * @param before   main's parsed conferences/<series>.yml (or events/<series>.yml)
 * @param after    the proposal's parsed version of the same file
 * @param editionId the one edition the proposal is for
 * @returns human-readable violations; empty means the proposal may become a PR
 */
export function proposalViolations(before: Doc, after: Doc, editionId: string): string[] {
  const out: string[] = [];

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === 'editions') continue;
    if (!same(before[key], after[key])) out.push(`Series field \`${key}\` changed.`);
  }

  const oldEditions = asRecords(before.editions);
  const newEditions = asRecords(after.editions);
  const oldIds = oldEditions.map((e) => e.id);
  const newIds = newEditions.map((e) => e.id);
  if (!same(oldIds, newIds)) {
    out.push('Editions were added, removed or reordered.');
    return out;
  }
  if (!oldIds.includes(editionId)) {
    out.push(`Edition \`${editionId}\` is not in this file.`);
    return out;
  }

  oldEditions.forEach((oldEdition, index) => {
    const newEdition = newEditions[index]!;
    const id = String(oldEdition.id);

    if (id !== editionId) {
      if (!same(oldEdition, newEdition))
        out.push(`Edition \`${id}\` changed, but only \`${editionId}\` may.`);
      return;
    }

    for (const key of new Set([...Object.keys(oldEdition), ...Object.keys(newEdition)])) {
      if (!EDITABLE_EDITION_FIELDS.has(key) && !same(oldEdition[key], newEdition[key])) {
        out.push(`\`${id}.${key}\` changed; a CFP check may not edit it.`);
      }
    }

    checkText(`\`${id}.venue\``, oldEdition.venue, newEdition.venue, out);
    checkText(`\`${id}.note\``, oldEdition.note, newEdition.note, out);
    checkText(`\`${id}.date\``, oldEdition.date, newEdition.date, out);

    const oldDeadlines = asRecords(oldEdition.deadlines);
    const oldLinks = new Set(oldDeadlines.map((d) => d.link).filter(Boolean));
    for (const [i, deadline] of asRecords(newEdition.deadlines).entries()) {
      for (const key of Object.keys(deadline)) {
        if (!DEADLINE_FIELDS.has(key))
          out.push(`\`${id}.deadlines[${i}].${key}\` is not a deadline field.`);
      }
      if (deadline.link !== undefined && !oldLinks.has(deadline.link)) {
        out.push(`\`${id}.deadlines[${i}].link\` is new; a CFP check may not add links.`);
      }
      const oldLabel = oldDeadlines.find((d) => d.type === deadline.type)?.label;
      checkText(`\`${id}.deadlines[${i}].label\``, oldLabel, deadline.label, out);
    }

    // The change log is append-only: history the site shows must not be rewritten.
    const newChanges = asRecords(newEdition.changes);
    for (const change of asRecords(oldEdition.changes)) {
      if (!newChanges.some((c) => same(c, change))) {
        out.push(`\`${id}.changes\` lost or rewrote an existing entry.`);
        break;
      }
    }
    for (const change of newChanges) {
      for (const key of ['field', 'old', 'new'])
        checkText(`\`${id}.changes.${key}\``, undefined, change[key], out);
    }
  });

  return out;
}
