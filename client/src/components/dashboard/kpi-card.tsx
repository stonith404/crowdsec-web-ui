import { useMemo, type ReactNode } from 'react';
import { ArrowRightIcon } from '@phosphor-icons/react';
import { Chart, ChartPalette, Label, LinkButton, SkeletonLine } from '@cloudflare/kumo';
import { echarts } from '@/lib/echarts';
import { useIsDarkMode } from '@/lib/theme';

interface KpiProps {
  label: string;
  /** Explanation behind an info icon next to the label */
  info?: string;
  value: ReactNode;
  href?: string;
  linkLabel?: string;
  sparkline?: number[];
  footer?: ReactNode;
  loading?: boolean;
}

/** One cell of a Cloudflare summary card: the label, a large figure, a muted line under it and a sparkline flush with the bottom edge */
export function KpiCell({ label, info, value, href, linkLabel, sparkline, footer, loading = false }: KpiProps) {
  const isDarkMode = useIsDarkMode();
  const color = ChartPalette.categorical(0, isDarkMode);
  const sparklineOptions = useMemo(() => (sparkline && sparkline.length > 1 ? {
    animation: false,
    grid: { left: 0, right: 0, top: 2, bottom: 0 },
    xAxis: { type: 'category' as const, show: false, boundaryGap: false },
    yAxis: { type: 'value' as const, show: false, min: 0 },
    series: [{
      type: 'line' as const,
      data: sparkline,
      silent: true,
      showSymbol: false,
      smooth: true,
      lineStyle: { width: 1.5, color },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: `${color}40` }, { offset: 1, color: `${color}00` }]) },
    }],
  } : null), [color, sparkline]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-col gap-1 p-4">
        <div className="flex min-h-7 items-center justify-between gap-2">
          <Label asContent tooltip={info} className="min-w-0 text-sm font-normal whitespace-nowrap text-kumo-subtle">{label}</Label>
          {href ? (
            <LinkButton href={href} variant="ghost" size="sm" shape="square" icon={<ArrowRightIcon className="rtl:rotate-180" />} aria-label={linkLabel} title={linkLabel} />
          ) : null}
        </div>
        {loading ? <SkeletonLine className="my-1.5 h-7 w-28" /> : <div className="text-3xl font-semibold text-kumo-default numeric">{value}</div>}
        {footer ? <div className="text-sm text-kumo-subtle numeric">{footer}</div> : null}
      </div>
      {sparklineOptions ? (
        <div className="mt-auto">
          <Chart echarts={echarts} options={sparklineOptions} height={40} isDarkMode={isDarkMode} />
        </div>
      ) : null}
    </div>
  );
}
