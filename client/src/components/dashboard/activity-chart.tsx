import { useEffect, useMemo, useRef } from 'react';
import type { ECharts } from 'echarts/core';
import { ChartBarIcon } from '@phosphor-icons/react';
import { Chart, ChartLegend, ChartPalette, LayerCard, Loader, Tabs } from '@cloudflare/kumo';
import type { SearchDateRange } from '../../../../shared/search';
import { useDateTime } from '@/lib/dateTime';
import { echarts, KUMO_TOOLTIP_STYLE, REPLACE_SERIES } from '@/lib/echarts';
import { useI18n } from '@/lib/i18n';
import { useIsDarkMode } from '@/lib/theme';
import type { DashboardGranularity, DashboardStatsSeries } from '@/types';

export type ScaleMode = 'linear' | 'symlog';

type SeriesKey = 'alerts' | 'simulatedAlerts' | 'decisions' | 'simulatedDecisions';
type ActivityRow = Record<SeriesKey, number> & { key: string; fullDate: string };
/** A bar series, stacked onto the series named by `below` */
interface SeriesDefinition { key: SeriesKey; name: string; color: string; below: SeriesKey | null }

const CHART_HEIGHT = 280;

// Linear up to 1 and logarithmic above, so 0, 1, 10 and 100 sit one step apart and empty buckets stay at zero
const toSymlog = (value: number) => (value <= 1 ? value : 1 + Math.log10(value));
const fromSymlog = (value: number) => (value <= 1 ? value : 10 ** (value - 1));

function buildRows(series: DashboardStatsSeries): ActivityRow[] {
  const byKey = (buckets: DashboardStatsSeries['alertsHistory']) => new Map(buckets.map((bucket) => [bucket.date, bucket.count]));
  const simulatedAlerts = byKey(series.simulatedAlertsHistory);
  const decisions = byKey(series.decisionsHistory);
  const simulatedDecisions = byKey(series.simulatedDecisionsHistory);
  return series.alertsHistory.map((bucket) => ({
    key: bucket.date,
    fullDate: bucket.fullDate,
    alerts: bucket.count,
    simulatedAlerts: simulatedAlerts.get(bucket.date) ?? 0,
    decisions: decisions.get(bucket.date) ?? 0,
    simulatedDecisions: simulatedDecisions.get(bucket.date) ?? 0,
  }));
}

/**
 * Alerts and decisions per day or hour, where dragging across the bars selects that time range as a filter, like zooming a Cloudflare analytics chart.
 * The selection is written as bucket keys such as `2026-10-23` or `2026-10-23T05`, which the search treats as whole days or hours.
 */
export function ActivityChart({
  series,
  loading,
  simulationsEnabled,
  granularity,
  onGranularityChange,
  scale,
  onScaleChange,
  dateRange,
  onDateRangeChange,
}: {
  series: DashboardStatsSeries | null;
  loading: boolean;
  simulationsEnabled: boolean;
  granularity: DashboardGranularity;
  onGranularityChange: (granularity: DashboardGranularity) => void;
  scale: ScaleMode;
  onScaleChange: (scale: ScaleMode) => void;
  dateRange: SearchDateRange;
  onDateRangeChange: (range: SearchDateRange) => void;
}) {
  const { t } = useI18n();
  const { formatDate, formatTime, formatDateTime } = useDateTime();
  const isDarkMode = useIsDarkMode();
  const chartRef = useRef<ECharts | null>(null);
  const rows = useMemo(() => (series ? buildRows(series) : []), [series]);

  const definitions = useMemo(() => {
    const alertColor = ChartPalette.semantic('Attention', isDarkMode);
    const decisionColor = ChartPalette.categorical(0, isDarkMode);
    const all: SeriesDefinition[] = [
      { key: 'alerts', name: t('components.dashboardCharts.alerts'), color: alertColor, below: null },
      { key: 'simulatedAlerts', name: t('components.dashboardCharts.simulationAlerts'), color: `${alertColor}80`, below: 'alerts' },
      { key: 'decisions', name: t('components.dashboardCharts.decisions'), color: decisionColor, below: null },
      { key: 'simulatedDecisions', name: t('components.dashboardCharts.simulationDecisions'), color: `${decisionColor}80`, below: 'decisions' },
    ];
    return simulationsEnabled ? all : all.filter((definition) => !definition.below);
  }, [isDarkMode, simulationsEnabled, t]);

  const options = useMemo(() => {
    const axisColor = ChartPalette.text('primary', isDarkMode);
    const compact = Intl.NumberFormat(undefined, { notation: 'compact' });
    // A stacked segment covers the scaled distance between the totals below and up to it, so the stack's top shows the scaled sum
    const segment = (below: number, own: number) => (scale === 'symlog' ? toSymlog(below + own) - toSymlog(below) : own);
    const formatBucket = (row: ActivityRow, short: boolean) => {
      if (granularity === 'hour') return short ? formatTime(row.fullDate, { hour: '2-digit', minute: '2-digit' }) : formatDateTime(row.fullDate, { dateStyle: 'medium', timeStyle: 'short' });
      return formatDate(row.fullDate, short ? { month: 'short', day: 'numeric' } : { dateStyle: 'medium' });
    };

    return {
      animation: false,
      grid: { left: 8, right: 8, top: 12, bottom: 4, containLabel: true },
      brush: {
        xAxisIndex: 0,
        brushType: 'lineX' as const,
        brushMode: 'single' as const,
        transformable: false,
        outOfBrush: { colorAlpha: 0.3 },
        brushStyle: { borderWidth: 1, color: 'rgba(120,140,180,0.3)', borderColor: 'rgba(120,140,180,0.8)' },
      },
      toolbox: { show: false },
      tooltip: {
        ...KUMO_TOOLTIP_STYLE,
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        dangerousHtmlFormatter: (params: unknown) => {
          const points = params as Array<{ dataIndex: number; seriesId: SeriesKey; seriesName: string; marker: string }>;
          const row = rows[points[0]?.dataIndex];
          if (!row) return '';
          const lines = points.map((point) => `<div style="display:flex;align-items:center;gap:12px"><span style="flex:1">${point.marker}${point.seriesName}</span><strong>${row[point.seriesId].toLocaleString()}</strong></div>`);
          return `<div style="display:flex;flex-direction:column;gap:4px"><div style="color:var(--text-color-kumo-subtle)">${formatBucket(row, false)}</div>${lines.join('')}</div>`;
        },
      },
      xAxis: {
        type: 'category' as const,
        data: rows.map((row) => row.key),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: axisColor, hideOverlap: true, formatter: (_: string, index: number) => formatBucket(rows[index], true) },
      },
      yAxis: {
        type: 'value' as const,
        min: 0,
        ...(scale === 'symlog' ? { interval: 1, max: (extent: { max: number }) => Math.max(1, Math.ceil(extent.max)) } : { minInterval: 1 }),
        axisLabel: { color: axisColor, formatter: (value: number) => compact.format(scale === 'symlog' ? Math.round(fromSymlog(value)) : value) },
        splitLine: { lineStyle: { type: 'dashed' as const, color: `${axisColor}33` } },
      },
      series: definitions.map((definition) => ({
        id: definition.key,
        name: definition.name,
        type: 'bar' as const,
        stack: definition.below ?? definition.key,
        color: definition.color,
        itemStyle: { borderRadius: definition.below || !simulationsEnabled ? [3, 3, 0, 0] : 0 },
        data: rows.map((row) => segment(definition.below ? row[definition.below] : 0, row[definition.key])),
      })),
    };
  }, [definitions, rows, scale, granularity, isDarkMode, simulationsEnabled, formatDate, formatTime, formatDateTime]);

  const selectionStart = rows.findIndex((row) => row.key === dateRange.start);
  const selectionEnd = rows.findIndex((row) => row.key === dateRange.end);

  // Dragging draws a brush only once the brush has taken the cursor of the chart, which is created anew after the loader and on a theme change
  useEffect(() => {
    chartRef.current?.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'lineX', brushMode: 'single' } });
  }, [isDarkMode, loading]);

  // The range of an earlier drag stays drawn as the brush while both ends are buckets of the chart
  useEffect(() => {
    chartRef.current?.dispatchAction({
      type: 'brush',
      areas: selectionStart >= 0 && selectionEnd >= 0 ? [{ brushType: 'lineX', xAxisIndex: 0, coordRange: [selectionStart, selectionEnd] }] : [],
    });
  }, [options, selectionStart, selectionEnd]);

  const events = useMemo(() => ({
    brushend: ({ areas }: { areas: Array<{ coordRange: [number, number] }> }) => {
      const [from, to] = areas[0]?.coordRange ?? [];
      const start = rows[Math.max(0, Math.round(from))]?.key;
      const end = rows[Math.min(rows.length - 1, Math.round(to))]?.key;
      if (start && end) onDateRangeChange({ start, end });
    },
  }), [rows, onDateRangeChange]);

  return (
    <LayerCard>
      <LayerCard.Secondary className="flex-wrap justify-between py-3">
        <span className="flex items-center gap-2 text-kumo-default">
          <ChartBarIcon className="size-4" />
          {t('components.dashboardCharts.activityHistory')}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t('components.dashboardCharts.granularityAria')}>
            <Tabs
              size="sm"
              value={granularity}
              onValueChange={(value) => onGranularityChange(value as DashboardGranularity)}
              tabs={[
                { value: 'day', label: t('components.dashboardCharts.day') },
                { value: 'hour', label: t('components.dashboardCharts.hour') },
              ]}
            />
          </div>
          <div role="group" aria-label={t('components.dashboardCharts.scaleAria')}>
            <Tabs
              size="sm"
              value={scale}
              onValueChange={(value) => onScaleChange(value as ScaleMode)}
              tabs={[
                { value: 'linear', label: t('components.dashboardCharts.linear') },
                { value: 'symlog', label: t('components.dashboardCharts.symlog') },
              ]}
            />
          </div>
        </div>
      </LayerCard.Secondary>
      <LayerCard.Primary className="gap-3">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {definitions.map((definition) => (
            <ChartLegend.SmallItem
              key={definition.key}
              loading={loading}
              name={definition.name}
              color={definition.color}
              value={rows.reduce((sum, row) => sum + row[definition.key], 0).toLocaleString()}
            />
          ))}
        </div>
        {loading ? (
          <div className="flex h-70 items-center justify-center"><Loader /></div>
        ) : (
          <div className="cursor-crosshair select-none">
            <Chart ref={chartRef} echarts={echarts} options={options} optionUpdateBehavior={REPLACE_SERIES} height={CHART_HEIGHT} isDarkMode={isDarkMode} onEvents={events} />
          </div>
        )}
        <p className="text-xs text-kumo-subtle">{t('pages.dashboard.dragToSelect')}</p>
      </LayerCard.Primary>
    </LayerCard>
  );
}
