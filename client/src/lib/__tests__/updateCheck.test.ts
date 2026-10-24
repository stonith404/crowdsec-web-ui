import { expect, test } from 'vitest';
import { normalizeUpdateStatus } from '../updateCheck';

test('only reports an update for a release newer than the running one', () => {
  const status = { update_available: true, remote_version: 'v1.10.0' };
  expect(normalizeUpdateStatus(status, 'v1.9.2').update_available).toBe(true);
  expect(normalizeUpdateStatus(status, '1.10.0').update_available).toBe(false);
  expect(normalizeUpdateStatus(status, '1.11.0').update_available).toBe(false);
  expect(normalizeUpdateStatus({ update_available: true, remote_version: '2026.10b' }, '2026.9a').update_available).toBe(true);
  expect(normalizeUpdateStatus(status, undefined).update_available).toBe(true);
});
