import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { KeyIcon, SignInIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { Banner, Button, Input } from '@cloudflare/kumo';
import { AuthLayout } from '@/components/auth-layout';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/useBranding';
import { apiUrl } from '@/lib/basePath';
import { useI18n } from '@/lib/i18n';
import { serializeAuthenticationCredential, toPublicKeyCredentialRequestOptions } from '@/lib/webauthn';

// The server answers with English messages, so the ones it is known to send are translated
const KNOWN_ERRORS: Record<string, string> = {
  'Authenticator code required': 'pages.login.error.authenticatorCodeRequired',
  'Invalid authenticator code': 'pages.login.error.invalidAuthenticatorCode',
  'Login failed': 'pages.login.error.loginFailed',
  'Failed to start passkey login': 'pages.login.error.failedToStartPasskeyLogin',
  'No passkey credential returned': 'pages.login.error.noPasskeyCredential',
  'This passkey belongs to an OIDC-only account. Sign in with SSO instead.': 'pages.login.error.oidcOnlyPasskey',
  'Passkey authentication failed': 'pages.login.error.passkeyAuthenticationFailed',
};

export function Login() {
  const { authEnabled, authenticated, login, oidcEnabled, passwordLoginDisabled, passkeysEnabled, refresh } = useAuth();
  const { t } = useI18n();
  const { appName } = useBranding();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  if (!authEnabled || authenticated) return <Navigate to="/" replace />;

  const translateError = (message: string) => (KNOWN_ERRORS[message] ? t(KNOWN_ERRORS[message]) : message);

  const validate = () => {
    if (!requiresTotp) return !username.trim() || !password ? t('pages.login.validation.credentialsRequired') : '';
    if (!totpCode.trim()) return t('pages.login.validation.totpRequired');
    return /^[0-9 ]+$/.test(totpCode) ? '' : t('pages.login.validation.totpDigits');
  };

  const handlePasswordLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    try {
      await login(username, password, requiresTotp ? totpCode : undefined);
    } catch (loginError) {
      if (loginError instanceof Error && 'requiresTotp' in loginError && loginError.requiresTotp === true && !requiresTotp) {
        setRequiresTotp(true);
        setNotice(loginError.message ? translateError(loginError.message) : t('pages.login.error.authenticatorCodeRequired'));
        return;
      }
      setError(loginError instanceof Error ? translateError(loginError.message) : t('pages.login.error.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const resetTotpPrompt = () => {
    setRequiresTotp(false);
    setPassword('');
    setTotpCode('');
    setError('');
    setNotice('');
  };

  const handlePasskeyLogin = async () => {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      if (!window.isSecureContext || !navigator.credentials) throw new Error(t('pages.login.error.passkeysRequireSecureContext'));

      const optionsResponse = await fetch(apiUrl('/api/auth/webauthn/login/options'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (!optionsResponse.ok) throw new Error(t('pages.login.error.failedToStartPasskeyLogin'));
      const options = toPublicKeyCredentialRequestOptions(await optionsResponse.json() as Record<string, unknown>);
      const credential = await navigator.credentials.get({ publicKey: options }) as PublicKeyCredential | null;
      if (!credential) throw new Error(t('pages.login.error.noPasskeyCredential'));

      const verifyResponse = await fetch(apiUrl('/api/auth/webauthn/login/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serializeAuthenticationCredential(credential)),
      });
      if (!verifyResponse.ok) {
        const payload = await verifyResponse.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error ? translateError(payload.error) : t('pages.login.error.passkeyAuthenticationFailed'));
      }
      await refresh();
    } catch (passkeyError) {
      setError(passkeyError instanceof Error ? passkeyError.message : t('pages.login.error.passkeyAuthenticationFailed'));
    } finally {
      setLoading(false);
    }
  };

  const showAlternatives = !requiresTotp && (passkeysEnabled || oidcEnabled);

  return (
    <AuthLayout title={t('pages.login.title')} description={t('pages.login.subtitle', { appName })}>
      {error || notice ? (
        <Banner variant={error ? 'error' : 'alert'} size="sm" icon={<WarningCircleIcon weight="fill" />} description={error || notice} />
      ) : null}

      {!passwordLoginDisabled ? (
        <form onSubmit={(event) => void handlePasswordLogin(event)} noValidate className="flex flex-col gap-4">
          {requiresTotp ? (
            <>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-kumo-recessed px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs text-kumo-subtle">{t('pages.login.signingInAs')}</p>
                  <p className="truncate font-medium">{username}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={resetTotpPrompt} disabled={loading}>
                  {t('pages.login.change')}
                </Button>
              </div>
              <Input
                label={t('pages.login.authenticatorCode')}
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                className="font-mono tracking-widest"
              />
            </>
          ) : (
            <>
              <Input label={t('pages.login.username')} value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus />
              <Input label={t('pages.login.password')} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
            </>
          )}
          <Button type="submit" variant="primary" className="w-full" loading={loading} icon={<SignInIcon />}>
            {t('pages.login.signIn')}
          </Button>
        </form>
      ) : null}

      {showAlternatives ? (
        <div className="flex flex-col gap-3">
          {!passwordLoginDisabled ? (
            <div className="flex items-center gap-3 text-xs text-kumo-subtle">
              <span className="h-px flex-1 bg-kumo-hairline" />
              {t('pages.login.or')}
              <span className="h-px flex-1 bg-kumo-hairline" />
            </div>
          ) : null}
          {passkeysEnabled ? (
            <Button
              type="button"
              variant={passwordLoginDisabled ? 'primary' : 'secondary'}
              className="w-full"
              icon={<KeyIcon />}
              onClick={() => void handlePasskeyLogin()}
              disabled={loading}
            >
              {t('pages.login.signInWithPasskey')}
            </Button>
          ) : null}
          {oidcEnabled ? (
            <a
              href={apiUrl('/api/auth/oidc/login')}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-kumo-base px-3 text-base font-medium ring-1 ring-kumo-line hover:bg-kumo-tint"
            >
              <SignInIcon />
              {t('pages.login.continueWithSso')}
            </a>
          ) : null}
        </div>
      ) : null}
    </AuthLayout>
  );
}
