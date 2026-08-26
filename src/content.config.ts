import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

import { REGION_IDS, SOCIETY_IDS, TAG_IDS } from './lib/taxonomy';
import { isValidTimezone, TBA } from './lib/time';

/**
 * The conference schema. This is the contract every pull request is checked
 * against: `astro build` fails when a file here does not match, so CI rejects a
 * malformed contribution without anyone having to review YAML by hand.
 *
 * One file per conference *series* (pscc.yml, pesgm.yml, ...). Series-level
 * fields describe the conference in general; `editions` holds one entry per
 * year it runs. Adding next year's deadlines means appending one edition block.
 */

const DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const timezone = z.string().refine(isValidTimezone, {
  error: (issue) =>
    `"${issue.input}" is not a recognised timezone. Use "AoE", an IANA name ` +
    `(e.g. "Europe/Amsterdam"), a "UTC+2"-style offset, or an abbreviation like "CET".`,
});

/**
 * YAML parses a bare `2026-06-08` into a Date, so `start:`/`end:` accept either
 * form and normalise to a `YYYY-MM-DD` string. Contributors should not have to
 * remember to quote a plain calendar date.
 */
const dayString = z
  .union([z.string().regex(DATE_RE, 'Use the YYYY-MM-DD format.'), z.date()])
  .transform((value) =>
    typeof value === 'string' ? value : value.toISOString().slice(0, 10),
  );

/** A deadline date is either a precise wall-clock timestamp or the literal TBA. */
const deadlineDate = z
  .string({
    error: (issue) =>
      issue.input instanceof Date
        ? 'Quote deadline timestamps in YAML ("2026-04-15 23:59:59"), otherwise ' +
          'YAML reads them as UTC and the timezone field is ignored.'
        : 'Deadline must be a quoted "YYYY-MM-DD HH:mm:ss" string or "TBA".',
  })
  .refine((value) => value === TBA || DATETIME_RE.test(value), {
    error: (issue) =>
      `"${issue.input}" must be "YYYY-MM-DD HH:mm:ss" (quote it in YAML) or "${TBA}".`,
  });

const deadlineSchema = z.object({
  /** Machine-readable kind, e.g. "paper". See DEADLINE_TYPES in lib/taxonomy.ts. */
  type: z.string().min(1),
  /** What the CFP calls it, shown verbatim, e.g. "Full paper submission". */
  label: z.string().min(1),
  date: deadlineDate,
  /** Falls back to the edition's timezone, then to AoE. */
  timezone: timezone.optional(),
  /** Optional link to the specific submission page for this deadline. */
  link: z.string().url().optional(),
});

const editionSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  /** Globally unique. Convention: lowercase series slug + two-digit year, e.g. pscc26. */
  id: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'ID must be lowercase letters, digits and hyphens only.'),
  /** Overrides the series link when an edition has its own site. */
  link: z.string().url().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  /** Derived from `country` when omitted. */
  region: z.enum(REGION_IDS).optional(),
  venue: z.string().optional(),
  /** Human-readable event dates, shown verbatim, e.g. "June 15-19, 2026". */
  date: z.string().min(1),
  start: dayString.optional(),
  end: dayString.optional(),
  format: z.enum(['in-person', 'hybrid', 'online']).default('in-person'),
  /** Where the accepted papers end up, e.g. "IEEE Xplore". */
  proceedings: z.string().optional(),
  submission_type: z.enum(['full-paper', 'abstract-first', 'extended-abstract']).optional(),
  /** Default timezone for this edition's deadlines. */
  timezone: timezone.optional(),
  deadlines: z.array(deadlineSchema).default([]),
  /** Tags in addition to the series tags. */
  tags: z.array(z.enum(TAG_IDS)).optional(),
  note: z.string().optional(),
  /** Set when an edition is confirmed cancelled; kept for the archive. */
  cancelled: z.boolean().default(false),
});

const conferenceSchema = z.object({
  /** Short name as people say it, e.g. "PSCC". */
  name: z.string().min(1),
  full_name: z.string().min(1),
  link: z.string().url(),
  society: z.array(z.enum(SOCIETY_IDS)).min(1),
  frequency: z.enum(['annual', 'biennial', 'irregular']).default('annual'),
  tags: z.array(z.enum(TAG_IDS)).min(1, 'At least one tag is required.'),
  /** One paragraph shown on the conference page. */
  description: z.string().optional(),
  editions: z.array(editionSchema).min(1, 'A conference needs at least one edition.'),
});

// Derived from the schemas via parse() rather than z.infer, because the `z`
// re-exported by astro:content is a value export and carries no type namespace.
export type ConferenceSeriesData = ReturnType<typeof conferenceSchema.parse>;
export type EditionData = ReturnType<typeof editionSchema.parse>;
export type DeadlineData = ReturnType<typeof deadlineSchema.parse>;

const conferences = defineCollection({
  loader: glob({
    pattern: ['**/*.yml', '**/*.yaml', '!_*'],
    base: './src/data/conferences',
  }),
  schema: conferenceSchema,
});

export const collections = { conferences };
