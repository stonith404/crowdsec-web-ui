import { useSearchParams } from 'react-router-dom';
import { ArrowSquareOutIcon } from '@phosphor-icons/react';
import { Badge, Link, cn } from '@cloudflare/kumo';
import { CountryFlag } from '@/components/country-flag';
import { InstanceIcon } from '@/components/instance-icon';
import { useRefresh } from '@/contexts/useRefresh';
import { useNow } from '@/hooks/use-now';
import { ipProfileHref } from '@/lib/alerts';
import { useDateTime } from '@/lib/dateTime';
import { getDecisionExpirationState } from '@/lib/decisionExpiration';
import { useI18n } from '@/lib/i18n';
import { getCountryName, getHubUrl } from '@/lib/utils';
import type { DecisionListItem } from '@/types';

export const EMPTY_CELL = '—';

/** The instance a row comes from, with the same tile as the instance switcher */
export function InstanceCell({ id, name }: { id?: string; name?: string }) {
  const { config } = useRefresh();
  const label = name || id || 'default';
  const index = config?.instances?.findIndex((instance) => instance.id === id) ?? -1;

  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <InstanceIcon name={label} colorIndex={Math.max(index, 0)} />
      {label}
    </span>
  );
}

/** A timestamp in one monospaced line, like the timestamps of Cloudflare's log views */
export function TimeCell({ timestamp }: { timestamp?: string | null }) {
  const { formatDate, formatTime, dateFormat } = useDateTime();
  if (!timestamp) return <span className="text-kumo-subtle">{EMPTY_CELL}</span>;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return <span>{timestamp}</span>;

  return (
    <span className="font-mono text-sm whitespace-nowrap">
      {dateFormat !== 'browser' ? formatDate(date) : formatDate(date, { month: 'short', day: 'numeric' })}{' '}
      {formatTime(date, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}

/** A scenario as its short name with the author in a muted line, as the Hub writes them */
export function ScenarioName({
  name,
  reason,
  simulated = false,
  showLink = false,
  showReason = false,
  className,
}: {
  name?: string | null;
  reason?: string | null;
  simulated?: boolean;
  showLink?: boolean;
  showReason?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  if (!name) return <span className="text-kumo-subtle">{EMPTY_CELL}</span>;
  const slash = name.indexOf('/');
  const namespace = slash === -1 ? '' : name.slice(0, slash);
  const shortName = slash === -1 ? name : name.slice(slash + 1);
  const hubUrl = showLink ? getHubUrl(name) : null;

  return (
    <div className={cn('flex min-w-0 flex-col leading-tight', className)}>
      {/* A fixed height keeps rows with and without the Simulation badge the same height */}
      <div className="flex h-5 min-w-0 items-center gap-1.5">
        <span className="truncate font-medium" title={name}>{shortName}</span>
        {simulated ? <Badge variant="warning" className="shrink-0">{t('pages.dashboard.simulation')}</Badge> : null}
        {hubUrl ? (
          <a href={hubUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-kumo-subtle hover:text-kumo-link" title={t('components.statCard.viewOnHub')} aria-label={t('components.statCard.viewOnHub')}>
            <ArrowSquareOutIcon className="size-3.5" />
          </a>
        ) : null}
      </div>
      {namespace ? <span className="truncate text-xs text-kumo-subtle">{namespace}</span> : null}
      {showReason && reason && reason !== name ? <span className="truncate text-xs text-kumo-subtle" title={reason}>{reason}</span> : null}
    </div>
  );
}

export function TargetCell({ target, targetCount }: { target?: string | null; targetCount?: number }) {
  const { t } = useI18n();
  if (!target) return <span className="text-kumo-subtle">{EMPTY_CELL}</span>;
  const count = Number.isFinite(targetCount) && Number(targetCount) > 1 ? Math.floor(Number(targetCount)) : 1;
  const countLabel = t('components.targetDisplay.distinctTargets', { count });

  return (
    <div className="flex min-w-0 items-center gap-1.5" title={count > 1 ? `${target} · ${countLabel}` : target}>
      <span className="truncate">{target}</span>
      {count > 1 ? <Badge variant="outline">+{count - 1}</Badge> : null}
    </div>
  );
}

export function CountryCell({ code }: { code?: string | null }) {
  const { language } = useI18n();
  if (!code || code === 'Unknown') return <span className="text-kumo-subtle">{EMPTY_CELL}</span>;
  const name = getCountryName(code, language) ?? code;

  return (
    <div className="flex min-w-0 items-center gap-2" title={name}>
      <CountryFlag code={code} className="h-3 w-4" />
      <span className="truncate">{name}</span>
    </div>
  );
}

export function TextCell({ value, mono = false }: { value?: string | null; mono?: boolean }) {
  if (!value) return <span className="text-kumo-subtle">{EMPTY_CELL}</span>;
  return <span className={cn('block truncate', mono && 'font-mono text-sm')} title={value}>{value}</span>;
}

/** An IP that opens its profile, inside rows that open something else on click */
export function IpCell({ value }: { value?: string | null }) {
  const [searchParams] = useSearchParams();
  if (!value) return <span className="text-kumo-subtle">{EMPTY_CELL}</span>;
  return (
    <Link href={ipProfileHref(value, searchParams.get('instance'))} variant="current" className="block truncate font-mono text-sm" title={value} onClick={(event) => event.stopPropagation()}>
      {value}
    </Link>
  );
}

export function ExpirationCell({ decision }: { decision: DecisionListItem }) {
  const { t } = useI18n();
  const now = useNow();
  const expiration = getDecisionExpirationState(decision, now);
  return expiration.isExpired
    ? <Badge variant="secondary">{t('common.inactive')}</Badge>
    : <span className="numeric whitespace-nowrap">{expiration.label}</span>;
}
