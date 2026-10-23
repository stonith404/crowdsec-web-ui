import { useState } from 'react';
import i18next from 'i18next';
import { DEFAULT_MANUAL_DECISION_SCENARIO, isValidDecisionScenario } from '../../../../shared/contracts';
import { Loader, Select } from '@cloudflare/kumo';
import { ListEditor } from '@/components/settings/list-editor';
import { ReadOnlyNotice } from '@/components/settings/read-only-notice';
import { FormCard, SettingsCard, SwitchRow } from '@/components/settings/settings-card';
import { useSubmit } from '@/components/settings/use-submit';
import { useRefresh } from '@/contexts/useRefresh';
import { updateManualDecisionScenarios, updateManualRefreshSetting, updateMetricsSidebarPreference } from '@/lib/api';
import {
  BROWSER_LANGUAGE_SETTING,
  SUPPORTED_LANGUAGES,
  getLanguageLabelKey,
  resolveLanguagePreference,
  useI18n,
  type LanguagePreference,
} from '@/lib/i18n';
import { toast } from '@/lib/toast';
import type { InstanceSummary, ManualDecisionScenarioSettings } from '@/types';

const REFRESH_OPTIONS = [
  { value: 0, labelKey: 'components.sidebar.refresh.off' },
  { value: 5000, labelKey: 'components.sidebar.refresh.every5Seconds' },
  { value: 30000, labelKey: 'components.sidebar.refresh.every30Seconds' },
  { value: 60000, labelKey: 'components.sidebar.refresh.every1Minute' },
  { value: 300000, labelKey: 'components.sidebar.refresh.every5Minutes' },
];

export function GeneralSettings() {
  const { t } = useI18n();
  const { config } = useRefresh();

  if (!config) {
    return <div className="flex justify-center py-16 text-kumo-subtle"><Loader size={20} /></div>;
  }

  const canManage = config.permissions?.can_manage_settings !== false;
  const overridden = config.instances?.filter((instance) => Object.keys(instance.sync_overrides ?? {}).length > 0) ?? [];

  return (
    <div className="flex flex-col gap-6">
      {canManage ? null : <ReadOnlyNotice>{t('pages.settings.readOnlyGeneral')}</ReadOnlyNotice>}
      <InterfaceCard />
      <RefreshCard readOnly={!canManage} />
      {overridden.length > 0 ? <OverridesCard instances={overridden} /> : null}
      <ScenariosCard saved={config.manual_decision_scenario_settings ?? { configured: [], custom: [] }} readOnly={!canManage} />
    </div>
  );
}

function InterfaceCard() {
  const { t, browserLanguage, preference: savedLanguage, setLanguagePreference } = useI18n();
  const { config, reloadConfig } = useRefresh();
  const savedMetricsVisible = config?.metrics_sidebar_visible !== false;
  const [language, setLanguage] = useState<LanguagePreference>(savedLanguage);
  const [metricsVisible, setMetricsVisible] = useState(savedMetricsVisible);
  const { saving, error, run } = useSubmit();

  const save = () => run(async () => {
    if (metricsVisible !== savedMetricsVisible) {
      await updateMetricsSidebarPreference({ visible: metricsVisible });
      await reloadConfig();
    }
    setLanguagePreference(language);
    // Confirms in the language just chosen, which the page only switches to after this render
    toast.success(String(i18next.getFixedT(resolveLanguagePreference(language))('pages.settings.settingsSaved')));
  }, t('pages.settings.failedToSaveSettings'));

  return (
    <FormCard
      title={t('pages.settings.interface')}
      description={t('pages.settings.generalDescription')}
      dirty={language !== savedLanguage || metricsVisible !== savedMetricsVisible}
      saving={saving}
      error={error}
      onSubmit={() => void save()}
    >
      <div className="grid items-start gap-5 md:grid-cols-2">
        <Select
          label={t('pages.settings.language')}
          description={t('pages.settings.languageHelp')}
          className="w-full"
          value={language}
          onValueChange={(value) => setLanguage(value as LanguagePreference)}
          items={[
            { value: BROWSER_LANGUAGE_SETTING, label: t('pages.settings.browserDefaultLanguage', { language: t(getLanguageLabelKey(browserLanguage)) }) },
            ...SUPPORTED_LANGUAGES.map((option) => ({ value: option.code, label: t(option.labelKey) })),
          ]}
        />
      </div>
      <SwitchRow
        id="settings-metrics-sidebar"
        label={t('pages.settings.showMetricsInSidebar')}
        description={t('pages.settings.showMetricsInSidebarHelp')}
        checked={metricsVisible}
        onCheckedChange={setMetricsVisible}
      />
    </FormCard>
  );
}

function RefreshCard({ readOnly }: { readOnly: boolean }) {
  const { t } = useI18n();
  const { config, intervalMs, setIntervalMs, reloadConfig } = useRefresh();
  const savedManualRefresh = config?.manual_refresh_enabled === true;
  const [refreshInterval, setRefreshInterval] = useState(intervalMs);
  const [manualRefresh, setManualRefresh] = useState(savedManualRefresh);
  const { saving, error, run } = useSubmit();

  const save = () => run(async () => {
    if (refreshInterval !== intervalMs) await setIntervalMs(refreshInterval);
    if (manualRefresh !== savedManualRefresh) {
      await updateManualRefreshSetting({ enabled: manualRefresh });
      await reloadConfig();
    }
    toast.success(t('pages.settings.settingsSaved'));
  }, t('pages.settings.failedToSaveSettings'));

  return (
    <FormCard
      title={t('pages.settings.refresh')}
      description={t('pages.settings.refreshDescription')}
      readOnly={readOnly}
      dirty={refreshInterval !== intervalMs || manualRefresh !== savedManualRefresh}
      saving={saving}
      error={error}
      onSubmit={() => void save()}
    >
      <div className="grid items-start gap-5 md:grid-cols-2">
        <Select
          label={t('pages.settings.refreshInterval')}
          description={t('pages.settings.refreshHelp')}
          className="w-full"
          value={refreshInterval}
          onValueChange={(value) => setRefreshInterval(value as number)}
          items={REFRESH_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
        />
      </div>
      <SwitchRow
        id="settings-manual-refresh"
        label={t('pages.settings.enableManualRefresh')}
        description={t('pages.settings.enableManualRefreshHelp')}
        checked={manualRefresh}
        onCheckedChange={setManualRefresh}
      />
    </FormCard>
  );
}

function OverridesCard({ instances }: { instances: InstanceSummary[] }) {
  const { t } = useI18n();

  return (
    <SettingsCard title={t('pages.settings.instanceOverrides')} description={t('pages.settings.instanceOverridesDescription')}>
      <div className="grid gap-6 md:grid-cols-2">
        {instances.map((instance) => (
          <section key={instance.id} className="flex min-w-0 flex-col gap-2">
            <h3 className="font-medium text-kumo-default">{instance.name}</h3>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
              {Object.entries(instance.sync_overrides ?? {}).map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="font-mono text-kumo-subtle">{key}</dt>
                  <dd className="min-w-0 font-mono break-words text-kumo-default">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </SettingsCard>
  );
}

function ScenariosCard({ saved, readOnly }: { saved: ManualDecisionScenarioSettings; readOnly: boolean }) {
  const { t } = useI18n();
  const { reloadConfig } = useRefresh();
  const [custom, setCustom] = useState(saved.custom);
  const { saving, error, run } = useSubmit();
  // The default and the configured scenarios are always offered, so they show first and can't be removed
  const locked = [...new Set([DEFAULT_MANUAL_DECISION_SCENARIO, ...saved.configured])];

  const save = () => run(async () => {
    const payload = await updateManualDecisionScenarios({ scenarios: custom });
    setCustom(payload.manual_decision_scenario_settings.custom);
    await reloadConfig();
    toast.success(t('pages.settings.manualDecisionScenariosSaved'));
  }, t('pages.settings.failedToSaveManualDecisionScenarios'));

  return (
    <FormCard
      title={t('pages.settings.manualDecisions')}
      description={t('pages.settings.manualDecisionsDescription')}
      readOnly={readOnly}
      dirty={custom.join('\n') !== saved.custom.join('\n')}
      saving={saving}
      error={error}
      submitLabel={t('pages.settings.saveManualDecisionScenarios')}
      onSubmit={() => void save()}
    >
      <ListEditor
        id="settings-manual-decision-scenarios"
        label={t('pages.settings.manualDecisionScenarios')}
        description={t('pages.settings.manualDecisionScenariosHelp')}
        items={[...locked, ...custom]}
        onChange={(items) => setCustom(items.filter((scenario) => !locked.includes(scenario)))}
        canRemove={(scenario) => !locked.includes(scenario)}
        placeholder="custom/abuse-report"
        removeLabel={(scenario) => t('pages.settings.removeManualDecisionScenario', { scenario })}
        validate={(scenario) => (isValidDecisionScenario(scenario) ? null : t('pages.settings.manualDecisionScenarioInvalid', { scenario }))}
      />
    </FormCard>
  );
}
