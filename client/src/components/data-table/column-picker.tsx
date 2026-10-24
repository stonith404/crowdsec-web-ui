import { ArrowDownIcon, ArrowUpIcon, ColumnsIcon } from '@phosphor-icons/react';
import { Button, Checkbox, Popover } from '@cloudflare/kumo';
import { useI18n } from '@/lib/i18n';
import type { TableColumnId } from '@/types';

/** Shows, hides and reorders the columns of a table, which the browser remembers */
export function ColumnPicker({
  order,
  visible,
  onChange,
}: {
  order: TableColumnId[];
  visible: TableColumnId[];
  onChange: (order: TableColumnId[], visible: TableColumnId[]) => void;
}) {
  const { t } = useI18n();

  const move = (index: number, offset: number) => {
    const next = [...order];
    const [column] = next.splice(index, 1);
    next.splice(index + offset, 0, column);
    onChange(next, visible);
  };

  const toggle = (column: TableColumnId, checked: boolean) => {
    const nextVisible = checked ? [...visible, column] : visible.filter((candidate) => candidate !== column);
    // A table always keeps at least one column
    if (nextVisible.length > 0) onChange(order, nextVisible);
  };

  return (
    <Popover.Root>
      <Popover.Trigger render={<Button shape="square" icon={<ColumnsIcon />} aria-label={t('components.table.columns')} title={t('components.table.columns')} />} />
      <Popover.Portal>
        <Popover.Positioner align="end" sideOffset={8}>
          {/* Only keyboard users start on the first checkbox; for a click its focus ring would just highlight a random column */}
          <Popover.Popup className="w-60 p-0" initialFocus={(openType) => openType === 'keyboard'}>
            <div className="border-b border-kumo-hairline px-3 py-2 text-sm font-medium">{t('components.table.columns')}</div>
            <ul className="flex max-h-96 flex-col overflow-y-auto p-1">
              {order.map((column, index) => {
                const label = t(`tableColumns.${column}`);
                return (
                  <li key={column} className="group flex h-8 items-center gap-1 rounded-md ps-2 pe-1 hover:bg-kumo-tint">
                    <div className="min-w-0 flex-1">
                      <Checkbox label={<span className="text-sm font-normal">{label}</span>} checked={visible.includes(column)} onCheckedChange={(checked) => toggle(column, checked)} />
                    </div>
                    {/* Reorder buttons only show for the row under the pointer or keyboard focus, so the list reads as a plain checklist */}
                    <div className="flex opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                      <Button variant="ghost" size="xs" shape="square" icon={<ArrowUpIcon />} disabled={index === 0} aria-label={t('components.table.moveUp', { column: label })} onClick={() => move(index, -1)} />
                      <Button variant="ghost" size="xs" shape="square" icon={<ArrowDownIcon />} disabled={index === order.length - 1} aria-label={t('components.table.moveDown', { column: label })} onClick={() => move(index, 1)} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
