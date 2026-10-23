import { useCallback, useMemo } from 'react';
import { useRefresh } from '../contexts/useRefresh';
import type { FacetField, TableColumnId } from '../types';
import { useI18n } from './i18n';
import { getCountryCodesMatchingName, getCountryName } from './utils';

// Facets reuse the column names, since each facet filters one column of the tables
const FACET_COLUMNS: Partial<Record<FacetField, TableColumnId>> = {
  ip: 'source',
  decision: 'decisions',
  status: 'expiration',
};

export function facetColumn(field: FacetField): TableColumnId {
  return FACET_COLUMNS[field] ?? (field as TableColumnId);
}

/** Labels for facet fields and values, and the raw values a typed search should also match, such as country codes for a country name */
export function useFacetText() {
  const { t, language } = useI18n();
  const { config } = useRefresh();
  const instances = useMemo(() => config?.instances ?? [], [config?.instances]);

  const fieldLabel = useCallback((field: FacetField) => t(`tableColumns.${facetColumn(field)}`), [t]);

  const valueLabel = useCallback((field: FacetField, value: string) => {
    if (value === '') return t('components.quickFilters.empty');
    if (field === 'country') return getCountryName(value, language) || value;
    if (field === 'instance') return instances.find((instance) => instance.id === value)?.name || value;
    if (field === 'decision') return value === 'active' ? t('common.active') : t('common.inactive');
    if (field === 'status') return value === 'active' ? t('common.active') : t('pages.decisions.expired');
    return value;
  }, [instances, language, t]);

  const searchValues = useCallback((field: FacetField, search: string) => {
    if (field === 'country') return getCountryCodesMatchingName(search, language);
    if (field !== 'instance') return [];
    const normalized = search.trim().toLocaleLowerCase(language);
    return instances.filter((instance) => instance.name.toLocaleLowerCase(language).includes(normalized)).map((instance) => instance.id);
  }, [instances, language]);

  return { fieldLabel, valueLabel, searchValues };
}
