import type { BulkDeleteResult, InstanceEntityRef } from '../types';
import type { TranslationValues } from './i18n';

type Translate = (key: string, values?: TranslationValues) => string;

/** Rows from several instances can share an ID, so a row is keyed by its instance and its ID */
export function entityKey(entity: { id: string | number; instance_id?: string }): string {
  return `${entity.instance_id || 'default'}\u0000${String(entity.id)}`;
}

export function keyToRef(key: string): InstanceEntityRef {
  const [instanceId, id] = key.split('\u0000');
  return { instance_id: instanceId, id };
}

/** The keys of every row matching the filters, from the refs the server sends or else from its plain IDs */
export function selectableKeys(response: { selectable_ids: Array<string | number>; selectable_refs?: InstanceEntityRef[] }): string[] {
  return response.selectable_refs?.length
    ? response.selectable_refs.map((ref) => entityKey(ref))
    : response.selectable_ids.map((id) => entityKey({ id }));
}

/** A notice for a delete that only partly succeeded, or null when everything was deleted */
export function summarizeDeleteResult(result: BulkDeleteResult, t: Translate): string | null {
  if (result.failed.length === 0) return null;
  const parts: string[] = [];
  if (result.deleted_alerts > 0) parts.push(t('pages.alerts.deletedAlerts', { count: result.deleted_alerts }));
  if (result.deleted_decisions > 0) parts.push(t('pages.alerts.deletedDecisions', { count: result.deleted_decisions }));
  const deleted = parts.length > 0 ? t('pages.alerts.deletedSummaryPrefix', { items: parts.join(` ${t('common.and')} `) }) : '';
  return `${deleted}${t('pages.alerts.itemsFailedToDelete', { count: result.failed.length })}`;
}

export function combineDeleteResults(results: BulkDeleteResult[]): BulkDeleteResult {
  return results.reduce<BulkDeleteResult>((combined, result) => ({
    requested_alerts: combined.requested_alerts + result.requested_alerts,
    requested_decisions: combined.requested_decisions + result.requested_decisions,
    deleted_alerts: combined.deleted_alerts + result.deleted_alerts,
    deleted_decisions: combined.deleted_decisions + result.deleted_decisions,
    failed: [...combined.failed, ...result.failed],
    instance_results: [...(combined.instance_results || []), ...(result.instance_results || [])],
    ip: combined.ip || result.ip,
  }), { requested_alerts: 0, requested_decisions: 0, deleted_alerts: 0, deleted_decisions: 0, failed: [] });
}
