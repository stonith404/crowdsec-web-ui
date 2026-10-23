import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  compileAlertSearch,
  compileDecisionSearch,
  getSearchDateRange,
  getSearchFacetSelection,
  replaceSearchDateRange,
  replaceSearchFacetSelection,
  serializeSearchNode,
  type SearchDateOptions,
  type SearchDateRange,
  type SearchFacetSelection,
  type SearchNode,
  type SearchPage,
  type SearchParseError,
} from '../../../shared/search';
import type { FacetField } from '../types';
import { getBrowserTimeZone, useDateTime } from './dateTime';
import { getQuickFilterCompatibility, type QuickFilterCompatibility } from './quickFilterCompatibility';
import {
  getQuickFilterFields,
  getQuickFilterSimulation,
  loadStoredQuickFilters,
  mergeStoredQuickFiltersIntoQuery,
  quickFilterSimulationSelection,
  saveStoredQuickFilters,
  setStoredQuickFilterSelection,
  storedQuickFiltersEqual,
  syncStoredQuickFiltersFromSearch,
  type QuickFilterSimulationValue,
} from './quickFilters';
import { useRecentFilter } from './savedFilters';
import { parseSimulationFilter } from './simulation';

export const SEARCH_FEATURES = { machineEnabled: true, originEnabled: true };
const SEARCH_DEBOUNCE_MS = 350;
const EMPTY_SELECTION: SearchFacetSelection = { included: [], excluded: [] };

export function compileSearch(page: SearchPage, query: string, dateOptions?: SearchDateOptions) {
  return page === 'alerts'
    ? compileAlertSearch(query, SEARCH_FEATURES, dateOptions)
    : compileDecisionSearch(query, SEARCH_FEATURES, dateOptions);
}

export function useSearchDateOptions(): SearchDateOptions {
  const { timeZone } = useDateTime();
  return useMemo(() => ({
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    timeZone: timeZone || getBrowserTimeZone(),
  }), [timeZone]);
}

function updateStoredQuickFilters(update: (current: ReturnType<typeof loadStoredQuickFilters>) => ReturnType<typeof loadStoredQuickFilters>) {
  const current = loadStoredQuickFilters();
  const next = update(current);
  if (!storedQuickFiltersEqual(current, next)) saveStoredQuickFilters(next);
}

export interface SearchState {
  page: SearchPage;
  /** What the search box shows, which may not compile yet */
  draft: string;
  setDraft: (value: string) => void;
  /** Applies the draft right away, e.g. on Enter */
  commitDraft: () => void;
  /** Replaces the whole query, e.g. from a saved filter */
  applyQuery: (query: string) => void;
  draftError: SearchParseError | null;
  /** The query in the URL, which always compiles */
  query: string;
  ast: SearchNode | null;
  compatibility: QuickFilterCompatibility;
  facetFields: FacetField[];
  getSelection: (field: FacetField) => SearchFacetSelection;
  setSelection: (field: FacetField, selection: SearchFacetSelection) => void;
  dateRange: SearchDateRange;
  setDateRange: (range: SearchDateRange) => void;
  simulation: QuickFilterSimulationValue;
  setSimulation: (value: QuickFilterSimulationValue) => void;
  clearFilters: () => void;
  /** Parameters every list, facet and stats request of the page sends */
  serverFilters: Record<string, string>;
}

/**
 * The search of a data page: the query lives in `?q=`, and facet chips, the time range and the simulation filter are parts of that query.
 * Quick filters are also remembered per browser, so they follow the user between Alerts, Decisions and the Dashboard.
 */
export function useSearchState(page: SearchPage): SearchState {
  const [searchParams, setSearchParams] = useSearchParams();
  const dateOptions = useSearchDateOptions();
  const urlQuery = searchParams.get('q') ?? '';
  const urlCompiled = useMemo(() => compileSearch(page, urlQuery, dateOptions), [dateOptions, page, urlQuery]);
  // A hand-edited URL may not compile, in which case the page searches for nothing until it is fixed
  const query = urlCompiled.ok ? urlQuery.trim() : '';
  const ast = urlCompiled.ok ? urlCompiled.ast : null;
  // Remembered quick filters join the query the first time the page opens
  const [draft, setDraftState] = useState(() => mergeStoredQuickFiltersIntoQuery(page, urlQuery, loadStoredQuickFilters()));
  const [writtenQuery, setWrittenQuery] = useState(urlQuery);
  const [seenQuery, setSeenQuery] = useState(urlQuery);

  // Back and forward, links and other external changes of the URL replace what was typed
  // A change that echoes the page's own write keeps what is typed
  if (urlQuery !== seenQuery) {
    setSeenQuery(urlQuery);
    setWrittenQuery(urlQuery);
    if (urlQuery !== writtenQuery) setDraftState(urlQuery);
  }

  const writeQuery = useCallback((next: string, options: { replace?: boolean; dropParams?: string[] } = {}) => {
    setWrittenQuery(next);
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (next) params.set('q', next);
      else params.delete('q');
      params.delete('page');
      for (const name of options.dropParams ?? []) params.delete(name);
      return params;
    }, { replace: options.replace });
  }, [setSearchParams]);

  useLayoutEffect(() => {
    if (draft === urlQuery) return;
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set('q', draft);
      return params;
    }, { replace: true });
    // Only on mount, later changes come from the page itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draftCompiled = useMemo(() => compileSearch(page, draft, dateOptions), [dateOptions, draft, page]);

  // Typing applies the query once it compiles and the user paused, without adding a history entry per keystroke
  useEffect(() => {
    if (!draftCompiled.ok || draft.trim() === urlQuery.trim()) return;
    const timeout = window.setTimeout(() => writeQuery(draft.trim(), { replace: true }), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [draft, draftCompiled.ok, urlQuery, writeQuery]);

  const facetFields = getQuickFilterFields(page);
  const compatibility = useMemo(
    () => (urlCompiled.ok ? getQuickFilterCompatibility(urlCompiled.ast, facetFields) : { compatible: false as const, reason: 'syntax-error' as const }),
    [facetFields, urlCompiled],
  );

  const legacyDateStart = searchParams.get('dateStart') ?? '';
  const legacyDateEnd = searchParams.get('dateEnd') ?? '';
  const astDateRange = getSearchDateRange(ast);
  const dateRange = { start: astDateRange.start || legacyDateStart, end: astDateRange.end || legacyDateEnd };
  const simulation = getQuickFilterSimulation(ast, parseSimulationFilter(searchParams.get('simulation')));

  useEffect(() => {
    if (!urlCompiled.ok || !compatibility.compatible) return;
    updateStoredQuickFilters((current) => syncStoredQuickFiltersFromSearch(current, page, urlCompiled.ast, getSearchDateRange(urlCompiled.ast)));
  }, [compatibility.compatible, page, urlCompiled]);

  const updateAst = useCallback((transform: (current: SearchNode | null) => SearchNode | null, dropParams?: string[]) => {
    const next = serializeSearchNode(transform(ast));
    setDraftState(next);
    writeQuery(next, { dropParams });
  }, [ast, writeQuery]);

  const setSelection = useCallback((field: FacetField, selection: SearchFacetSelection) => {
    updateStoredQuickFilters((current) => setStoredQuickFilterSelection(current, field, selection));
    updateAst((current) => replaceSearchFacetSelection(current, field, selection));
  }, [updateAst]);

  const setDateRange = useCallback((range: SearchDateRange) => {
    updateStoredQuickFilters((current) => ({ ...current, dateRange: range }));
    updateAst((current) => replaceSearchDateRange(current, range), ['dateStart', 'dateEnd']);
  }, [updateAst]);

  const setSimulation = useCallback((value: QuickFilterSimulationValue) => {
    updateStoredQuickFilters((current) => ({ ...current, simulation: value }));
    updateAst((current) => replaceSearchFacetSelection(current, 'sim', quickFilterSimulationSelection(value)), ['simulation']);
  }, [updateAst]);

  const clearFilters = useCallback(() => {
    updateAst((current) => {
      let next = current;
      for (const field of facetFields) next = replaceSearchFacetSelection(next, field, EMPTY_SELECTION);
      next = replaceSearchFacetSelection(next, 'sim', EMPTY_SELECTION);
      return replaceSearchDateRange(next, { start: '', end: '' });
    }, ['dateStart', 'dateEnd', 'simulation']);
  }, [facetFields, updateAst]);

  const applyQuery = useCallback((next: string) => {
    setDraftState(next);
    writeQuery(next.trim());
  }, [writeQuery]);

  const commitDraft = useCallback(() => {
    if (draftCompiled.ok && draft.trim() !== urlQuery.trim()) writeQuery(draft.trim());
  }, [draft, draftCompiled.ok, urlQuery, writeQuery]);

  useRecentFilter(query, page);

  const instance = searchParams.get('instance') || 'all';
  const legacySimulation = searchParams.get('simulation');
  const serverFilters = useMemo(() => {
    const filters: Record<string, string> = { tz_offset: String(new Date().getTimezoneOffset()), instance };
    const browserTimeZone = getBrowserTimeZone();
    if (browserTimeZone) filters.browser_tz = browserTimeZone;
    if (query) filters.q = query;
    if (legacyDateStart) filters.dateStart = legacyDateStart;
    if (legacyDateEnd) filters.dateEnd = legacyDateEnd;
    if (legacySimulation === 'live' || legacySimulation === 'simulated') filters.simulation = legacySimulation;
    return filters;
  }, [instance, legacyDateEnd, legacyDateStart, legacySimulation, query]);

  return {
    page,
    draft,
    setDraft: setDraftState,
    commitDraft,
    applyQuery,
    draftError: draftCompiled.ok ? null : draftCompiled.error,
    query,
    ast,
    compatibility,
    facetFields,
    getSelection: (field) => getSearchFacetSelection(ast, field),
    setSelection,
    dateRange,
    setDateRange,
    simulation,
    setSimulation,
    clearFilters,
    serverFilters,
  };
}
