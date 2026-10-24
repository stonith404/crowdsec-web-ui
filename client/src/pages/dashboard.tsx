import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CrosshairIcon, GlobeIcon, GaugeIcon, ListBulletsIcon, ShieldWarningIcon } from '@phosphor-icons/react';
import { LayerCard, Tabs, cn } from '@cloudflare/kumo';
import { compileDecisionSearch } from '../../../shared/search';
import { ActivityChart, type ScaleMode } from '@/components/dashboard/activity-chart';
import { KpiCell } from '@/components/dashboard/kpi-card';
import { ProtectionCard } from '@/components/dashboard/protection-card';
import { TopListCard, type TopListItem } from '@/components/dashboard/top-list-card';
import { WorldMapCard } from '@/components/dashboard/world-map-card';
import { CountryFlag } from '@/components/country-flag';
import { ScenarioName } from '@/components/cells';
import { FilterBar } from '@/components/filters/filter-bar';
import { PageHeader } from '@/components/page-header';
import { useRefresh } from '@/contexts/useRefresh';
import { useServerData } from '@/hooks/use-server-data';
import { fetchCombinedCrowdsecMetrics, fetchDashboardStats } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { SEARCH_FEATURES, useSearchState, useSearchDateOptions } from '@/lib/searchState';
import type { CrowdsecMetricsResponse, DashboardGranularity, DashboardStatsResponse, FacetField } from '@/types';

// Fields that alerts and decisions share, since the dashboard applies its search to both
const DASHBOARD_FILTER_FIELDS: FacetField[] = ['country', 'scenario', 'kind', 'as', 'ip', 'target', 'id', 'instance', 'region', 'city', 'machine', 'origin'];
const TOP_LIST_SIZE = 8;

type TopSourceMode = 'as' | 'ip';

function useStoredState<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = window.localStorage.getItem(key);
    return stored && (allowed as readonly string[]).includes(stored) ? stored as T : fallback;
  });
  const update = (next: T) => {
    setValue(next);
    window.localStorage.setItem(key, next);
  };
  return [value, update];
}

function sumHistory(...series: Array<Array<{ date: string; count: number }>>): number[] {
  const first = series[0] ?? [];
  return first.map((bucket, index) => series.reduce((sum, buckets) => sum + (buckets[index]?.count ?? 0), 0));
}

export function Dashboard() {
  const { t } = useI18n();
  const { config } = useRefresh();
  const [searchParams] = useSearchParams();
  const search = useSearchState('alerts');
  const dateOptions = useSearchDateOptions();
  const [granularity, setGranularity] = useStoredState<DashboardGranularity>('dashboard_granularity', ['day', 'hour'], 'day');
  const [scale, setScale] = useStoredState<ScaleMode>('dashboard_scale_mode', ['linear', 'symlog'], 'linear');
  const [sourceMode, setSourceMode] = useStoredState<TopSourceMode>('dashboard_top_source_mode', ['as', 'ip'], 'as');
  const simulationsEnabled = config?.simulations_enabled === true;
  const instanceScope = searchParams.get('instance') || 'all';

  const decisionQueryValid = !search.query || compileDecisionSearch(search.query, SEARCH_FEATURES, dateOptions).ok;
  const requestFilters = useMemo(() => {
    const filters: Record<string, string> = { ...search.serverFilters, granularity };
    if (search.query && decisionQueryValid) filters.decision_q = search.query;
    return filters;
  }, [decisionQueryValid, granularity, search.query, search.serverFilters]);
  const filtersKey = JSON.stringify(requestFilters);
  const stats = useServerData<DashboardStatsResponse>(filtersKey, (signal) => fetchDashboardStats(requestFilters, { signal }));
  const data = stats.data;

  // The server answers with a pending placeholder while it builds the statistics, and says when to ask again
  const { reload } = stats;
  useEffect(() => {
    if (!data?.pending) return;
    const timeout = window.setTimeout(reload, data.retryAfterMs ?? 1500);
    return () => window.clearTimeout(timeout);
  }, [data, reload]);

  const loading = stats.loading || (data?.pending === true && !data.stale);
  const filtered = data?.filteredTotals;
  const alertCount = filtered?.alerts ?? 0;
  const decisionCount = (filtered?.decisions ?? 0) + (filtered?.simulatedDecisions ?? 0);
  const percentageTotal = filtered?.alerts ?? 0;
  const alertSparkline = useMemo(() => (data ? sumHistory(data.series.alertsHistory, data.series.simulatedAlertsHistory) : undefined), [data]);
  const decisionSparkline = useMemo(() => (data ? sumHistory(data.series.activeDecisionsHistory, data.series.activeSimulatedDecisionsHistory) : undefined), [data]);

  const drilldown = (path: '/alerts' | '/decisions') => {
    const params = new URLSearchParams();
    if (instanceScope !== 'all') params.set('instance', instanceScope);
    if (search.query) params.set('q', search.query);
    return params.size ? `${path}?${params}` : path;
  };

  const toggle = (field: FacetField) => (value: string) => {
    const selection = search.getSelection(field);
    const included = selection.included.includes(value) ? selection.included.filter((candidate) => candidate !== value) : [...selection.included, value];
    search.setSelection(field, { included, excluded: selection.excluded.filter((candidate) => candidate !== value) });
  };

  const instances = config?.instances ?? [];
  const scopedInstances = instanceScope === 'all' ? instances : instances.filter((instance) => instance.id === instanceScope);
  const online = scopedInstances.length > 0
    ? scopedInstances.filter((instance) => instance.lapi_status.isConnected).length
    : Number(config?.lapi_status.isConnected ?? false);
  const lapiTotal = Math.max(1, scopedInstances.length);
  const lapiState = online === 0 ? 'offline' : online === lapiTotal ? 'online' : 'partial';
  const metricsAvailable = scopedInstances.some((instance) => instance.prometheus.length > 0);
  const metrics = useServerData<CrowdsecMetricsResponse | null>(metricsAvailable ? instanceScope : '', () => (
    metricsAvailable ? fetchCombinedCrowdsecMetrics(instanceScope) : Promise.resolve(null)
  ));

  const countryItems: TopListItem[] = (data?.topCountries ?? []).slice(0, TOP_LIST_SIZE).map((item) => ({
    value: item.value ?? item.countryCode ?? item.label,
    count: item.count,
    title: item.label,
    label: (
      <span className="flex items-center gap-2">
        <CountryFlag code={item.countryCode} className="h-3 w-4" />
        <span className="truncate">{item.label}</span>
      </span>
    ),
  }));
  const scenarioItems: TopListItem[] = (data?.topScenarios ?? []).slice(0, TOP_LIST_SIZE).map((item) => ({
    value: item.value ?? item.label,
    count: item.count,
    title: item.label,
    label: <ScenarioName name={item.label} className="flex-row items-baseline gap-2" />,
  }));
  const sourceItems: TopListItem[] = (sourceMode === 'as' ? data?.topAS ?? [] : data?.topIPs ?? []).slice(0, TOP_LIST_SIZE).map((item) => ({
    value: item.value ?? item.label,
    count: item.count,
    title: item.label,
    label: sourceMode === 'ip' ? (
      <span className="flex items-center gap-2 font-mono text-sm">
        <CountryFlag code={item.sourceCountryCode} className="h-3 w-4" />
        {item.label}
      </span>
    ) : item.label,
  }));
  const targetItems: TopListItem[] = (data?.topTargets ?? []).slice(0, TOP_LIST_SIZE).map((item) => ({ value: item.value ?? item.label, count: item.count, title: item.label, label: item.label }));
  const selectedCountry = search.getSelection('country').included;

  return (
    <>
      <PageHeader
        title={t('pages.dashboard.title')}
        description={config ? t('pages.dashboard.description', { period: config.lookback_period }) : undefined}
      />
      <FilterBar search={search} fields={DASHBOARD_FILTER_FIELDS} simulationsEnabled={simulationsEnabled} />
      {!decisionQueryValid ? <p className="-mt-3 text-sm text-kumo-warning">{t('pages.dashboard.alertOnlyQuery')}</p> : null}

      <LayerCard className={cn('transition-opacity', stats.busy && !loading && 'opacity-80')}>
        <LayerCard.Secondary className="py-3 text-kumo-default">
          <GaugeIcon className="size-4" />
          {t('pages.dashboard.overview')}
        </LayerCard.Secondary>
        <LayerCard.Primary className="grid gap-0 divide-y divide-kumo-hairline p-0 md:grid-cols-3 md:divide-x md:divide-y-0">
          <KpiCell
            label={t('pages.dashboard.totalAlerts')}
            info={t('pages.dashboard.totalAlertsInfo')}
            loading={loading}
            value={alertCount.toLocaleString()}
            href={drilldown('/alerts')}
            linkLabel={t('pages.dashboard.viewAlerts')}
            sparkline={alertSparkline}
            footer={simulationsEnabled && filtered ? t('pages.dashboard.simulatedCount', { count: filtered.simulatedAlerts.toLocaleString() }) : undefined}
          />
          <KpiCell
            label={t('pages.dashboard.activeDecisions')}
            info={t('pages.dashboard.activeDecisionsInfo')}
            loading={loading}
            value={decisionCount.toLocaleString()}
            href={drilldown('/decisions')}
            linkLabel={t('pages.dashboard.viewDecisions')}
            sparkline={decisionSparkline}
            footer={simulationsEnabled && filtered ? t('pages.dashboard.simulatedCount', { count: filtered.simulatedDecisions.toLocaleString() }) : undefined}
          />
          <KpiCell
            label={scopedInstances.length > 1 ? t('pages.dashboard.crowdsecLapis') : t('pages.dashboard.crowdsecLapi')}
            value={(
              <span className="flex items-center gap-2.5">
                <span
                  className={cn('size-2.5 rounded-full', lapiState === 'online' ? 'bg-kumo-success' : lapiState === 'partial' ? 'bg-kumo-warning' : 'bg-kumo-danger')}
                  aria-hidden="true"
                />
                {lapiState === 'online'
                  ? (scopedInstances.length > 1 ? t('pages.dashboard.allLapisOnline') : t('common.online'))
                  : lapiState === 'partial' ? t('pages.dashboard.lapisPartiallyOnline') : t('common.offline')}
              </span>
            )}
            footer={scopedInstances.length > 1
              ? t('pages.dashboard.lapisOnlineCount', { online, total: lapiTotal })
              : config?.lapi_status.lastError ?? undefined}
          />
        </LayerCard.Primary>
      </LayerCard>

      {metricsAvailable ? (
        <ProtectionCard
          rows={metrics.data?.activeDecisionsByOrigin ?? []}
          loading={metrics.loading}
          failed={Boolean(metrics.error)}
          metricsHref={instanceScope === 'all' ? '/metrics' : `/metrics?instance=${encodeURIComponent(instanceScope)}`}
        />
      ) : null}

      <ActivityChart
        series={data?.series ?? null}
        loading={loading}
        simulationsEnabled={simulationsEnabled}
        granularity={granularity}
        onGranularityChange={setGranularity}
        scale={scale}
        onScaleChange={setScale}
        dateRange={search.dateRange}
        onDateRangeChange={search.setDateRange}
      />

      <WorldMapCard
        data={data?.allCountries ?? []}
        attackLocations={data?.attackLocations ?? []}
        selectedCountry={selectedCountry.length === 1 ? selectedCountry[0] : null}
        onCountrySelect={toggle('country')}
        simulationsEnabled={simulationsEnabled}
        selectionDisabledReason={search.compatibility.compatible ? undefined : t(`components.quickFilters.disabled.${search.compatibility.reason}`)}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <TopListCard
          title={t('pages.dashboard.topCountries')}
          icon={<GlobeIcon className="size-4" />}
          items={countryItems}
          total={percentageTotal}
          selected={selectedCountry}
          onToggle={search.compatibility.compatible ? toggle('country') : undefined}
          loading={loading}
        />
        <TopListCard
          title={t('pages.dashboard.topScenarios')}
          icon={<ShieldWarningIcon className="size-4" />}
          items={scenarioItems}
          total={percentageTotal}
          selected={search.getSelection('scenario').included}
          onToggle={search.compatibility.compatible ? toggle('scenario') : undefined}
          loading={loading}
        />
        <TopListCard
          title={sourceMode === 'as' ? t('pages.dashboard.topAs') : t('pages.dashboard.topIps')}
          icon={<ListBulletsIcon className="size-4" />}
          items={sourceItems}
          total={percentageTotal}
          selected={search.getSelection(sourceMode).included}
          onToggle={search.compatibility.compatible ? toggle(sourceMode) : undefined}
          loading={loading}
          action={(
            <div role="group" aria-label={t('pages.dashboard.groupBy')}>
              <Tabs
                size="sm"
                value={sourceMode}
                onValueChange={(value) => setSourceMode(value as TopSourceMode)}
                tabs={[
                  { value: 'as', label: t('pages.dashboard.as') },
                  { value: 'ip', label: t('pages.dashboard.ip') },
                ]}
              />
            </div>
          )}
        />
        <TopListCard
          title={t('pages.dashboard.topTargets')}
          icon={<CrosshairIcon className="size-4" />}
          items={targetItems}
          total={percentageTotal}
          selected={search.getSelection('target').included}
          onToggle={search.compatibility.compatible ? toggle('target') : undefined}
          loading={loading}
        />
      </div>
    </>
  );
}
