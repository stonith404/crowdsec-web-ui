import { useRef, useState, type ChangeEvent } from 'react';
import { ArrowCounterClockwiseIcon, UploadSimpleIcon } from '@phosphor-icons/react';
import { Button, Input, cn } from '@cloudflare/kumo';
import { AppLogo } from '@/components/app-logo';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { ErrorAlert } from '@/components/error-alert';
import { ColorsCard } from '@/components/settings/colors-card';
import { ReadOnlyNotice } from '@/components/settings/read-only-notice';
import { FormCard, SettingsCard } from '@/components/settings/settings-card';
import { useSubmit } from '@/components/settings/use-submit';
import { useBranding } from '@/contexts/useBranding';
import { useRefresh } from '@/contexts/useRefresh';
import {
  ACCEPTED_APP_LOGO_TYPES,
  MAX_APP_LOGO_BYTES,
  MAX_APP_NAME_LENGTH,
  resetAppLogo,
  updateAppName,
  uploadAppLogo,
  type AppLogoVariant,
} from '@/lib/branding';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/lib/toast';

const MAX_LOGO_SIZE = `${MAX_APP_LOGO_BYTES / 1024} KB`;

export function BrandingSettings() {
  const { t } = useI18n();
  const { config } = useRefresh();
  const readOnly = config?.permissions?.can_manage_settings === false;

  return (
    <div className="flex flex-col gap-6">
      {readOnly ? <ReadOnlyNotice>{t('pages.settings.readOnlyBranding')}</ReadOnlyNotice> : null}
      <AppNameCard readOnly={readOnly} />
      <LogosCard readOnly={readOnly} />
      <ColorsCard readOnly={readOnly} />
    </div>
  );
}

function AppNameCard({ readOnly }: { readOnly: boolean }) {
  const { t } = useI18n();
  const { appName, defaultAppName, setBranding } = useBranding();
  // The default name is stored as no name, so the field shows it as its placeholder
  const savedName = appName === defaultAppName ? '' : appName;
  const [name, setName] = useState(savedName);
  const { saving, error, run } = useSubmit();

  const save = () => run(async () => {
    const branding = await updateAppName(name);
    setBranding(branding);
    setName(branding.appName === branding.defaultAppName ? '' : branding.appName);
    toast.success(t('pages.settings.appNameSaved'));
  }, t('pages.settings.failedToSaveAppName'));

  return (
    <FormCard
      title={t('pages.settings.branding')}
      description={t('pages.settings.brandingDescription')}
      readOnly={readOnly}
      dirty={name.trim() !== savedName}
      saving={saving}
      error={error}
      submitLabel={t('pages.settings.saveAppName')}
      onSubmit={() => void save()}
    >
      <div className="grid items-start gap-5 md:grid-cols-2">
        <Input
          label={t('pages.settings.appName')}
          description={t('pages.settings.appNameHelp', { defaultName: defaultAppName })}
          value={name}
          maxLength={MAX_APP_NAME_LENGTH}
          placeholder={defaultAppName}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
    </FormCard>
  );
}

function LogosCard({ readOnly }: { readOnly: boolean }) {
  const { t } = useI18n();
  const { setBranding } = useBranding();
  const upload = useSubmit();
  const reset = useSubmit();
  const [uploading, setUploading] = useState<AppLogoVariant | null>(null);
  const [resetting, setResetting] = useState<AppLogoVariant | null>(null);

  const uploadLogo = async (file: File, variant: AppLogoVariant) => {
    if (file.type && !ACCEPTED_APP_LOGO_TYPES.includes(file.type)) {
      upload.setError({ message: t('pages.settings.logoUnsupportedType') });
      return;
    }
    if (file.size > MAX_APP_LOGO_BYTES) {
      upload.setError({ message: t('pages.settings.logoTooLarge', { size: MAX_LOGO_SIZE }) });
      return;
    }
    setUploading(variant);
    await upload.run(async () => {
      setBranding(await uploadAppLogo(file, variant));
      toast.success(t(variant === 'dark' ? 'pages.settings.darkLogoUpdated' : 'pages.settings.logoUpdated'));
    }, t('pages.settings.failedToUpdateLogo'));
    setUploading(null);
  };

  const confirmReset = () => void reset.run(async () => {
    if (!resetting) return;
    setBranding(await resetAppLogo(resetting));
    toast.success(t(resetting === 'dark' ? 'pages.settings.darkLogoRemoved' : 'pages.settings.logoReset'));
    setResetting(null);
  }, t('pages.settings.failedToUpdateLogo'));

  return (
    <SettingsCard title={t('pages.settings.logos')}>
      <div className="grid items-start gap-5 md:grid-cols-2">
        {(['default', 'dark'] as const).map((variant) => (
          <LogoField
            key={variant}
            variant={variant}
            disabled={readOnly || upload.saving}
            uploading={uploading === variant}
            onUpload={(file) => void uploadLogo(file, variant)}
            onReset={() => {
              reset.setError(null);
              setResetting(variant);
            }}
          />
        ))}
      </div>
      {upload.error ? <ErrorAlert error={upload.error} onDismiss={() => upload.setError(null)} /> : null}
      <ConfirmDeleteDialog
        open={resetting !== null}
        title={t(resetting === 'dark' ? 'pages.settings.removeLogo' : 'pages.settings.resetLogo')}
        description={t(resetting === 'dark' ? 'pages.settings.removeDarkLogoConfirm' : 'pages.settings.resetLogoConfirm')}
        error={reset.error}
        busy={reset.saving}
        confirmLabel={t(resetting === 'dark' ? 'pages.settings.removeLogo' : 'pages.settings.resetLogo')}
        onConfirm={confirmReset}
        onCancel={() => setResetting(null)}
      />
    </SettingsCard>
  );
}

function LogoField({
  variant,
  disabled,
  uploading,
  onUpload,
  onReset,
}: {
  variant: AppLogoVariant;
  disabled: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
  onReset: () => void;
}) {
  const { t } = useI18n();
  const { appName, logoUrl, logoDarkUrl } = useBranding();
  const inputRef = useRef<HTMLInputElement>(null);
  const dark = variant === 'dark';
  const id = `settings-logo-${variant}`;

  const select = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so that choosing the same file again fires another change
    event.target.value = '';
    if (file) onUpload(file);
  };

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-base font-medium text-kumo-default">{t(dark ? 'pages.settings.darkLogo' : 'pages.settings.logo')}</label>
      <div className="flex items-center gap-4">
        {/* Each logo sits on the background of the theme it is shown in, the light one on white also while the page is dark */}
        <div data-mode={dark ? 'dark' : undefined} className={cn('flex size-16 shrink-0 items-center justify-center rounded-lg ring ring-kumo-hairline', dark ? 'bg-kumo-base' : 'bg-white')}>
          <AppLogo variant={variant} alt={t(dark ? 'pages.settings.darkLogoAlt' : 'components.sidebar.logoAlt', { appName })} className="size-12" />
        </div>
        <div className="flex flex-wrap gap-2">
          <input id={id} ref={inputRef} type="file" accept={ACCEPTED_APP_LOGO_TYPES.join(',')} className="sr-only" tabIndex={-1} disabled={disabled} onChange={select} />
          <Button icon={UploadSimpleIcon} disabled={disabled} loading={uploading} onClick={() => inputRef.current?.click()}>
            {t('pages.settings.uploadLogo')}
          </Button>
          {(dark ? logoDarkUrl : logoUrl) ? (
            <Button variant="secondary-destructive" icon={ArrowCounterClockwiseIcon} disabled={disabled} onClick={onReset}>
              {t(dark ? 'pages.settings.removeLogo' : 'pages.settings.resetLogo')}
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-sm leading-snug text-kumo-subtle">{dark ? t('pages.settings.darkLogoHelp') : t('pages.settings.logoHelp', { size: MAX_LOGO_SIZE })}</p>
    </div>
  );
}
