import { useState } from 'react';
import { PlusIcon, PaperPlaneTiltIcon } from '@phosphor-icons/react';
import { Badge, Button, Empty, LayerCard, SkeletonLine } from '@cloudflare/kumo';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { ErrorAlert } from '@/components/error-alert';
import { DestinationDialog } from '@/components/notifications/destination-dialog';
import { CHANNEL_TYPES } from '@/components/notifications/notification-types';
import { ResourceList, ResourceRow } from '@/components/notifications/resource-list';
import { TestResultDialog, type TestResult } from '@/components/notifications/test-result-dialog';
import { useRefresh } from '@/contexts/useRefresh';
import { useServerData } from '@/hooks/use-server-data';
import { deleteNotificationChannel, fetchNotificationSettings, testNotificationChannel } from '@/lib/api';
import { useDateTime } from '@/lib/dateTime';
import { toErrorInfo, type ErrorInfo } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import type { NotificationChannel } from '@/types';

export function NotificationDestinations() {
  const { t } = useI18n();
  const { formatDateTime } = useDateTime();
  const { config } = useRefresh();
  const canManage = config?.permissions?.can_manage_settings !== false;
  const settings = useServerData('notification-settings', fetchNotificationSettings);
  const [editing, setEditing] = useState<NotificationChannel | 'new' | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [deleting, setDeleting] = useState<NotificationChannel | null>(null);
  const [deleteError, setDeleteError] = useState<ErrorInfo | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const channels = settings.data?.channels ?? [];
  const linkedIds = new Set(settings.data?.rules.flatMap((rule) => rule.channel_ids));

  const runTest = async (channel: NotificationChannel) => {
    setTestingId(channel.id);
    try {
      const result = await testNotificationChannel(channel.id);
      setTestResult({ name: channel.name, title: result.title, message: result.message, deliveries: [result.delivery] });
    } catch (error) {
      toast.error(toErrorInfo(error, t('pages.notifications.failedToSendTest')).message);
    } finally {
      setTestingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteNotificationChannel(deleting.id);
      setDeleting(null);
      settings.reload();
    } catch (error) {
      setDeleteError(toErrorInfo(error, t('pages.notifications.failedToDeleteDestination')));
    } finally {
      setDeleteBusy(false);
    }
  };

  const addButton = canManage ? (
    <Button variant="primary" icon={<PlusIcon />} onClick={() => setEditing('new')}>{t('pages.notifications.addDestination')}</Button>
  ) : null;

  return (
    <>
      {channels.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-kumo-subtle numeric">
            {`${t('pages.notifications.destinationsCount', { count: channels.length })} · ${t('pages.notifications.activeCount', { count: channels.filter((channel) => channel.enabled).length })}`}
          </p>
          {addButton}
        </div>
      ) : null}
      {settings.error && !settings.data ? (
        <ErrorAlert error={toErrorInfo(settings.error, t('pages.notifications.failedToLoad'))} />
      ) : settings.loading ? (
        <LayerCard className="flex flex-col gap-4 p-4">
          <SkeletonLine />
          <SkeletonLine />
          <SkeletonLine />
        </LayerCard>
      ) : channels.length === 0 ? (
        <Empty icon={<PaperPlaneTiltIcon size={48} className="text-kumo-subtle" />} title={t('pages.notifications.noDestinations')} description={t('pages.notifications.destinationsEmptyDescription')} contents={addButton} />
      ) : (
        <ResourceList
          label={t('pages.notifications.destinations')}
          items={channels}
          storageKey="crowdsec-web-ui:notifications:destination-order"
          sortable={canManage}
          dragLabel={(channel) => t('pages.notifications.reorderDestination', { name: channel.name })}
        >
          {(channel) => (
            <ResourceRow
              icon={CHANNEL_TYPES[channel.type].icon}
              name={channel.name}
              badges={(
                <>
                  <Badge variant={channel.enabled ? 'success' : 'secondary'}>{channel.enabled ? t('common.enabled') : t('common.disabled')}</Badge>
                  <Badge variant="outline">{t(CHANNEL_TYPES[channel.type].labelKey)}</Badge>
                  {linkedIds.has(channel.id) ? null : <Badge variant="warning">{t('pages.notifications.noRuleAttached')}</Badge>}
                </>
              )}
              details={(
                <>
                  {t('pages.notifications.updatedAt', { time: formatDateTime(channel.updated_at) })}
                  {channel.configured_secrets.length > 0 ? ` · ${t('pages.notifications.savedSecrets', { secrets: channel.configured_secrets.join(', ') })}` : null}
                </>
              )}
              actions={canManage ? {
                editLabel: t('pages.notifications.editDestination'),
                testLabel: t('pages.notifications.sendTest'),
                deleteLabel: t('pages.notifications.deleteDestination'),
                testDisabled: !channel.enabled,
                testing: testingId === channel.id,
                onEdit: () => setEditing(channel),
                onTest: () => void runTest(channel),
                onDelete: () => {
                  setDeleteError(null);
                  setDeleting(channel);
                },
              } : undefined}
            />
          )}
        </ResourceList>
      )}
      {editing ? (
        <DestinationDialog channel={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={settings.reload} />
      ) : null}
      <TestResultDialog result={testResult} onClose={() => setTestResult(null)} />
      <ConfirmDeleteDialog
        open={deleting !== null}
        title={t('pages.notifications.deleteDestinationTitle')}
        description={t('pages.notifications.deleteDestinationConfirm', { name: deleting?.name ?? '' })}
        error={deleteError}
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
