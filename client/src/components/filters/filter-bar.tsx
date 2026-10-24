import { useRef, useState, type ReactNode } from 'react';
import { CaretLeftIcon, PlusIcon, QuestionIcon, XIcon } from '@phosphor-icons/react';
import { Button, Popover, Select } from '@cloudflare/kumo';
import { FacetValues } from '@/components/filters/facet-values';
import { SavedFiltersMenu } from '@/components/filters/saved-filters-menu';
import { SearchInput } from '@/components/filters/search-input';
import { SearchSyntaxDialog } from '@/components/filters/search-syntax-dialog';
import { TimeRange } from '@/components/filters/time-range';
import { useFacetText } from '@/lib/facets';
import { useI18n } from '@/lib/i18n';
import type { QuickFilterSimulationValue } from '@/lib/quickFilters';
import type { SearchState } from '@/lib/searchState';
import type { FacetField } from '@/types';

const SIMULATION_OPTIONS: Array<{ value: QuickFilterSimulationValue; labelKey: string }> = [
  { value: 'all', labelKey: 'components.filters.simulation.all' },
  { value: 'live', labelKey: 'components.filters.simulation.live' },
  { value: 'simulated', labelKey: 'components.filters.simulation.simulated' },
];

function FilterPopover({ trigger, children }: { trigger: React.ReactElement; children: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner align="start" sideOffset={6}>
          <Popover.Popup className="w-80 p-2">{children}</Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A filter as Cloudflare draws it: the field and its values on one joined control, with a button that removes it */
function FacetChip({ search, field }: { search: SearchState; field: FacetField }) {
  const { t } = useI18n();
  const { fieldLabel, valueLabel } = useFacetText();
  const selection = search.getSelection(field);
  const excludedOnly = selection.included.length === 0;
  const values = excludedOnly ? selection.excluded : selection.included;
  const shown = values.slice(0, 2).map((value) => valueLabel(field, value)).join(', ');
  const more = values.length > 2 ? ` +${values.length - 2}` : '';

  return (
    <div className="flex h-7 items-center rounded-md bg-kumo-base text-sm ring ring-kumo-line">
      <FilterPopover
        trigger={(
          <button type="button" className="flex h-full min-w-0 items-center gap-1 rounded-s-md ps-2.5 pe-2 hover:bg-kumo-tint">
            <span className="text-kumo-subtle">{fieldLabel(field)}</span>
            <span className="text-kumo-subtle">{excludedOnly ? t('components.filters.isNot') : t('components.filters.is')}</span>
            <span className="max-w-48 truncate font-medium">{shown}{more}</span>
          </button>
        )}
      >
        <FacetValues page={search.page} field={field} filters={search.serverFilters} selection={selection} onChange={(next) => search.setSelection(field, next)} />
      </FilterPopover>
      <button
        type="button"
        className="flex h-full items-center rounded-e-md border-s border-kumo-line px-1.5 text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
        aria-label={t('components.quickFilters.clearSection', { field: fieldLabel(field) })}
        onClick={() => search.setSelection(field, { included: [], excluded: [] })}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}

function AddFilter({ search, fields }: { search: SearchState; fields: FacetField[] }) {
  const { t } = useI18n();
  const { fieldLabel } = useFacetText();
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<FacetField | null>(null);

  return (
    <Popover.Root open={open} onOpenChange={(next) => { setOpen(next); if (!next) setField(null); }}>
      <Popover.Trigger render={<Button variant="ghost" size="sm" icon={<PlusIcon />}>{t('components.filters.addFilter')}</Button>} />
      <Popover.Portal>
        <Popover.Positioner align="start" sideOffset={6}>
          <Popover.Popup className="w-80 p-2">
            {field ? (
              <div className="flex flex-col gap-2">
                <button type="button" className="flex items-center gap-1 self-start rounded-md px-1 text-sm font-medium hover:text-kumo-subtle" onClick={() => setField(null)}>
                  <CaretLeftIcon className="size-4 rtl:rotate-180" />
                  {fieldLabel(field)}
                </button>
                <FacetValues page={search.page} field={field} filters={search.serverFilters} selection={search.getSelection(field)} onChange={(next) => search.setSelection(field, next)} />
              </div>
            ) : (
              <ul className="flex max-h-80 flex-col overflow-y-auto">
                {fields.map((candidate) => (
                  <li key={candidate}>
                    <button type="button" className="w-full rounded-md px-2 py-1.5 text-start text-sm hover:bg-kumo-tint" onClick={() => setField(candidate)}>
                      {fieldLabel(candidate)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface FilterBarProps {
  search: SearchState;
  /** Facet fields offered as filters, in the order the table shows its columns */
  fields: FacetField[];
  simulationsEnabled: boolean;
  /** Controls placed at the end of the search row, such as the column picker */
  actions?: ReactNode;
  /** Page-specific filters placed at the end of the filter row, such as toggles */
  extra?: ReactNode;
}

/** Cloudflare's query bar: the search with its time range in one row, then filter chips that are parts of the same query */
export function FilterBar({ search, fields, simulationsEnabled, actions, extra }: FilterBarProps) {
  const { t } = useI18n();
  const [syntaxOpen, setSyntaxOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeFields = fields.filter((field) => {
    const selection = search.getSelection(field);
    return selection.included.length > 0 || selection.excluded.length > 0;
  });
  const hasFilters = activeFields.length > 0 || Boolean(search.dateRange.start || search.dateRange.end) || search.simulation !== 'all';

  const insertSnippet = (snippet: string) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? search.draft.length;
    const end = input?.selectionEnd ?? search.draft.length;
    const before = search.draft.slice(0, start);
    const spacer = before && !before.endsWith(' ') ? ' ' : '';
    search.setDraft(`${before}${spacer}${snippet}${search.draft.slice(end)}`);
    setSyntaxOpen(false);
    window.setTimeout(() => {
      input?.focus();
      const caret = before.length + spacer.length + snippet.length;
      input?.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-64 flex-1 items-center gap-2">
          <SearchInput
            value={search.draft}
            page={search.page}
            error={search.draftError}
            onChange={(event) => search.setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') search.commitDraft();
            }}
            placeholder={t('components.filters.searchPlaceholder')}
            aria-label={t('common.search')}
            ref={inputRef}
            addon={(
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                icon={<QuestionIcon />}
                aria-label={t('components.searchSyntax.help')}
                title={t('components.searchSyntax.help')}
                onClick={() => setSyntaxOpen(true)}
              />
            )}
          />
          <SavedFiltersMenu page={search.page} query={search.query} onApply={search.applyQuery} />
        </div>
        <div className="flex items-center gap-2">
          <TimeRange value={search.dateRange} onChange={search.setDateRange} disabled={!search.compatibility.compatible} />
          {actions}
        </div>
      </div>
      {search.draftError ? (
        <p role="alert" className="text-sm text-kumo-danger">
          {t('common.searchSyntaxError', { position: search.draftError.position + 1, message: search.draftError.message })}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {search.compatibility.compatible ? (
          <>
            {simulationsEnabled ? (
              <Select
                size="sm"
                aria-label={t('components.filters.simulation.label')}
                value={search.simulation === 'none' ? 'all' : search.simulation}
                onValueChange={(value) => search.setSimulation(value as QuickFilterSimulationValue)}
                renderValue={(value: string) => t(SIMULATION_OPTIONS.find((option) => option.value === value)?.labelKey ?? '')}
              >
                {SIMULATION_OPTIONS.map((option) => <Select.Option key={option.value} value={option.value}>{t(option.labelKey)}</Select.Option>)}
              </Select>
            ) : null}
            {activeFields.map((field) => <FacetChip key={field} search={search} field={field} />)}
            <AddFilter search={search} fields={fields.filter((field) => !activeFields.includes(field))} />
            {hasFilters ? (
              <Button variant="ghost" size="sm" className="text-kumo-subtle" onClick={search.clearFilters}>
                {t('components.quickFilters.clearAll')}
              </Button>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-kumo-subtle">
            <span className="font-medium text-kumo-default">{t('components.quickFilters.disabledTitle')}. </span>
            {t(`components.quickFilters.disabled.${search.compatibility.reason}`)}
          </p>
        )}
        {extra ? <div className="ms-auto flex flex-wrap items-center gap-x-5 gap-y-2">{extra}</div> : null}
      </div>
      <SearchSyntaxDialog
        page={search.page}
        open={syntaxOpen}
        onOpenChange={setSyntaxOpen}
        onInsert={insertSnippet}
        onApplyExample={(query) => {
          search.applyQuery(query);
          setSyntaxOpen(false);
        }}
      />
    </div>
  );
}
