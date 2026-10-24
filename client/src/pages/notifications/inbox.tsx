import { useState } from 'react';
import { BellSimpleSlashIcon, CheckIcon, ChecksIcon, DotsThreeIcon, TrashIcon } from '@phosphor-icons/react';
import { Badge, Button, DropdownMenu, Empty, Link as KumoLink, LinkButton, cn } from '@cloudflare/kumo';
import { TimeCell } from '@/components/cells';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { DataTable, type Column } from '@/components/data-table/data-table';
import { ErrorAlert } from '@/components/error-alert';
import { DELIVERY_STATUSES, SEVERITIES } from '@/components/notifications/notification-types';
import { useBranding } from '@/contexts/useBranding';
import { useNotificationUnreadCount } from '@/contexts/useNotificationUnreadCount';
import { useRefresh } from '@/contexts/useRefresh';
import { useServerData } from '@/hooks/use-server-data';
import { bulkDeleteNotifications, deleteNotification, deleteReadNotifications, fetchNotificationsPaginated, markNotificationRead, markNotificationsRead } from '@/lib/api';
import { toErrorInfo, type ErrorInfo } from '@/lib/errors';
import { useI18n, type TranslationValues } from '@/lib/i18n';
import { usePagination } from '@/lib/pagination';
import type { NotificationItem } from '@/types';

type DeleteAction = { kind: 'single'; item: NotificationItem } | { kind: 'selected'; ids: string[] } | { kind: 'read' };
type Translate = (key: string, values?: TranslationValues) => string;

const RELEASE_URL_PREFIX = 'https://github.com/crowdsecurity/crowdsec/releases/';

function metadataString(item: NotificationItem, key: string): string | null {
  const value = item.metadata[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function metadataNumber(item: NotificationItem, key: string): number | null {
  const value = item.metadata[key];
  const number = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
}

/** The title and message in the viewer's language, from the metadata the server stores, or else as the server wrote them */
function localize(item: NotificationItem, t: Translate, appName: string): { title: string; message: string } {
  const ruleName = { ruleName: item.rule_name };
  const text = (titleKey: string, messageKey: string, values: TranslationValues) => ({ title: t(titleKey, ruleName), message: t(messageKey, values) });
  const string = (key: string) => metadataString(item, key);
  const number = (key: string) => metadataNumber(item, key);

  if (item.rule_type === 'alert-spike') {
    const values = { count: number('current_count'), minutes: number('window_minutes'), percent: number('increase_percent'), previousCount: number('previous_count') };
    if (Object.values(values).every((value) => value !== null)) return text('server.notifications.alertSpike.title', 'server.notifications.alertSpike.message', values);
  }
  if (item.rule_type === 'alert-threshold') {
    const values = { count: number('matched_alerts'), minutes: number('window_minutes'), threshold: number('threshold') };
    if (Object.values(values).every((value) => value !== null)) return text('server.notifications.alertThreshold.title', 'server.notifications.alertThreshold.message', values);
  }
  if (item.rule_type === 'new-alert-decision') {
    const eventType = string('event_type');
    const id = string(eventType === 'alert' ? 'alert_id' : 'decision_id');
    const scenario = string('scenario');
    const target = string('target');
    const createdAt = string('created_at');
    if (id && scenario && target && createdAt) {
      if (eventType === 'alert') {
        return text('server.notifications.newEvent.alertTitle', 'server.notifications.newEvent.alertMessage', {
          id, scenario, target, createdAt, source: string('source') || '—', description: string('message') || '—',
        });
      }
      if (eventType === 'decision') {
        return text('server.notifications.newEvent.decisionTitle', 'server.notifications.newEvent.decisionMessage', {
          id, scenario, target, createdAt, type: string('type') || '—', value: string('value') || '—', stopAt: string('stop_at') || '—',
        });
      }
    }
  }
  if (item.rule_type === 'new-cve') {
    const values = { cveId: string('cve_id'), ageDays: number('age_days'), count: number('matched_alerts') };
    if (Object.values(values).every((value) => value !== null)) return text('server.notifications.newCve.title', 'server.notifications.newCve.message', values);
  }
  if (item.rule_type === 'ip-ban') {
    const value = string('value');
    const scenario = string('scenario');
    const stopAt = string('stop_at');
    if (value) {
      return text('server.notifications.ipBan.title', 'server.notifications.ipBan.message', {
        value,
        scenarioDetail: scenario ? t('server.notifications.ipBan.scenarioDetail', { scenario }) : '',
        stopAtDetail: stopAt ? t('server.notifications.ipBan.stopAtDetail', { stopAt }) : '',
      });
    }
  }
  if (item.rule_type === 'application-update') {
    const targetVersion = string('remote_version');
    if (targetVersion) {
      return text('server.notifications.applicationUpdate.title', 'server.notifications.applicationUpdate.message', {
        appName,
        currentVersion: string('local_version') || t('server.notifications.currentVersion'),
        targetVersion: string('tag') === 'dev' ? `dev-${targetVersion}` : targetVersion,
      });
    }
  }
  if (item.rule_type === 'crowdsec-update') {
    const values = { instanceName: string('instance_name'), endpointName: string('endpoint_name'), currentVersion: string('local_version'), targetVersion: string('remote_version') };
    if (Object.values(values).every(Boolean)) return text('server.notifications.crowdsecUpdate.title', 'server.notifications.crowdsecUpdate.message', values);
  }
  if (item.rule_type === 'lapi-availability') {
    const seconds = number('outage_duration_seconds');
    if (seconds !== null) {
      const state = string('recovered_at') ? 'lapiRecovered' : 'lapiUnavailable';
      return text(`server.notifications.${state}.title`, `server.notifications.${state}.message`, { seconds });
    }
  }
  return { title: item.title, message: item.message };
}

export function NotificationInbox() {
  const { t } = useI18n();
  const { appName } = useBranding();
  const { config } = useRefresh();
  const { refreshUnreadCount } = useNotificationUnreadCount();
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const canManage = config?.permissions?.can_manage_settings !== false;
  const notifications = useServerData(`${page}|${pageSize}`, () => fetchNotificationsPaginated(page, pageSize));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<ErrorInfo | null>(null);
  const [deleteAction, setDeleteAction] = useState<DeleteAction | null>(null);
  const [deleteError, setDeleteError] = useState<ErrorInfo | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rows = notifications.data?.data ?? [];
  const total = notifications.data?.pagination.total ?? 0;
  const unread = notifications.data?.unread_count ?? 0;

  const changed = () => {
    notifications.reload();
    void refreshUnreadCount();
  };

  const markRead = async (ids: string[]) => {
    setNotice(null);
    try {
      if (ids.length === 1) await markNotificationRead(ids[0]);
      else await markNotificationsRead(ids);
      changed();
    } catch (error) {
      setNotice(toErrorInfo(error, t(ids.length === 1 ? 'pages.notifications.failedToMarkRead' : 'pages.notifications.failedToMarkSelectedRead')));
    }
  };

  const requestDelete = (action: DeleteAction) => {
    setDeleteError(null);
    setDeleteAction(action);
  };

  const confirmDelete = async () => {
    if (!deleteAction) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      if (deleteAction.kind === 'single') await deleteNotification(deleteAction.item.id);
      else if (deleteAction.kind === 'selected') await bulkDeleteNotifications(deleteAction.ids);
      else await deleteReadNotifications();
      setSelected(new Set());
      setDeleteAction(null);
      changed();
    } catch (error) {
      setDeleteError(toErrorInfo(error, t('pages.notifications.failedToDelete')));
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<NotificationItem>[] = [
    {
      id: 'notification',
      header: t('pages.notifications.notification'),
      className: 'min-w-56 whitespace-normal',
      cell: (item) => {
        const { title, message } = localize(item, t, appName);
        const releaseUrl = item.rule_type === 'crowdsec-update' ? metadataString(item, 'release_url') : null;
        return (
          <div className="flex min-w-0 gap-2.5">
            <span className={cn('mt-2 size-2 shrink-0 rounded-full', !item.read_at && 'bg-kumo-brand')}>
              {item.read_at ? null : <span className="sr-only">{t('pages.notifications.unread')}</span>}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <span className={cn('text-kumo-default', item.read_at ? 'font-normal' : 'font-semibold')}>{title}</span>
              <p className="text-sm text-kumo-subtle">{message}</p>
              {releaseUrl?.startsWith(RELEASE_URL_PREFIX) ? (
                <KumoLink href={releaseUrl} target="_blank" rel="noopener noreferrer" className="w-fit text-sm">
                  {t('pages.notifications.viewCrowdsecRelease')}
                </KumoLink>
              ) : null}
              {item.deliveries.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {item.deliveries.map((delivery, index) => (
                    <span key={`${delivery.channel_id}-${index}`} title={delivery.error}>
                      <Badge variant={DELIVERY_STATUSES[delivery.status].variant}>{delivery.channel_name}: {t(DELIVERY_STATUSES[delivery.status].labelKey)}</Badge>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      id: 'severity',
      header: t('pages.notifications.severity'),
      cell: (item) => <Badge variant={SEVERITIES[item.severity].variant}>{t(SEVERITIES[item.severity].labelKey)}</Badge>,
    },
    {
      id: 'rule',
      header: t('pages.notifications.rule'),
      className: 'max-w-48',
      cell: (item) => <span className="block truncate" title={item.rule_name}>{item.rule_name}</span>,
    },
    { id: 'time', header: t('tableColumns.time'), cell: (item) => <TimeCell timestamp={item.created_at} /> },
    {
      id: 'actions',
      header: <span className="sr-only">{t('tableColumns.actions')}</span>,
      className: 'w-0 text-end',
      sticky: true,
      cell: (item) => (item.read_at && !canManage ? null : (
        <DropdownMenu>
          <DropdownMenu.Trigger render={<Button variant="ghost" size="sm" shape="square" icon={<DotsThreeIcon weight="bold" />} aria-label={t('tableColumns.actions')} />} />
          <DropdownMenu.Content align="end">
            {item.read_at ? null : (
              <DropdownMenu.Item icon={CheckIcon} onClick={() => void markRead([item.id])}>{t('pages.notifications.markRead')}</DropdownMenu.Item>
            )}
            {canManage ? (
              <DropdownMenu.Item icon={TrashIcon} variant="danger" onClick={() => requestDelete({ kind: 'single', item })}>
                {t('pages.notifications.deleteNotification')}
              </DropdownMenu.Item>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu>
      )),
    },
  ];

  const deleteTitle = deleteAction?.kind === 'single'
    ? t('pages.notifications.deleteNotificationTitle')
    : deleteAction?.kind === 'selected' ? t('pages.notifications.deleteSelectedTitle') : t('pages.notifications.deleteReadTitle');
  const deleteDescription = deleteAction?.kind === 'single'
    ? <>{t('pages.notifications.deleteNotificationConfirmPrefix')} <span className="font-medium text-kumo-default">{localize(deleteAction.item, t, appName).title}</span>? {t('common.actionCannotBeUndone')}</>
    : deleteAction?.kind === 'selected'
      ? t('pages.notifications.deleteSelectedConfirm', { count: deleteAction.ids.length })
      : t('pages.notifications.deleteReadConfirm');

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-kumo-subtle numeric">
          {notifications.data
            ? `${t('pages.notifications.notificationsCount', { count: total.toLocaleString() })} · ${t('pages.notifications.unreadCount', { count: unread.toLocaleString() })}`
            : null}
        </p>
        {canManage ? (
          <Button variant="secondary-destructive" icon={<TrashIcon />} disabled={total - unread === 0} onClick={() => requestDelete({ kind: 'read' })}>
            {t('pages.notifications.deleteAllRead')}
          </Button>
        ) : null}
      </div>
      {notice ? <ErrorAlert error={notice} onDismiss={() => setNotice(null)} /> : null}
      <DataTable
        label={t('pages.notifications.recentNotifications')}
        columns={columns}
        data={rows}
        getRowId={(item) => item.id}
        loading={notifications.loading}
        busy={notifications.busy}
        error={notifications.error && !notifications.data ? toErrorInfo(notifications.error, t('pages.notifications.failedToLoad')).message : null}
        onRetry={notifications.reload}
        empty={(
          <Empty
            size="sm"
            icon={<BellSimpleSlashIcon size={32} className="text-kumo-subtle" />}
            title={t('pages.notifications.noNotifications')}
            contents={canManage ? <LinkButton variant="secondary" href="/notifications/rules">{t('pages.notifications.manageRules')}</LinkButton> : undefined}
          />
        )}
        pagination={{ page, pageSize, total, onPageChange: setPage, onPageSizeChange: setPageSize }}
        selection={{
          selectableIds: notifications.data?.selectable_ids.map(String) ?? [],
          selected,
          onChange: setSelected,
          actions: (ids) => (
            <>
              <Button size="sm" icon={<ChecksIcon />} disabled={unread === 0} onClick={() => void markRead(ids)}>
                {t('pages.notifications.markSelectedRead')}
              </Button>
              {canManage ? (
                <Button size="sm" variant="destructive" icon={<TrashIcon />} onClick={() => requestDelete({ kind: 'selected', ids })}>
                  {t('pages.notifications.deleteSelected')}
                </Button>
              ) : null}
            </>
          ),
        }}
      />
      <ConfirmDeleteDialog
        open={deleteAction !== null}
        title={deleteTitle}
        description={deleteDescription}
        error={deleteError}
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteAction(null)}
      />
    </>
  );
}
