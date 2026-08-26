import type { ConferenceEdition } from './conferences';
import { TAGS, tagLabel, type TagId } from './taxonomy';
import { SITE_TITLE, absoluteUrl, withBase } from './site';

/**
 * The published calendar feeds. Defined once here so the endpoints that
 * generate them and the /subscribe page that lists them can never drift apart.
 */

export interface FeedDefinition {
  /** Site-absolute path, without the deployment base prefix. */
  path: string;
  /** Calendar name a subscriber sees in their client. */
  name: string;
  description: string;
  kind: 'all' | 'events' | 'tag';
  tag?: TagId;
}

export const ALL_DEADLINES_FEED: FeedDefinition = {
  path: '/calendar/all.ics',
  name: `${SITE_TITLE}: all deadlines`,
  description: 'Every submission deadline tracked on the site.',
  kind: 'all',
};

export const EVENTS_FEED: FeedDefinition = {
  path: '/calendar/events.ics',
  name: `${SITE_TITLE}: conference dates`,
  description: 'The conferences themselves, as all-day events.',
  kind: 'events',
};

export function tagFeed(tag: TagId): FeedDefinition {
  return {
    path: `/calendar/${tag}.ics`,
    name: `${SITE_TITLE}: ${tagLabel(tag)}`,
    description: `Deadlines for conferences tagged "${tagLabel(tag)}".`,
    kind: 'tag',
    tag,
  };
}

export function conferenceFeedPath(editionId: string): string {
  return `/conference/${editionId}.ics`;
}

/** Every feed, in the order the subscribe page lists them. */
export function allFeeds(usedTags: TagId[]): FeedDefinition[] {
  const used = new Set<string>(usedTags);
  const ordered = TAGS.filter((tag) => used.has(tag.id)).map((tag) => tagFeed(tag.id));
  return [ALL_DEADLINES_FEED, EVENTS_FEED, ...ordered];
}

/** The https:// URL a subscriber pastes into Google Calendar. */
export function feedUrl(path: string): string {
  return absoluteUrl(withBase(path));
}

/** The webcal:// URL that opens directly in Apple Calendar and Outlook. */
export function webcalUrl(path: string): string {
  return feedUrl(path).replace(/^https?:/, 'webcal:');
}

/** Google Calendar's "add by URL" deep link. */
export function googleSubscribeUrl(path: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl(path))}`;
}

export function editionsForFeed(
  feed: FeedDefinition,
  editions: ConferenceEdition[],
): ConferenceEdition[] {
  if (feed.kind === 'tag' && feed.tag) {
    return editions.filter((edition) => edition.tags.includes(feed.tag!));
  }
  return editions;
}
