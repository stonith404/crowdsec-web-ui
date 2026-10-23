import { useEffect, useRef, useState, type ReactNode } from 'react';
import Sortable from 'sortablejs';
import { DotsSixVerticalIcon, DotsThreeIcon, PaperPlaneTiltIcon, PencilSimpleIcon, TrashIcon, type Icon } from '@phosphor-icons/react';
import { Button, DropdownMenu, LayerCard } from '@cloudflare/kumo';
import { useI18n } from '@/lib/i18n';

function readOrder(storageKey: string): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** A list of destinations or rules whose order the user can drag, which only this browser remembers */
export function ResourceList<T extends { id: string }>({
  label,
  items,
  storageKey,
  sortable,
  dragLabel,
  children,
}: {
  label: string;
  items: T[];
  storageKey: string;
  sortable: boolean;
  dragLabel: (item: T) => string;
  children: (item: T) => ReactNode;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const [order, setOrder] = useState(() => readOrder(storageKey));
  const rank = new Map(order.map((id, index) => [id, index]));
  const ordered = [...items].sort((a, b) => (rank.get(a.id) ?? order.length) - (rank.get(b.id) ?? order.length));
  const draggable = sortable && items.length > 1;

  useEffect(() => {
    if (!draggable || !listRef.current) return;
    const instance = Sortable.create(listRef.current, {
      animation: 150,
      handle: '[data-drag-handle]',
      onEnd: ({ item, from, oldIndex, newIndex }) => {
        if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return;
        const next = Array.from(from.children, (child) => (child as HTMLElement).dataset.id ?? '');
        // React owns these nodes, so Sortable's move is undone and React renders the new order itself
        from.insertBefore(item, from.children[oldIndex > newIndex ? oldIndex + 1 : oldIndex] ?? null);
        setOrder(next);
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // Without storage the order lasts until the page reloads
        }
      },
    });
    return () => instance.destroy();
  }, [draggable, storageKey]);

  return (
    <LayerCard>
      <ul ref={listRef} aria-label={label} className="divide-y divide-kumo-hairline">
        {ordered.map((item) => (
          <li key={item.id} data-id={item.id} className="flex items-center gap-3 bg-kumo-base px-3 py-3 sm:px-4">
            {draggable ? (
              <Button
                data-drag-handle
                variant="ghost"
                size="sm"
                shape="square"
                icon={<DotsSixVerticalIcon weight="bold" />}
                className="-ms-1.5 cursor-grab text-kumo-subtle active:cursor-grabbing"
                aria-label={dragLabel(item)}
              />
            ) : null}
            {children(item)}
          </li>
        ))}
      </ul>
    </LayerCard>
  );
}

export interface ResourceActions {
  editLabel: string;
  testLabel: string;
  deleteLabel: string;
  testDisabled: boolean;
  testing: boolean;
  onEdit: () => void;
  onTest: () => void;
  onDelete: () => void;
}

/** One destination or rule: its type icon, name, status badges, a line of details and, when settings can be changed, its actions */
export function ResourceRow({
  icon: TypeIcon,
  name,
  badges,
  details,
  actions,
}: {
  icon: Icon;
  name: string;
  badges: ReactNode;
  details: ReactNode;
  actions?: ResourceActions;
}) {
  const { t } = useI18n();

  return (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-kumo-recessed text-kumo-subtle">
        <TypeIcon size={18} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {actions ? (
            <button type="button" className="min-w-0 truncate text-start font-medium text-kumo-default outline-none hover:underline focus-visible:underline" onClick={actions.onEdit}>
              {name}
            </button>
          ) : (
            <span className="min-w-0 truncate font-medium text-kumo-default">{name}</span>
          )}
          {badges}
        </div>
        <div className="text-sm text-kumo-subtle">{details}</div>
      </div>
      {actions ? (
        <DropdownMenu>
          <DropdownMenu.Trigger
            render={<Button variant="ghost" size="sm" shape="square" icon={<DotsThreeIcon weight="bold" />} loading={actions.testing} aria-label={t('tableColumns.actions')} />}
          />
          <DropdownMenu.Content align="end">
            <DropdownMenu.Item icon={PencilSimpleIcon} onClick={actions.onEdit}>{actions.editLabel}</DropdownMenu.Item>
            <DropdownMenu.Item icon={PaperPlaneTiltIcon} disabled={actions.testDisabled} onClick={actions.onTest}>{actions.testLabel}</DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item icon={TrashIcon} variant="danger" onClick={actions.onDelete}>{actions.deleteLabel}</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      ) : null}
    </>
  );
}
