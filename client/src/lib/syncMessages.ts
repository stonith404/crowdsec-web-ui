import type { InstanceSyncStatus } from '../types';
import type { TranslationValues } from './i18n';

type Translate = (key: string, values?: TranslationValues) => string;

const FIXED_MESSAGES: Record<string, string> = {
  'Starting historical data sync...': 'components.syncOverlay.statusStarting',
  'Finalizing decision data...': 'components.syncOverlay.statusFinalizingDecisions',
  'Building search indexes...': 'components.syncOverlay.statusBuildingIndexes',
  'Preparing dashboard data for faster loading...': 'components.syncOverlay.statusPreparingDashboard',
};

// The server reports sync progress in English sentences, so the known ones are matched and translated here
const PATTERN_MESSAGES: Array<[RegExp, string, (match: RegExpMatchArray) => TranslationValues]> = [
  [/^Removed (\d+) stale cached alerts and (\d+) stale cached decisions before sync\.$/, 'components.syncOverlay.statusRemovedStale', (m) => ({ alerts: Number(m[1]), decisions: Number(m[2]) })],
  [/^Syncing: (.+) \((\d+) alerts, (\d+) decisions\)$/, 'components.syncOverlay.statusSyncingWindow', (m) => ({ window: m[1], alerts: Number(m[2]), decisions: Number(m[3]) })],
  [/^Fetching: (.+) \((\d+) alerts and (\d+) decisions cached so far\)$/, 'components.syncOverlay.statusFetchingWindow', (m) => ({ window: m[1], alerts: Number(m[2]), decisions: Number(m[3]) })],
  [/^Processing (\d+) alerts and (\d+) decisions from (.+)\.\.\.$/, 'components.syncOverlay.statusProcessingWindow', (m) => ({ alerts: Number(m[1]), decisions: Number(m[2]), window: m[3] })],
];

export function translateSyncMessage(message: string | undefined, t: Translate): string {
  if (!message) return t('components.syncOverlay.synchronizing');
  if (FIXED_MESSAGES[message]) return t(FIXED_MESSAGES[message]);
  for (const [pattern, key, values] of PATTERN_MESSAGES) {
    const match = message.match(pattern);
    if (match) return t(key, values(match));
  }
  return message;
}

export function instanceStatusMessage(instance: InstanceSyncStatus, t: Translate): string {
  if (instance.state === 'failed') return instance.errors?.[0] || instance.message;
  if (instance.state === 'complete' && instance.progress === 100) return t('components.syncOverlay.statusComplete');
  if (!instance.startedAt && !instance.completedAt && !instance.isSyncing && instance.progress === 0) {
    return t('components.syncOverlay.statusWaiting');
  }
  return translateSyncMessage(instance.message, t);
}
