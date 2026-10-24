import { useCallback, useRef, useState } from 'react';
import { BookmarkSimpleIcon, ClockCounterClockwiseIcon, PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react';
import { Button, Input, Popover } from '@cloudflare/kumo';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/lib/i18n';
import {
  clearRecentFilters,
  createSavedFilter,
  deleteSavedFilter,
  fetchFilterLists,
  filterValidForPage,
  recordRecentFilter,
  renameSavedFilter,
  type FilterLists,
  type FilterPage,
} from '@/lib/savedFilters';

interface SavedFiltersMenuProps {
  page: FilterPage;
  query: string;
  onApply: (query: string) => void;
}

/** Saved and recent queries, kept per user so one user's lists never show for another */
export function SavedFiltersMenu(props: SavedFiltersMenuProps) {
  const { authEnabled, user } = useAuth();
  return <SavedFiltersMenuBody key={authEnabled ? user?.userId ?? 'signed-out' : 'shared'} {...props} />;
}

function SavedFiltersMenuBody({ page, query, onApply }: SavedFiltersMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<FilterLists | null>(null);
  const [name, setName] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const queryValid = filterValidForPage(query, page);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const next = await fetchFilterLists();
      if (id !== requestId.current) return;
      setLists(next);
      setError('');
    } catch (failure) {
      if (id === requestId.current) setError(failure instanceof Error ? failure.message : String(failure));
    }
  }, []);

  const mutate = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await operation();
      await reload();
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const apply = (value: string) => {
    onApply(value);
    setOpen(false);
    // Search stays usable when recording the history fails
    void recordRecentFilter(value).catch(() => undefined);
  };

  return (
    <Popover.Root open={open} onOpenChange={(next) => { setOpen(next); if (next) void reload(); }}>
      <Popover.Trigger render={<Button shape="square" icon={<BookmarkSimpleIcon />} aria-label={t('components.savedFilters.title')} title={t('components.savedFilters.title')} />} />
      <Popover.Portal>
        <Popover.Positioner align="end" sideOffset={8}>
          <Popover.Popup className="flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-3 p-3">
            <Popover.Title className="px-1 font-semibold">{t('components.savedFilters.title')}</Popover.Title>
            {lists?.shared ? <p className="px-1 text-xs text-kumo-warning">{t('components.savedFilters.shared')}</p> : null}
            {error ? <p role="alert" className="px-1 text-sm text-kumo-danger">{error}</p> : null}
            <form
              className="flex gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                if (await mutate(() => createSavedFilter(name, query.trim()))) setName('');
              }}
            >
              <Input
                className="flex-1"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                aria-label={t('components.savedFilters.name')}
                placeholder={t('components.savedFilters.name')}
                disabled={!queryValid}
              />
              <Button type="submit" variant="primary" disabled={busy || !name.trim() || !queryValid}>{t('common.save')}</Button>
            </form>
            {!queryValid ? <p className="px-1 text-xs text-kumo-subtle">{t('components.savedFilters.validQuery')}</p> : null}
            <section aria-label={t('components.savedFilters.saved')} className="flex max-h-64 flex-col gap-0.5 overflow-y-auto border-t border-kumo-hairline pt-3">
              <h3 className="px-1 pb-1 text-xs font-medium text-kumo-subtle">{t('components.savedFilters.saved')}</h3>
              {!lists && !error ? <p className="px-1 text-sm text-kumo-subtle">{t('components.savedFilters.loading')}</p> : null}
              {lists?.saved.length === 0 ? <p className="px-1 text-sm text-kumo-subtle">{t('components.savedFilters.emptySaved')}</p> : null}
              {lists?.saved.map((filter) => {
                const compatible = filterValidForPage(filter.query, page);
                return renameId === filter.id ? (
                  <form
                    key={filter.id}
                    className="flex gap-2 p-1"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (await mutate(() => renameSavedFilter(filter.id, renameValue))) setRenameId(null);
                    }}
                  >
                    <Input className="flex-1" autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} maxLength={80} aria-label={t('components.savedFilters.name')} />
                    <Button type="submit" size="sm" variant="primary" disabled={busy || !renameValue.trim()}>{t('common.save')}</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRenameId(null)}>{t('common.cancel')}</Button>
                  </form>
                ) : (
                  <div key={filter.id} className="group flex items-center gap-1 rounded-md hover:bg-kumo-tint">
                    <button
                      type="button"
                      disabled={!compatible || busy}
                      title={compatible ? filter.query : t('components.savedFilters.incompatible')}
                      onClick={() => apply(filter.query)}
                      className="flex min-w-0 flex-1 flex-col items-start px-2 py-1.5 text-start disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="max-w-full truncate text-sm font-medium">{filter.name}</span>
                      <span className="max-w-full truncate font-mono text-xs text-kumo-subtle">{filter.query}</span>
                    </button>
                    <Button variant="ghost" size="xs" shape="square" icon={<PencilSimpleIcon />} disabled={busy} aria-label={t('components.savedFilters.rename')} onClick={() => { setRenameId(filter.id); setRenameValue(filter.name); }} />
                    <Button variant="ghost" size="xs" shape="square" icon={<TrashIcon />} className="me-1 text-kumo-danger" disabled={busy} aria-label={t('common.delete')} onClick={() => void mutate(() => deleteSavedFilter(filter.id))} />
                  </div>
                );
              })}
            </section>
            <section aria-label={t('components.savedFilters.recent')} className="flex max-h-56 flex-col gap-0.5 overflow-y-auto border-t border-kumo-hairline pt-3">
              <div className="flex items-center justify-between px-1 pb-1">
                <h3 className="text-xs font-medium text-kumo-subtle">{t('components.savedFilters.recent')}</h3>
                {lists?.recent.length ? (
                  <Button variant="ghost" size="xs" disabled={busy} onClick={() => void mutate(clearRecentFilters)}>{t('components.savedFilters.clearRecent')}</Button>
                ) : null}
              </div>
              {lists?.recent.length === 0 ? <p className="px-1 text-sm text-kumo-subtle">{t('components.savedFilters.emptyRecent')}</p> : null}
              {lists?.recent.map((filter) => {
                const compatible = filterValidForPage(filter.query, page);
                return (
                  <button
                    key={filter.query}
                    type="button"
                    disabled={!compatible || busy}
                    title={compatible ? undefined : t('components.savedFilters.incompatible')}
                    onClick={() => apply(filter.query)}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-start hover:bg-kumo-tint disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ClockCounterClockwiseIcon className="size-3.5 shrink-0 text-kumo-subtle" />
                    <span className="truncate font-mono text-xs">{filter.query}</span>
                  </button>
                );
              })}
            </section>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
