import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IntersectIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { Badge, Banner, Button, Empty, LayerCard, Loader, Select, Switch, cn, type BadgeVariant } from '@cloudflare/kumo';
import { EMPTY_CELL, ScenarioName, TextCell } from '@/components/cells';
import { InstanceIcon } from '@/components/instance-icon';
import { HeaderHint, MetricsSection, SplitBar } from '@/components/metrics/metrics-section';
import { PageHeader } from '@/components/page-header';
import { useRefresh } from '@/contexts/useRefresh';
import { useServerData } from '@/hooks/use-server-data';
import { fetchCombinedCrowdsecMetrics, fetchCrowdsecMetrics } from '@/lib/api';
import { useDateTime } from '@/lib/dateTime';
import { toErrorInfo } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import type { CrowdsecMetricsBouncerMode, CrowdsecMetricsResponse, CrowdsecMetricsRouteActivity } from '@/types';

const COMBINED_ENDPOINT_ID = '_combined';
const SHOW_CHILD_PARSER_NODES_STORAGE_KEY = 'crowdsec-web-ui:metrics:show-child-parser-nodes';
const MACHINE_ONLINE_WINDOW_MS = 2 * 60 * 1_000;

const BOUNCER_MODE_VARIANTS: Record<CrowdsecMetricsBouncerMode, BadgeVariant> = {
  live: 'success',
  stream: 'info',
  mixed: 'warning',
  unknown: 'secondary',
};

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString();
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDuration(value: number): string {
  if (value < 0.001) return `${(value * 1_000_000).toFixed(1)} us`;
  if (value < 1) return `${(value * 1_000).toFixed(1)} ms`;
  return `${value.toFixed(2)} s`;
}

function Muted({ children = EMPTY_CELL }: { children?: string }) {
  return <span className="text-kumo-subtle">{children}</span>;
}

function NameCell({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="flex min-w-0 flex-col leading-tight">
      <span className="truncate font-medium" title={name}>{name}</span>
      <span className="truncate text-xs text-kumo-subtle" title={detail}>{detail}</span>
    </div>
  );
}

function SuccessRate({ value }: { value: number | null }) {
  if (value === null) return <Muted />;
  return (
    <span className="inline-flex items-center gap-2">
      <SplitBar healthy={value} />
      <Badge variant={value >= 0.8 ? 'success' : 'warning'}>{formatPercent(value)}</Badge>
    </span>
  );
}

function Duration({ seconds, warnAbove }: { seconds: number | null; warnAbove: number }) {
  const { t } = useI18n();
  if (seconds === null) return <Badge variant="secondary">{t('pages.metrics.notAvailable')}</Badge>;
  return <Badge variant={seconds >= warnAbove ? 'warning' : 'success'}>{formatDuration(seconds)}</Badge>;
}

function RouteList({ routes = [] }: { routes?: CrowdsecMetricsRouteActivity[] }) {
  const { t } = useI18n();
  if (routes.length === 0) return <Muted>{t('pages.metrics.noRouteActivity')}</Muted>;
  return (
    <ul className="flex flex-col gap-0.5 font-mono text-xs">
      {routes.slice(0, 4).map((route) => (
        <li key={`${route.method} ${route.route}`} className="flex justify-between gap-4">
          <span className="text-kumo-subtle"><span className="font-semibold text-kumo-default">{route.method}</span> {route.route}</span>
          <span className="numeric">{formatNumber(route.requests)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Metrics() {
  const { t } = useI18n();
  const { formatDateTime } = useDateTime();
  const { config } = useRefresh();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showChildNodes, setShowChildNodes] = useState(() => window.localStorage.getItem(SHOW_CHILD_PARSER_NODES_STORAGE_KEY) === 'true');

  const instances = config?.instances ?? [];
  const scope = searchParams.get('instance') || (instances.length === 1 ? instances[0].id : 'all');
  const includeInstance = scope === 'all';
  const choices = instances
    .filter((instance) => includeInstance || instance.id === scope)
    .flatMap((instance) => instance.prometheus.map((endpoint) => ({ instance, endpoint })));
  const requestedEndpoint = searchParams.get('endpoint');
  const selected = choices.find(({ instance, endpoint }) =>
    endpoint.id === requestedEndpoint && (!includeInstance || instance.id === searchParams.get('metrics_instance')));
  const combined = choices.length > 1 && (requestedEndpoint === COMBINED_ENDPOINT_ID || !selected);
  const choice = selected ?? choices[0];
  const selection = combined ? COMBINED_ENDPOINT_ID : choice ? `${choice.instance.id}:${choice.endpoint.id}` : '';
  const disabled = instances.length === 0 ? config?.metrics_enabled === false : choices.length === 0;
  const ready = config !== null && !disabled;

  const metrics = useServerData<CrowdsecMetricsResponse | null>(ready ? `${scope}|${selection}` : '', () => {
    if (!ready) return Promise.resolve(null);
    return combined ? fetchCombinedCrowdsecMetrics(scope) : fetchCrowdsecMetrics(choice?.instance.id, choice?.endpoint.id);
  });
  const data = metrics.data;

  const selectEndpoint = (value: string | null) => {
    const next = choices.find(({ instance, endpoint }) => `${instance.id}:${endpoint.id}` === value);
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set('endpoint', next ? next.endpoint.id : COMBINED_ENDPOINT_ID);
      if (next && includeInstance) params.set('metrics_instance', next.instance.id);
      else params.delete('metrics_instance');
      return params;
    });
  };

  const endpointOptions = [
    { value: COMBINED_ENDPOINT_ID, icon: <IntersectIcon size={16} className="shrink-0 text-kumo-subtle" />, label: t('pages.metrics.combined') },
    ...choices.map(({ instance, endpoint }, index) => ({
      value: `${instance.id}:${endpoint.id}`,
      icon: <InstanceIcon name={includeInstance ? instance.name : endpoint.name} colorIndex={includeInstance ? instances.indexOf(instance) : index} />,
      label: includeInstance ? `${instance.name} — ${endpoint.name}` : endpoint.name,
    })),
  ];
  const endpointOption = (value: string) => {
    const option = endpointOptions.find((candidate) => candidate.value === value);
    return option ? <span className="flex min-w-0 items-center gap-2">{option.icon}<span className="truncate">{option.label}</span></span> : null;
  };

  const changeShowChildNodes = (checked: boolean) => {
    setShowChildNodes(checked);
    window.localStorage.setItem(SHOW_CHILD_PARSER_NODES_STORAGE_KEY, String(checked));
  };

  const aggregation = data?.aggregation;
  const sourceLabels = new Map(aggregation?.sources.map((source) => [
    source.id,
    includeInstance ? `${source.instance_name} — ${source.endpoint_name}` : source.endpoint_name,
  ]));
  const sourceCells = new Map(aggregation?.sources.map((source, index) => [source.id, (
    <span className="flex min-w-0 items-center gap-2">
      <InstanceIcon name={includeInstance ? source.instance_name : source.endpoint_name} colorIndex={includeInstance ? instances.findIndex((instance) => instance.id === source.instance_id) : index} />
      <span className="truncate" title={sourceLabels.get(source.id)}>{sourceLabels.get(source.id)}</span>
    </span>
  )]));
  // Rows name their metrics endpoint only in a combined response
  const sourceOf = aggregation ? (row: { source_id?: string }) => sourceCells.get(row.source_id ?? '') : undefined;

  const heartbeat = (lastHeartbeatAt: string | null | undefined, heartbeats: number) => {
    if (!lastHeartbeatAt) {
      return heartbeats > 0
        ? { variant: 'info' as const, label: t('pages.metrics.heartbeatObserved'), title: t('pages.metrics.heartbeatObservedDescription') }
        : { variant: 'warning' as const, label: t('pages.metrics.heartbeatNotObserved') };
    }
    const online = new Date(data?.fetched_at ?? 0).getTime() - new Date(lastHeartbeatAt).getTime() <= MACHINE_ONLINE_WINDOW_MS;
    return {
      variant: online ? 'success' as const : 'warning' as const,
      label: t(online ? 'pages.metrics.heartbeatOnline' : 'pages.metrics.heartbeatStale'),
      title: t('pages.metrics.heartbeatLastSeenDescription', { time: formatDateTime(lastHeartbeatAt) }),
    };
  };

  const visibleParserNodes = data ? (showChildNodes ? data.parserNodes : data.parserNodes.filter((node) => !node.isChild)) : [];

  return (
    <>
      <PageHeader
        title={t('pages.metrics.title')}
        description={t('pages.metrics.counterScope')}
        meta={data && !disabled ? (
          <>
            {data.crowdsecVersion ? <span>{t('pages.metrics.version')}: <span className="font-mono">{data.crowdsecVersion}</span></span> : null}
            {data.crowdsecStartedAt ? <span>{t('pages.metrics.startedAt', { time: formatDateTime(data.crowdsecStartedAt) })}</span> : null}
            {data.totals.activeDecisions !== undefined ? (
              <span className="numeric">{t('pages.metrics.activeDecisions', { count: formatNumber(data.totals.activeDecisions) })}</span>
            ) : null}
            {data.totals.alerts !== undefined ? <span className="numeric">{t('pages.metrics.alerts', { count: formatNumber(data.totals.alerts) })}</span> : null}
            <span>{t('pages.metrics.scrapedAt', { time: formatDateTime(data.fetched_at) })}</span>
          </>
        ) : null}
        actions={choices.length > 1 ? (
          <Select
            aria-label={t('pages.metrics.metricsEndpoint')}
            className="max-w-full"
            value={selection}
            onValueChange={selectEndpoint}
            renderValue={endpointOption}
          >
            {endpointOptions.map((option) => <Select.Option key={option.value} value={option.value}>{endpointOption(option.value)}</Select.Option>)}
          </Select>
        ) : null}
      />

      {disabled ? (
        <Empty
          title={t('pages.metrics.disabledTitle')}
          contents={(
            <p className="max-w-140 text-center text-balance text-kumo-subtle">
              {t('pages.metrics.disabledPrefix')} <code className="font-mono text-sm">CONFIG_INSTANCE_METRICS_URL</code>{' '}
              {t('pages.metrics.disabledMiddle')} <code className="font-mono text-sm">full</code> {t('pages.metrics.disabledSuffix')}
            </p>
          )}
        />
      ) : metrics.error ? (
        <Empty
          icon={<WarningCircleIcon size={32} className="text-kumo-danger" />}
          title={t('pages.metrics.unavailableTitle')}
          description={toErrorInfo(metrics.error, t('pages.metrics.fetchFailed')).message}
          contents={<Button loading={metrics.busy} onClick={metrics.reload}>{t('pages.metrics.retry')}</Button>}
          className="break-words"
        />
      ) : !data ? (
        <div className="flex flex-1 items-center justify-center p-8 text-kumo-subtle">
          <Loader size={20} />
        </div>
      ) : (
        <div className={cn('flex flex-col gap-6 transition-opacity', metrics.busy && 'opacity-80')}>
          {aggregation?.partial ? (
            <Banner
              variant="alert"
              icon={<WarningCircleIcon weight="fill" />}
              description={t('pages.metrics.partialWarning', {
                sources: aggregation.sources.filter((source) => source.status === 'unavailable').map((source) => sourceLabels.get(source.id)).join(', '),
              })}
            />
          ) : null}

          {aggregation ? (
            <MetricsSection
              title={t('pages.metrics.combinedSources')}
              rows={aggregation.sources}
              rowKey={(source) => source.id}
              emptyMessage={t('common.noDataAvailable')}
              columns={[
                { header: t('pages.metrics.metricsEndpoint'), className: 'max-w-72', cell: (source) => sourceCells.get(source.id) },
                {
                  header: t('pages.metrics.columns.status'),
                  cell: (source) => (
                    <Badge variant={source.status === 'available' ? 'success' : 'warning'}>
                      {t(source.status === 'available' ? 'pages.metrics.sourceAvailable' : 'pages.metrics.sourceUnavailable')}
                    </Badge>
                  ),
                },
                {
                  header: t('pages.metrics.version'),
                  cell: (source) => source.status === 'available'
                    ? <span className="font-mono text-sm">{source.crowdsecVersion || EMPTY_CELL}</span>
                    : <span className="text-sm whitespace-normal text-kumo-warning">{source.error}</span>,
                },
                { header: t('pages.metrics.started'), cell: (source) => (source.crowdsecStartedAt ? formatDateTime(source.crowdsecStartedAt) : <Muted />) },
              ]}
            />
          ) : null}

          <LayerCard className="grid grid-cols-2 gap-px bg-kumo-hairline lg:grid-cols-3">
            {[
              {
                label: t('pages.metrics.remediationComponentApiRequests'),
                value: formatNumber(data.totals.bouncerRequests),
                footer: t('pages.metrics.groupedByBouncer'),
              },
              {
                label: t('pages.metrics.machineAlertPosts'),
                value: formatNumber(data.totals.machineAlertRequests ?? 0),
                footer: t('pages.metrics.machineAlertPostsDetail', {
                  calls: formatNumber(data.totals.machineRequests),
                  heartbeats: formatNumber(data.totals.machineHeartbeatRequests ?? 0),
                }),
              },
              {
                label: t('pages.metrics.appsecRequests'),
                value: formatNumber(data.totals.appsecRequests),
                footer: t('pages.metrics.blockedCount', { count: formatNumber(data.totals.appsecBlocked) }),
              },
              {
                label: t('pages.metrics.whitelistHits'),
                value: formatNumber(data.totals.whitelistHits),
                footer: t('pages.metrics.whitelistedCount', { count: formatNumber(data.totals.whitelisted) }),
              },
              {
                label: t('pages.metrics.parserEvents'),
                value: formatNumber(data.totals.parserProcessed),
                footer: t('pages.metrics.unparsedCount', { count: formatNumber(data.totals.parserKo) }),
              },
              {
                label: t('pages.metrics.parsedSuccessfully'),
                value: data.totals.parserSuccessRate === null ? t('pages.metrics.notAvailable') : formatPercent(data.totals.parserSuccessRate),
                footer: t('pages.metrics.averageDuration', {
                  duration: data.totals.parserAverageSeconds === null ? t('pages.metrics.notAvailable') : formatDuration(data.totals.parserAverageSeconds),
                }),
              },
            ].map((figure) => (
              <div key={figure.label} className="flex min-w-0 flex-col gap-1 bg-kumo-base p-4">
                <span className="text-sm text-kumo-subtle">{figure.label}</span>
                <span className="text-2xl leading-tight font-semibold text-kumo-default numeric">{figure.value}</span>
                <span className="text-xs text-kumo-subtle numeric sm:text-sm">{figure.footer}</span>
              </div>
            ))}
          </LayerCard>

          <MetricsSection
            title={t('pages.metrics.remediationComponents')}
            description={t('pages.metrics.bouncersDescription')}
            footer={t('pages.metrics.remediationMetricsNote')}
            rows={data.bouncers}
            rowKey={(bouncer) => `${bouncer.source_id}|${bouncer.name}`}
            source={sourceOf}
            emptyMessage={t('pages.metrics.emptyBouncers')}
            columns={[
              { header: t('common.name'), className: 'max-w-56', cell: (bouncer) => <TextCell value={bouncer.name} /> },
              {
                header: t('pages.metrics.columns.mode'),
                cell: (bouncer) => {
                  const mode = bouncer.mode ?? 'unknown';
                  return <Badge variant={BOUNCER_MODE_VARIANTS[mode]}>{t(`pages.metrics.modes.${mode}`)}</Badge>;
                },
              },
              { header: t('pages.metrics.columns.requests'), numeric: true, cell: (bouncer) => formatNumber(bouncer.requests) },
              {
                header: <HeaderHint label={t('pages.metrics.columns.decisionResponses')} hint={t('pages.metrics.streamModeDescription')} />,
                cell: (bouncer) => {
                  const nonEmpty = bouncer.decisionsOk ?? 0;
                  const empty = bouncer.decisionsKo ?? 0;
                  if (bouncer.mode === 'stream' || empty + nonEmpty === 0) return <Muted />;
                  return (
                    <span className="inline-flex items-center gap-2">
                      <SplitBar healthy={empty / (empty + nonEmpty)} />
                      <span className="text-sm text-kumo-subtle numeric">
                        {t('pages.metrics.labels.empty', { count: formatNumber(empty) })} · {t('pages.metrics.labels.nonEmpty', { count: formatNumber(nonEmpty) })}
                      </span>
                    </span>
                  );
                },
              },
              { header: t('pages.metrics.columns.routes'), cell: (bouncer) => <RouteList routes={bouncer.routes} /> },
            ]}
          />

          <MetricsSection
            title={t('pages.metrics.logProcessors')}
            description={t('pages.metrics.machinesDescription')}
            rows={data.machines}
            rowKey={(machine) => `${machine.source_id}|${machine.name}`}
            source={sourceOf}
            emptyMessage={t('pages.metrics.emptyMachines')}
            columns={[
              { header: t('common.name'), className: 'max-w-56', cell: (machine) => <TextCell value={machine.name} /> },
              {
                header: t('pages.metrics.columns.heartbeat'),
                cell: (machine) => {
                  const status = heartbeat(machine.lastHeartbeatAt, machine.heartbeatRequests ?? 0);
                  return <span title={status.title}><Badge variant={status.variant}>{status.label}</Badge></span>;
                },
              },
              { header: t('pages.metrics.columns.alertPosts'), numeric: true, cell: (machine) => formatNumber(machine.alertRequests ?? 0) },
              { header: t('pages.metrics.columns.heartbeats'), numeric: true, cell: (machine) => formatNumber(machine.heartbeatRequests ?? 0) },
              { header: t('pages.metrics.columns.otherApi'), numeric: true, cell: (machine) => formatNumber(machine.otherRequests ?? 0) },
              { header: t('pages.metrics.columns.routes'), cell: (machine) => <RouteList routes={machine.routes} /> },
            ]}
          />

          <MetricsSection
            title={t('pages.metrics.appsecEngines')}
            description={t('pages.metrics.appsecEnginesDescription')}
            rows={data.appsecEngines ?? []}
            rowKey={(engine) => `${engine.source_id}|${engine.engine}|${engine.source}`}
            source={sourceOf}
            emptyMessage={t('pages.metrics.emptyAppsecEngines')}
            columns={[
              { header: t('pages.metrics.columns.engine'), className: 'max-w-64', cell: (engine) => <NameCell name={engine.engine} detail={engine.source} /> },
              { header: t('pages.metrics.columns.requests'), numeric: true, cell: (engine) => formatNumber(engine.requests) },
              { header: t('pages.metrics.columns.allowed'), numeric: true, cell: (engine) => formatNumber(Math.max(engine.requests - engine.blocked, 0)) },
              { header: t('pages.metrics.columns.blocked'), numeric: true, cell: (engine) => formatNumber(engine.blocked) },
              {
                header: <HeaderHint label={t('pages.metrics.columns.blockRate')} hint={t('pages.metrics.appsecBlockRateTooltip')} />,
                cell: (engine) => engine.blockRate === null ? <Muted /> : (
                  <span className="inline-flex items-center gap-2">
                    <SplitBar healthy={1 - engine.blockRate} />
                    <Badge variant={engine.blocked > 0 ? 'warning' : 'secondary'}>{formatPercent(engine.blockRate)}</Badge>
                  </span>
                ),
              },
            ]}
          />

          <MetricsSection
            title={t('pages.metrics.parserSources')}
            description={t('pages.metrics.parserSourcesDescription')}
            rows={data.parserSources}
            rowKey={(source) => `${source.source_id}|${source.source}|${source.type}`}
            source={sourceOf}
            emptyMessage={t('pages.metrics.emptyParserSources')}
            columns={[
              {
                header: t('pages.metrics.columns.datasource'),
                className: 'max-w-72',
                cell: (source) => <NameCell name={source.source} detail={[source.type, ...source.acquisTypes].join(' / ')} />,
              },
              { header: t('pages.metrics.columns.read'), numeric: true, cell: (source) => (source.linesRead === null ? <Muted /> : formatNumber(source.linesRead)) },
              { header: t('pages.metrics.columns.parsed'), numeric: true, cell: (source) => formatNumber(source.parsedOk) },
              { header: t('pages.metrics.columns.unparsed'), numeric: true, cell: (source) => formatNumber(source.parsedKo) },
              { header: t('pages.metrics.columns.poured'), numeric: true, cell: (source) => formatNumber(source.pouredToBucket) },
              { header: t('pages.metrics.columns.whitelisted'), numeric: true, cell: (source) => formatNumber(source.whitelisted) },
              {
                header: <HeaderHint label={t('pages.metrics.columns.success')} hint={t('pages.metrics.parserSuccessTooltip')} />,
                cell: (source) => <SuccessRate value={source.successRate} />,
              },
            ]}
          />

          <MetricsSection
            title={t('pages.metrics.scenarios')}
            description={t('pages.metrics.scenariosDescription')}
            rows={data.scenarios ?? []}
            rowKey={(scenario) => `${scenario.source_id}|${scenario.name}`}
            source={sourceOf}
            emptyMessage={t('pages.metrics.emptyScenarios')}
            columns={[
              { header: t('pages.metrics.columns.scenario'), className: 'max-w-72', cell: (scenario) => <ScenarioName name={scenario.name} /> },
              { header: t('pages.metrics.columns.current'), numeric: true, cell: (scenario) => formatNumber(scenario.current) },
              { header: t('pages.metrics.columns.instantiated'), numeric: true, cell: (scenario) => formatNumber(scenario.instantiations) },
              {
                header: t('pages.metrics.columns.overflowed'),
                numeric: true,
                cell: (scenario) => <span className={cn(scenario.overflows > 0 && 'text-kumo-warning')}>{formatNumber(scenario.overflows)}</span>,
              },
              { header: t('pages.metrics.columns.poured'), numeric: true, cell: (scenario) => formatNumber(scenario.poured) },
              { header: t('pages.metrics.columns.expired'), numeric: true, cell: (scenario) => formatNumber(scenario.underflows) },
              { header: t('pages.metrics.columns.canceled'), numeric: true, cell: (scenario) => formatNumber(scenario.canceled) },
            ]}
          />

          <MetricsSection
            title={t('pages.metrics.parserTiming')}
            description={t('pages.metrics.parserTimingDescription')}
            rows={data.parserTimings}
            rowKey={(timing) => `${timing.source_id}|${timing.source}|${timing.type}`}
            source={sourceOf}
            emptyMessage={t('pages.metrics.emptyParserTiming')}
            columns={[
              { header: t('pages.metrics.columns.datasource'), className: 'max-w-72', cell: (timing) => <NameCell name={timing.source} detail={timing.type} /> },
              { header: t('pages.metrics.columns.timedEvents'), numeric: true, cell: (timing) => formatNumber(timing.count) },
              {
                header: <HeaderHint label={t('pages.metrics.columns.average')} hint={t('pages.metrics.parserTimingTooltip')} />,
                numeric: true,
                cell: (timing) => <Duration seconds={timing.averageSeconds} warnAbove={0.001} />,
              },
            ]}
          />

          <MetricsSection
            title={t('pages.metrics.lapiLatency')}
            description={t('pages.metrics.lapiLatencyDescription')}
            rows={data.lapiRoutes ?? []}
            rowKey={(route) => `${route.source_id}|${route.method} ${route.route}`}
            source={sourceOf}
            emptyMessage={t('pages.metrics.emptyLapiLatency')}
            columns={[
              { header: t('pages.metrics.columns.method'), cell: (route) => <span className="font-mono text-sm font-medium">{route.method}</span> },
              { header: t('pages.metrics.columns.route'), className: 'max-w-80', cell: (route) => <TextCell value={route.route} mono /> },
              { header: t('pages.metrics.columns.requests'), numeric: true, cell: (route) => formatNumber(route.requests) },
              { header: t('pages.metrics.columns.average'), numeric: true, cell: (route) => <Duration seconds={route.averageSeconds} warnAbove={0.25} /> },
            ]}
          />

          <MetricsSection
            title={t('pages.metrics.parserNodes')}
            description={t('pages.metrics.parserNodesDescription')}
            action={data.parserNodes.length > 0 ? (
              <Switch size="sm" label={t('pages.metrics.showChildParserNodes')} checked={showChildNodes} onCheckedChange={changeShowChildNodes} />
            ) : null}
            rows={visibleParserNodes}
            rowKey={(node) => `${node.source_id}|${node.name}|${node.stage}|${node.source}|${node.acquisType ?? ''}`}
            source={sourceOf}
            emptyMessage={data.parserNodes.length === 0 ? t('pages.metrics.emptyParserNodes') : t('pages.metrics.emptyParserNodesAfterFilter')}
            columns={[
              { header: t('pages.metrics.columns.node'), className: 'max-w-72', cell: (node) => <NameCell name={node.name} detail={`${node.type} / ${node.source}`} /> },
              { header: t('pages.metrics.columns.stage'), cell: (node) => node.stage },
              { header: t('pages.metrics.columns.processed'), numeric: true, cell: (node) => formatNumber(node.processed) },
              { header: t('pages.metrics.columns.success'), cell: (node) => <SuccessRate value={node.successRate} /> },
            ]}
          />

          {data.whitelists.length > 0 ? (
            <MetricsSection
              title={t('pages.metrics.whitelists')}
              description={t('pages.metrics.whitelistsDescription')}
              rows={data.whitelists}
              rowKey={(whitelist) => `${whitelist.source_id}|${whitelist.name}|${whitelist.reason}`}
              source={sourceOf}
              emptyMessage={t('common.noDataAvailable')}
              columns={[
                { header: t('pages.metrics.columns.whitelist'), className: 'max-w-72', cell: (whitelist) => <TextCell value={whitelist.name} /> },
                { header: t('pages.metrics.columns.reason'), className: 'max-w-80', cell: (whitelist) => <TextCell value={whitelist.reason} /> },
                { header: t('pages.metrics.columns.hits'), numeric: true, cell: (whitelist) => formatNumber(whitelist.hits) },
                { header: t('pages.metrics.columns.whitelisted'), numeric: true, cell: (whitelist) => formatNumber(whitelist.whitelisted) },
              ]}
            />
          ) : null}
        </div>
      )}
    </>
  );
}
