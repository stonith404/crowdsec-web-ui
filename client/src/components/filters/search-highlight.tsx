import { forwardRef, useMemo } from 'react';
import {
  analyzeSearchQuery,
  type SearchHighlightTokenKind,
  type SearchPage,
  type SearchParseError,
} from '../../../../shared/search';
import { SEARCH_FEATURES } from '@/lib/searchState';
import { cn } from '@cloudflare/kumo';

interface HighlightSegment {
  key: string;
  text: string;
  kind: SearchHighlightTokenKind | 'plain';
  hasError: boolean;
}

const KIND_CLASS_NAMES: Partial<Record<HighlightSegment['kind'], string>> = {
  field: 'text-kumo-info',
  booleanOperator: 'text-(--color-kumo-badge-purple)',
  comparator: 'text-kumo-warning',
  string: 'text-kumo-success',
  paren: 'text-kumo-subtle',
  negation: 'text-kumo-subtle',
};

function buildSegments(query: string, page: SearchPage, error: SearchParseError | null | undefined, highlightErrors: boolean): HighlightSegment[] {
  if (!query) return [];
  const analysis = analyzeSearchQuery(query, page, SEARCH_FEATURES);
  const activeError = highlightErrors ? (error ?? analysis.error) : null;
  const boundaries = new Set<number>([0, query.length]);
  for (const token of analysis.tokens) {
    boundaries.add(token.start);
    boundaries.add(token.end);
  }
  const errorEnd = activeError ? Math.min(query.length, activeError.position + Math.max(activeError.length, 1)) : -1;
  if (activeError) {
    boundaries.add(activeError.position);
    boundaries.add(errorEnd);
  }

  const ordered = [...boundaries].filter((boundary) => boundary >= 0 && boundary <= query.length).sort((a, b) => a - b);
  const segments: HighlightSegment[] = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = ordered[index];
    const end = ordered[index + 1];
    if (start === end) continue;
    const token = analysis.tokens.find((candidate) => candidate.start <= start && candidate.end >= end);
    const hasError = activeError !== null && start < errorEnd && end > activeError.position;
    segments.push({ key: `${start}-${end}`, text: query.slice(start, end), kind: token?.kind ?? 'plain', hasError });
  }
  return segments;
}

interface SearchHighlightProps {
  query: string;
  page: SearchPage;
  error?: SearchParseError | null;
  highlightErrors?: boolean;
  className?: string;
  inline?: boolean;
}

/** Colors a search query by token kind, as a layer under the search input or as inline code */
export const SearchHighlight = forwardRef<HTMLDivElement, SearchHighlightProps>(function SearchHighlight(
  { query, page, error, highlightErrors = false, className, inline = false },
  ref,
) {
  const segments = useMemo(() => buildSegments(query, page, error, highlightErrors), [error, highlightErrors, page, query]);
  const children = segments.map((segment) => (
    <span
      key={segment.key}
      className={cn(KIND_CLASS_NAMES[segment.kind], segment.hasError && 'rounded-sm bg-kumo-danger-tint text-kumo-danger')}
    >
      {segment.text}
    </span>
  ));
  return inline
    ? <span className={className} aria-hidden="true">{children}</span>
    : <div ref={ref} className={className} aria-hidden="true">{children}</div>;
});
