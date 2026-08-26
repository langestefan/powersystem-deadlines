import { useCallback, useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * Filters the server-rendered conference cards in place.
 *
 * The cards themselves are static Astro output — this island only toggles their
 * visibility using the data-* attributes they carry. That keeps the list fast
 * and indexable while the interactive part stays a few kilobytes of JavaScript.
 * Filter state is mirrored into the query string so a filtered view is a
 * shareable link.
 */

export interface FilterOption {
  id: string;
  label: string;
  /** Tailwind classes for the tag chip, from the taxonomy. */
  className?: string;
  count: number;
}

interface FilterBarProps {
  tags: FilterOption[];
  societies: FilterOption[];
  regions: FilterOption[];
  totalCount: number;
}

interface FilterState {
  query: string;
  tags: Set<string>;
  societies: Set<string>;
  regions: Set<string>;
}

const EMPTY: FilterState = {
  query: '',
  tags: new Set(),
  societies: new Set(),
  regions: new Set(),
};

function readUrl(): FilterState {
  if (typeof window === 'undefined') return EMPTY;
  const params = new URLSearchParams(window.location.search);
  const list = (key: string) =>
    new Set((params.get(key) ?? '').split(',').filter(Boolean));

  return {
    query: params.get('q') ?? '',
    tags: list('tags'),
    societies: list('society'),
    regions: list('region'),
  };
}

function writeUrl(state: FilterState) {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.tags.size) params.set('tags', [...state.tags].join(','));
  if (state.societies.size) params.set('society', [...state.societies].join(','));
  if (state.regions.size) params.set('region', [...state.regions].join(','));

  const search = params.toString();
  const url = `${window.location.pathname}${search ? `?${search}` : ''}`;
  window.history.replaceState(null, '', url);
}

function matches(card: HTMLElement, state: FilterState): boolean {
  if (state.query) {
    const haystack = card.dataset.search ?? '';
    // Every whitespace-separated term must appear somewhere in the card.
    const terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.every((term) => haystack.includes(term))) return false;
  }

  if (state.tags.size) {
    const cardTags = (card.dataset.tags ?? '').split(' ').filter(Boolean);
    if (!cardTags.some((tag) => state.tags.has(tag))) return false;
  }

  if (state.societies.size) {
    const cardSocieties = (card.dataset.societies ?? '').split('|').filter(Boolean);
    if (!cardSocieties.some((society) => state.societies.has(society))) return false;
  }

  if (state.regions.size) {
    if (!state.regions.has(card.dataset.region ?? '')) return false;
  }

  return true;
}

function toggle(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export default function FilterBar({
  tags,
  societies,
  regions,
  totalCount,
}: FilterBarProps) {
  const [state, setState] = useState<FilterState>(EMPTY);
  const [visible, setVisible] = useState(totalCount);
  const [ready, setReady] = useState(false);

  // Restore any filter carried in the URL before the first apply.
  useEffect(() => {
    setState(readUrl());
    setReady(true);
  }, []);

  const apply = useCallback((next: FilterState) => {
    const cards = document.querySelectorAll<HTMLElement>('[data-conference-card]');
    let shown = 0;

    for (const card of cards) {
      const show = matches(card, next);
      // The wrapper carries the list spacing, so hide that rather than the card.
      const target = (card.closest('[data-card-slot]') as HTMLElement | null) ?? card;
      target.hidden = !show;
      if (show) shown += 1;
    }

    // Section headings with nothing left under them would otherwise linger.
    for (const group of document.querySelectorAll<HTMLElement>('[data-card-group]')) {
      const anyVisible = group.querySelector('[data-card-slot]:not([hidden])') !== null;
      group.hidden = !anyVisible;
    }

    setVisible(shown);
  }, []);

  useEffect(() => {
    if (!ready) return;
    apply(state);
    writeUrl(state);
  }, [state, ready, apply]);

  const active = useMemo(
    () => state.tags.size + state.societies.size + state.regions.size + (state.query ? 1 : 0),
    [state],
  );

  const chip = (
    option: FilterOption,
    selected: boolean,
    onClick: () => void,
    tone?: string,
  ) => (
    <button
      key={option.id}
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : cn('border-transparent hover:brightness-95', tone ?? 'bg-muted text-muted-foreground'),
      )}
    >
      {option.label}
      <span className={cn('tabular-nums', selected ? 'opacity-80' : 'opacity-60')}>
        {option.count}
      </span>
    </button>
  );

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">Search conferences</span>
          <input
            type="search"
            value={state.query}
            placeholder="Search name, city, country…"
            onChange={(event) =>
              setState((previous) => ({ ...previous, query: event.target.value }))
            }
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <p className="text-sm text-muted-foreground tabular-nums">
          {visible} of {totalCount}
        </p>

        {active > 0 && (
          <button
            type="button"
            onClick={() => setState(EMPTY)}
            className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {tags.map((tag) =>
          chip(
            tag,
            state.tags.has(tag.id),
            () => setState((previous) => ({ ...previous, tags: toggle(previous.tags, tag.id) })),
            tag.className,
          ),
        )}
      </div>

      <details className="mt-3 border-t pt-3">
        <summary className="cursor-pointer list-none text-sm text-muted-foreground select-none hover:text-foreground">
          More filters
        </summary>

        <div className="mt-3 space-y-3">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide uppercase opacity-70">
              Organiser
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {societies.map((society) =>
                chip(society, state.societies.has(society.id), () =>
                  setState((previous) => ({
                    ...previous,
                    societies: toggle(previous.societies, society.id),
                  })),
                ),
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide uppercase opacity-70">
              Region
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {regions.map((region) =>
                chip(region, state.regions.has(region.id), () =>
                  setState((previous) => ({
                    ...previous,
                    regions: toggle(previous.regions, region.id),
                  })),
                ),
              )}
            </div>
          </div>
        </div>
      </details>

      {ready && visible === 0 && (
        <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">
          No conferences match these filters.{' '}
          <button
            type="button"
            onClick={() => setState(EMPTY)}
            className="text-primary underline underline-offset-4"
          >
            Clear them
          </button>{' '}
          or{' '}
          <a
            className="text-primary underline underline-offset-4"
            href="https://github.com/langestefan/powersystems-deadlines/blob/main/CONTRIBUTING.md"
          >
            add the conference you were looking for
          </a>
          .
        </p>
      )}
    </div>
  );
}
