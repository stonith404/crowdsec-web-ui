import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DotsThreeIcon, GavelIcon, ShieldSlashIcon, TrashIcon } from '@phosphor-icons/react';
import { Badge, Button, DropdownMenu, Empty, Link as KumoLink } from '@cloudflare/kumo';
import { resolveMachineName } from '../../../shared/machine';
import { collectDistinctOrigins, getOriginDisplayValue, getOriginTitle } from '../../../shared/origin';
import { AddDecisionDialog, type AddDecisionTarget } from '@/components/add-decision-dialog';
import { AlertDetails } from '@/components/alerts/alert-details';
import { CountryCell, EMPTY_CELL, InstanceCell, IpCell, ScenarioName, TargetCell, TextCell, TimeCell } from '@/components/cells';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { ColumnPicker } from '@/components/data-table/column-picker';
import { DataTable, type Column } from '@/components/data-table/data-table';
import { ErrorAlert } from '@/components/error-alert';
import { toErrorInfo, type ErrorInfo } from '@/lib/errors';
import { FilterBar } from '@/components/filters/filter-bar';
import { PageHeader } from '@/components/page-header';
import { useRefresh } from '@/contexts/useRefresh';
import { useServerData } from '@/hooks/use-server-data';
import { decisionListHref, getAlertSourceValue } from '@/lib/alerts';
import { bulkDeleteAlerts, cleanupByIp, deleteAlert, fetchAlertsPaginated } from '@/lib/api';
import { combineDeleteResults, entityKey, keyToRef, selectableKeys, summarizeDeleteResult } from '@/lib/deleteResults';
import { facetColumn } from '@/lib/facets';
import { useI18n } from '@/lib/i18n';
import { usePagination } from '@/lib/pagination';
import { ALERT_QUICK_FILTER_FIELDS } from '@/lib/quickFilters';
import { useSearchState } from '@/lib/searchState';
import { isSimulatedAlert } from '@/lib/simulation';
import { useTableColumns } from '@/lib/tableColumns';
import type { AlertRecord, InstanceOperationResult, SimulationFilter, SlimAlert, TableColumnId } from '@/types';

type DeleteAction =
  | { kind: 'single'; alert: SlimAlert | AlertRecord }
  | { kind: 'selected'; keys: string[] }
  | { kind: 'ip'; ip: string };

function decisionCounts(alert: SlimAlert, simulation: SimulationFilter) {
  const summary = alert.decision_summary;
  if (summary) {
    if (simulation === 'simulated') return { active: summary.simulated_active_count, expired: summary.simulated_expired_count };
    if (simulation === 'live') {
      return { active: summary.active_count - summary.simulated_active_count, expired: summary.expired_count - summary.simulated_expired_count };
    }
    return { active: summary.active_count, expired: summary.expired_count };
  }
  const decisions = simulation === 'all' ? alert.decisions : alert.decisions.filter((decision) => (simulation === 'simulated') === (decision.simulated === true));
  return { active: decisions.filter((decision) => decision.expired !== true).length, expired: decisions.filter((decision) => decision.expired === true).length };
}

export function Alerts() {
  const { t } = useI18n();
  const { config } = useRefresh();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = useSearchState('alerts');
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const columns = useTableColumns('alerts');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<ErrorInfo | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<AddDecisionTarget | null>(null);
  const [decisionsVersion, setDecisionsVersion] = useState(0);
  const [deleteAction, setDeleteAction] = useState<DeleteAction | null>(null);
  const [deleteError, setDeleteError] = useState<ErrorInfo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [retryInstances, setRetryInstances] = useState<InstanceOperationResult[]>([]);

  const simulationsEnabled = config?.simulations_enabled === true;
  const canManage = config?.permissions?.can_manage_enforcement !== false;
  const instanceScope = searchParams.get('instance') || 'all';
  const multipleInstances = (config?.instances?.length ?? 0) > 1;
  const simulation: SimulationFilter = simulationsEnabled && (search.simulation === 'live' || search.simulation === 'simulated') ? search.simulation : 'all';
  const openId = searchParams.get('id');
  const openInstance = searchParams.get('alert_instance') ?? (instanceScope !== 'all' ? instanceScope : undefined);

  const filtersKey = JSON.stringify(search.serverFilters);
  const alerts = useServerData(`${filtersKey}|${page}|${pageSize}`, () => fetchAlertsPaginated(page, pageSize, search.serverFilters));
  const rows = alerts.data?.data ?? [];
  const selectableIds = useMemo(() => (alerts.data ? selectableKeys(alerts.data) : []), [alerts.data]);

  // Combined views show which instance a row comes from, even when the column is hidden
  const visibleColumns: TableColumnId[] = multipleInstances && instanceScope === 'all' && !columns.visible.includes('instance')
    ? ['instance', ...columns.visibleOrdered]
    : columns.visibleOrdered;

  const openAlert = (alert: SlimAlert) => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set('id', String(alert.id));
      if (alert.instance_id) params.set('alert_instance', alert.instance_id);
      return params;
    });
  };

  const closeAlert = () => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.delete('id');
      params.delete('alert_instance');
      return params;
    });
  };

  const openDecision = (alert: SlimAlert | AlertRecord) => {
    const ip = alert.source?.ip?.trim();
    if (!ip) return;
    setDecisionTarget({ initial: { ip, duration: '4h', reason: alert.scenario?.trim() || 'manual' }, instanceId: alert.instance_id });
  };

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
        const result = await deleteAlert(deleteAction.alert.id, multipleInstances || instanceScope !== 'all' ? deleteAction.alert.instance_id : undefined);
        message = result ? summarizeDeleteResult(result, t) : null;
        if (openId === String(deleteAction.alert.id)) closeAlert();
        setSelected((current) => {
          const next = new Set(current);
          next.delete(entityKey(deleteAction.alert));
          return next;
        });
      } else if (deleteAction.kind === 'selected') {
        const refs = deleteAction.keys.map(keyToRef);
        const result = await bulkDeleteAlerts(multipleInstances ? refs : refs.map((ref) => ref.id));
        message = summarizeDeleteResult(result, t);
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
          alerts.reload();
          return;
        }
        if (openId && getAlertSourceValue(rows.find((row) => String(row.id) === openId)) === deleteAction.ip) closeAlert();
      }
      setDeleteAction(null);
      setRetryInstances([]);
      alerts.reload();
      if (message) setNotice({ message });
    } catch (error) {
      const fallback = deleteAction.kind === 'single' ? 'pages.alerts.deleteFailed' : deleteAction.kind === 'selected' ? 'pages.alerts.deleteSelectedFailed' : 'pages.alerts.deleteIpFailed';
      setDeleteError(toErrorInfo(error, t(fallback)));
    } finally {
      setDeleting(false);
    }
  };

  const buildColumns = (): Column<SlimAlert>[] => {
    const definitions: Record<TableColumnId, Column<SlimAlert> | undefined> = {
      id: { id: 'id', header: t('tableColumns.id'), cell: (row) => <span className="font-mono text-sm text-kumo-subtle">#{row.id}</span> },
      instance: { id: 'instance', header: t('tableColumns.instance'), cell: (row) => <InstanceCell id={row.instance_id} name={row.instance_name} /> },
      time: { id: 'time', header: t('tableColumns.time'), cell: (row) => <TimeCell timestamp={row.created_at} /> },
      scenario: {
        id: 'scenario',
        header: t('tableColumns.scenario'),
        className: 'max-w-64',
        cell: (row) => <ScenarioName name={row.scenario} simulated={simulationsEnabled && isSimulatedAlert(row)} showLink />,
      },
      kind: { id: 'kind', header: t('tableColumns.kind'), cell: (row) => <TextCell value={row.kind} /> },
      country: { id: 'country', header: t('tableColumns.country'), className: 'max-w-44', cell: (row) => <CountryCell code={row.source?.cn} /> },
      region: { id: 'region', header: t('tableColumns.region'), className: 'max-w-44', cell: (row) => <TextCell value={row.source?.region} /> },
      city: { id: 'city', header: t('tableColumns.city'), className: 'max-w-40', cell: (row) => <TextCell value={row.source?.city} /> },
      as: { id: 'as', header: t('tableColumns.as'), className: 'max-w-44', cell: (row) => <TextCell value={row.source?.as_name} /> },
      source: { id: 'source', header: t('tableColumns.source'), className: 'max-w-52', cell: (row) => <IpCell value={getAlertSourceValue(row)} /> },
      target: { id: 'target', header: t('tableColumns.target'), className: 'max-w-48', cell: (row) => <TargetCell target={row.target} targetCount={row.target_count} /> },
      machine: { id: 'machine', header: t('tableColumns.machine'), className: 'max-w-36', cell: (row) => <TextCell value={resolveMachineName(row)} /> },
      origin: {
        id: 'origin',
        header: t('tableColumns.origin'),
        className: 'max-w-36',
        cell: (row) => {
          const origins = row.decision_summary?.origins ?? collectDistinctOrigins(row.decisions);
          return origins.length ? <span className="block truncate" title={getOriginTitle(origins)}>{getOriginDisplayValue(origins)}</span> : <span className="text-kumo-subtle">{EMPTY_CELL}</span>;
        },
      },
      decisions: {
        id: 'decisions',
        header: t('tableColumns.decisions'),
        cell: (row) => {
          const counts = decisionCounts(row, simulation);
          if (counts.active === 0 && counts.expired === 0) return <span className="text-kumo-subtle">{EMPTY_CELL}</span>;
          return (
            <div className="flex gap-1.5">
              {counts.active > 0 ? (
                <KumoLink href={decisionListHref(row.id, { simulation, instanceId: row.instance_id })} variant="plain" title={t('pages.alerts.viewActiveDecisions', { count: counts.active })}>
                  <Badge variant="info">{t('common.active')} {counts.active}</Badge>
                </KumoLink>
              ) : null}
              {counts.expired > 0 ? (
                <KumoLink href={decisionListHref(row.id, { includeExpired: true, simulation, instanceId: row.instance_id })} variant="plain" title={t('pages.alerts.viewExpiredDecisions', { count: counts.expired })}>
                  <Badge variant="secondary">{t('common.inactive')} {counts.expired}</Badge>
                </KumoLink>
              ) : null}
            </div>
          );
        },
      },
      action: undefined,
      expiration: undefined,
      alert: undefined,
    };
    const ordered = visibleColumns.map((id) => definitions[id]).filter((column): column is Column<SlimAlert> => Boolean(column));
    if (!canManage) return ordered;
    return [...ordered, {
      id: 'actions',
      header: <span className="sr-only">{t('tableColumns.actions')}</span>,
      className: 'w-0 text-end',
      sticky: true,
      cell: (row) => {
        const sourceValue = getAlertSourceValue(row);
        return (
          <DropdownMenu>
            <DropdownMenu.Trigger render={<Button variant="ghost" size="sm" shape="square" icon={<DotsThreeIcon weight="bold" />} aria-label={t('tableColumns.actions')} />} />
            <DropdownMenu.Content align="end">
              {row.source?.ip ? (
                <DropdownMenu.Item icon={GavelIcon} onClick={() => openDecision(row)}>{t('pages.decisions.addDecision')}</DropdownMenu.Item>
              ) : null}
              <DropdownMenu.Separator />
              {sourceValue ? (
                <DropdownMenu.Item variant="danger" icon={ShieldSlashIcon} onClick={() => requestDelete({ kind: 'ip', ip: sourceValue })}>
                  {t('common.deleteAllForIp')}
                </DropdownMenu.Item>
              ) : null}
              <DropdownMenu.Item variant="danger" icon={TrashIcon} onClick={() => requestDelete({ kind: 'single', alert: row })}>
                {t('pages.alerts.deleteAlert')}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu>
        );
      },
    }];
  };
  const tableColumns = buildColumns();

  const total = alerts.data?.pagination.total ?? 0;
  const unfiltered = alerts.data?.pagination.unfiltered_total ?? 0;
  const filterFields = useMemo(
    () => [...ALERT_QUICK_FILTER_FIELDS].sort((a, b) => columns.order.indexOf(facetColumn(a)) - columns.order.indexOf(facetColumn(b))),
    [columns.order],
  );

  const deleteDescription = deleteAction?.kind === 'single'
    ? <>{t('pages.alerts.deleteAlertConfirmPrefix')} <span className="font-mono font-medium text-kumo-strong">#{deleteAction.alert.id}</span>? {t('pages.alerts.deleteAlertConfirmSuffix')}</>
    : deleteAction?.kind === 'ip'
      ? <>{t('common.deleteIpConfirmPrefix')} <span className="font-mono font-medium text-kumo-strong">{deleteAction.ip}</span>? {t('common.actionCannotBeUndone')}</>
      : t('pages.alerts.deleteSelectedConfirm', { count: deleteAction?.kind === 'selected' ? deleteAction.keys.length : 0 });

  return (
    <>
      <PageHeader
        title={t('pages.alerts.title')}
        description={t('pages.alerts.description')}
        meta={alerts.data ? (
          <span className="numeric">
            {total !== unfiltered
              ? t('pages.alerts.matchingOf', { count: total.toLocaleString(), total: unfiltered.toLocaleString() })
              : t('pages.alerts.count', { count: total.toLocaleString() })}
          </span>
        ) : null}
      />
      <FilterBar
        search={search}
        fields={filterFields}
        simulationsEnabled={simulationsEnabled}
        actions={<ColumnPicker order={columns.order} visible={columns.visible} onChange={columns.update} />}
      />
      {notice ? <ErrorAlert error={notice} onDismiss={() => setNotice(null)} /> : null}
      <DataTable
        label={t('pages.alerts.title')}
        columns={tableColumns}
        data={rows}
        getRowId={entityKey}
        loading={alerts.loading}
        busy={alerts.busy}
        error={alerts.error && !alerts.data ? toErrorInfo(alerts.error, t('components.table.loadFailed')).message : null}
        onRetry={alerts.reload}
        empty={<Empty size="sm" title={t('pages.alerts.noAlerts')} description={search.query ? t('components.table.noMatches') : undefined} />}
        pagination={{ page, pageSize, total, onPageChange: setPage, onPageSizeChange: setPageSize }}
        selection={canManage ? {
          selectableIds,
          selected,
          onChange: setSelected,
          actions: (keys) => (
            <Button size="sm" variant="destructive" icon={<TrashIcon />} onClick={() => requestDelete({ kind: 'selected', keys })}>
              {t('pages.alerts.deleteSelected')}
            </Button>
          ),
        } : undefined}
        onRowClick={openAlert}
        isRowActive={(alert) => String(alert.id) === openId}
      />
      <AlertDetails
        alert={rows.find((row) => String(row.id) === openId && (!openInstance || row.instance_id === openInstance)) ?? null}
        id={openId}
        instanceId={openInstance}
        onClose={closeAlert}
        canManage={canManage}
        onAddDecision={openDecision}
        onDelete={(alert) => requestDelete({ kind: 'single', alert })}
        onDeleteIp={(ip) => requestDelete({ kind: 'ip', ip })}
        decisionsVersion={decisionsVersion}
      />
      {decisionTarget ? (
        <AddDecisionDialog
          target={decisionTarget}
          onClose={() => setDecisionTarget(null)}
          onAdded={() => {
            alerts.reload();
            setDecisionsVersion((version) => version + 1);
          }}
        />
      ) : null}
      <ConfirmDeleteDialog
        open={deleteAction !== null}
        title={deleteAction?.kind === 'single' ? t('pages.alerts.deleteAlertTitle') : deleteAction?.kind === 'ip' ? t('pages.alerts.deleteAllIpTitle') : t('pages.alerts.deleteSelectedTitle')}
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
