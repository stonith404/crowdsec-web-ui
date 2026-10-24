import { useState } from 'react';
import { ArrowsClockwiseIcon, CaretDownIcon } from '@phosphor-icons/react';
import { Button, Dialog, DropdownMenu, cn } from '@cloudflare/kumo';
import { useRefresh } from '@/contexts/useRefresh';
import { useDateTime } from '@/lib/dateTime';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import type { ManualRefreshMode } from '@/types';

const INTERVALS = [
  { ms: 0, labelKey: 'components.sidebar.refresh.off' },
  { ms: 5000, labelKey: 'components.sidebar.refresh.every5Seconds' },
  { ms: 30000, labelKey: 'components.sidebar.refresh.every30Seconds' },
  { ms: 60000, labelKey: 'components.sidebar.refresh.every1Minute' },
  { ms: 300000, labelKey: 'components.sidebar.refresh.every5Minutes' },
];

/** Cloudflare's Live control: shows whether data refreshes on its own and when it last did, and refreshes on demand */
export function RefreshMenu() {
  const { t } = useI18n();
  const { formatTime } = useDateTime();
  const { config, intervalMs, setIntervalMs, lastUpdated, syncStatus, refreshNow } = useRefresh();
  const [refreshing, setRefreshing] = useState(false);
  const [confirmFull, setConfirmFull] = useState(false);
  const manualRefreshEnabled = config?.manual_refresh_enabled === true && Boolean(refreshNow);
  const canChangeInterval = config?.permissions?.can_manage_settings !== false;
  const busy = refreshing || Boolean(syncStatus?.isSyncing);
  const live = intervalMs > 0;

  const run = async (mode: ManualRefreshMode) => {
    setConfirmFull(false);
    setRefreshing(true);
    try {
      await refreshNow?.(mode);
      toast.success(t('components.sidebar.refresh.completed'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('components.sidebar.refresh.failed'));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenu.Trigger
          render={(
            <Button variant="ghost" size="sm" className="gap-2 text-kumo-subtle" aria-label={t('components.sidebar.refresh')}>
              <span className="relative flex size-2" aria-hidden="true">
                {live && !busy ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-kumo-success opacity-60" /> : null}
                <span className={cn('relative inline-flex size-2 rounded-full', busy ? 'animate-pulse bg-kumo-info' : live ? 'bg-kumo-success' : 'bg-kumo-fill')} />
              </span>
              <span className="hidden numeric sm:inline">
                {busy
                  ? t('components.layout.syncing')
                  : lastUpdated
                    ? t('components.layout.lastRefreshAt', { time: formatTime(lastUpdated, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })
                    : t('components.sidebar.lastRefreshNever')}
              </span>
              <CaretDownIcon className="size-3.5" />
            </Button>
          )}
        />
        <DropdownMenu.Content align="end" className="min-w-52">
          {canChangeInterval ? (
            <DropdownMenu.Group>
              <DropdownMenu.Label>{t('components.layout.autoRefresh')}</DropdownMenu.Label>
              <DropdownMenu.RadioGroup
                value={String(intervalMs)}
                onValueChange={(value: string) => { setIntervalMs(Number(value)).catch(() => toast.error(t('components.sidebar.refresh.failed'))); }}
              >
                {INTERVALS.map((interval) => (
                  <DropdownMenu.RadioItem key={interval.ms} value={String(interval.ms)}>
                    {t(interval.labelKey)}
                    <DropdownMenu.RadioItemIndicator />
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Group>
          ) : null}
          {manualRefreshEnabled ? (
            <>
              {canChangeInterval ? <DropdownMenu.Separator /> : null}
              <DropdownMenu.Group>
                <DropdownMenu.Label>{t('components.sidebar.refresh.chooseType')}</DropdownMenu.Label>
                <DropdownMenu.Item icon={ArrowsClockwiseIcon} disabled={busy} onClick={() => void run('delta')}>{t('components.sidebar.refresh.deltaNow')}</DropdownMenu.Item>
                <DropdownMenu.Item icon={ArrowsClockwiseIcon} disabled={busy} onClick={() => void run('latest')}>{t('components.sidebar.refresh.latestNow')}</DropdownMenu.Item>
                <DropdownMenu.Item icon={ArrowsClockwiseIcon} disabled={busy} onClick={() => setConfirmFull(true)}>{t('components.sidebar.refresh.fullNow')}</DropdownMenu.Item>
              </DropdownMenu.Group>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu>
      <Dialog.Root open={confirmFull} onOpenChange={setConfirmFull}>
        <Dialog className="p-6">
          <Dialog.Title className="text-lg font-semibold">{t('components.sidebar.refresh.fullConfirmTitle')}</Dialog.Title>
          <Dialog.Description className="mt-2 text-kumo-subtle">{t('components.sidebar.refresh.fullConfirmDescription')}</Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close render={(props) => <Button {...props}>{t('common.cancel')}</Button>} />
            <Button variant="primary" onClick={() => void run('full')}>{t('components.sidebar.refresh.confirmFull')}</Button>
          </div>
        </Dialog>
      </Dialog.Root>
    </>
  );
}
