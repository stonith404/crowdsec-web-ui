import type { ReactNode } from 'react';
import { LayerCard, SkeletonLine, cn } from '@cloudflare/kumo';
import { useI18n } from '@/lib/i18n';

export interface TopListItem {
  /** The facet value a click filters by */
  value: string;
  label: ReactNode;
  title?: string;
  count: number;
}

/** A Cloudflare analytics top list like "Top content types": each value with its count, share and an inline bar, where a click toggles the value as a filter */
export function TopListCard({
  title,
  icon,
  items,
  total,
  selected,
  onToggle,
  action,
  loading = false,
}: {
  title: string;
  icon: ReactNode;
  items: TopListItem[];
  total: number;
  selected: string[];
  onToggle?: (value: string) => void;
  action?: ReactNode;
  loading?: boolean;
}) {
  const { t } = useI18n();

  return (
    <LayerCard>
      <LayerCard.Secondary className="min-h-14 justify-between py-3">
        <span className="flex min-w-0 items-center gap-2 text-kumo-default">
          {icon}
          <span className="truncate">{title}</span>
        </span>
        {action}
      </LayerCard.Secondary>
      <LayerCard.Primary className="flex-1 gap-0 p-2">
        {loading ? (
          <div className="flex flex-col gap-3 p-2">
            {Array.from({ length: 5 }, (_, index) => <SkeletonLine key={index} />)}
          </div>
        ) : items.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-kumo-subtle">{t('common.noDataAvailable')}</p>
        ) : (
          <ul className="flex flex-col">
            {items.map((item) => {
              const share = total > 0 ? Math.min(100, (item.count / total) * 100) : 0;
              const active = selected.includes(item.value);
              return (
                <li key={item.value}>
                  <button
                    type="button"
                    disabled={!onToggle}
                    aria-pressed={active}
                    onClick={() => onToggle?.(item.value)}
                    title={item.title}
                    className={cn(
                      'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-md px-2 py-2 text-start text-sm text-kumo-default outline-none hover:bg-kumo-tint focus-visible:ring-2 focus-visible:ring-kumo-brand disabled:cursor-default disabled:hover:bg-transparent',
                      active && 'bg-kumo-info-tint hover:bg-kumo-info-tint',
                    )}
                  >
                    <span className="min-w-0 truncate">{item.label}</span>
                    <span className="flex items-baseline gap-2 numeric">
                      <span className="font-medium">{item.count.toLocaleString()}</span>
                      <span className="w-12 text-end text-xs text-kumo-subtle">{share >= 0.1 ? `${share.toFixed(share < 10 ? 1 : 0)}%` : '<0.1%'}</span>
                    </span>
                    <span className="col-span-full h-1.5 overflow-hidden rounded-full bg-kumo-recessed" aria-hidden="true">
                      <span className="block h-full rounded-full bg-kumo-brand" style={{ width: `${share}%` }} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </LayerCard.Primary>
    </LayerCard>
  );
}
