import { expect, test } from 'vitest';
import { instanceStatusMessage, translateSyncMessage } from '../../../lib/syncMessages';

const t = (key: string, values?: Record<string, unknown>) => `${key}${values ? JSON.stringify(values) : ''}`;

test('translates the progress sentences the server sends and passes unknown ones through', () => {
  expect(translateSyncMessage(undefined, t)).toBe('components.syncOverlay.synchronizing');
  expect(translateSyncMessage('Building search indexes...', t)).toBe('components.syncOverlay.statusBuildingIndexes');
  expect(translateSyncMessage('Syncing: 24h -> 12h ago (5 alerts, 3 decisions)', t))
    .toBe('components.syncOverlay.statusSyncingWindow{"window":"24h -> 12h ago","alerts":5,"decisions":3}');
  expect(translateSyncMessage('Something new', t)).toBe('Something new');
});

test('describes an instance by its state before its message', () => {
  const instance = { instance_id: 'edge', instance_name: 'Edge', isSyncing: false, progress: 0, message: 'Syncing', startedAt: null, completedAt: null };
  expect(instanceStatusMessage({ ...instance, state: 'failed', errors: ['LAPI down'] }, t)).toBe('LAPI down');
  expect(instanceStatusMessage({ ...instance, state: 'complete', progress: 100 }, t)).toBe('components.syncOverlay.statusComplete');
  expect(instanceStatusMessage(instance, t)).toBe('components.syncOverlay.statusWaiting');
});
