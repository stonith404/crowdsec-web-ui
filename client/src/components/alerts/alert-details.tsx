import { useEffect, useState, type ReactNode } from 'react';
import { ArrowSquareOutIcon, DotsThreeIcon, GavelIcon, ShieldSlashIcon, ShieldWarningIcon, TrashIcon } from '@phosphor-icons/react';
import { Badge, Banner, Button, Collapsible, DropdownMenu, LayerCard, LayerDialog, Link, SkeletonLine, Table } from '@cloudflare/kumo';
import { resolveMachineName } from '../../../../shared/machine';
import { CountryCell, IpCell, ScenarioName, TargetCell } from '@/components/cells';
import { MetadataList } from '@/components/metadata-list';
import { useRefresh } from '@/contexts/useRefresh';
import { useNow } from '@/hooks/use-now';
import { getDisplayMetadata, isAppSecEvent } from '@/lib/alertMetadata';
import { decisionListHref, getAlertSourceValue } from '@/lib/alerts';
import { fetchAlert, fetchDecisionsPaginated } from '@/lib/api';
import { useDateTime } from '@/lib/dateTime';
import { getDecisionExpirationState } from '@/lib/decisionExpiration';
import { useI18n } from '@/lib/i18n';
import { isSimulatedAlert, isSimulatedDecision } from '@/lib/simulation';
import type { AlertRecord, DecisionListItem, SlimAlert } from '@/types';

const DECISIONS_PAGE_SIZE = 50;
const COLLAPSED_EVENTS = 10;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-sm text-kumo-subtle">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function ExternalLink({ href, title, children }: { href: string; title: string; children: ReactNode }) {
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" title={title} variant="current" className="inline-flex max-w-full items-center gap-1">
      <span className="truncate">{children}</span>
      <ArrowSquareOutIcon className="size-3 shrink-0" />
    </Link>
  );
}

interface AlertDetailsProps {
  /** The row that was opened, shown right away while the full alert loads */
  alert: SlimAlert | null;
  id: string | null;
  instanceId?: string;
  onClose: () => void;
  canManage: boolean;
  onAddDecision: (alert: SlimAlert | AlertRecord) => void;
  onDelete: (alert: SlimAlert | AlertRecord) => void;
  onDeleteIp: (ip: string) => void;
  /** Changes whenever decisions of the alert may have changed, e.g. after adding one */
  decisionsVersion: number;
}

type AlertDetailsBodyProps = Omit<AlertDetailsProps, 'id' | 'onClose'> & { id: string };

/** The details of one alert in a Cloudflare layer dialog, which phones show as a bottom sheet */
export function AlertDetails({ id, onClose, ...props }: AlertDetailsProps) {
  return (
    <LayerDialog.Root open={Boolean(id)} onOpenChange={(open) => { if (!open) onClose(); }}>
      {/* Keyed by the alert, so opening another alert starts from a clean state */}
      {id ? <AlertDetailsBody key={`${props.instanceId}:${id}`} id={id} {...props} /> : null}
    </LayerDialog.Root>
  );
}

function AlertDetailsBody({ alert: row, id, instanceId, canManage, onAddDecision, onDelete, onDeleteIp, decisionsVersion }: AlertDetailsBodyProps) {
  const { t } = useI18n();
  const { formatDateTime } = useDateTime();
  const { config, refreshSignal } = useRefresh();
  const now = useNow();
  const [full, setFull] = useState<AlertRecord | null>(null);
  const [decisionPage, setDecisionPage] = useState(1);
  const [decisionResult, setDecisionResult] = useState<{ key: string; decisions: DecisionListItem[]; total: number }>({ key: '', decisions: [], total: 0 });
  const [showAllEvents, setShowAllEvents] = useState(false);
  const simulationsEnabled = config?.simulations_enabled === true;
  const multipleInstances = (config?.instances?.length ?? 0) > 1;
  const decisionsKey = `${decisionPage}|${decisionsVersion}|${refreshSignal}`;
  const decisionsLoading = decisionResult.key !== decisionsKey;
  const { decisions, total: decisionTotal } = decisionResult;

  useEffect(() => {
    let cancelled = false;
    fetchAlert(id, instanceId)
      .then((alert) => { if (!cancelled) setFull(alert); })
      .catch((error: unknown) => console.error('Failed to fetch alert details', error));
    return () => { cancelled = true; };
  }, [id, instanceId]);

  useEffect(() => {
    let cancelled = false;
    fetchDecisionsPaginated(1, DECISIONS_PAGE_SIZE * decisionPage, {
      alert_id: id,
      instance: instanceId || 'all',
      include_expired: 'true',
      tz_offset: String(new Date().getTimezoneOffset()),
    }).then(
      (response) => { if (!cancelled) setDecisionResult({ key: decisionsKey, decisions: response.data, total: response.pagination.total }); },
      (error: unknown) => console.error('Failed to load alert decisions', error),
    );
    return () => { cancelled = true; };
  }, [decisionPage, decisionsKey, id, instanceId]);

  const alert: SlimAlert | AlertRecord | null = full ?? row;
  const events = full?.events ?? [];
  const context = full ? getDisplayMetadata(full.meta) : [];
  const kind = alert?.kind?.trim().toLowerCase() ?? '';
  const isAppSec = kind === 'waf' || kind === 'bot-detection' || events.some(isAppSecEvent);
  const sourceValue = getAlertSourceValue(alert);
  const decisionIp = alert?.source?.ip?.trim();
  const source = alert?.source;

  return (
    <LayerDialog.Content size="xl" verticalAlign="top">
      <LayerDialog.Title>
        <span className="flex items-center gap-2">
          {t('pages.alerts.alertDetailsId', { id })}
          {alert && simulationsEnabled && isSimulatedAlert(alert) ? <Badge variant="warning">{t('pages.dashboard.simulation')}</Badge> : null}
        </span>
      </LayerDialog.Title>
      <LayerDialog.Description>{alert ? t('pages.alerts.capturedAt', { time: formatDateTime(alert.created_at) }) : '\u00a0'}</LayerDialog.Description>
      <LayerDialog.Body>
        {!alert ? (
          <div className="flex flex-col gap-3">
            <SkeletonLine />
            <SkeletonLine />
            <SkeletonLine />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                {decisionIp ? <Button variant="primary" size="sm" icon={<GavelIcon />} onClick={() => onAddDecision(alert)}>{t('pages.decisions.addDecision')}</Button> : null}
                <DropdownMenu>
                  <DropdownMenu.Trigger render={<Button size="sm" shape="square" icon={<DotsThreeIcon weight="bold" />} aria-label={t('tableColumns.actions')} />} />
                  <DropdownMenu.Content align="start">
                    {sourceValue ? <DropdownMenu.Item icon={ShieldSlashIcon} variant="danger" onClick={() => onDeleteIp(sourceValue)}>{t('common.deleteAllForIp')}</DropdownMenu.Item> : null}
                    <DropdownMenu.Item icon={TrashIcon} variant="danger" onClick={() => onDelete(alert)}>{t('pages.alerts.deleteAlert')}</DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu>
              </div>
            ) : null}

            <LayerCard>
              <LayerCard.Primary>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Fact label={t('tableColumns.scenario')}>
                    <ScenarioName name={alert.scenario} reason={alert.reason} showLink showReason />
                  </Fact>
                  <Fact label={t('tableColumns.source')}>
                    {sourceValue ? (
                      <span className="flex items-center gap-2">
                        <IpCell value={sourceValue} />
                        <ExternalLink href={`https://app.crowdsec.net/cti/${encodeURIComponent(sourceValue)}`} title={t('pages.alerts.viewOnCti')}>CTI</ExternalLink>
                      </span>
                    ) : '—'}
                    {source?.range && source.range !== sourceValue ? (
                      <span className="block truncate font-mono text-xs text-kumo-subtle">{t('pages.alerts.range', { range: source.range })}</span>
                    ) : null}
                  </Fact>
                  <Fact label={t('pages.alerts.location')}>
                    <CountryCell code={source?.cn} />
                    {source?.city || source?.region ? <span className="block truncate text-xs text-kumo-subtle">{[source.city, source.region].filter(Boolean).join(', ')}</span> : null}
                    {source?.latitude && source?.longitude ? (
                      <span className="block text-xs text-kumo-subtle">
                        <ExternalLink href={`https://www.google.com/maps?q=${encodeURIComponent(String(source.latitude))},${encodeURIComponent(String(source.longitude))}`} title={t('pages.alerts.viewOnGoogleMaps')}>
                          {t('pages.alerts.coordinates', { latitude: source.latitude, longitude: source.longitude })}
                        </ExternalLink>
                      </span>
                    ) : null}
                  </Fact>
                  <Fact label={t('tableColumns.as')}>
                    {source?.as_number ? (
                      <ExternalLink href={`https://bgp.he.net/AS${encodeURIComponent(String(source.as_number))}`} title={t('pages.alerts.viewAsInfo')}>
                        {source.as_name} (AS{source.as_number})
                      </ExternalLink>
                    ) : source?.as_name || '—'}
                  </Fact>
                  <Fact label={t('tableColumns.target')}>
                    <TargetCell target={alert.target} targetCount={alert.target_count} />
                  </Fact>
                  <Fact label={t('tableColumns.machine')}>
                    <span className="block truncate">{resolveMachineName(alert) || '—'}</span>
                  </Fact>
                  {multipleInstances ? (
                    <Fact label={t('tableColumns.instance')}>
                      <span className="block truncate">{alert.instance_name || alert.instance_id || '—'}</span>
                    </Fact>
                  ) : null}
                  {alert.kind ? <Fact label={t('tableColumns.kind')}>{alert.kind}</Fact> : null}
                </dl>
              </LayerCard.Primary>
            </LayerCard>

            {alert.message || isAppSec ? (
              <Banner
                variant={isAppSec ? 'error' : 'default'}
                icon={<ShieldWarningIcon weight="fill" />}
                title={isAppSec ? 'AppSec / WAF' : undefined}
                description={alert.message}
              />
            ) : null}

            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-semibold">{t('pages.alerts.decisionsTaken')}</h3>
                {decisionTotal > decisions.length ? <span className="text-xs text-kumo-subtle">{t('common.showingOf', { count: decisions.length, total: decisionTotal })}</span> : null}
              </div>
              {decisionsLoading && decisions.length === 0 ? (
                <SkeletonLine />
              ) : decisions.length === 0 ? (
                <p className="text-sm text-kumo-subtle">{t('pages.decisions.noDecisionsForAlert')}</p>
              ) : (
                <LayerCard className="overflow-hidden p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <Table.Header>
                        <Table.Row>
                          <Table.Head>{t('tableColumns.id')}</Table.Head>
                          <Table.Head>{t('tableColumns.type')}</Table.Head>
                          <Table.Head>{t('tableColumns.value')}</Table.Head>
                          <Table.Head>{t('tableColumns.expiration')}</Table.Head>
                          <Table.Head>{t('tableColumns.origin')}</Table.Head>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {decisions.map((decision) => {
                          const expiration = getDecisionExpirationState(decision, now);
                          return (
                            <Table.Row key={`${decision.instance_id}-${decision.id}`}>
                              <Table.Cell>
                                <Link
                                  href={decisionListHref(alert.id, {
                                    instanceId: alert.instance_id,
                                    includeExpired: expiration.isExpired,
                                    simulation: simulationsEnabled ? (isSimulatedDecision(decision) ? 'simulated' : 'live') : undefined,
                                  })}
                                  title={expiration.isExpired ? t('pages.alerts.viewExpiredDecision') : t('pages.alerts.viewActiveDecision')}
                                  className="font-mono text-sm"
                                >
                                  #{decision.id}
                                </Link>
                              </Table.Cell>
                              <Table.Cell><Badge variant="red">{decision.detail.type || decision.detail.action || 'ban'}</Badge></Table.Cell>
                              <Table.Cell className="font-mono text-sm">{decision.value}</Table.Cell>
                              <Table.Cell>{expiration.isExpired ? <Badge variant="secondary">{t('common.inactive')}</Badge> : <span className="numeric">{expiration.label}</span>}</Table.Cell>
                              <Table.Cell>{decision.detail.origin || '—'}</Table.Cell>
                            </Table.Row>
                          );
                        })}
                      </Table.Body>
                    </Table>
                  </div>
                </LayerCard>
              )}
              {decisionTotal > decisions.length ? (
                <Button size="sm" loading={decisionsLoading} onClick={() => setDecisionPage((page) => page + 1)}>{t('components.quickFilters.showMore')}</Button>
              ) : null}
            </section>

            {context.length > 0 ? (
              <section className="flex flex-col gap-3">
                <h3 className="font-semibold">{t('pages.alerts.contextSummary')}</h3>
                <MetadataList entries={context} />
              </section>
            ) : null}

            {full ? (
              <Collapsible.Root>
                <Collapsible.DefaultTrigger>{t('pages.alerts.eventsTitle', { count: events.length })}</Collapsible.DefaultTrigger>
                <Collapsible.DefaultPanel>
                  <div className="flex flex-col gap-2">
                    {(showAllEvents ? events : events.slice(0, COLLAPSED_EVENTS)).map((event, index) => (
                      <Collapsible.Root key={index} className="rounded-lg ring-1 ring-kumo-hairline">
                        <Collapsible.Trigger className="w-full px-3 py-2 text-start text-sm">
                          <span className="font-mono text-xs text-kumo-subtle">#{index + 1}</span>
                          <span className="ms-3">{event.timestamp ? formatDateTime(event.timestamp) : '—'}</span>
                        </Collapsible.Trigger>
                        <Collapsible.Panel className="px-3 pb-3">
                          <MetadataList entries={getDisplayMetadata(event.meta)} />
                        </Collapsible.Panel>
                      </Collapsible.Root>
                    ))}
                    {!showAllEvents && events.length > COLLAPSED_EVENTS ? (
                      <Button size="sm" onClick={() => setShowAllEvents(true)}>
                        {t('pages.alerts.showAllEvents', { total: events.length, remaining: events.length - COLLAPSED_EVENTS })}
                      </Button>
                    ) : null}
                  </div>
                </Collapsible.DefaultPanel>
              </Collapsible.Root>
            ) : null}
          </div>
        )}
      </LayerDialog.Body>
    </LayerDialog.Content>
  );
}
