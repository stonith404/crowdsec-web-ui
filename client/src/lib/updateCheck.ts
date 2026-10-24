import { useEffect, useState } from 'react';
import type { UpdateCheckResponse } from '../types';
import { apiUrl } from './basePath';
import { sessionFetch } from './sessionFetch';

export function normalizeUpdateStatus(status: UpdateCheckResponse, currentVersion = import.meta.env.VITE_VERSION): UpdateCheckResponse {
  if (!status.update_available || !status.remote_version) return status;

  const current = currentVersion?.replace(/^v/i, '').trim();
  const remote = status.remote_version.replace(/^v/i, '').trim();
  if (!current || compareReleaseVersions(remote, current) > 0) return status;

  return { ...status, update_available: false };
}

function compareReleaseVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  if (!leftParts.every(Number.isFinite) || !rightParts.every(Number.isFinite)) {
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
  }

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function useUpdateStatus(refreshSignal: number): UpdateCheckResponse | null {
  const [status, setStatus] = useState<UpdateCheckResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (import.meta.env.VITE_VERSION) params.set('version', import.meta.env.VITE_VERSION);
    if (import.meta.env.VITE_BRANCH) params.set('branch', import.meta.env.VITE_BRANCH);
    if (import.meta.env.VITE_COMMIT_HASH) params.set('commit_hash', import.meta.env.VITE_COMMIT_HASH);

    sessionFetch(apiUrl(`/api/update-check${params.size ? `?${params}` : ''}`), { cache: 'no-store' })
      .then(async (response) => {
        if (response.ok && !cancelled) setStatus(normalizeUpdateStatus(await response.json() as UpdateCheckResponse));
      })
      .catch((error: unknown) => console.error('Failed to check for updates', error));

    return () => {
      cancelled = true;
    };
  }, [refreshSignal]);

  return status;
}
