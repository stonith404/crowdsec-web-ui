import type { ReactNode } from 'react';
import { XIcon } from '@phosphor-icons/react';
import { Button, LayerCard, Pagination, SkeletonLine, Table, cn } from '@cloudflare/kumo';
import { useI18n } from '@/lib/i18n';
import { PAGE_SIZES } from '@/lib/pagination';

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Classes for the header and the cells of the column, e.g. a width or `text-end` */
  className?: string;
  /** Keeps the column at the end edge while the table scrolls sideways, as for row actions */
  sticky?: boolean;
}

// Kumo pins sticky columns with `right-0`, which is the wrong edge in right-to-left languages
const STICKY_END_CLASSES = 'rtl:right-auto rtl:left-0';

export interface TableSelection {
  /** Row IDs of every row that matches the filters, across all pages */
  selectableIds: string[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  /** Toolbar content for the checked rows */
  actions: (selected: string[]) => ReactNode;
}

interface DataTableProps<T> {
  label: string;
  columns: Column<T>[];
  data: T[];
  getRowId: (row: T) => string;
  /** True until the first page arrived, which shows skeleton rows instead of an empty table */
  loading: boolean;
  /** True while a later page or a refresh is loading, which dims the rows that are shown */
  busy?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty: ReactNode;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
  };
  selection?: TableSelection;
  onRowClick?: (row: T) => void;
  isRowActive?: (row: T) => boolean;
}

/** A Cloudflare list table: rows in a layer card, the selection's actions above them and pagination below */
export function DataTable<T>({
  label,
  columns,
  data,
  getRowId,
  loading,
  busy = false,
  error,
  onRetry,
  empty,
  pagination,
  selection,
  onRowClick,
  isRowActive,
}: DataTableProps<T>) {
  const { t } = useI18n();
  const pageIds = data.map(getRowId);
  const selectedOnPage = selection ? pageIds.filter((id) => selection.selected.has(id)).length : 0;
  const allOnPage = pageIds.length > 0 && selectedOnPage === pageIds.length;
  const allMatching = selection ? selection.selected.size > 0 && selection.selected.size === selection.selectableIds.length : false;
  const columnCount = columns.length + (selection ? 1 : 0);

  const setChecked = (ids: string[], checked: boolean) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    for (const id of ids) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    selection.onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      {selection && selection.selected.size > 0 ? (
        // The selection takes over the toolbar, so its actions sit where the eye already is
        <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg bg-kumo-tint px-3 py-1.5" aria-live="polite">
          <span className="text-sm font-medium">{t('components.table.selected', { count: selection.selected.size.toLocaleString() })}</span>
          {allOnPage && !allMatching && selection.selectableIds.length > pageIds.length ? (
            <Button variant="ghost" size="sm" className="text-kumo-link" onClick={() => selection.onChange(new Set(selection.selectableIds))}>
              {t('components.table.selectAllMatching', { count: selection.selectableIds.length.toLocaleString() })}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" icon={<XIcon />} onClick={() => selection.onChange(new Set())}>
            {t('components.table.clearSelection')}
          </Button>
          <div className="ms-auto flex shrink-0 items-center gap-2">{selection.actions([...selection.selected])}</div>
        </div>
      ) : null}
      <LayerCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table aria-label={label} aria-busy={loading || busy}>
            <Table.Header>
              <Table.Row>
                {selection ? (
                  <Table.CheckHead
                    label={t('components.table.selectAllOnPage')}
                    checked={allOnPage}
                    indeterminate={selectedOnPage > 0 && !allOnPage}
                    disabled={pageIds.length === 0}
                    onCheckedChange={(checked) => setChecked(pageIds, checked)}
                  />
                ) : null}
                {columns.map((column) => (
                  <Table.Head key={column.id} sticky={column.sticky ? 'right' : undefined} className={cn(column.sticky && STICKY_END_CLASSES, column.className)}>{column.header}</Table.Head>
                ))}
              </Table.Row>
            </Table.Header>
            <Table.Body className={cn('transition-opacity', busy && !loading && 'opacity-60')}>
              {loading ? (
                // As many rows as a page holds, each as tall as a row with a two-line cell such as a scenario and its author, so the table keeps its size when the data arrives
                Array.from({ length: pagination.pageSize }, (_, index) => (
                  <Table.Row key={index}>
                    {Array.from({ length: columnCount }, (_, cell) => (
                      <Table.Cell key={cell}>
                        <div className="flex h-9 items-center"><SkeletonLine /></div>
                      </Table.Cell>
                    ))}
                  </Table.Row>
                ))
              ) : error ? (
                <Table.Row>
                  <Table.Cell colSpan={columnCount}>
                    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                      <p className="text-kumo-subtle">{error}</p>
                      {onRetry ? <Button size="sm" onClick={onRetry}>{t('components.table.retry')}</Button> : null}
                    </div>
                  </Table.Cell>
                </Table.Row>
              ) : data.length === 0 ? (
                <Table.Row>
                  <Table.Cell colSpan={columnCount}>{empty}</Table.Cell>
                </Table.Row>
              ) : (
                data.map((row) => {
                  const id = getRowId(row);
                  return (
                    <Table.Row
                      key={id}
                      variant={selection?.selected.has(id) || isRowActive?.(row) ? 'selected' : 'default'}
                      className={cn(onRowClick && 'cursor-pointer')}
                      onClick={onRowClick ? (event) => {
                        // Links, buttons and checkboxes inside the row keep their own click
                        if ((event.target as HTMLElement).closest('a, button, input, [role="checkbox"], [role="menuitem"]')) return;
                        onRowClick(row);
                      } : undefined}
                    >
                      {selection ? (
                        <Table.CheckCell label={t('components.table.selectRow')} checked={selection.selected.has(id)} onCheckedChange={(checked) => setChecked([id], checked)} />
                      ) : null}
                      {columns.map((column) => (
                        <Table.Cell key={column.id} sticky={column.sticky ? 'right' : undefined} className={cn(column.sticky && STICKY_END_CLASSES, column.className)}>{column.cell(row)}</Table.Cell>
                      ))}
                    </Table.Row>
                  );
                })
              )}
            </Table.Body>
          </Table>
        </div>
      </LayerCard>
      {!loading && !error && pagination.total > 0 ? (
        <Pagination
          page={pagination.page}
          setPage={pagination.onPageChange}
          perPage={pagination.pageSize}
          totalCount={pagination.total}
          labels={{
            navigation: t('components.table.pagination'),
            firstPage: t('components.table.firstPage'),
            previousPage: t('components.table.previousPage'),
            nextPage: t('components.table.nextPage'),
            lastPage: t('components.table.lastPage'),
            pageNumber: t('components.table.pageNumber'),
            pageSize: t('components.table.perPage'),
          }}
        >
          <Pagination.Info>
            {({ page, perPage = pagination.pageSize, totalCount = 0 }) => t('components.table.range', {
              first: ((page - 1) * perPage + 1).toLocaleString(),
              last: Math.min(totalCount, page * perPage).toLocaleString(),
              total: totalCount.toLocaleString(),
            })}
          </Pagination.Info>
          <Pagination.PageSize value={pagination.pageSize} onChange={pagination.onPageSizeChange} options={PAGE_SIZES} label={t('components.table.perPage')} />
          <Pagination.Controls />
        </Pagination>
      ) : null}
    </div>
  );
}
