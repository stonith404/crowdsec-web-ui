import { useState } from 'react';
import { Input, Select } from '@cloudflare/kumo';
import { authRequest, type AuthSettings, type OidcUnmatchedRole } from '@/components/settings/auth-api';
import { ListEditor } from '@/components/settings/list-editor';
import { FormCard, SwitchRow } from '@/components/settings/settings-card';
import { useSubmit } from '@/components/settings/use-submit';
import { withBasePath } from '@/lib/basePath';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/lib/toast';

const DEFAULT_OIDC_SCOPE = 'openid profile email';

const UNMATCHED_ROLES: Array<{ value: OidcUnmatchedRole; labelKey: string }> = [
  { value: 'deny', labelKey: 'pages.settings.oidcUnmatchedRoleDeny' },
  { value: 'admin', labelKey: 'pages.settings.oidcUnmatchedRoleAdmin' },
  { value: 'read-only', labelKey: 'pages.settings.oidcUnmatchedRoleReadOnly' },
];

const splitCsv = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

function toForm(settings: AuthSettings) {
  return {
    issuerUrl: settings.oidcIssuerUrl,
    clientId: settings.oidcClientId,
    clientSecret: '',
    scopes: (settings.oidcScope || DEFAULT_OIDC_SCOPE).trim().split(/\s+/),
    groupsClaim: settings.oidcGroupsClaim || 'groups',
    adminGroups: splitCsv(settings.oidcAdminGroups),
    readOnlyGroups: splitCsv(settings.oidcReadOnlyGroups),
    unmatchedRole: settings.oidcUnmatchedRole || 'deny',
    endSession: settings.oidcEndSession !== false,
  };
}

type OidcForm = ReturnType<typeof toForm>;

/** The OIDC provider connection and the mapping of its groups to admin and read-only access */
export function OidcCard({ settings, readOnly, onSaved }: { settings: AuthSettings; readOnly: boolean; onSaved: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState(() => toForm(settings));
  const { saving, error, run } = useSubmit();

  const update = (change: Partial<OidcForm>) => setForm((current) => ({ ...current, ...change }));

  const save = () => run(async () => {
    const payload = await authRequest<{ oidcError?: string }>('/settings', 'PUT', {
      oidcIssuerUrl: form.issuerUrl,
      oidcClientId: form.clientId,
      oidcClientSecret: form.clientSecret,
      oidcScope: form.scopes.join(' '),
      oidcGroupsClaim: form.groupsClaim,
      oidcAdminGroups: form.adminGroups.join(','),
      oidcReadOnlyGroups: form.readOnlyGroups.join(','),
      oidcUnmatchedRole: form.unmatchedRole,
      oidcEndSession: form.endSession,
    });
    update({ clientSecret: '' });
    onSaved();
    if (payload.oidcError) {
      toast.warning(t('pages.settings.oidcSettingsSavedButDiscoveryFailed', { error: payload.oidcError }));
    } else {
      toast.success(t('pages.settings.oidcSettingsSaved'));
    }
  }, t('pages.settings.failedToSaveOidcSettings'));

  return (
    <FormCard
      title={t('pages.settings.oidcSso')}
      description={t('pages.settings.oidcDescription')}
      readOnly={readOnly}
      dirty={JSON.stringify(form) !== JSON.stringify(toForm(settings))}
      saving={saving}
      error={error}
      submitLabel={t('pages.settings.saveOidcSettings')}
      onSubmit={() => void save()}
    >
      <div className="grid items-start gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <Input label={t('pages.settings.oidcIssuerUrl')} placeholder="https://id.example.com" value={form.issuerUrl} onChange={(event) => update({ issuerUrl: event.target.value })} />
        </div>
        <Input label={t('pages.settings.oidcClientId')} className="font-mono" value={form.clientId} onChange={(event) => update({ clientId: event.target.value })} />
        <Input
          label={t('pages.settings.oidcClientSecret')}
          type="password"
          autoComplete="new-password"
          placeholder={settings.hasOidcClientSecret ? t('pages.settings.unchanged') : undefined}
          value={form.clientSecret}
          onChange={(event) => update({ clientSecret: event.target.value })}
        />
        <div className="md:col-span-2">
          <ListEditor
            id="oidc-scopes"
            label={t('pages.settings.oidcScope')}
            items={form.scopes}
            onChange={(scopes) => update({ scopes })}
            canRemove={(scope) => scope !== 'openid'}
            splitOnSpaces
            placeholder={DEFAULT_OIDC_SCOPE}
            removeLabel={(scope) => t('pages.settings.removeScope', { scope })}
          />
        </div>
        <Input label={t('pages.settings.oidcGroupsClaim')} className="font-mono" placeholder="groups" value={form.groupsClaim} onChange={(event) => update({ groupsClaim: event.target.value })} />
        <Select
          label={t('pages.settings.oidcUnmatchedRole')}
          description={t('pages.settings.oidcGroupsHelp')}
          className="w-full"
          value={form.unmatchedRole}
          onValueChange={(value) => update({ unmatchedRole: value as OidcUnmatchedRole })}
          items={UNMATCHED_ROLES.map((role) => ({ value: role.value, label: t(role.labelKey) }))}
        />
        <ListEditor
          id="oidc-admin-groups"
          label={t('pages.settings.oidcAdminGroups')}
          items={form.adminGroups}
          onChange={(adminGroups) => update({ adminGroups })}
          placeholder="crowdsec-admins"
          removeLabel={(group) => t('pages.settings.removeGroup', { group })}
        />
        <ListEditor
          id="oidc-read-only-groups"
          label={t('pages.settings.oidcReadOnlyGroups')}
          items={form.readOnlyGroups}
          onChange={(readOnlyGroups) => update({ readOnlyGroups })}
          placeholder="crowdsec-viewers"
          removeLabel={(group) => t('pages.settings.removeGroup', { group })}
        />
      </div>
      <SwitchRow
        id="oidc-end-session"
        label={t('pages.settings.oidcEndSession')}
        description={t('pages.settings.oidcEndSessionHelp', { url: `${window.location.origin}${withBasePath('/login')}` })}
        checked={form.endSession}
        onCheckedChange={(endSession) => update({ endSession })}
      />
    </FormCard>
  );
}
