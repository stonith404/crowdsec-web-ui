import { useState } from 'react';
import { getMetaValueItems, type DisplayMetadataEntry } from '@/lib/alertMetadata';
import { useI18n } from '@/lib/i18n';

const COLLAPSED_VALUES = 5;

/** Key and value rows of alert or event metadata, where long lists of values collapse to their first few */
export function MetadataList({ entries }: { entries: DisplayMetadataEntry[] }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

  return (
    <dl className="divide-y divide-kumo-hairline overflow-hidden rounded-lg text-sm ring-1 ring-kumo-hairline">
      {entries.map((entry, index) => {
        const items = getMetaValueItems(entry.value);
        const isExpanded = expanded.has(index);
        const hidden = items ? Math.max(0, items.length - COLLAPSED_VALUES) : 0;
        const visible = items && !isExpanded ? items.slice(0, COLLAPSED_VALUES) : items;
        return (
          <div key={`${entry.key}-${index}`} className="grid grid-cols-1 sm:grid-cols-[minmax(8rem,12rem)_1fr]">
            <dt className="bg-kumo-elevated px-3 py-2 text-xs font-medium break-all text-kumo-subtle">{entry.key}</dt>
            <dd className="min-w-0 divide-y divide-kumo-hairline bg-kumo-base">
              {visible ? (
                <>
                  {visible.map((item, itemIndex) => <div key={`${item}-${itemIndex}`} className="px-3 py-2 font-mono text-xs break-all">{item}</div>)}
                  {hidden > 0 ? (
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-start text-xs font-medium text-kumo-link hover:bg-kumo-tint"
                      onClick={() => setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(index)) next.delete(index);
                        else next.add(index);
                        return next;
                      })}
                    >
                      {isExpanded
                        ? t('pages.alerts.showFewerContextValues', { count: COLLAPSED_VALUES })
                        : t('pages.alerts.showAllContextValues', { total: items!.length, remaining: hidden })}
                    </button>
                  ) : null}
                </>
              ) : (
                <span className="block px-3 py-2 font-mono text-xs break-all">{entry.formattedValue}</span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
