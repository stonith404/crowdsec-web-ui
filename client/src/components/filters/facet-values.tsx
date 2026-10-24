import { useEffect, useState } from 'react';
import { CheckIcon, MagnifyingGlassIcon, ProhibitIcon } from '@phosphor-icons/react';
import { Button, InputGroup, Loader, cn } from '@cloudflare/kumo';
import type { SearchFacetSelection, SearchPage } from '../../../../shared/search';
import { CountryFlag } from '@/components/country-flag';
import { fetchFacet } from '@/lib/api';
import { useFacetText } from '@/lib/facets';
import { useI18n } from '@/lib/i18n';
import type { FacetField, FacetValue } from '@/types';

const FIRST_PAGE_SIZE = 10;
const NEXT_PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 250;

interface FacetValuesProps {
  page: SearchPage;
  field: FacetField;
  filters: Record<string, string>;
  selection: SearchFacetSelection;
  onChange: (selection: SearchFacetSelection) => void;
}

function toggle(values: string[], value: string, on: boolean): string[] {
  return on ? [...new Set([...values, value])] : values.filter((candidate) => candidate !== value);
}

/** The values of one facet with their counts, where a click includes a value and the second button excludes it */
export function FacetValues({ page, field, filters, selection, onChange }: FacetValuesProps) {
  const { t } = useI18n();
  const { fieldLabel, valueLabel, searchValues } = useFacetText();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [result, setResult] = useState<{ key: string; values: FacetValue[]; hasMore: boolean; failed: boolean }>({ key: '', values: [], hasMore: false, failed: false });
  const label = fieldLabel(field);
  const filtersKey = JSON.stringify(filters);
  const requestKey = JSON.stringify([field, filtersKey, debouncedSearch, offset, retryKey]);
  const loading = result.key !== requestKey;
  const { values, hasMore, failed } = result;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setOffset(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    fetchFacet(page, field, JSON.parse(filtersKey) as Record<string, string>, {
      search: debouncedSearch,
      searchValues: debouncedSearch ? searchValues(field, debouncedSearch) : undefined,
      offset,
      limit: offset === 0 ? FIRST_PAGE_SIZE : NEXT_PAGE_SIZE,
      signal: controller.signal,
    }).then(
      (response) => setResult((current) => ({
        key: requestKey,
        values: offset === 0 ? response.values : [...current.values, ...response.values.filter((value) => !current.values.some((existing) => existing.value === value.value))],
        hasMore: response.has_more,
        failed: false,
      })),
      () => {
        if (!controller.signal.aborted) setResult((current) => ({ ...current, key: requestKey, hasMore: false, failed: true }));
      },
    );
    return () => controller.abort();
  }, [debouncedSearch, field, filtersKey, offset, page, requestKey, searchValues]);

  // Selected values stay listed even when the current filters leave them without matches
  const listed = [
    ...[...selection.included, ...selection.excluded]
      .filter((value) => !values.some((candidate) => candidate.value === value))
      .map((value) => ({ value, count: 0 })),
    ...values,
  ];

  return (
    <div className="flex flex-col gap-2">
      <InputGroup>
        <InputGroup.Addon>
          <MagnifyingGlassIcon />
        </InputGroup.Addon>
        <InputGroup.Input
          autoFocus
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('components.quickFilters.searchPlaceholder')}
          aria-label={t('components.quickFilters.searchField', { field: label })}
        />
      </InputGroup>
      <ul className="-mx-1 flex max-h-72 flex-col overflow-y-auto" aria-busy={loading}>
        {listed.map((facet) => {
          const included = selection.included.includes(facet.value);
          const excluded = selection.excluded.includes(facet.value);
          const text = valueLabel(field, facet.value);
          return (
            <li key={facet.value} className="group flex items-center gap-1 rounded-md pe-1 hover:bg-kumo-tint">
              <button
                type="button"
                aria-pressed={included}
                aria-label={t('components.quickFilters.toggleValue', { value: text, field: label })}
                onClick={() => onChange({ included: toggle(selection.included, facet.value, !included), excluded: toggle(selection.excluded, facet.value, false) })}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-start text-sm outline-none focus-visible:ring-2 focus-visible:ring-kumo-brand"
              >
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded-sm bg-kumo-control ring ring-kumo-line',
                    included && 'bg-kumo-brand text-white ring-kumo-brand',
                    excluded && 'bg-kumo-danger text-white ring-kumo-danger',
                  )}
                  aria-hidden="true"
                >
                  {included ? <CheckIcon className="size-3" weight="bold" /> : excluded ? <ProhibitIcon className="size-3" weight="bold" /> : null}
                </span>
                {field === 'country' ? <CountryFlag code={facet.value} className="h-3 w-4" /> : null}
                <span className={cn('min-w-0 flex-1 truncate', excluded && 'text-kumo-subtle line-through')}>{text}</span>
                {facet.count > 0 ? <span className="text-xs text-kumo-subtle numeric">{facet.count.toLocaleString()}</span> : null}
              </button>
              <Button
                variant="ghost"
                size="xs"
                shape="square"
                icon={<ProhibitIcon />}
                aria-pressed={excluded}
                aria-label={t('components.filters.excludeValue', { value: text })}
                className={cn('opacity-0 group-hover:opacity-100 focus-visible:opacity-100', excluded && 'text-kumo-danger opacity-100')}
                onClick={() => onChange({ included: toggle(selection.included, facet.value, false), excluded: toggle(selection.excluded, facet.value, !excluded) })}
              />
            </li>
          );
        })}
        {!loading && !failed && listed.length === 0 ? <li className="px-2 py-1.5 text-sm text-kumo-subtle">{t('components.quickFilters.noValues')}</li> : null}
        {failed ? (
          <li className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm text-kumo-danger">
            {t('components.filters.loadFailed')}
            <Button variant="ghost" size="xs" onClick={() => setRetryKey((key) => key + 1)}>{t('components.quickFilters.retry')}</Button>
          </li>
        ) : null}
        {loading ? (
          <li className="flex justify-center py-2 text-kumo-subtle"><Loader /></li>
        ) : hasMore ? (
          <li>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setOffset(values.length)}>
              {t('components.quickFilters.showMore')}
            </Button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
