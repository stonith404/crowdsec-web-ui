import type { SimulationFilter, SlimAlert } from '../types';

export function getAlertSourceValue(alert: { source?: SlimAlert['source'] } | null | undefined): string | undefined {
  const source = alert?.source;
  return [source?.ip, source?.value, source?.range].find((value): value is string => typeof value === 'string' && value.length > 0);
}

export function decisionListHref(alertId: string | number, options: { includeExpired?: boolean; simulation?: SimulationFilter; instanceId?: string } = {}) {
  const params = new URLSearchParams({ alert_id: String(alertId) });
  if (options.instanceId) params.set('instance', options.instanceId);
  if (options.includeExpired) params.set('include_expired', 'true');
  if (options.simulation && options.simulation !== 'all') params.set('simulation', options.simulation);
  return `/decisions?${params}`;
}

export function ipProfileHref(ip: string, instanceScope?: string | null) {
  const path = `/ip/${encodeURIComponent(ip)}`;
  return instanceScope && instanceScope !== 'all' ? `${path}?instance=${encodeURIComponent(instanceScope)}` : path;
}
