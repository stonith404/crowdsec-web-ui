import { useState, type FormEvent } from 'react';
import { KeyIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { Button, Input, LayerDialog, SkeletonLine } from '@cloudflare/kumo';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { ErrorAlert } from '@/components/error-alert';
import { authRequest, type PasskeySummary } from '@/components/settings/auth-api';
import { SettingsCard } from '@/components/settings/settings-card';
import { useSubmit } from '@/components/settings/use-submit';
import { useServerData } from '@/hooks/use-server-data';
import { useDateTime } from '@/lib/dateTime';
import { toErrorInfo } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { serializeRegistrationCredential, toPublicKeyCredentialCreationOptions } from '@/lib/webauthn';

/** The signed-in account's passkeys, with registering and removing them */
export function PasskeysCard() {
  const { t } = useI18n();
  const { formatDate } = useDateTime();
  const passkeys = useServerData('passkeys', () => authRequest<{ passkeys: PasskeySummary[] }>('/passkeys'));
  const [registering, setRegistering] = useState(false);
  const [removing, setRemoving] = useState<PasskeySummary | null>(null);
  const remove = useSubmit();
  const list = passkeys.data?.passkeys ?? [];

  const confirmRemove = () => void remove.run(async () => {
    if (!removing) return;
    await authRequest(`/passkeys/${removing.id}`, 'DELETE');
    setRemoving(null);
    passkeys.reload();
    toast.success(t('pages.settings.passkeyRemoved'));
  }, t('pages.settings.failedToRemovePasskey'));

  return (
    <SettingsCard
      title={t('pages.settings.passkeys')}
      description={t('pages.settings.passkeysDescription')}
      action={<Button size="sm" icon={PlusIcon} onClick={() => setRegistering(true)}>{t('pages.settings.registerNewPasskey')}</Button>}
    >
      {passkeys.loading ? (
        <SkeletonLine />
      ) : passkeys.error ? (
        <ErrorAlert error={toErrorInfo(passkeys.error, t('pages.settings.failedToLoadSettings'))} />
      ) : list.length === 0 ? (
        <p className="text-sm text-kumo-subtle">{t('pages.settings.noPasskeys')}</p>
      ) : (
        <ul className="-my-2 divide-y divide-kumo-hairline">
          {list.map((passkey) => (
            <li key={passkey.id} className="flex items-center gap-3 py-2">
              <KeyIcon className="size-4 shrink-0 text-kumo-subtle" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium text-kumo-default">{passkey.name || t('pages.settings.passkey')}</span>
                <span className="text-sm text-kumo-subtle">{t('pages.settings.passkeyAdded', { date: formatDate(passkey.createdAt) })}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                icon={TrashIcon}
                aria-label={t('pages.settings.removePasskey')}
                onClick={() => {
                  remove.setError(null);
                  setRemoving(passkey);
                }}
              />
            </li>
          ))}
        </ul>
      )}
      {registering ? (
        <RegisterPasskeyDialog
          onClose={() => setRegistering(false)}
          onRegistered={() => {
            setRegistering(false);
            passkeys.reload();
          }}
        />
      ) : null}
      <ConfirmDeleteDialog
        open={removing !== null}
        title={t('pages.settings.removePasskey')}
        description={t('pages.settings.removePasskeyConfirm', { name: removing?.name || t('pages.settings.passkey') })}
        error={remove.error}
        busy={remove.saving}
        confirmLabel={t('common.remove')}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </SettingsCard>
  );
}

function RegisterPasskeyDialog({ onClose, onRegistered }: { onClose: () => void; onRegistered: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(() => t('pages.settings.passkeyNameDefault'));
  const { saving, error, run } = useSubmit();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      // WebAuthn only exists on HTTPS and localhost, and a cancelled browser prompt leaves no credential, both get the generic message
      if (!window.isSecureContext || !navigator.credentials) throw new Error('');
      const options = toPublicKeyCredentialCreationOptions(await authRequest<Record<string, unknown>>('/webauthn/register/options', 'POST'));
      const credential = await navigator.credentials.create({ publicKey: options }).catch(() => null) as PublicKeyCredential | null;
      if (!credential) throw new Error('');
      await authRequest('/webauthn/register/verify', 'POST', serializeRegistrationCredential(credential, name.trim() || null));
      toast.success(t('pages.settings.passkeyRegistered'));
      onRegistered();
    }, t('pages.settings.failedToRegisterPasskey'));
  };

  return (
    <LayerDialog.Root open onOpenChange={(open) => { if (!open) onClose(); }} dismissDisabled={saving}>
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>{t('pages.settings.registerPasskeyTitle')}</LayerDialog.Title>
        <LayerDialog.Description>{t('pages.settings.registerPasskeyDescription')}</LayerDialog.Description>
        <LayerDialog.Body>
          <form id="register-passkey-form" onSubmit={submit} className="flex flex-col gap-5">
            <Input label={t('pages.settings.passkeyNamePrompt')} value={name} disabled={saving} autoFocus onChange={(event) => setName(event.target.value)} />
            {error ? <ErrorAlert error={error} /> : null}
          </form>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t('common.cancel')}>
          <LayerDialog.Action type="submit" form="register-passkey-form" loading={saving}>{t('pages.settings.registerPasskeySubmit')}</LayerDialog.Action>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
