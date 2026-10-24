import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ArrowSquareOutIcon, CrosshairIcon, DotsThreeIcon, GaugeIcon, GavelIcon, ShieldSlashIcon, ShieldWarningIcon } from '@phosphor-icons/react';
import { Badge, Button, DropdownMenu, Empty, LayerCard, LinkButton } from '@cloudflare/kumo';
import { resolveMachineName } from '../../../shared/machine';
import { AddDecisionDialog, type AddDecisionTarget } from '@/components/add-decision-dialog';
import { AlertDetails } from '@/components/alerts/alert-details';
import { EMPTY_CELL, ExpirationCell, InstanceCell, ScenarioName, TargetCell, TextCell, TimeCell } from '@/components/cells';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { CountryFlag } from '@/components/country-flag';
import { KpiCell } from '@/components/dashboard/kpi-card';
import { TopListCard, type TopListItem } from '@/components/dashboard/top-list-card';
import { DataTable, type Column } from '@/components/data-table/data-table';
import { ErrorAlert } from '@/components/error-alert';
import { PageHeader } from '@/components/page-header';
import { useRefresh } from '@/contexts/useRefresh';
import { useServerData } from '@/hooks/use-server-data';
import { cleanupByIp, deleteAlert, fetchAlertsPaginated, fetchDashboardStats, fetchDecisionsPaginated } from '@/lib/api';
import { getBrowserTimeZone, useDateTime } from '@/lib/dateTime';
import { entityKey, summarizeDeleteResult } from '@/lib/deleteResults';
import { toErrorInfo, type ErrorInfo } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import type { AlertRecord, DashboardStatsResponse, DecisionListItem, SlimAlert } from '@/types';

const TABLE_PAGE_SIZE = 25;
const TOP_LIST_SIZE = 6;

type DeleteAction = { kind: 'alert'; alert: SlimAlert | AlertRecord } | { kind: 'ip' };

/** Everything this UI knows about one source IP: its activity, what it triggered and how it is blocked */
export function IpProfile() {
  const { t } = useI18n();
  const { formatDate } = useDateTime();
  const { config } = useRefresh();
  const { ip = '' } = useParams();
  const [searchParams] = useSearchParams();
  const [alertsPage, setAlertsPage] = useState(1);
  const [alertsPageSize, setAlertsPageSize] = useState(TABLE_PAGE_SIZE);
  const [decisionsPage, setDecisionsPage] = useState(1);
  const [decisionsPageSize, setDecisionsPageSize] = useState(TABLE_PAGE_SIZE);
  const [openAlert, setOpenAlert] = useState<SlimAlert | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<AddDecisionTarget | null>(null);
  const [decisionsVersion, setDecisionsVersion] = useState(0);
  const [deleteAction, setDeleteAction] = useState<DeleteAction | null>(null);
  const [deleteError, setDeleteError] = useState<ErrorInfo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<ErrorInfo | null>(null);

  const instanceScope = searchParams.get('instance') || 'all';
  const multipleInstances = (config?.instances?.length ?? 0) > 1;
  const showInstance = multipleInstances && instanceScope === 'all';
  const canManage = config?.permissions?.can_manage_enforcement !== false;
  const query = `ip:"${ip}"`;
  const filters = useMemo(() => {
    const result: Record<string, string> = { q: query, instance: instanceScope, tz_offset: String(new Date().getTimezoneOffset()) };
    const browserTimeZone = getBrowserTimeZone();
    if (browserTimeZone) result.browser_tz = browserTimeZone;
    return result;
  }, [instanceScope, query]);
  const filtersKey = JSON.stringify(filters);

  const stats = useServerData<DashboardStatsResponse>(filtersKey, (signal) => fetchDashboardStats({ ...filters, decision_q: query, granularity: 'day' }, { signal }));
  const alerts = useServerData(`${filtersKey}|${alertsPage}|${alertsPageSize}`, () => fetchAlertsPaginated(alertsPage, alertsPageSize, filters));
  const decisions = useServerData(
    `${filtersKey}|${decisionsPage}|${decisionsPageSize}|${decisionsVersion}`,
    () => fetchDecisionsPaginated(decisionsPage, decisionsPageSize, { ...filters, include_expired: 'true', hide_duplicates: 'false' }),
  );
  // The statistics count duplicate decisions once, so the figure comes from the same list the table shows
  const active = useServerData(`${filtersKey}|${decisionsVersion}`, () => fetchDecisionsPaginated(1, 1, { ...filters, hide_duplicates: 'false' }));
  const data = stats.data;

  // The server answers with a pending placeholder while it builds the statistics, and says when to ask again
  const reloadStats = stats.reload;
  useEffect(() => {
    if (!data?.pending) return;
    const timeout = window.setTimeout(reloadStats, data.retryAfterMs ?? 1500);
    return () => window.clearTimeout(timeout);
  }, [data, reloadStats]);

  const loading = stats.loading || (data?.pending === true && !data.stale);
  const alertTotal = alerts.data?.pagination.total ?? 0;
  const activeDecisions = active.data?.pagination.total ?? 0;
  const activity = useMemo(() => (data?.series.alertsHistory ?? []).map((bucket, index) => ({
    ...bucket,
    count: bucket.count + (data?.series.simulatedAlertsHistory[index]?.count ?? 0),
  })), [data]);
  const activeBuckets = activity.filter((bucket) => bucket.count > 0);
  const firstSeen = activeBuckets[0]?.fullDate;
  const lastSeen = activeBuckets.at(-1)?.fullDate;
  const country = data?.topCountries[0];
  const network = data?.topAS[0];
  const scoped = (path: string) => `${path}?${new URLSearchParams({ q: query, ...(instanceScope !== 'all' ? { instance: instanceScope } : {}) })}`;

  const toItems = (items: DashboardStatsResponse['topScenarios'], scenario: boolean): TopListItem[] => items.slice(0, TOP_LIST_SIZE).map((item) => ({
    value: item.value ?? item.label,
    count: item.count,
    title: item.label,
    label: scenario ? <ScenarioName name={item.label} className="flex-row items-baseline gap-2" /> : item.label,
  }));

  const addDecision = () => setDecisionTarget({
    initial: { ip, duration: '4h', reason: 'manual' },
    instanceId: instanceScope !== 'all' ? instanceScope : undefined,
  });

  const requestDelete = (action: DeleteAction) => {
    setDeleteError(null);
    setDeleteAction(action);
  };

  const reloadAll = () => {
    stats.reload();
    alerts.reload();
    setDecisionsVersion((version) => version + 1);
  };

  const confirmDelete = async () => {
    if (!deleteAction) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = deleteAction.kind === 'alert'
        ? await deleteAlert(deleteAction.alert.id, multipleInstances || instanceScope !== 'all' ? deleteAction.alert.instance_id : undefined)
        : await cleanupByIp(!multipleInstances && instanceScope === 'all'
          ? ip
          : instanceScope === 'all' ? { ip, scope: 'all' } : { ip, scope: 'instance', instance_id: instanceScope });
      const message = result ? summarizeDeleteResult(result, t) : null;
      if (message) setNotice({ message });
      setOpenAlert(null);
      setDeleteAction(null);
      reloadAll();
    } catch (error) {
      setDeleteError(toErrorInfo(error, t(deleteAction.kind === 'alert' ? 'pages.alerts.deleteFailed' : 'pages.alerts.deleteIpFailed')));
    } finally {
      setDeleting(false);
    }
  };

  const alertColumns: Column<SlimAlert>[] = [
    ...(showInstance ? [{ id: 'instance', header: t('tableColumns.instance'), cell: (row: SlimAlert) => <InstanceCell id={row.instance_id} name={row.instance_name} /> }] : []),
    { id: 'time', header: t('tableColumns.time'), cell: (row) => <TimeCell timestamp={row.created_at} /> },
    { id: 'scenario', header: t('tableColumns.scenario'), className: 'max-w-72', cell: (row) => <ScenarioName name={row.scenario} showLink /> },
    { id: 'target', header: t('tableColumns.target'), className: 'max-w-48', cell: (row) => <TargetCell target={row.target} targetCount={row.target_count} /> },
    { id: 'machine', header: t('tableColumns.machine'), className: 'max-w-36', cell: (row) => <TextCell value={resolveMachineName(row)} /> },
    {
      id: 'decisions',
      header: t('tableColumns.decisions'),
      cell: (row) => {
        const active = row.decision_summary?.active_count ?? row.decisions.filter((decision) => decision.expired !== true).length;
        return active > 0 ? <Badge variant="info">{t('common.active')} {active}</Badge> : <span className="text-kumo-subtle">{EMPTY_CELL}</span>;
      },
    },
  ];

  const decisionColumns: Column<DecisionListItem>[] = [
    ...(showInstance ? [{ id: 'instance', header: t('tableColumns.instance'), cell: (row: DecisionListItem) => <InstanceCell id={row.instance_id} name={row.instance_name} /> }] : []),
    { id: 'time', header: t('tableColumns.time'), cell: (row) => <TimeCell timestamp={row.created_at} /> },
    { id: 'scenario', header: t('tableColumns.scenario'), className: 'max-w-72', cell: (row) => <ScenarioName name={row.scenario} showLink /> },
    { id: 'action', header: t('tableColumns.action'), cell: (row) => <Badge variant="red">{row.detail.action || 'ban'}</Badge> },
    { id: 'expiration', header: t('tableColumns.expiration'), cell: (row) => <ExpirationCell decision={row} /> },
    { id: 'origin', header: t('tableColumns.origin'), className: 'max-w-36', cell: (row) => <TextCell value={row.detail.origin} /> },
  ];

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{ip}</span>}
        meta={(
          <>
            {active.loading ? null : activeDecisions > 0
              ? <Badge variant="error">{t('pages.ip.blocked')}</Badge>
              : <Badge variant="secondary">{t('pages.ip.notBlocked')}</Badge>}
            {country ? (
              <span className="flex items-center gap-1.5">
                <CountryFlag code={country.countryCode} className="h-3 w-4" />
                {country.label}
              </span>
            ) : null}
            {network ? <span>{network.label}</span> : null}
          </>
        )}
        actions={(
          <>
            <LinkButton href={`https://app.crowdsec.net/cti/${encodeURIComponent(ip)}`} target="_blank" rel="noopener noreferrer" icon={<ArrowSquareOutIcon />}>
              {t('pages.alerts.viewOnCti')}
            </LinkButton>
            {canManage ? (
              <>
                <Button variant="primary" icon={<GavelIcon />} onClick={addDecision}>{t('pages.decisions.addDecision')}</Button>
                <DropdownMenu>
                  <DropdownMenu.Trigger render={<Button shape="square" icon={<DotsThreeIcon weight="bold" />} aria-label={t('tableColumns.actions')} />} />
                  <DropdownMenu.Content align="end">
                    <DropdownMenu.Item variant="danger" icon={ShieldSlashIcon} onClick={() => requestDelete({ kind: 'ip' })}>{t('common.deleteAllForIp')}</DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu>
              </>
            ) : null}
          </>
        )}
      />
      {notice ? <ErrorAlert error={notice} onDismiss={() => setNotice(null)} /> : null}

      <LayerCard>
        <LayerCard.Secondary className="py-3 text-kumo-default">
          <GaugeIcon className="size-4" />
          {t('pages.dashboard.overview')}
        </LayerCard.Secondary>
        <LayerCard.Primary className="grid gap-0 divide-y divide-kumo-hairline p-0 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          <KpiCell
            label={t('pages.dashboard.totalAlerts')}
            loading={alerts.loading}
            value={alertTotal.toLocaleString()}
            href={scoped('/alerts')}
            linkLabel={t('pages.dashboard.viewAlerts')}
            sparkline={activity.map((bucket) => bucket.count)}
          />
          <KpiCell
            label={t('pages.dashboard.activeDecisions')}
            loading={active.loading}
            value={activeDecisions.toLocaleString()}
            href={scoped('/decisions')}
            linkLabel={t('pages.dashboard.viewDecisions')}
          />
          <KpiCell
            label={t('pages.ip.firstSeen')}
            info={config ? t('pages.ip.seenInfo', { period: config.lookback_period }) : undefined}
            loading={loading}
            value={firstSeen ? formatDate(firstSeen) : EMPTY_CELL}
          />
          <KpiCell label={t('pages.ip.lastSeen')} loading={loading} value={lastSeen ? formatDate(lastSeen) : EMPTY_CELL} />
        </LayerCard.Primary>
      </LayerCard>

      <div className="grid gap-6 md:grid-cols-2">
        <TopListCard
          title={t('pages.dashboard.topScenarios')}
          icon={<ShieldWarningIcon className="size-4" />}
          items={toItems(data?.topScenarios ?? [], true)}
          total={alertTotal}
          selected={[]}
          loading={loading}
        />
        <TopListCard
          title={t('pages.dashboard.topTargets')}
          icon={<CrosshairIcon className="size-4" />}
          items={toItems(data?.topTargets ?? [], false)}
          total={alertTotal}
          selected={[]}
          loading={loading}
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('pages.alerts.title')}</h2>
        <DataTable
          label={t('pages.alerts.title')}
          columns={alertColumns}
          data={alerts.data?.data ?? []}
          getRowId={entityKey}
          loading={alerts.loading}
          busy={alerts.busy}
          error={alerts.error && !alerts.data ? toErrorInfo(alerts.error, t('components.table.loadFailed')).message : null}
          onRetry={alerts.reload}
          empty={<Empty size="sm" title={t('pages.alerts.noAlerts')} />}
          pagination={{ page: alertsPage, pageSize: alertsPageSize, total: alertTotal, onPageChange: setAlertsPage, onPageSizeChange: (size) => { setAlertsPageSize(size); setAlertsPage(1); } }}
          onRowClick={setOpenAlert}
          isRowActive={(row) => openAlert !== null && entityKey(row) === entityKey(openAlert)}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('pages.decisions.title')}</h2>
        <DataTable
          label={t('pages.decisions.title')}
          columns={decisionColumns}
          data={decisions.data?.data ?? []}
          getRowId={entityKey}
          loading={decisions.loading}
          busy={decisions.busy}
          error={decisions.error && !decisions.data ? toErrorInfo(decisions.error, t('components.table.loadFailed')).message : null}
          onRetry={decisions.reload}
          empty={<Empty size="sm" title={t('pages.decisions.noDecisions')} />}
          pagination={{ page: decisionsPage, pageSize: decisionsPageSize, total: decisions.data?.pagination.total ?? 0, onPageChange: setDecisionsPage, onPageSizeChange: (size) => { setDecisionsPageSize(size); setDecisionsPage(1); } }}
        />
      </section>

      <AlertDetails
        alert={openAlert}
        id={openAlert ? String(openAlert.id) : null}
        instanceId={openAlert?.instance_id}
        onClose={() => setOpenAlert(null)}
        canManage={canManage}
        onAddDecision={addDecision}
        onDelete={(alert) => requestDelete({ kind: 'alert', alert })}
        onDeleteIp={() => requestDelete({ kind: 'ip' })}
        decisionsVersion={decisionsVersion}
      />
      {decisionTarget ? <AddDecisionDialog target={decisionTarget} onClose={() => setDecisionTarget(null)} onAdded={reloadAll} /> : null}
      <ConfirmDeleteDialog
        open={deleteAction !== null}
        title={deleteAction?.kind === 'alert' ? t('pages.alerts.deleteAlertTitle') : t('pages.alerts.deleteAllIpTitle')}
        description={deleteAction?.kind === 'alert'
          ? <>{t('pages.alerts.deleteAlertConfirmPrefix')} <span className="font-mono font-medium text-kumo-strong">#{deleteAction.alert.id}</span>? {t('pages.alerts.deleteAlertConfirmSuffix')}</>
          : <>{t('common.deleteIpConfirmPrefix')} <span className="font-mono font-medium text-kumo-strong">{ip}</span>? {t('common.actionCannotBeUndone')}</>}
        error={deleteError}
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteAction(null)}
      />
    </>
  );
}
