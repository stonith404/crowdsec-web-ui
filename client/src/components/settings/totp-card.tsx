import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { QrCodeIcon, ShieldSlashIcon } from '@phosphor-icons/react';
import { Badge, Button, ClipboardText, Input, LayerDialog, Loader, buttonVariants } from '@cloudflare/kumo';
import { ErrorAlert } from '@/components/error-alert';
import { authRequest } from '@/components/settings/auth-api';
import { SettingsCard } from '@/components/settings/settings-card';
import { useSubmit } from '@/components/settings/use-submit';
import { toErrorInfo } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/lib/toast';

/** The authenticator app second factor of the signed-in password account */
export function TotpCard({ enabled, onChanged }: { enabled: boolean; onChanged: () => void }) {
  const { t } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);

  const close = (changed: boolean) => {
    setDialogOpen(false);
    if (changed) onChanged();
  };

  return (
    <SettingsCard title={t('pages.settings.totpTitle')}>
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <Badge variant={enabled ? 'success' : 'secondary'}>{enabled ? t('common.enabled') : t('common.disabled')}</Badge>
          <p className="text-sm leading-snug text-kumo-subtle">
            {enabled ? t('pages.settings.totpEnabledDescription') : t('pages.settings.totpDescription')}
          </p>
        </div>
        {enabled ? (
          <Button variant="secondary-destructive" icon={ShieldSlashIcon} className="shrink-0" onClick={() => setDialogOpen(true)}>
            {t('pages.settings.disableTotp')}
          </Button>
        ) : (
          <Button icon={QrCodeIcon} className="shrink-0" onClick={() => setDialogOpen(true)}>
            {t('pages.settings.setupTotp')}
          </Button>
        )}
      </div>
      {dialogOpen ? enabled ? <TotpDisableDialog onClose={close} /> : <TotpSetupDialog onClose={close} /> : null}
    </SettingsCard>
  );
}

interface TotpSetup {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

function TotpSetupDialog({ onClose }: { onClose: (changed: boolean) => void }) {
  const { t } = useI18n();
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState('');
  const { saving, error, setError, run } = useSubmit();

  // Every start creates a new secret, which the server keeps until the code that confirms it arrives
  useEffect(() => {
    let cancelled = false;
    authRequest<{ secret: string; otpauthUrl: string }>('/totp/setup', 'POST')
      .then(async (payload) => ({
        ...payload,
        // QR codes need dark modules on a light ground, whatever the theme
        qrDataUrl: await QRCode.toDataURL(payload.otpauthUrl, { width: 256, margin: 1, color: { dark: '#111827', light: '#ffffff' } }),
      }))
      .then((next) => {
        if (!cancelled) setSetup(next);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(toErrorInfo(failure, t('pages.settings.failedToStartTotpSetup')));
      });
    return () => {
      cancelled = true;
    };
  }, [setError, t]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await authRequest('/totp/enable', 'POST', { code });
      toast.success(t('pages.settings.totpEnabled'));
      onClose(true);
    }, t('pages.settings.failedToEnableTotp'));
  };

  return (
    <LayerDialog.Root open onOpenChange={(open) => { if (!open) onClose(false); }} dismissDisabled={saving}>
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>{t('pages.settings.setupTotpTitle')}</LayerDialog.Title>
        <LayerDialog.Description>{t('pages.settings.setupTotpDescription')}</LayerDialog.Description>
        <LayerDialog.Body>
          <form id="totp-setup-form" onSubmit={submit} className="flex flex-col gap-5">
            {setup ? (
              <>
                <div className="flex flex-col items-center gap-3">
                  <img src={setup.qrDataUrl} alt={t('pages.settings.totpQrAlt')} className="w-full max-w-56 rounded-lg ring ring-kumo-hairline" />
                  {/* A plain anchor, since the app's link component would route the otpauth: URL inside the app */}
                  <a href={setup.otpauthUrl} className={buttonVariants()}>
                    <QrCodeIcon />
                    {t('pages.settings.openAuthenticatorApp')}
                  </a>
                </div>
                <div className="grid gap-2">
                  <span className="text-base font-medium text-kumo-default">{t('pages.settings.manualTotpSecret')}</span>
                  <ClipboardText
                    text={setup.secret}
                    className="w-full"
                    labels={{ copyAction: t('pages.settings.copyTotpSecret') }}
                    tooltip={{ text: t('pages.settings.copyTotpSecret'), copiedText: t('pages.settings.copied') }}
                  />
                </div>
                <Input
                  label={t('pages.settings.authenticatorCode')}
                  value={code}
                  disabled={saving}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9 ]*"
                  className="numeric"
                  autoFocus
                  onChange={(event) => setCode(event.target.value)}
                />
              </>
            ) : error ? null : (
              <div className="flex justify-center py-8 text-kumo-subtle"><Loader size={20} /></div>
            )}
            {error ? <ErrorAlert error={error} /> : null}
          </form>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t('common.cancel')}>
          <LayerDialog.Action type="submit" form="totp-setup-form" disabled={!setup || !code.trim()} loading={saving}>
            {t('pages.settings.verifyAndEnableTotp')}
          </LayerDialog.Action>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

function TotpDisableDialog({ onClose }: { onClose: (changed: boolean) => void }) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const { saving, error, run } = useSubmit();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await authRequest('/totp', 'DELETE', { currentPassword: password });
      toast.success(t('pages.settings.totpDisabled'));
      onClose(true);
    }, t('pages.settings.failedToDisableTotp'));
  };

  return (
    <LayerDialog.Alert open onOpenChange={(open) => { if (!open) onClose(false); }} dismissDisabled={saving}>
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>{t('pages.settings.disableTotp')}</LayerDialog.Title>
        <LayerDialog.Description>{t('pages.settings.disableTotpDescription')}</LayerDialog.Description>
        <LayerDialog.Body>
          <form id="totp-disable-form" onSubmit={submit} className="flex flex-col gap-5">
            <Input
              label={t('pages.settings.currentPassword')}
              type="password"
              value={password}
              disabled={saving}
              autoComplete="current-password"
              autoFocus
              onChange={(event) => setPassword(event.target.value)}
            />
            {error ? <ErrorAlert error={error} /> : null}
          </form>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t('common.cancel')}>
          <LayerDialog.Action type="submit" form="totp-disable-form" variant="destructive" disabled={!password} loading={saving}>
            {t('pages.settings.disableTotp')}
          </LayerDialog.Action>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Alert>
  );
}
