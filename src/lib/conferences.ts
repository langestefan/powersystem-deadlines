import { getCollection, type CollectionEntry } from 'astro:content';

import { flattenEdition, sortEditions, type ConferenceEdition } from './edition';

/**
 * Reads the content collection and hands back conference editions. All of the
 * shaping logic lives in ./edition.ts; this file exists only to touch
 * `astro:content`, which is why it is the one module tests do not import.
 */

export * from './edition';

let cache: ConferenceEdition[] | null = null;


/** Every edition of every conference, flattened and sorted. */
export async function getAllEditions(now: Date = new Date()): Promise<ConferenceEdition[]> {
  if (cache) return cache;

  const entries: CollectionEntry<'conferences'>[] = await getCollection('conferences');
  const editions = entries.flatMap((entry) =>
    entry.data.editions.map((edition) => flattenEdition(entry.data, entry.id, edition, now)),
  );

  cache = sortEditions(editions);
  return cache;
}

/** Editions with at least one deadline still ahead of us, or a TBA deadline. */
export async function getUpcomingEditions(now: Date = new Date()): Promise<ConferenceEdition[]> {
  const all = await getAllEditions(now);
  return all.filter(
    (edition) =>
      !edition.cancelled &&
      (edition.hasUpcomingDeadline ||
        edition.deadlines.some((d) => d.tba) ||
        edition.isUpcomingEvent),
  );
}

/** Editions whose deadlines and event have all passed. */
export async function getPastEditions(now: Date = new Date()): Promise<ConferenceEdition[]> {
  const all = await getAllEditions(now);
  const upcoming = new Set((await getUpcomingEditions(now)).map((e) => e.id));
  return all.filter((edition) => !upcoming.has(edition.id)).reverse();
}

export async function getEditionById(id: string): Promise<ConferenceEdition | undefined> {
  const all = await getAllEditions();
  return all.find((edition) => edition.id === id);
}
