import { CheckCircleIcon, CircleNotchIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { Banner, Collapsible, Meter } from '@cloudflare/kumo';
import { InstanceIcon } from '@/components/instance-icon';
import { useRefresh } from '@/contexts/useRefresh';
import { useI18n } from '@/lib/i18n';
import { instanceStatusMessage, translateSyncMessage } from '@/lib/syncMessages';

/** Shows the historical sync above the page while it runs, without blocking the pages that already have data */
export function SyncBanner() {
  const { t } = useI18n();
  const { syncStatus } = useRefresh();
  if (!syncStatus?.isSyncing) return null;

  const progress = syncStatus.progress || 0;
  const instances = (syncStatus.instances?.length ?? 0) > 1 ? syncStatus.instances! : null;
  const finished = instances?.filter((instance) => Boolean(instance.completedAt)).length ?? 0;

  return (
    <div aria-live="polite" className="flex flex-col gap-3">
      <Banner
        icon={<CircleNotchIcon className="animate-spin" />}
        title={t('components.syncOverlay.title')}
        description={translateSyncMessage(syncStatus.message, t)}
      />
      <Meter label={t('components.syncOverlay.title')} value={progress} showValue />
      {instances ? (
        <Collapsible.Root>
          <Collapsible.DefaultTrigger>{t('components.syncOverlay.instancesProgress', { completed: finished, total: instances.length })}</Collapsible.DefaultTrigger>
          <Collapsible.DefaultPanel>
          <ul className="grid gap-3 sm:grid-cols-2">
            {instances.map((instance, index) => {
              const failed = instance.state === 'failed';
              const complete = instance.state === 'complete' && instance.progress === 100;
              return (
                <li key={instance.instance_id} className="flex flex-col gap-1.5 rounded-lg bg-kumo-base p-3 ring-1 ring-kumo-hairline">
                  <div className="flex items-center gap-2">
                    <InstanceIcon name={instance.instance_name} colorIndex={index} />
                    <span className="min-w-0 flex-1 truncate font-medium">{instance.instance_name}</span>
                    {failed ? <WarningCircleIcon className="text-kumo-danger" /> : complete ? <CheckCircleIcon className="text-kumo-success" /> : null}
                  </div>
                  <Meter label={instanceStatusMessage(instance, t)} value={instance.progress} showValue />
                </li>
              );
            })}
          </ul>
          </Collapsible.DefaultPanel>
        </Collapsible.Root>
      ) : null}
    </div>
  );
}
