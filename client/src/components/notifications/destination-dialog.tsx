import { useState, type FormEvent } from 'react';
import { PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { Button, InputArea, LayerDialog, Switch } from '@cloudflare/kumo';
import { FormError, FormSection, NameField, SelectField, TextField } from '@/components/notifications/form-fields';
import { CHANNEL_TYPES } from '@/components/notifications/notification-types';
import { createNotificationChannel, updateNotificationChannel } from '@/lib/api';
import { toErrorInfo, type ErrorInfo } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import {
  coerceEmailConfig,
  coerceGotifyConfig,
  coerceMqttConfig,
  coerceNtfyConfig,
  coerceWebhookConfig,
  defaultChannelConfig,
  validateNotificationChannelConfig,
  type EmailConfig,
  type WebhookAuthConfig,
  type WebhookBodyConfig,
  type WebhookConfig,
} from '@/lib/notification-config';
import type { AlertMetaValue, NotificationChannel, NotificationChannelType, UpsertNotificationChannelRequest } from '@/types';

type Translate = ReturnType<typeof useI18n>['t'];
type PatchConfig = (patch: object) => void;

const FORM_ID = 'notification-destination-form';

function hostAndPath(value: string): string {
  try {
    const url = new URL(value);
    return url.host + (url.pathname === '/' ? '' : url.pathname);
  } catch {
    return '';
  }
}

function generateName({ type, config }: UpsertNotificationChannelRequest, t: Translate): string {
  const setting = (key: string) => (typeof config[key] === 'string' ? String(config[key]).trim() : '');
  const detail = {
    ntfy: setting('ntfyTopic'),
    gotify: hostAndPath(setting('gotifyUrl')),
    email: setting('emailTo').split(/[;,]/)[0].trim(),
    mqtt: setting('topic') || hostAndPath(setting('brokerUrl')),
    webhook: hostAndPath(setting('url')),
  }[type];
  const base = t(`pages.notifications.destinationNameDefaults.${type}`);
  return detail ? `${base} · ${detail}` : base;
}

/** Creates a destination, or edits one when given, in a dialog that stays open until the server accepted it */
export function DestinationDialog({ channel, onClose, onSaved }: { channel: NotificationChannel | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState<UpsertNotificationChannelRequest>(() => (channel
    ? { name: channel.name, type: channel.type, enabled: channel.enabled, config: channel.config }
    : { name: '', type: 'ntfy', enabled: true, config: defaultChannelConfig('ntfy') }));
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (change: Partial<UpsertNotificationChannelRequest>) => setForm((current) => ({ ...current, ...change }));
  const patchConfig: PatchConfig = (patch) => setForm((current) => ({ ...current, config: { ...current.config, ...patch } }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = validateNotificationChannelConfig(form.type, form.config);
    if (invalid) {
      setError({ message: invalid });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (channel) await updateNotificationChannel(channel.id, form);
      else await createNotificationChannel(form);
      onSaved();
      onClose();
    } catch (failure) {
      setError(toErrorInfo(failure, t('pages.notifications.failedToSaveDestination')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <LayerDialog.Root open onOpenChange={(open) => { if (!open) onClose(); }} dismissDisabled={saving}>
      <LayerDialog.Content size="lg" verticalAlign="top">
        <LayerDialog.Title>{channel ? t('pages.notifications.editDestinationTitle') : t('pages.notifications.newDestinationTitle')}</LayerDialog.Title>
        <LayerDialog.Description>{t('pages.notifications.destinationSheetDescription')}</LayerDialog.Description>
        <LayerDialog.Body>
          <form id={FORM_ID} className="flex flex-col gap-5" onSubmit={(event) => void submit(event)}>
            <div className="grid items-start gap-5 sm:grid-cols-2">
              <NameField value={form.name} onChange={(name) => update({ name })} onGenerate={() => update({ name: generateName(form, t) })} />
              <SelectField
                label={t('tableColumns.type')}
                value={form.type}
                options={(Object.keys(CHANNEL_TYPES) as NotificationChannelType[]).map((type) => ({ value: type, label: t(CHANNEL_TYPES[type].labelKey) }))}
                onChange={(type) => update({ type, config: defaultChannelConfig(type) })}
              />
            </div>
            <Switch label={t('common.enabled')} checked={form.enabled} onCheckedChange={(enabled) => update({ enabled })} />
            <FormSection title={t(CHANNEL_TYPES[form.type].labelKey)}>
              <ChannelFields type={form.type} config={form.config} onChange={patchConfig} />
            </FormSection>
            {error ? <FormError error={error} /> : null}
          </form>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t('common.cancel')}>
          <LayerDialog.Action type="submit" form={FORM_ID} loading={saving}>{t('pages.notifications.saveDestination')}</LayerDialog.Action>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

function ChannelFields({ type, config, onChange }: { type: NotificationChannelType; config: Record<string, AlertMetaValue>; onChange: PatchConfig }) {
  const { t } = useI18n();
  const number = (value: string) => Number(value || '0');

  if (type === 'email') {
    const email = coerceEmailConfig(config);
    return (
      <>
        <div className="grid items-start gap-5 sm:grid-cols-2">
          <TextField label={t('pages.notifications.smtpHost')} value={email.smtpHost} onChange={(smtpHost) => onChange({ smtpHost })} />
          <TextField label={t('pages.notifications.smtpPort')} type="number" value={email.smtpPort} onChange={(value) => onChange({ smtpPort: number(value) })} />
          <SelectField<EmailConfig['smtpTlsMode']>
            label={t('pages.notifications.smtpSecurity')}
            value={email.smtpTlsMode}
            options={(['plain', 'starttls', 'tls'] as const).map((mode) => ({ value: mode, label: t(`pages.notifications.smtpSecurityModes.${mode}`) }))}
            onChange={(smtpTlsMode) => onChange({ smtpTlsMode })}
          />
          <TextField label={t('pages.notifications.smtpUser')} value={email.smtpUser} onChange={(smtpUser) => onChange({ smtpUser })} />
          <TextField label={t('pages.notifications.smtpPassword')} secret value={email.smtpPassword} onChange={(smtpPassword) => onChange({ smtpPassword })} />
          <TextField label={t('pages.notifications.fromAddress')} value={email.smtpFrom} onChange={(smtpFrom) => onChange({ smtpFrom })} />
          <TextField label={t('pages.notifications.toAddresses')} value={email.emailTo} onChange={(emailTo) => onChange({ emailTo })} />
          <TextField label={t('pages.notifications.subjectPrefix')} value={email.subjectPrefix} onChange={(subjectPrefix) => onChange({ subjectPrefix })} />
          <SelectField<EmailConfig['emailImportanceOverride']>
            label={t('pages.notifications.importance')}
            value={email.emailImportanceOverride}
            options={(['auto', 'normal', 'important'] as const).map((level) => ({ value: level, label: t(`pages.notifications.importanceLevels.${level}`) }))}
            onChange={(emailImportanceOverride) => onChange({ emailImportanceOverride })}
          />
        </div>
        {email.smtpTlsMode !== 'plain' ? (
          <Switch label={t('pages.notifications.allowInsecureSmtpTls')} checked={email.allowInsecureTls} onCheckedChange={(allowInsecureTls) => onChange({ allowInsecureTls })} />
        ) : null}
      </>
    );
  }

  if (type === 'gotify') {
    const gotify = coerceGotifyConfig(config);
    return (
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <TextField label={t('pages.notifications.gotifyUrl')} value={gotify.gotifyUrl} onChange={(gotifyUrl) => onChange({ gotifyUrl })} />
        <SelectField
          label={t('pages.notifications.priority')}
          value={gotify.gotifyPriorityOverride}
          options={[{ value: 'auto', label: t('pages.notifications.priorityAuto') }, ...Array.from({ length: 11 }, (_, priority) => ({ value: String(priority), label: String(priority) }))]}
          onChange={(gotifyPriorityOverride) => onChange({ gotifyPriorityOverride })}
        />
        <div className="sm:col-span-2">
          <TextField label={t('pages.notifications.appToken')} secret value={gotify.gotifyToken} onChange={(gotifyToken) => onChange({ gotifyToken })} />
        </div>
      </div>
    );
  }

  if (type === 'mqtt') {
    const mqtt = coerceMqttConfig(config);
    return (
      <>
        <TextField label={t('pages.notifications.brokerUrl')} placeholder="mqtt://broker.example.com:1883" value={mqtt.brokerUrl} onChange={(brokerUrl) => onChange({ brokerUrl })} />
        <div className="grid items-start gap-5 sm:grid-cols-2">
          <TextField label={t('pages.notifications.username')} value={mqtt.username} onChange={(username) => onChange({ username })} />
          <TextField label={t('pages.notifications.password')} secret value={mqtt.password} onChange={(password) => onChange({ password })} />
          <TextField label={t('pages.notifications.clientId')} value={mqtt.clientId} onChange={(clientId) => onChange({ clientId })} />
          <SelectField
            label={t('pages.notifications.qos')}
            value={String(mqtt.qos)}
            options={[{ value: '0', label: '0' }, { value: '1', label: '1' }]}
            onChange={(qos) => onChange({ qos: Number(qos) })}
          />
          <TextField label={t('pages.notifications.keepaliveSeconds')} type="number" value={mqtt.keepaliveSeconds} onChange={(value) => onChange({ keepaliveSeconds: number(value) })} />
          <TextField label={t('pages.notifications.connectTimeoutMs')} type="number" value={mqtt.connectTimeoutMs} onChange={(value) => onChange({ connectTimeoutMs: number(value) })} />
        </div>
        <TextField label={t('pages.notifications.topic')} placeholder="crowdsec/notifications" value={mqtt.topic} onChange={(topic) => onChange({ topic })} />
        <Switch label={t('pages.notifications.retainMqttPayloads')} checked={mqtt.retainEvents} onCheckedChange={(retainEvents) => onChange({ retainEvents })} />
      </>
    );
  }

  if (type === 'webhook') return <WebhookFields webhook={coerceWebhookConfig(config)} onChange={onChange} />;

  const ntfy = coerceNtfyConfig(config);
  return (
    <div className="grid items-start gap-5 sm:grid-cols-2">
      <TextField label={t('pages.notifications.serverUrl')} value={ntfy.ntfyUrl} onChange={(ntfyUrl) => onChange({ ntfyUrl })} />
      <TextField label={t('pages.notifications.topic')} value={ntfy.ntfyTopic} onChange={(ntfyTopic) => onChange({ ntfyTopic })} />
      <TextField label={t('pages.notifications.accessToken')} secret value={ntfy.ntfyToken} onChange={(ntfyToken) => onChange({ ntfyToken })} />
      <TextField label={t('pages.notifications.username')} value={ntfy.ntfyUsername} onChange={(ntfyUsername) => onChange({ ntfyUsername })} />
      <TextField label={t('pages.notifications.password')} secret value={ntfy.ntfyPassword} onChange={(ntfyPassword) => onChange({ ntfyPassword })} />
      <TextField label={t('pages.notifications.titlePrefix')} value={ntfy.titlePrefix} onChange={(titlePrefix) => onChange({ titlePrefix })} />
      <TextField label={t('pages.notifications.tags')} value={ntfy.tags} onChange={(tags) => onChange({ tags })} />
      <SelectField
        label={t('pages.notifications.priority')}
        value={ntfy.ntfyPriorityOverride}
        options={['auto', 'min', 'low', 'default', 'high', 'urgent'].map((priority) => ({ value: priority, label: priority === 'auto' ? t('pages.notifications.priorityAuto') : priority }))}
        onChange={(ntfyPriorityOverride) => onChange({ ntfyPriorityOverride })}
      />
    </div>
  );
}

function WebhookFields({ webhook, onChange }: { webhook: WebhookConfig; onChange: PatchConfig }) {
  const { t } = useI18n();
  const number = (value: string) => Number(value || '0');
  const { auth, body } = webhook;

  const setAuthMode = (mode: WebhookAuthConfig['mode']) => onChange({
    auth: mode === 'bearer' ? { mode, token: '' } : mode === 'basic' ? { mode, username: '', password: '' } : { mode },
  });

  const setBodyMode = (mode: WebhookBodyConfig['mode']) => onChange({
    body: mode === 'form' ? { mode, fields: [] } : { mode, template: body.mode === 'form' ? '' : body.template },
  });

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
        <SelectField<WebhookConfig['method']>
          label={t('pages.notifications.method')}
          value={webhook.method}
          options={(['POST', 'PUT', 'PATCH'] as const).map((method) => ({ value: method, label: method }))}
          onChange={(method) => onChange({ method })}
        />
        <TextField label={t('pages.notifications.url')} value={webhook.url} onChange={(url) => onChange({ url })} />
      </div>
      <KeyValueList
        legend={t('pages.notifications.queryParameters')}
        addLabel={t('pages.notifications.addQuery')}
        emptyLabel={t('pages.notifications.noQueryParameters')}
        rows={webhook.query}
        blank={{ name: '', value: '' }}
        onChange={(query) => onChange({ query })}
      />
      <KeyValueList
        legend={t('pages.notifications.headers')}
        addLabel={t('pages.notifications.addHeader')}
        emptyLabel={t('pages.notifications.noHeaders')}
        rows={webhook.headers}
        blank={{ name: '', value: '', sensitive: false }}
        onChange={(headers) => onChange({ headers })}
      />
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <SelectField<WebhookAuthConfig['mode']>
          label={t('pages.notifications.authentication')}
          value={auth.mode}
          options={(['none', 'bearer', 'basic'] as const).map((mode) => ({ value: mode, label: t(`pages.notifications.authModes.${mode}`) }))}
          onChange={setAuthMode}
        />
        {auth.mode === 'bearer' ? (
          <TextField label={t('pages.notifications.bearerToken')} secret value={auth.token} onChange={(token) => onChange({ auth: { ...auth, token } })} />
        ) : null}
        {auth.mode === 'basic' ? (
          <>
            <TextField label={t('pages.notifications.username')} value={auth.username} onChange={(username) => onChange({ auth: { ...auth, username } })} />
            <TextField label={t('pages.notifications.password')} secret value={auth.password} onChange={(password) => onChange({ auth: { ...auth, password } })} />
          </>
        ) : null}
      </div>
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <SelectField<WebhookBodyConfig['mode']>
          label={t('pages.notifications.bodyMode')}
          value={body.mode}
          options={(['json', 'text', 'form'] as const).map((mode) => ({ value: mode, label: t(`pages.notifications.bodyModes.${mode}`) }))}
          onChange={setBodyMode}
        />
      </div>
      {body.mode === 'form' ? (
        <KeyValueList
          legend={t('pages.notifications.formFields')}
          addLabel={t('pages.notifications.addField')}
          emptyLabel={t('pages.notifications.noFormFields')}
          rows={body.fields}
          blank={{ name: '', value: '', sensitive: false }}
          onChange={(fields) => onChange({ body: { mode: 'form', fields } })}
        />
      ) : (
        <InputArea
          label={t('pages.notifications.bodyTemplate')}
          rows={8}
          className="min-h-40 font-mono text-xs"
          value={body.template}
          onValueChange={(template) => onChange({ body: { ...body, template } })}
        />
      )}
      <div className="grid gap-5 sm:grid-cols-3">
        <TextField label={t('pages.notifications.timeoutMs')} type="number" value={webhook.timeoutMs} onChange={(value) => onChange({ timeoutMs: number(value) })} />
        <TextField label={t('pages.notifications.retryAttempts')} type="number" value={webhook.retryAttempts} onChange={(value) => onChange({ retryAttempts: number(value) })} />
        <TextField label={t('pages.notifications.retryDelayMs')} type="number" value={webhook.retryDelayMs} onChange={(value) => onChange({ retryDelayMs: number(value) })} />
      </div>
      <Switch label={t('pages.notifications.allowInsecureWebhookTls')} checked={webhook.allowInsecureTls} onCheckedChange={(allowInsecureTls) => onChange({ allowInsecureTls })} />
    </>
  );
}

/** Name and value pairs, where rows that can be marked sensitive keep their values as secrets */
function KeyValueList<T extends { name: string; value: string; sensitive?: boolean }>({
  legend,
  addLabel,
  emptyLabel,
  rows,
  blank,
  onChange,
}: {
  legend: string;
  addLabel: string;
  emptyLabel: string;
  rows: T[];
  blank: T;
  onChange: (rows: T[]) => void;
}) {
  const { t } = useI18n();
  const sensitive = 'sensitive' in blank;
  const updateRow = (index: number, change: Partial<T>) => onChange(rows.map((row, current) => (current === index ? { ...row, ...change } : row)));

  return (
    <div role="group" aria-label={legend} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-base font-medium text-kumo-default">{legend}</span>
        <Button size="sm" icon={<PlusIcon />} onClick={() => onChange([...rows, blank])}>{addLabel}</Button>
      </div>
      {rows.length === 0 ? <p className="text-sm text-kumo-subtle">{emptyLabel}</p> : null}
      {rows.map((row, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-lg p-3 ring ring-kumo-hairline sm:flex-row sm:items-end">
          <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
            <TextField label={t('common.name')} value={row.name} onChange={(name) => updateRow(index, { name } as Partial<T>)} />
            <TextField label={t('pages.notifications.value')} secret={sensitive} value={row.value} onChange={(value) => updateRow(index, { value } as Partial<T>)} />
          </div>
          <div className="flex h-9 items-center justify-between gap-3">
            {sensitive ? (
              <Switch label={t('pages.notifications.sensitive')} checked={row.sensitive === true} onCheckedChange={(checked) => updateRow(index, { sensitive: checked } as Partial<T>)} />
            ) : null}
            <Button
              variant="ghost"
              shape="square"
              icon={<TrashIcon />}
              className="text-kumo-subtle"
              aria-label={t('common.remove')}
              onClick={() => onChange(rows.filter((_, current) => current !== index))}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
