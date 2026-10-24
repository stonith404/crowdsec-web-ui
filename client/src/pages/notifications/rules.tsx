import { useState } from 'react';
import { PlusIcon, ListChecksIcon } from '@phosphor-icons/react';
import { Badge, Button, Empty, LayerCard, SkeletonLine } from '@cloudflare/kumo';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { ErrorAlert } from '@/components/error-alert';
import { RULE_TYPES, SEVERITIES } from '@/components/notifications/notification-types';
import { ResourceList, ResourceRow } from '@/components/notifications/resource-list';
import { RuleDialog } from '@/components/notifications/rule-dialog';
import { TestResultDialog, type TestResult } from '@/components/notifications/test-result-dialog';
import { useRefresh } from '@/contexts/useRefresh';
import { useServerData } from '@/hooks/use-server-data';
import { deleteNotificationRule, fetchNotificationSettings, testNotificationRule } from '@/lib/api';
import { toErrorInfo, type ErrorInfo } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import type { NotificationRule } from '@/types';

export function NotificationRules() {
  const { t } = useI18n();
  const { config } = useRefresh();
  const canManage = config?.permissions?.can_manage_settings !== false;
  const settings = useServerData('notification-settings', fetchNotificationSettings);
  const [editing, setEditing] = useState<NotificationRule | 'new' | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [deleting, setDeleting] = useState<NotificationRule | null>(null);
  const [deleteError, setDeleteError] = useState<ErrorInfo | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const rules = settings.data?.rules ?? [];
  const channels = settings.data?.channels ?? [];
  const channelNames = new Map(channels.map((channel) => [channel.id, channel.name]));

  const runTest = async (rule: NotificationRule) => {
    setTestingId(rule.id);
    try {
      const result = await testNotificationRule(rule.id);
      setTestResult({
        name: rule.name,
        help: t(result.source === 'current' ? 'pages.notifications.ruleTestCurrentHelp' : 'pages.notifications.ruleTestSampleHelp'),
        title: result.title,
        message: result.message,
        deliveries: result.deliveries,
      });
    } catch (error) {
      toast.error(toErrorInfo(error, t('pages.notifications.failedToSendRuleTest')).message);
    } finally {
      setTestingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteNotificationRule(deleting.id);
      setDeleting(null);
      settings.reload();
    } catch (error) {
      setDeleteError(toErrorInfo(error, t('pages.notifications.failedToDeleteRule')));
    } finally {
      setDeleteBusy(false);
    }
  };

  const addButton = canManage ? (
    <Button variant="primary" icon={<PlusIcon />} onClick={() => setEditing('new')}>{t('pages.notifications.addRule')}</Button>
  ) : null;

  return (
    <>
      {rules.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-kumo-subtle numeric">
            {`${t('pages.notifications.rulesCount', { count: rules.length })} · ${t('pages.notifications.activeCount', { count: rules.filter((rule) => rule.enabled).length })}`}
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
      ) : rules.length === 0 ? (
        <Empty icon={<ListChecksIcon size={48} className="text-kumo-subtle" />} title={t('pages.notifications.noRules')} description={t('pages.notifications.rulesEmptyDescription')} contents={addButton} />
      ) : (
        <ResourceList
          label={t('pages.notifications.rules')}
          items={rules}
          storageKey="crowdsec-web-ui:notifications:rule-order"
          sortable={canManage}
          dragLabel={(rule) => t('pages.notifications.reorderRule', { name: rule.name })}
        >
          {(rule) => (
            <ResourceRow
              icon={RULE_TYPES[rule.type].icon}
              name={rule.name}
              badges={(
                <>
                  <Badge variant={rule.enabled ? 'success' : 'secondary'}>{rule.enabled ? t('common.enabled') : t('common.disabled')}</Badge>
                  <Badge variant="outline">{t(RULE_TYPES[rule.type].labelKey)}</Badge>
                  <Badge variant={SEVERITIES[rule.severity].variant}>{t(SEVERITIES[rule.severity].labelKey)}</Badge>
                  {rule.channel_ids.length > 0 ? null : <Badge variant="warning">{t('pages.notifications.noDestinationsBadge')}</Badge>}
                </>
              )}
              details={t('pages.notifications.channels', {
                channels: rule.channel_ids.map((id) => channelNames.get(id) ?? id).join(', ') || t('pages.notifications.inAppOnly'),
              })}
              actions={canManage ? {
                editLabel: t('pages.notifications.editRule'),
                testLabel: t('pages.notifications.sendRuleTest'),
                deleteLabel: t('pages.notifications.deleteRule'),
                testDisabled: rule.channel_ids.length === 0,
                testing: testingId === rule.id,
                onEdit: () => setEditing(rule),
                onTest: () => void runTest(rule),
                onDelete: () => {
                  setDeleteError(null);
                  setDeleting(rule);
                },
              } : undefined}
            />
          )}
        </ResourceList>
      )}
      {editing ? (
        <RuleDialog rule={editing === 'new' ? null : editing} channels={channels} onClose={() => setEditing(null)} onSaved={settings.reload} />
      ) : null}
      <TestResultDialog result={testResult} onClose={() => setTestResult(null)} />
      <ConfirmDeleteDialog
        open={deleting !== null}
        title={t('pages.notifications.deleteRuleTitle')}
        description={t('pages.notifications.deleteRuleConfirm', { name: deleting?.name ?? '' })}
        error={deleteError}
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
