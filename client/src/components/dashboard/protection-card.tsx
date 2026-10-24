import type { ReactNode } from 'react';
import { ArrowRightIcon, ShieldCheckIcon } from '@phosphor-icons/react';
import { ChartPalette, LayerCard, Link, LinkButton, SkeletonLine } from '@cloudflare/kumo';
import { ScenarioName } from '@/components/cells';
import { useI18n } from '@/lib/i18n';
import { useIsDarkMode } from '@/lib/theme';
import type { CrowdsecMetricsActiveDecisions } from '@/types';

const LIST_SIZE = 6;
const BLOCKLISTS_URL = 'https://app.crowdsec.net/blocklists';

type OriginGroup = 'community' | 'lists' | 'local' | 'manual' | 'other';

const ORIGIN_GROUPS: OriginGroup[] = ['community', 'lists', 'local', 'manual', 'other'];

// Origin names from CrowdSec's pkg/types/constants.go
function originGroup(origin: string): OriginGroup {
  if (origin === 'CAPI') return 'community';
  if (origin === 'lists') return 'lists';
  if (origin === 'crowdsec') return 'local';
  if (origin === 'cscli' || origin === 'console' || origin === 'cscli-import') return 'manual';
  return 'other';
}

function RankedList({ title, rows, empty }: { title: string; rows: CrowdsecMetricsActiveDecisions[]; empty: ReactNode }) {
  const top = rows[0]?.count ?? 0;
  return (
    <div className="flex min-w-0 flex-col gap-3 p-4">
      <h3 className="text-sm text-kumo-subtle">{title}</h3>
      {rows.length === 0 ? <p className="text-sm text-kumo-subtle">{empty}</p> : (
        <ul className="flex flex-col gap-2.5">
          {rows.slice(0, LIST_SIZE).map((row) => (
            <li key={row.reason} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm" title={row.reason}>
              {row.origin === 'lists' ? <span className="truncate">{row.reason}</span> : <ScenarioName name={row.reason} className="min-w-0 flex-row items-baseline gap-2" />}
              <span className="font-medium numeric">{row.count.toLocaleString()}</span>
              <span className="col-span-full h-1 overflow-hidden rounded-full bg-kumo-recessed" aria-hidden="true">
                <span className="block h-full rounded-full bg-kumo-brand" style={{ width: `${(row.count / top) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** How many IPs the bouncers block right now, split by where the decisions came from, with the community blocklist and subscribed blocklists in front */
export function ProtectionCard({ rows, loading, failed, metricsHref }: {
  rows: CrowdsecMetricsActiveDecisions[];
  loading: boolean;
  failed: boolean;
  metricsHref: string;
}) {
  const { t } = useI18n();
  const isDarkMode = useIsDarkMode();
  const totals = ORIGIN_GROUPS.map((group, index) => ({
    group,
    color: ChartPalette.categorical(index, isDarkMode),
    count: rows.filter((row) => originGroup(row.origin) === group).reduce((sum, row) => sum + row.count, 0),
  })).filter((entry) => entry.count > 0);
  const total = totals.reduce((sum, entry) => sum + entry.count, 0);
  const shared = totals.filter((entry) => entry.group === 'community' || entry.group === 'lists').reduce((sum, entry) => sum + entry.count, 0);
  const percent = (count: number) => {
    const share = total > 0 ? (count / total) * 100 : 0;
    return share > 0 && share < 1 ? '<1%' : `${Math.round(share)}%`;
  };

  return (
    <LayerCard>
      <LayerCard.Secondary className="justify-between py-3">
        <span className="flex items-center gap-2 text-kumo-default">
          <ShieldCheckIcon className="size-4" />
          {t('pages.dashboard.protection.title')}
        </span>
        <LinkButton href={metricsHref} variant="ghost" size="sm" icon={<ArrowRightIcon className="rtl:rotate-180" />}>
          {t('pages.dashboard.protection.viewMetrics')}
        </LinkButton>
      </LayerCard.Secondary>
      <LayerCard.Primary className="grid gap-0 divide-y divide-kumo-hairline p-0 lg:grid-cols-[minmax(0,1.3fr)_1fr_1fr] lg:divide-x lg:divide-y-0">
        <div className="flex min-w-0 flex-col gap-4 p-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-kumo-subtle">{t('pages.dashboard.protection.activeDecisions')}</span>
            {loading ? <SkeletonLine className="my-1.5 h-7 w-28" /> : <span className="text-3xl font-semibold numeric">{total.toLocaleString()}</span>}
            {failed ? (
              <span className="text-sm text-kumo-danger">{t('pages.dashboard.protection.loadFailed')}</span>
            ) : !loading && total > 0 ? (
              <span className="text-sm text-kumo-subtle">{t('pages.dashboard.protection.sharedShare', { share: percent(shared) })}</span>
            ) : null}
          </div>
          {total > 0 ? (
            <>
              <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                {totals.map((entry) => <span key={entry.group} style={{ flexGrow: entry.count, backgroundColor: entry.color }} />)}
              </div>
              <ul className="flex flex-col gap-2 text-sm">
                {totals.map((entry) => (
                  <li key={entry.group} className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{t(`pages.dashboard.protection.origin.${entry.group}`)}</span>
                    <span className="font-medium numeric">{entry.count.toLocaleString()}</span>
                    <span className="w-10 text-end text-xs text-kumo-subtle numeric">{percent(entry.count)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="mt-auto text-xs text-kumo-subtle">{t('pages.dashboard.protection.footnote')}</p>
        </div>
        <RankedList
          title={t('pages.dashboard.protection.blocklists')}
          rows={rows.filter((row) => row.origin === 'lists')}
          empty={<>{t('pages.dashboard.protection.noBlocklists')} <Link href={BLOCKLISTS_URL} variant="inline" target="_blank" rel="noreferrer">{t('pages.dashboard.protection.browseBlocklists')}</Link></>}
        />
        <RankedList
          title={t('pages.dashboard.protection.communityScenarios')}
          rows={rows.filter((row) => row.origin === 'CAPI')}
          empty={t('pages.dashboard.protection.noCommunity')}
        />
      </LayerCard.Primary>
    </LayerCard>
  );
}
