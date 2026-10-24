import { useState } from 'react';
import { Input, Loader } from '@cloudflare/kumo';
import { ErrorAlert } from '@/components/error-alert';
import { authRequest, type AuthSettings } from '@/components/settings/auth-api';
import { OidcCard } from '@/components/settings/oidc-card';
import { PasskeysCard } from '@/components/settings/passkeys-card';
import { ReadOnlyNotice } from '@/components/settings/read-only-notice';
import { FormCard, SwitchRow } from '@/components/settings/settings-card';
import { TotpCard } from '@/components/settings/totp-card';
import { useSubmit } from '@/components/settings/use-submit';
import { useAuth } from '@/contexts/AuthContext';
import { useRefresh } from '@/contexts/useRefresh';
import { useServerData } from '@/hooks/use-server-data';
import { toErrorInfo } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/lib/toast';

export function AuthenticationSettings() {
  const { t } = useI18n();
  const { authEnabled } = useAuth();

  if (!authEnabled) {
    return <ReadOnlyNotice>{t('pages.settings.authDisabledHint')}</ReadOnlyNotice>;
  }
  return <AuthenticationCards />;
}

function AuthenticationCards() {
  const { t } = useI18n();
  const { config } = useRefresh();
  const settings = useServerData('auth-settings', () => authRequest<AuthSettings>('/settings'));
  const readOnly = config?.permissions?.can_manage_settings === false;

  if (settings.loading) {
    return <div className="flex justify-center py-16 text-kumo-subtle"><Loader size={20} /></div>;
  }
  if (!settings.data) {
    return <ErrorAlert error={toErrorInfo(settings.error, t('pages.settings.failedToLoadSettings'))} />;
  }

  const data = settings.data;
  // Only a password session can change the password or its second factor, the server refuses it for passkey and SSO sessions
  const passwordSession = data.hasPassword && data.authMethod === 'password';

  return (
    <div className="flex flex-col gap-6">
      {readOnly ? <ReadOnlyNotice>{t('pages.settings.readOnlyAuthentication')}</ReadOnlyNotice> : null}
      {passwordSession ? <ChangePasswordCard /> : null}
      {passwordSession ? <TotpCard enabled={data.totpEnabled} onChanged={settings.reload} /> : null}
      {data.passkeysAvailable !== false ? <PasskeysCard /> : null}
      <PasswordLoginCard settings={data} readOnly={readOnly} onSaved={settings.reload} />
      <OidcCard settings={data} readOnly={readOnly} onSaved={settings.reload} />
    </div>
  );
}

const EMPTY_PASSWORDS = { currentPassword: '', newPassword: '', confirmPassword: '' };

function ChangePasswordCard() {
  const { t } = useI18n();
  const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
  const { saving, error, run } = useSubmit();

  const update = (change: Partial<typeof EMPTY_PASSWORDS>) => setPasswords((current) => ({ ...current, ...change }));

  const save = () => run(async () => {
    if (passwords.newPassword !== passwords.confirmPassword) throw new Error(t('pages.settings.passwordsDoNotMatch'));
    await authRequest('/change-password', 'POST', { currentPassword: passwords.currentPassword, newPassword: passwords.newPassword });
    setPasswords(EMPTY_PASSWORDS);
    toast.success(t('pages.settings.passwordChanged'));
  }, t('pages.settings.failedToChangePassword'));

  return (
    <FormCard
      title={t('pages.settings.password')}
      description={t('pages.settings.passwordDescription')}
      dirty={Object.values(passwords).every(Boolean)}
      saving={saving}
      error={error}
      submitLabel={t('pages.settings.changePassword')}
      onSubmit={() => void save()}
    >
      <div className="grid gap-5 md:grid-cols-3">
        <Input label={t('pages.settings.currentPassword')} type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={(event) => update({ currentPassword: event.target.value })} />
        <Input label={t('pages.settings.newPassword')} type="password" autoComplete="new-password" value={passwords.newPassword} onChange={(event) => update({ newPassword: event.target.value })} />
        <Input label={t('pages.settings.confirmPassword')} type="password" autoComplete="new-password" value={passwords.confirmPassword} onChange={(event) => update({ confirmPassword: event.target.value })} />
      </div>
    </FormCard>
  );
}

function PasswordLoginCard({ settings, readOnly, onSaved }: { settings: AuthSettings; readOnly: boolean; onSaved: () => void }) {
  const { t } = useI18n();
  const { refresh } = useAuth();
  const [disabled, setDisabled] = useState(settings.disablePasswordLogin);
  const { saving, error, run } = useSubmit();
  const managed = settings.passwordLoginManaged === true;

  const save = () => run(async () => {
    await authRequest('/settings', 'PUT', { disablePasswordLogin: disabled });
    await refresh();
    onSaved();
    toast.success(t('pages.settings.passwordLoginSaved'));
  }, t('pages.settings.failedToSavePasswordLogin'));

  return (
    <FormCard
      title={t('pages.settings.passwordLogin')}
      readOnly={readOnly || managed}
      dirty={disabled !== settings.disablePasswordLogin}
      saving={saving}
      error={error}
      onSubmit={() => void save()}
    >
      <SwitchRow
        id="disable-password-login"
        label={t('pages.settings.disablePasswordLogin')}
        checked={disabled}
        onCheckedChange={setDisabled}
        description={(
          <>
            <p>{t('pages.settings.disablePasswordLoginDescription')}</p>
            {managed ? <p>{t('pages.settings.passwordLoginManaged')}</p> : null}
            {settings.passwordLoginFallback ? <p className="text-kumo-warning">{t('pages.settings.passwordLoginFallback')}</p> : null}
          </>
        )}
      />
    </FormCard>
  );
}
