/**
 * The controlled vocabularies used by the conference schema. Adding a value here
 * is what makes it usable in src/data/conferences/*.yml — a typo in a pull
 * request fails validation instead of silently creating a one-off category.
 */

export interface TagDefinition {
  /** Slug used in YAML and in URLs, including the per-tag calendar feed. */
  id: string;
  label: string;
  description: string;
  /** Tailwind classes for the badge. Kept literal so the JIT compiler sees them. */
  className: string;
}

export const TAGS = [
  {
    id: 'power-systems',
    label: 'Power Systems',
    description: 'General power system analysis, operation and planning',
    className: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  },
  {
    id: 'power-electronics',
    label: 'Power Electronics',
    description: 'Converters, inverters, drives and semiconductor devices',
    className: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200',
  },
  {
    id: 'machines-drives',
    label: 'Machines & Drives',
    description: 'Electrical machines, motor drives and actuators',
    className: 'bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-200',
  },
  {
    id: 'smart-grid',
    label: 'Smart Grid',
    description: 'Measurement, communication, automation and demand response',
    className: 'bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200',
  },
  {
    id: 'microgrids',
    label: 'Microgrids',
    description: 'Islanded and grid-connected microgrids, DC grids',
    className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  },
  {
    id: 'protection-automation',
    label: 'Protection & Automation',
    description: 'Relaying, fault location, substation automation',
    className: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  },
  {
    id: 'hvdc-facts',
    label: 'HVDC & FACTS',
    description: 'HVDC transmission, converters and flexible AC transmission',
    className: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200',
  },
  {
    id: 'distribution',
    label: 'Distribution',
    description: 'Distribution networks, LV/MV planning and operation',
    className: 'bg-lime-100 text-lime-900 dark:bg-lime-950 dark:text-lime-200',
  },
  {
    id: 'transmission',
    label: 'Transmission',
    description: 'Transmission networks, interconnection and bulk power',
    className: 'bg-cyan-100 text-cyan-900 dark:bg-cyan-950 dark:text-cyan-200',
  },
  {
    id: 'energy-markets',
    label: 'Energy Markets',
    description: 'Electricity markets, pricing, regulation and economics',
    className: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  },
  {
    id: 'renewables',
    label: 'Renewables',
    description: 'Wind, solar PV and renewable integration',
    className: 'bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200',
  },
  {
    id: 'energy-storage',
    label: 'Energy Storage',
    description: 'Batteries, hydrogen and storage system integration',
    className: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200',
  },
  {
    id: 'ev-transportation',
    label: 'EV & Transportation',
    description: 'Electric vehicles, charging infrastructure, electrified transport',
    className: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200',
  },
  {
    id: 'power-quality',
    label: 'Power Quality',
    description: 'Harmonics, flicker, voltage quality and EMC',
    className: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
  },
  {
    id: 'reliability-planning',
    label: 'Reliability & Planning',
    description: 'Adequacy, risk, asset management and expansion planning',
    className: 'bg-stone-200 text-stone-900 dark:bg-stone-800 dark:text-stone-200',
  },
  {
    id: 'computation-optimization',
    label: 'Computation & Optimization',
    description: 'Optimization, simulation, machine learning for power systems',
    className: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
  },
  {
    id: 'cyber-physical-security',
    label: 'Cyber-Physical Security',
    description: 'Grid cybersecurity, resilience and cyber-physical systems',
    className: 'bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-200',
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
 * Recommended `type` values for a deadline entry. Not enforced — a conference is
 * free to invent one — but these get a nicer icon and sort priority in the UI.
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
