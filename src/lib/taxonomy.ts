/**
 * The controlled vocabularies used by the conference schema. Adding a value here
 * is what makes it usable in conferences/*.yml. A typo in a pull
 * request fails validation instead of silently creating a one-off category.
 */

export interface TagDefinition {
  /** Slug used in YAML and in URLs, including the per-tag calendar feed. */
  id: string;
  label: string;
  description: string;
  /** Tailwind classes for the badge. Kept literal so the JIT compiler sees them. */
  className: string;
  /** Tinted band for a conference's run on the calendar, in the same hue as the badge. */
  barClass: string;
}

export const TAGS = [
  {
    id: 'power-systems',
    label: 'Power Systems',
    description: 'General power system analysis, operation and planning',
    className: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
    barClass: 'bg-sky-500/25 dark:bg-sky-400/25',
  },
  {
    id: 'power-electronics',
    label: 'Power Electronics',
    description: 'Converters, inverters, drives and semiconductor devices',
    className: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200',
    barClass: 'bg-violet-500/25 dark:bg-violet-400/25',
  },
  {
    id: 'machines-drives',
    label: 'Machines & Drives',
    description: 'Electrical machines, motor drives and actuators',
    className: 'bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-200',
    barClass: 'bg-fuchsia-500/25 dark:bg-fuchsia-400/25',
  },
  {
    id: 'smart-grid',
    label: 'Smart Grid',
    description: 'Measurement, communication, automation and demand response',
    className: 'bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200',
    barClass: 'bg-teal-500/25 dark:bg-teal-400/25',
  },
  {
    id: 'microgrids',
    label: 'Microgrids',
    description: 'Islanded and grid-connected microgrids, DC grids',
    className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
    barClass: 'bg-emerald-500/25 dark:bg-emerald-400/25',
  },
  {
    id: 'protection-automation',
    label: 'Protection & Automation',
    description: 'Relaying, fault location, substation automation',
    className: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
    barClass: 'bg-red-500/25 dark:bg-red-400/25',
  },
  {
    id: 'hvdc-facts',
    label: 'HVDC & FACTS',
    description: 'HVDC transmission, converters and flexible AC transmission',
    className: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200',
    barClass: 'bg-indigo-500/25 dark:bg-indigo-400/25',
  },
  {
    id: 'distribution',
    label: 'Distribution',
    description: 'Distribution networks, LV/MV planning and operation',
    className: 'bg-lime-100 text-lime-900 dark:bg-lime-950 dark:text-lime-200',
    barClass: 'bg-lime-500/25 dark:bg-lime-400/25',
  },
  {
    id: 'transmission',
    label: 'Transmission',
    description: 'Transmission networks, interconnection and bulk power',
    className: 'bg-cyan-100 text-cyan-900 dark:bg-cyan-950 dark:text-cyan-200',
    barClass: 'bg-cyan-500/25 dark:bg-cyan-400/25',
  },
  {
    id: 'energy-markets',
    label: 'Energy Markets',
    description: 'Electricity markets, pricing, regulation and economics',
    className: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
    barClass: 'bg-amber-500/25 dark:bg-amber-400/25',
  },
  {
    id: 'renewables',
    label: 'Renewables',
    description: 'Wind, solar PV and renewable integration',
    className: 'bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200',
    barClass: 'bg-green-500/25 dark:bg-green-400/25',
  },
  {
    id: 'energy-storage',
    label: 'Energy Storage',
    description: 'Batteries, hydrogen and storage system integration',
    className: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200',
    barClass: 'bg-orange-500/25 dark:bg-orange-400/25',
  },
  {
    id: 'ev-transportation',
    label: 'EV & Transportation',
    description: 'Electric vehicles, charging infrastructure, electrified transport',
    className: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200',
    barClass: 'bg-yellow-500/25 dark:bg-yellow-400/25',
  },
  {
    id: 'power-quality',
    label: 'Power Quality',
    description: 'Harmonics, flicker, voltage quality and EMC',
    className: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
    barClass: 'bg-rose-500/25 dark:bg-rose-400/25',
  },
  {
    id: 'reliability-planning',
    label: 'Reliability & Planning',
    description: 'Adequacy, risk, asset management and expansion planning',
    className: 'bg-stone-200 text-stone-900 dark:bg-stone-800 dark:text-stone-200',
    barClass: 'bg-stone-500/25 dark:bg-stone-400/25',
  },
  {
    id: 'computation-optimization',
    label: 'Computation & Optimization',
    description: 'Optimization, simulation, machine learning for power systems',
    className: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
    barClass: 'bg-blue-500/25 dark:bg-blue-400/25',
  },
  {
    id: 'cyber-physical-security',
    label: 'Cyber-Physical Security',
    description: 'Grid cybersecurity, resilience and cyber-physical systems',
    className: 'bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-200',
    barClass: 'bg-slate-500/25 dark:bg-slate-400/25',
  },
] as const satisfies readonly TagDefinition[];

export type TagId = (typeof TAGS)[number]['id'];

export const TAG_IDS = TAGS.map((tag) => tag.id) as unknown as [TagId, ...TagId[]];

const TAG_BY_ID = new Map<string, TagDefinition>(TAGS.map((tag) => [tag.id, tag]));

export function getTag(id: string): TagDefinition | undefined {
  return TAG_BY_ID.get(id);
}

export function tagLabel(id: string): string {
  return TAG_BY_ID.get(id)?.label ?? id;
}

/** Organising bodies. Used for filtering and shown on the conference card. */
export const SOCIETIES = [
  'IEEE PES',
  'IEEE PELS',
  'IEEE IAS',
  'IEEE IES',
  'IEEE VTS',
  'IEEE ComSoc',
  'CIGRE',
  'CIRED',
  'IET',
  'EPE',
  'ACM',
  'PSCC',
  'VDE ETG',
  'Other',
] as const;

export type Society = (typeof SOCIETIES)[number];

export const SOCIETY_IDS = SOCIETIES as unknown as [Society, ...Society[]];

export const REGIONS = [
  'Europe',
  'North America',
  'Latin America',
  'Asia',
  'Africa',
  'Oceania',
  'Online',
] as const;

export type Region = (typeof REGIONS)[number];

export const REGION_IDS = REGIONS as unknown as [Region, ...Region[]];

/**
 * Recommended `type` values for a deadline entry. Not enforced, since a conference is
 * free to invent one, but these get a nicer icon and sort priority in the UI.
 */
export const DEADLINE_TYPES = [
  'abstract',
  'paper',
  'notification',
  'rebuttal_start',
  'rebuttal_end',
  'camera_ready',
  'early_registration',
  'author_registration',
  'tutorial_proposal',
  'panel_proposal',
  'workshop_proposal',
  'poster',
  'presentation_upload',
] as const;

export type DeadlineType = (typeof DEADLINE_TYPES)[number];

export interface DeadlineTypeStyle {
  /** Short name for a legend, as an author would say it. */
  label: string;
  /** Solid dot colour. Literal so the JIT compiler sees it; never interpolated. */
  dotClass: string;
}

/**
 * Colour and wording per deadline type, for the calendar overview.
 *
 * Each kind of submission is told apart, because "paper" and "camera-ready"
 * are different work at different stages. Types that mean the same thing to an
 * author deliberately share a colour and a label: three proposal deadlines are
 * all "Proposal", and both registration deadlines are "Registration".
 */
export const DEADLINE_TYPE_STYLES: Record<string, DeadlineTypeStyle> = {
  abstract: { label: 'Abstract', dotClass: 'bg-amber-500' },
  paper: { label: 'Paper', dotClass: 'bg-blue-600' },
  camera_ready: { label: 'Camera-ready', dotClass: 'bg-violet-500' },
  presentation_upload: { label: 'Upload', dotClass: 'bg-cyan-500' },
  poster: { label: 'Poster', dotClass: 'bg-pink-500' },
  notification: { label: 'Notification', dotClass: 'bg-emerald-500' },
  rebuttal_start: { label: 'Rebuttal', dotClass: 'bg-teal-500' },
  rebuttal_end: { label: 'Rebuttal', dotClass: 'bg-teal-500' },
  tutorial_proposal: { label: 'Proposal', dotClass: 'bg-fuchsia-500' },
  panel_proposal: { label: 'Proposal', dotClass: 'bg-fuchsia-500' },
  workshop_proposal: { label: 'Proposal', dotClass: 'bg-fuchsia-500' },
  author_registration: { label: 'Registration', dotClass: 'bg-rose-500' },
  early_registration: { label: 'Registration', dotClass: 'bg-rose-500' },
};

/** `type` is free text in the schema, so this has to answer for anything. */
const UNKNOWN_DEADLINE_TYPE: DeadlineTypeStyle = { label: 'Other', dotClass: 'bg-slate-400' };

export function deadlineTypeStyle(type: string): DeadlineTypeStyle {
  return DEADLINE_TYPE_STYLES[type] ?? UNKNOWN_DEADLINE_TYPE;
}

/**
 * Deadline types that represent something an author must *submit*. Only these
 * drive the headline countdown; a notification date is information, not a task.
 */
export const SUBMISSION_DEADLINE_TYPES = new Set<string>([
  'abstract',
  'paper',
  'poster',
  'camera_ready',
  'tutorial_proposal',
  'panel_proposal',
  'workshop_proposal',
  'presentation_upload',
]);
