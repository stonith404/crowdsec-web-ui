import { apiUrl } from '@/lib/basePath';
import { sessionFetch } from '@/lib/sessionFetch';

export type OidcUnmatchedRole = 'deny' | 'admin' | 'read-only';

export interface AuthSettings {
  disablePasswordLogin: boolean;
  passwordLoginManaged?: boolean;
  passwordLoginFallback?: boolean;
  oidcIssuerUrl: string;
  oidcClientId: string;
  hasOidcClientSecret: boolean;
  oidcScope: string;
  oidcGroupsClaim: string;
  oidcAdminGroups: string;
  oidcReadOnlyGroups: string;
  oidcUnmatchedRole: OidcUnmatchedRole;
  oidcEndSession?: boolean;
  hasPassword: boolean;
  passkeysAvailable?: boolean;
  totpEnabled: boolean;
  authMethod: 'password' | 'passkey' | 'oidc' | null;
}

export interface PasskeySummary {
  id: number;
  name: string | null;
  createdAt: string;
}

/** Calls an /api/auth endpoint, throwing the server's error or an empty one that the caller's fallback message replaces */
export async function authRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await sessionFetch(
    apiUrl(`/api/auth${path}`),
    { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) },
    // A wrong current password answers 401 too, which must not end the session
    { ignoredUnauthorizedErrors: ['Current password is incorrect'] },
  );
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? '');
  return payload;
}
