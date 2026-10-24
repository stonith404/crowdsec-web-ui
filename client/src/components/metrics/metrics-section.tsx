import type { ReactNode } from 'react';
import { InfoIcon } from '@phosphor-icons/react';
import { Empty, LayerCard, Table, Tooltip, cn } from '@cloudflare/kumo';
import { useI18n } from '@/lib/i18n';

interface MetricsColumn<T> {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  numeric?: boolean;
  className?: string;
}

/** A metrics card holding a compact table, with a leading column naming the metrics endpoint of each row when several are combined */
export function MetricsSection<T>({
  title,
  description,
  action,
  footer,
  rows,
  rowKey,
  columns,
  source,
  emptyMessage,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  footer?: ReactNode;
  rows: T[];
  rowKey: (row: T) => string;
  columns: MetricsColumn<T>[];
  source?: (row: T) => ReactNode;
  emptyMessage: string;
}) {
  const { t } = useI18n();

  return (
    <LayerCard>
      <LayerCard.Secondary className="my-0 justify-between py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="font-semibold text-kumo-default">{title}</h2>
          {description ? <p className="text-sm font-normal">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </LayerCard.Secondary>
      <LayerCard.Primary className="p-0">
        {rows.length === 0 ? (
          <Empty size="sm" title={emptyMessage} className="rounded-none border-0" />
        ) : (
          <div className="overflow-x-auto">
            <Table aria-label={title} className="text-start whitespace-nowrap">
              <Table.Header variant="compact">
                <Table.Row>
                  {source ? <Table.Head className="text-start">{t('pages.metrics.metricsEndpoint')}</Table.Head> : null}
                  {columns.map((column, index) => (
                    <Table.Head key={index} className={cn(column.numeric ? 'text-end' : 'text-start', column.className)}>{column.header}</Table.Head>
                  ))}
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rows.map((row) => (
                  <Table.Row key={rowKey(row)}>
                    {source ? <Table.Cell className="max-w-56">{source(row)}</Table.Cell> : null}
                    {columns.map((column, index) => (
                      <Table.Cell key={index} className={cn(column.numeric && 'text-end numeric', column.className)}>{column.cell(row)}</Table.Cell>
                    ))}
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </LayerCard.Primary>
      {footer ? <LayerCard.Secondary className="text-sm font-normal">{footer}</LayerCard.Secondary> : null}
    </LayerCard>
  );
}

/** A column header with an info icon that explains how to read the column */
export function HeaderHint({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <Tooltip content={hint} className="text-kumo-subtle hover:text-kumo-default" render={<button type="button" aria-label={hint} />}>
        <InfoIcon size={14} />
      </Tooltip>
    </span>
  );
}

/** An inline bar whose start is the healthy share in green and whose rest is amber */
export function SplitBar({ healthy }: { healthy: number }) {
  return (
    <span className="inline-block h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-kumo-warning" aria-hidden="true">
      <span className="block h-full bg-kumo-success" style={{ width: `${Math.min(100, Math.max(0, healthy * 100))}%` }} />
    </span>
  );
}
