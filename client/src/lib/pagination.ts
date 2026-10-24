import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export const PAGE_SIZES = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 50;

function positiveInt(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** The page and page size of a table, kept in the URL so a page of results is linkable */
export function usePagination() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = positiveInt(searchParams.get('page')) ?? 1;
  const requestedSize = positiveInt(searchParams.get('pageSize'));
  const pageSize = requestedSize && PAGE_SIZES.includes(requestedSize) ? requestedSize : DEFAULT_PAGE_SIZE;

  const update = useCallback((changes: Record<string, number | null>) => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) params.delete(key);
        else params.set(key, String(value));
      }
      return params;
    });
  }, [setSearchParams]);

  const setPage = useCallback((next: number) => update({ page: next > 1 ? next : null }), [update]);
  const setPageSize = useCallback((next: number) => update({ pageSize: next === DEFAULT_PAGE_SIZE ? null : next, page: null }), [update]);

  return { page, pageSize, setPage, setPageSize };
}
