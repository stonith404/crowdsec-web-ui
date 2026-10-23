import { useState, type FormEvent } from 'react';
import { InfoIcon, WarningIcon } from '@phosphor-icons/react';
import { Banner, Checkbox, LayerDialog, Switch } from '@cloudflare/kumo';
import { FormError, FormSection, NameField, SelectField, TextField } from '@/components/notifications/form-fields';
import { CHANNEL_TYPES, RULE_TYPES, SEVERITIES } from '@/components/notifications/notification-types';
import { useBranding } from '@/contexts/useBranding';
import { createNotificationRule, updateNotificationRule } from '@/lib/api';
import { toErrorInfo, type ErrorInfo } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import type { NotificationChannel, NotificationFilter, NotificationRule, NotificationRuleConfig, NotificationRuleType, NotificationSeverity } from '@/types';

interface RuleForm {
  name: string;
  type: NotificationRuleType;
  enabled: boolean;
  severity: NotificationSeverity;
  channel_ids: string[];
  filters: {
    scenario: string;
    exclude_scenario: boolean;
    target: string;
    include_simulated: boolean;
    values: string;
    countries: string;
    exclude_countries: boolean;
  };
  config: Record<string, string>;
}

type Translate = ReturnType<typeof useI18n>['t'];

const FORM_ID = 'notification-rule-form';

const RULE_DEFAULTS: Record<NotificationRuleType, Record<string, string>> = {
  'alert-spike': { window_minutes: '60', percent_increase: '100', minimum_current_alerts: '10' },
  'alert-threshold': { window_minutes: '60', alert_threshold: '25' },
  'new-alert-decision': { window_minutes: '5', event_type: 'both' },
  'new-cve': { max_cve_age_days: '14' },
  'ip-ban': { window_minutes: '60' },
  'application-update': {},
  'crowdsec-update': {},
  'lapi-availability': { outage_threshold_seconds: '60', notify_on_recovery: 'false' },
};

const WITHOUT_ALERT_FILTERS: NotificationRuleType[] = ['application-update', 'crowdsec-update', 'lapi-availability'];

function toForm(rule: NotificationRule | null): RuleForm {
  const filters: NotificationFilter | undefined = rule && 'filters' in rule.config ? rule.config.filters : undefined;
  return {
    name: rule?.name ?? '',
    type: rule?.type ?? 'alert-spike',
    enabled: rule?.enabled ?? true,
    severity: rule?.severity ?? 'warning',
    channel_ids: rule?.channel_ids ?? [],
    filters: {
      scenario: filters?.scenario ?? '',
      exclude_scenario: filters?.exclude_scenario === true,
      target: filters?.target ?? '',
      include_simulated: filters?.include_simulated === true,
      values: filters?.values?.join(', ') ?? '',
      countries: filters?.countries?.join(', ') ?? '',
      exclude_countries: filters?.exclude_countries === true,
    },
    config: rule
      ? Object.fromEntries(Object.entries(rule.config).filter(([key]) => key !== 'filters').map(([key, value]) => [key, String(value ?? '')]))
      : { ...RULE_DEFAULTS['alert-spike'] },
  };
}

const splitList = (value: string) => value.split(/[\s,]+/).filter(Boolean);

function toConfig({ type, config, filters: form }: RuleForm): NotificationRuleConfig {
  const number = (key: string) => Number(config[key] || '0');
  const scenario = form.scenario.trim();
  const filters: NotificationFilter = {
    scenario,
    ...(scenario && form.exclude_scenario ? { exclude_scenario: true } : {}),
    target: form.target.trim(),
    include_simulated: form.include_simulated,
  };
  switch (type) {
    case 'alert-spike':
      return { window_minutes: number('window_minutes'), percent_increase: number('percent_increase'), minimum_current_alerts: number('minimum_current_alerts'), filters };
    case 'alert-threshold':
      return { window_minutes: number('window_minutes'), alert_threshold: number('alert_threshold'), filters };
    case 'new-alert-decision':
      return {
        window_minutes: number('window_minutes'),
        event_type: config.event_type === 'alert' || config.event_type === 'decision' ? config.event_type : 'both',
        filters: { ...filters, values: splitList(form.values) },
      };
    case 'ip-ban':
      return {
        window_minutes: number('window_minutes'),
        filters: { ...filters, values: splitList(form.values), countries: splitList(form.countries.toUpperCase()), exclude_countries: form.exclude_countries },
      };
    case 'lapi-availability':
      return { outage_threshold_seconds: number('outage_threshold_seconds'), notify_on_recovery: config.notify_on_recovery === 'true' };
    case 'new-cve':
      return { max_cve_age_days: number('max_cve_age_days'), filters };
    default:
      return {};
  }
}

function generateName({ type, filters }: RuleForm, t: Translate): string {
  const base = t(`pages.notifications.ruleNameDefaults.${type}`);
  if (WITHOUT_ALERT_FILTERS.includes(type)) return base;
  const firstTwo = (value: string) => {
    const values = value.split(',').map((part) => part.trim()).filter(Boolean);
    return values.slice(0, 2).join(', ') + (values.length > 2 ? '…' : '');
  };
  const detail = [
    filters.exclude_countries ? '' : firstTwo(filters.countries),
    firstTwo(filters.values),
    filters.target.trim(),
    filters.exclude_scenario ? '' : filters.scenario.trim(),
  ].filter(Boolean).slice(0, 2).join(' / ');
  return detail ? `${base} · ${detail}` : base;
}

/** Creates a rule, or edits one when given, in a dialog that stays open until the server accepted it */
export function RuleDialog({
  rule,
  channels,
  onClose,
  onSaved,
}: {
  rule: NotificationRule | null;
  channels: NotificationChannel[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { appName } = useBranding();
  const [form, setForm] = useState(() => toForm(rule));
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const { type, filters, config } = form;

  const update = (change: Partial<RuleForm>) => setForm((current) => ({ ...current, ...change }));
  const updateFilters = (change: Partial<RuleForm['filters']>) => setForm((current) => ({ ...current, filters: { ...current.filters, ...change } }));
  const updateConfig = (change: Record<string, string>) => setForm((current) => ({ ...current, config: { ...current.config, ...change } }));
  const configField = (key: string, labelKey: string, descriptionKey?: string) => (
    <TextField
      label={t(labelKey)}
      type="number"
      value={config[key] ?? ''}
      description={descriptionKey ? t(descriptionKey) : undefined}
      onChange={(value) => updateConfig({ [key]: value })}
    />
  );

  const includesAlerts = config.event_type !== 'decision';
  const includesDecisions = config.event_type !== 'alert';
  const setEventTypes = (alerts: boolean, decisions: boolean) => {
    // One of the two always stays checked, since a rule for neither would never fire
    if (alerts || decisions) updateConfig({ event_type: alerts && decisions ? 'both' : alerts ? 'alert' : 'decision' });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const payload = { name: form.name, type, enabled: form.enabled, severity: form.severity, channel_ids: form.channel_ids, config: toConfig(form) };
    setSaving(true);
    setError(null);
    try {
      if (rule) await updateNotificationRule(rule.id, payload);
      else await createNotificationRule(payload);
      onSaved();
      onClose();
    } catch (failure) {
      setError(toErrorInfo(failure, t('pages.notifications.failedToSaveRule')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <LayerDialog.Root open onOpenChange={(open) => { if (!open) onClose(); }} dismissDisabled={saving}>
      <LayerDialog.Content size="lg" verticalAlign="top">
        <LayerDialog.Title>{rule ? t('pages.notifications.editRuleTitle') : t('pages.notifications.newRuleTitle')}</LayerDialog.Title>
        <LayerDialog.Description>{t('pages.notifications.ruleSheetDescription')}</LayerDialog.Description>
        <LayerDialog.Body>
          <form id={FORM_ID} className="flex flex-col gap-5" onSubmit={(event) => void submit(event)}>
            <NameField
              value={form.name}
              placeholder={t(`pages.notifications.ruleNameExamples.${type}`)}
              description={t('pages.notifications.ruleNameHelp')}
              onChange={(name) => update({ name })}
              onGenerate={() => update({ name: generateName(form, t) })}
            />
            <div className="grid items-start gap-5 sm:grid-cols-2">
              <SelectField
                label={t('pages.notifications.ruleType')}
                value={type}
                options={(Object.keys(RULE_TYPES) as NotificationRuleType[]).map((value) => ({ value, label: t(RULE_TYPES[value].labelKey) }))}
                onChange={(next) => update({ type: next, config: { ...RULE_DEFAULTS[next] } })}
              />
              <SelectField
                label={t('pages.notifications.severity')}
                value={form.severity}
                options={(Object.keys(SEVERITIES) as NotificationSeverity[]).map((value) => ({ value, label: t(SEVERITIES[value].labelKey) }))}
                onChange={(severity) => update({ severity })}
              />
            </div>
            <Switch label={t('common.enabled')} checked={form.enabled} onCheckedChange={(enabled) => update({ enabled })} />

            <FormSection title={t('pages.notifications.outboundDestinations')}>
              {channels.length === 0 ? (
                <Banner variant="alert" icon={<WarningIcon weight="fill" />} description={t('pages.notifications.noOutboundDestinationsHelp')} />
              ) : (
                <Checkbox.Group
                  appearance="card"
                  description={t('pages.notifications.selectDestinationsHelp')}
                  value={form.channel_ids}
                  onValueChange={(channel_ids) => update({ channel_ids })}
                >
                  <Checkbox.Legend className="sr-only">{t('pages.notifications.outboundDestinations')}</Checkbox.Legend>
                  {channels.map((channel) => (
                    <Checkbox.Item key={channel.id} value={channel.id} label={channel.name} description={t(CHANNEL_TYPES[channel.type].labelKey)} />
                  ))}
                </Checkbox.Group>
              )}
            </FormSection>

            {WITHOUT_ALERT_FILTERS.includes(type) ? null : (
              <FormSection title={t('pages.notifications.filters')}>
                <div className="grid items-start gap-5 sm:grid-cols-2">
                  {type === 'ip-ban' || type === 'new-alert-decision' ? (
                    <TextField label={t('pages.notifications.ipRangeFilter')} mono value={filters.values} onChange={(values) => updateFilters({ values })} />
                  ) : null}
                  {type === 'ip-ban' ? (
                    <TextField label={t('pages.notifications.countryFilter')} value={filters.countries} onChange={(countries) => updateFilters({ countries })} />
                  ) : null}
                  <TextField label={t('pages.notifications.scenarioContains')} value={filters.scenario} onChange={(scenario) => updateFilters({ scenario })} />
                  <TextField label={t('pages.notifications.targetContains')} value={filters.target} onChange={(target) => updateFilters({ target })} />
                </div>
                <div className="flex flex-col gap-3">
                  <Checkbox label={t('pages.notifications.excludeMatchingScenarios')} checked={filters.exclude_scenario} onCheckedChange={(exclude_scenario) => updateFilters({ exclude_scenario })} />
                  {type === 'ip-ban' ? (
                    <Checkbox label={t('pages.notifications.excludeCountries')} checked={filters.exclude_countries} onCheckedChange={(exclude_countries) => updateFilters({ exclude_countries })} />
                  ) : null}
                  <Switch
                    label={t(type === 'ip-ban'
                      ? 'pages.notifications.includeSimulatedDecisions'
                      : type === 'new-alert-decision' ? 'pages.notifications.includeSimulatedAlertsAndDecisions' : 'pages.notifications.includeSimulatedAlerts')}
                    checked={filters.include_simulated}
                    onCheckedChange={(include_simulated) => updateFilters({ include_simulated })}
                  />
                </div>
              </FormSection>
            )}

            <FormSection title={t(RULE_TYPES[type].labelKey)}>
              {type === 'alert-spike' ? (
                <div className="grid gap-5 sm:grid-cols-3">
                  {configField('window_minutes', 'pages.notifications.windowMinutes')}
                  {configField('percent_increase', 'pages.notifications.percentIncrease')}
                  {configField('minimum_current_alerts', 'pages.notifications.minimumAlerts')}
                  <p className="text-sm text-kumo-subtle sm:col-span-3">{t('pages.notifications.alertSpikeWindowHelp')}</p>
                </div>
              ) : null}
              {type === 'alert-threshold' ? (
                <div className="grid items-start gap-5 sm:grid-cols-2">
                  {configField('window_minutes', 'pages.notifications.windowMinutes', 'pages.notifications.alertThresholdWindowHelp')}
                  {configField('alert_threshold', 'pages.notifications.alertThreshold')}
                </div>
              ) : null}
              {type === 'new-alert-decision' ? (
                <>
                  <Checkbox.Group
                    legend={t('pages.notifications.eventType')}
                    value={[...(includesAlerts ? ['alert'] : []), ...(includesDecisions ? ['decision'] : [])]}
                    onValueChange={(values) => setEventTypes(values.includes('alert'), values.includes('decision'))}
                  >
                    <Checkbox.Item value="alert" label={t('pages.notifications.eventTypes.alerts')} />
                    <Checkbox.Item value="decision" label={t('pages.notifications.eventTypes.decisions')} />
                  </Checkbox.Group>
                  <div className="grid items-start gap-5 sm:grid-cols-2">
                    {configField('window_minutes', 'pages.notifications.windowMinutes', 'pages.notifications.newAlertDecisionWindowHelp')}
                  </div>
                </>
              ) : null}
              {type === 'ip-ban' ? (
                <div className="grid items-start gap-5 sm:grid-cols-2">
                  {configField('window_minutes', 'pages.notifications.windowMinutes', 'pages.notifications.ipBanWindowHelp')}
                </div>
              ) : null}
              {type === 'new-cve' ? (
                <div className="grid items-start gap-5 sm:grid-cols-2">
                  {configField('max_cve_age_days', 'pages.notifications.maximumCveAgeDays')}
                </div>
              ) : null}
              {type === 'lapi-availability' ? (
                <>
                  <div className="grid items-start gap-5 sm:grid-cols-2">
                    {configField('outage_threshold_seconds', 'pages.notifications.outageThresholdSeconds')}
                  </div>
                  <Switch
                    label={t('pages.notifications.sendRecoveryNotification')}
                    checked={config.notify_on_recovery === 'true'}
                    onCheckedChange={(checked) => updateConfig({ notify_on_recovery: String(checked) })}
                  />
                </>
              ) : null}
              {type === 'application-update' || type === 'crowdsec-update' ? (
                <Banner
                  icon={<InfoIcon weight="fill" />}
                  description={type === 'crowdsec-update' ? t('pages.notifications.crowdsecUpdateHelp') : t('pages.notifications.applicationUpdateHelp', { appName })}
                />
              ) : null}
            </FormSection>
            {error ? <FormError error={error} /> : null}
          </form>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t('common.cancel')}>
          <LayerDialog.Action type="submit" form={FORM_ID} loading={saving}>{t('pages.notifications.saveRule')}</LayerDialog.Action>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
