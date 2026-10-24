import { describe, expect, test } from 'vitest';
import type { BulkDeleteResult } from '../../types';
import { combineDeleteResults, entityKey, keyToRef, selectableKeys, summarizeDeleteResult } from '../deleteResults';

const t = (key: string, values?: Record<string, unknown>) => `${key}${values ? JSON.stringify(values) : ''}`;
const result = (deleted: number, failed: number): BulkDeleteResult => ({
  requested_alerts: deleted + failed,
  requested_decisions: 0,
  deleted_alerts: deleted,
  deleted_decisions: 0,
  failed: Array.from({ length: failed }, (_, index) => ({ kind: 'alert' as const, id: String(index), error: 'boom' })),
});

describe('delete results', () => {
  test('keys rows by instance and ID so colliding IDs stay apart', () => {
    expect(entityKey({ id: 7, instance_id: 'edge' })).not.toBe(entityKey({ id: 7, instance_id: 'primary' }));
    expect(keyToRef(entityKey({ id: 7, instance_id: 'edge' }))).toEqual({ instance_id: 'edge', id: '7' });
    expect(keyToRef(entityKey({ id: 7 }))).toEqual({ instance_id: 'default', id: '7' });
  });

  test('prefers the refs of every matching row over plain IDs', () => {
    expect(selectableKeys({ selectable_ids: [1], selectable_refs: [{ instance_id: 'edge', id: 1 }] })).toEqual([entityKey({ id: 1, instance_id: 'edge' })]);
    expect(selectableKeys({ selectable_ids: [1, 2] })).toEqual([entityKey({ id: 1 }), entityKey({ id: 2 })]);
  });

  test('only summarizes deletes that partly failed', () => {
    expect(summarizeDeleteResult(result(2, 0), t)).toBeNull();
    expect(summarizeDeleteResult(result(2, 1), t)).toContain('pages.alerts.itemsFailedToDelete{"count":1}');
    expect(summarizeDeleteResult(result(0, 1), t)).toBe('pages.alerts.itemsFailedToDelete{"count":1}');
  });

  test('adds up the results of retried instances', () => {
    expect(combineDeleteResults([result(2, 1), result(3, 0)])).toMatchObject({ deleted_alerts: 5, failed: [{ id: '0' }] });
  });
});
