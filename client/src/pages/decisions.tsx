import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DotsThreeIcon, PlusIcon, ShieldSlashIcon, TrashIcon, XIcon } from '@phosphor-icons/react';
import { Badge, Button, DropdownMenu, Empty, Link as KumoLink, Switch } from '@cloudflare/kumo';
import { AddDecisionDialog, type AddDecisionTarget } from '@/components/add-decision-dialog';
import { CountryCell, EMPTY_CELL, ExpirationCell, InstanceCell, IpCell, ScenarioName, TargetCell, TextCell, TimeCell } from '@/components/cells';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { ColumnPicker } from '@/components/data-table/column-picker';
import { DataTable, type Column } from '@/components/data-table/data-table';
import { ErrorAlert } from '@/components/error-alert';
import { toErrorInfo, type ErrorInfo } from '@/lib/errors';
import { FilterBar } from '@/components/filters/filter-bar';
import { PageHeader } from '@/components/page-header';
import { useRefresh } from '@/contexts/useRefresh';
import { useServerData } from '@/hooks/use-server-data';
import { bulkDeleteDecisions, cleanupByIp, deleteDecision, fetchDecisionsPaginated } from '@/lib/api';
import { combineDeleteResults, entityKey, keyToRef, selectableKeys, summarizeDeleteResult } from '@/lib/deleteResults';
import { facetColumn } from '@/lib/facets';
import { useI18n } from '@/lib/i18n';
import { usePagination } from '@/lib/pagination';
import { DECISION_QUICK_FILTER_FIELDS } from '@/lib/quickFilters';
import { useSearchState } from '@/lib/searchState';
import { useTableColumns } from '@/lib/tableColumns';
import type { DecisionListItem, InstanceOperationResult, TableColumnId } from '@/types';

type DeleteAction =
  | { kind: 'single'; decision: DecisionListItem }
  | { kind: 'selected'; keys: string[] }
  | { kind: 'ip'; ip: string };

export function Decisions() {
  const { t } = useI18n();
  const { config } = useRefresh();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = useSearchState('decisions');
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const columns = useTableColumns('decisions');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<ErrorInfo | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<AddDecisionTarget | null>(null);
  const [deleteAction, setDeleteAction] = useState<DeleteAction | null>(null);
  const [deleteError, setDeleteError] = useState<ErrorInfo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [retryInstances, setRetryInstances] = useState<InstanceOperationResult[]>([]);

  const simulationsEnabled = config?.simulations_enabled === true;
  const canManage = config?.permissions?.can_manage_enforcement !== false;
  const instanceScope = searchParams.get('instance') || 'all';
  const multipleInstances = (config?.instances?.length ?? 0) > 1;
  const alertId = searchParams.get('alert_id');
  const status = search.getSelection('status');
  // Expired decisions are hidden unless asked for, also by a status filter that needs them
  const includeExpired = searchParams.get('include_expired') === 'true' || status.included.includes('expired') || status.excluded.includes('active');
  // Duplicates are hidden by default, but every decision of one alert is shown
  const showDuplicates = searchParams.get('hide_duplicates') === 'false' || Boolean(alertId);

  const serverFilters = useMemo(() => ({
    ...search.serverFilters,
    ...(alertId ? { alert_id: alertId } : {}),
    ...(includeExpired ? { include_expired: 'true' } : {}),
    ...(showDuplicates ? { hide_duplicates: 'false' } : {}),
  }), [alertId, includeExpired, search.serverFilters, showDuplicates]);
  const filtersKey = JSON.stringify(serverFilters);
  const decisions = useServerData(`${filtersKey}|${page}|${pageSize}`, () => fetchDecisionsPaginated(page, pageSize, serverFilters));
  const rows = decisions.data?.data ?? [];
  const selectableIds = useMemo(() => (decisions.data ? selectableKeys(decisions.data) : []), [decisions.data]);

  const setParam = (name: string, value: string | null) => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (value === null) params.delete(name);
      else params.set(name, value);
      params.delete('page');
      return params;
    });
  };

  const visibleColumns: TableColumnId[] = multipleInstances && instanceScope === 'all' && !columns.visible.includes('instance')
    ? ['instance', ...columns.visibleOrdered]
    : columns.visibleOrdered;

  const requestDelete = (action: DeleteAction) => {
    setDeleteError(null);
    setRetryInstances([]);
    setDeleteAction(action);
  };

  const confirmDelete = async () => {
    if (!deleteAction) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      let message: string | null = null;
      if (deleteAction.kind === 'single') {
        await deleteDecision(deleteAction.decision.id, multipleInstances || instanceScope !== 'all' ? deleteAction.decision.instance_id : undefined);
        setSelected((current) => {
          const next = new Set(current);
          next.delete(entityKey(deleteAction.decision));
          return next;
        });
      } else if (deleteAction.kind === 'selected') {
        const refs = deleteAction.keys.map(keyToRef);
        message = summarizeDeleteResult(await bulkDeleteDecisions(multipleInstances ? refs : refs.map((ref) => ref.id)), t);
        setSelected(new Set());
      } else {
        const result = retryInstances.length > 0
          ? combineDeleteResults(await Promise.all(retryInstances.map((instance) => cleanupByIp({ ip: deleteAction.ip, scope: 'instance', instance_id: instance.instance_id }))))
          : await cleanupByIp(!multipleInstances && instanceScope === 'all'
            ? deleteAction.ip
            : instanceScope === 'all' ? { ip: deleteAction.ip, scope: 'all' } : { ip: deleteAction.ip, scope: 'instance', instance_id: instanceScope });
        message = result.deleted_alerts === 0 && result.deleted_decisions === 0 && result.failed.length === 0
          ? t('pages.alerts.noAlertsOrDecisionsForIp', { ip: deleteAction.ip })
          : summarizeDeleteResult(result, t);
        setSelected(new Set());
        const failed = result.instance_results?.filter((instance) => !instance.success) ?? [];
        if (failed.length > 0) {
          const succeeded = result.instance_results?.filter((instance) => instance.success).map((instance) => instance.instance_name) ?? [];
          setRetryInstances(failed);
          setDeleteError({ message: t('common.partialInstanceFailure', { succeeded: succeeded.join(', ') || '—', failed: failed.map((instance) => instance.instance_name).join(', ') }) });
          decisions.reload();
          return;
        }
      }
      setDeleteAction(null);
      setRetryInstances([]);
      decisions.reload();
      if (message) setNotice({ message });
    } catch (error) {
      const fallback = deleteAction.kind === 'single' ? 'pages.decisions.deleteFailed' : deleteAction.kind === 'selected' ? 'pages.decisions.deleteSelectedFailed' : 'pages.alerts.deleteIpFailed';
      setDeleteError(toErrorInfo(error, t(fallback)));
    } finally {
      setDeleting(false);
    }
  };

  const buildColumns = (): Column<DecisionListItem>[] => {
    const definitions: Partial<Record<TableColumnId, Column<DecisionListItem>>> = {
      id: { id: 'id', header: t('tableColumns.id'), cell: (row) => <span className="font-mono text-sm text-kumo-subtle">#{row.id}</span> },
      instance: { id: 'instance', header: t('tableColumns.instance'), cell: (row) => <InstanceCell id={row.instance_id} name={row.instance_name} /> },
      time: { id: 'time', header: t('tableColumns.time'), cell: (row) => <TimeCell timestamp={row.created_at} /> },
      scenario: {
        id: 'scenario',
        header: t('tableColumns.scenario'),
        className: 'max-w-64',
        cell: (row) => (
          <div className="flex min-w-0 items-center gap-1.5">
            <ScenarioName name={row.scenario} simulated={simulationsEnabled && row.simulated === true} showLink />
            {row.is_duplicate ? <span title={t('pages.decisions.duplicates')}><Badge variant="outline">{t('pages.decisions.duplicate')}</Badge></span> : null}
          </div>
        ),
      },
      kind: { id: 'kind', header: t('tableColumns.kind'), cell: (row) => <TextCell value={row.kind} /> },
      country: { id: 'country', header: t('tableColumns.country'), className: 'max-w-44', cell: (row) => <CountryCell code={row.detail.country} /> },
      region: { id: 'region', header: t('tableColumns.region'), className: 'max-w-44', cell: (row) => <TextCell value={row.detail.region} /> },
      city: { id: 'city', header: t('tableColumns.city'), className: 'max-w-40', cell: (row) => <TextCell value={row.detail.city} /> },
      as: { id: 'as', header: t('tableColumns.as'), className: 'max-w-44', cell: (row) => <TextCell value={row.detail.as} /> },
      source: { id: 'source', header: t('tableColumns.source'), className: 'max-w-52', cell: (row) => <IpCell value={row.value} /> },
      action: { id: 'action', header: t('tableColumns.action'), cell: (row) => <Badge variant="red">{row.detail.action || 'ban'}</Badge> },
      expiration: { id: 'expiration', header: t('tableColumns.expiration'), cell: (row) => <ExpirationCell decision={row} /> },
      target: { id: 'target', header: t('tableColumns.target'), className: 'max-w-48', cell: (row) => <TargetCell target={row.detail.target} targetCount={row.detail.target_count} /> },
      machine: { id: 'machine', header: t('tableColumns.machine'), className: 'max-w-36', cell: (row) => <TextCell value={row.machine} /> },
      origin: { id: 'origin', header: t('tableColumns.origin'), className: 'max-w-36', cell: (row) => <TextCell value={row.detail.origin} /> },
      alert: {
        id: 'alert',
        header: t('tableColumns.alert'),
        cell: (row) => {
          const linkedAlert = row.detail.alert_id;
          if (!linkedAlert) return <span className="text-kumo-subtle">{EMPTY_CELL}</span>;
          const params = new URLSearchParams({ id: String(linkedAlert), alert_instance: row.instance_id || 'default', instance: instanceScope });
          return (
            <KumoLink href={`/alerts?${params}`} className="font-mono text-sm" title={t('pages.decisions.viewAlert', { id: linkedAlert })}>
              #{linkedAlert}
            </KumoLink>
          );
        },
      },
    };
    const ordered = visibleColumns.map((id) => definitions[id]).filter((column): column is Column<DecisionListItem> => Boolean(column));
    if (!canManage) return ordered;
    return [...ordered, {
      id: 'actions',
      header: <span className="sr-only">{t('tableColumns.actions')}</span>,
      className: 'w-0 text-end',
      sticky: true,
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenu.Trigger render={<Button variant="ghost" size="sm" shape="square" icon={<DotsThreeIcon weight="bold" />} aria-label={t('tableColumns.actions')} />} />
          <DropdownMenu.Content align="end">
            {row.value ? (
              <DropdownMenu.Item variant="danger" icon={ShieldSlashIcon} onClick={() => requestDelete({ kind: 'ip', ip: row.value! })}>
                {t('common.deleteAllForIp')}
              </DropdownMenu.Item>
            ) : null}
            <DropdownMenu.Item variant="danger" icon={TrashIcon} onClick={() => requestDelete({ kind: 'single', decision: row })}>
              {t('pages.decisions.deleteDecision')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      ),
    }];
  };
  const tableColumns = buildColumns();

  const total = decisions.data?.pagination.total ?? 0;
  const unfiltered = decisions.data?.pagination.unfiltered_total ?? 0;
  const filterFields = useMemo(
    () => [...DECISION_QUICK_FILTER_FIELDS].sort((a, b) => columns.order.indexOf(facetColumn(a)) - columns.order.indexOf(facetColumn(b))),
    [columns.order],
  );

  const deleteDescription = deleteAction?.kind === 'single'
    ? <>{t('pages.decisions.deleteDecisionConfirmPrefix')} <span className="font-mono font-medium text-kumo-strong">#{deleteAction.decision.id}</span>? {t('common.actionCannotBeUndone')}</>
    : deleteAction?.kind === 'ip'
      ? <>{t('common.deleteIpConfirmPrefix')} <span className="font-mono font-medium text-kumo-strong">{deleteAction.ip}</span>? {t('common.actionCannotBeUndone')}</>
      : t('pages.decisions.deleteSelectedConfirm', { count: deleteAction?.kind === 'selected' ? deleteAction.keys.length : 0 });

  return (
    <>
      <PageHeader
        title={t('pages.decisions.title')}
        description={t('pages.decisions.description')}
        meta={decisions.data ? (
          <span className="numeric">
            {total !== unfiltered
              ? t('pages.decisions.matchingOf', { count: total.toLocaleString(), total: unfiltered.toLocaleString() })
              : t('pages.decisions.count', { count: total.toLocaleString() })}
          </span>
        ) : null}
        actions={canManage ? (
          <Button variant="primary" icon={<PlusIcon />} onClick={() => setDecisionTarget({ initial: { ip: '', duration: '4h', reason: '' }, instanceId: instanceScope !== 'all' ? instanceScope : undefined })}>
            {t('pages.decisions.addDecision')}
          </Button>
        ) : null}
      />
      <FilterBar
        search={search}
        fields={filterFields}
        simulationsEnabled={simulationsEnabled}
        actions={<ColumnPicker order={columns.order} visible={columns.visible} onChange={columns.update} />}
        extra={(
          <>
            {alertId ? (
              <div className="flex h-7 items-center rounded-md bg-kumo-base text-sm ring ring-kumo-line">
                <span className="ps-2.5 pe-2">{t('pages.decisions.ofAlert', { id: alertId })}</span>
                <button
                  type="button"
                  aria-label={t('pages.decisions.clearAlertFilter')}
                  onClick={() => setParam('alert_id', null)}
                  className="flex h-full items-center rounded-e-md border-s border-kumo-line px-1.5 text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
            ) : null}
            <Switch size="sm" label={t('pages.decisions.showExpired')} checked={includeExpired} onCheckedChange={(checked: boolean) => setParam('include_expired', checked ? 'true' : null)} />
            <Switch size="sm" label={t('pages.decisions.showDuplicates')} checked={showDuplicates} disabled={Boolean(alertId)} onCheckedChange={(checked: boolean) => setParam('hide_duplicates', checked ? 'false' : null)} />
          </>
        )}
      />
      {notice ? <ErrorAlert error={notice} onDismiss={() => setNotice(null)} /> : null}
      <DataTable
        label={t('pages.decisions.title')}
        columns={tableColumns}
        data={rows}
        getRowId={entityKey}
        loading={decisions.loading}
        busy={decisions.busy}
        error={decisions.error && !decisions.data ? toErrorInfo(decisions.error, t('components.table.loadFailed')).message : null}
        onRetry={decisions.reload}
        empty={<Empty size="sm" title={t('pages.decisions.noDecisions')} description={search.query || alertId ? t('components.table.noMatches') : undefined} />}
        pagination={{ page, pageSize, total, onPageChange: setPage, onPageSizeChange: setPageSize }}
        selection={canManage ? {
          selectableIds,
          selected,
          onChange: setSelected,
          actions: (keys) => (
            <Button size="sm" variant="destructive" icon={<TrashIcon />} onClick={() => requestDelete({ kind: 'selected', keys })}>
              {t('pages.decisions.deleteSelected')}
            </Button>
          ),
        } : undefined}
      />
      {decisionTarget ? <AddDecisionDialog target={decisionTarget} onClose={() => setDecisionTarget(null)} onAdded={decisions.reload} /> : null}
      <ConfirmDeleteDialog
        open={deleteAction !== null}
        title={deleteAction?.kind === 'single' ? t('pages.decisions.deleteDecisionTitle') : deleteAction?.kind === 'ip' ? t('pages.alerts.deleteAllIpTitle') : t('pages.decisions.deleteSelectedTitle')}
        description={deleteDescription}
        error={deleteError}
        busy={deleting}
        confirmLabel={retryInstances.length > 0 ? t('common.retryFailedInstances') : undefined}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteAction(null)}
      />
    </>
  );
}
