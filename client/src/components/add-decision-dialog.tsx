import { useState, type FormEvent } from 'react';
import { DEFAULT_MANUAL_DECISION_SCENARIO } from '../../../shared/contracts';
import { Input, LayerDialog, Select, Switch } from '@cloudflare/kumo';
import { ErrorAlert } from '@/components/error-alert';
import { toErrorInfo, type ErrorInfo } from '@/lib/errors';
import { useRefresh } from '@/contexts/useRefresh';
import { addDecision } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { AddDecisionRequest, InstanceOperationResult, MultiInstanceOperationResponse } from '@/types';

const DECISION_TYPES: Array<{ value: NonNullable<AddDecisionRequest['type']>; labelKey: string }> = [
  { value: 'ban', labelKey: 'pages.decisions.typeBan' },
  { value: 'captcha', labelKey: 'pages.decisions.typeCaptcha' },
];

const scenarioListKey = (scenarios: string[]) => [...scenarios].sort().join('\n');

export interface AddDecisionTarget {
  initial: AddDecisionRequest;
  /** The instance the decision is for by default, e.g. the instance of the alert it comes from */
  instanceId?: string;
}

/** The manual decision form, which writes to one instance or to all of them and lets failed instances be retried */
export function AddDecisionDialog({ target, onClose, onAdded }: { target: AddDecisionTarget; onClose: () => void; onAdded: () => void }) {
  const { t } = useI18n();
  const { config } = useRefresh();
  const instances = config?.instances ?? [];
  const multipleInstances = instances.length > 1;
  const [decision, setDecision] = useState<AddDecisionRequest>(() => ({ type: 'ban', ...target.initial }));
  const [allInstances, setAllInstances] = useState(!target.instanceId);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [retryInstances, setRetryInstances] = useState<InstanceOperationResult[]>([]);

  const currentInstance = instances.find((instance) => instance.id === target.instanceId);
  const targetInstances = !multipleInstances || allInstances ? instances : instances.filter((instance) => instance.id === target.instanceId);
  const scenarioLists = targetInstances.map((instance) => (instance.manual_decision_scenarios?.length ? instance.manual_decision_scenarios : [DEFAULT_MANUAL_DECISION_SCENARIO]));
  // Instances with different lists fall back to the default scenario that every instance offers
  const scenarioOptions = scenarioLists.length > 0 && scenarioLists.every((list) => scenarioListKey(list) === scenarioListKey(scenarioLists[0]))
    ? scenarioLists[0]
    : [DEFAULT_MANUAL_DECISION_SCENARIO];
  const scenario = decision.scenario && scenarioOptions.includes(decision.scenario) ? decision.scenario : scenarioOptions[0];

  const update = (change: Partial<AddDecisionRequest>) => {
    setDecision((current) => ({ ...current, ...change }));
    setRetryInstances([]);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const payload: AddDecisionRequest = { ...decision, scenario };
    const request: AddDecisionRequest = !multipleInstances
      ? payload
      : allInstances
        ? { ...payload, scope: 'all' }
        : { ...payload, scope: 'instance', instance_id: target.instanceId };
    setSaving(true);
    setError(null);
    try {
      const response = retryInstances.length > 0
        ? {
          results: await Promise.all(retryInstances.map(async (failed): Promise<InstanceOperationResult> => {
            try {
              const retried = await addDecision({ ...payload, scope: 'instance', instance_id: failed.instance_id }) as MultiInstanceOperationResponse;
              return retried?.results?.[0] || { ...failed, success: true, error: undefined };
            } catch (retryError) {
              return { ...failed, success: false, error: retryError instanceof Error ? retryError.message : String(retryError) };
            }
          })),
        }
        : await addDecision(request) as MultiInstanceOperationResponse | undefined;

      const failed = response?.results?.filter((result) => !result.success) ?? [];
      onAdded();
      if (failed.length > 0) {
        const succeeded = response!.results.filter((result) => result.success).map((result) => result.instance_name);
        setRetryInstances(failed);
        setError({ message: t('common.partialInstanceFailure', { succeeded: succeeded.join(', ') || '—', failed: failed.map((result) => result.instance_name).join(', ') }) });
        return;
      }
      onClose();
    } catch (failure) {
      setError(toErrorInfo(failure, t('pages.decisions.addFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <LayerDialog.Root open onOpenChange={(open) => { if (!open) onClose(); }} dismissDisabled={saving}>
      <LayerDialog.Content>
        <LayerDialog.Title>{t('pages.decisions.addManualDecision')}</LayerDialog.Title>
        <LayerDialog.Description>{t('pages.decisions.addManualDecisionDescription')}</LayerDialog.Description>
        <LayerDialog.Body>
          <form id="add-decision-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
            <Input label={t('tableColumns.source')} required disabled={saving} placeholder="1.2.3.4" className="font-mono" value={decision.ip} onChange={(event) => update({ ip: event.target.value })} />
            <div className="grid grid-cols-2 items-start gap-4">
              <Select
                label={t('tableColumns.type')}
                hideLabel={false}
                className="w-full"
                value={decision.type}
                disabled={saving}
                onValueChange={(value) => update({ type: value as AddDecisionRequest['type'] })}
                renderValue={(value) => t(DECISION_TYPES.find((option) => option.value === value)?.labelKey ?? '')}
              >
                {DECISION_TYPES.map((option) => <Select.Option key={option.value} value={option.value}>{t(option.labelKey)}</Select.Option>)}
              </Select>
              <Input label={t('pages.decisions.duration')} disabled={saving} placeholder="4h" value={decision.duration} onChange={(event) => update({ duration: event.target.value })} description={t('pages.decisions.durationHint')} />
            </div>
            {scenarioOptions.length > 1 ? (
              <Select label={t('tableColumns.scenario')} hideLabel={false} className="w-full" value={scenario} disabled={saving} onValueChange={(value) => update({ scenario: value as string })}>
                {scenarioOptions.map((option) => <Select.Option key={option} value={option}>{option}</Select.Option>)}
              </Select>
            ) : null}
            <Input label={t('pages.decisions.reason')} disabled={saving} placeholder={t('pages.decisions.placeholderReason')} value={decision.reason} onChange={(event) => update({ reason: event.target.value })} />
            {multipleInstances ? (
              <div className="flex flex-col gap-1">
                <Switch
                  label={t('pages.decisions.allInstances')}
                  checked={allInstances}
                  disabled={saving || !target.instanceId}
                  onCheckedChange={(checked: boolean) => {
                    setAllInstances(checked);
                    setRetryInstances([]);
                    setError(null);
                  }}
                />
                <p className="text-sm text-kumo-subtle">
                  {allInstances
                    ? t('pages.decisions.targetInstances', { names: targetInstances.map((instance) => instance.name).join(', ') })
                    : t('pages.decisions.currentInstance', { name: currentInstance?.name || target.instanceId || '' })}
                </p>
              </div>
            ) : null}
            {error ? <ErrorAlert error={error} /> : null}
          </form>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t('common.cancel')}>
          <LayerDialog.Action type="submit" form="add-decision-form" loading={saving}>
            {retryInstances.length > 0 ? t('common.retryFailedInstances') : t('pages.decisions.addDecision')}
          </LayerDialog.Action>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
