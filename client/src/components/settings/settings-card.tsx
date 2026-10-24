import type { FormEvent, ReactNode } from 'react';
import { Button, LayerCard, Switch } from '@cloudflare/kumo';
import { ErrorAlert } from '@/components/error-alert';
import { useI18n } from '@/lib/i18n';
import type { ErrorInfo } from '@/lib/errors';

/** A settings section: its title and description in the card's strip, its content on the panel */
export function SettingsCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  /** Controls in the header that act right away, such as registering a passkey */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <LayerCard>
      {/* Kumo pulls this strip into the panel for a one-line title, which a description below it doesn't fit */}
      <LayerCard.Secondary className="my-0 justify-between py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="font-semibold text-kumo-default">{title}</h2>
          {description ? <p className="text-sm font-normal">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </LayerCard.Secondary>
      <LayerCard.Primary className="gap-5 p-5">{children}</LayerCard.Primary>
    </LayerCard>
  );
}

/**
 * A settings card that saves on its own, with its error and a Save button at the end that stays disabled until something changed.
 * Read-only, its fields are disabled and the Save row is left out.
 */
export function FormCard({
  title,
  description,
  readOnly = false,
  dirty,
  saving,
  error,
  submitLabel,
  footer,
  onSubmit,
  children,
}: {
  title: string;
  description?: string;
  readOnly?: boolean;
  dirty: boolean;
  saving: boolean;
  error: ErrorInfo | null;
  submitLabel?: string;
  /** Controls at the start of the Save row, such as restoring defaults */
  footer?: ReactNode;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <SettingsCard title={title} description={description}>
      <form onSubmit={submit}>
        <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-5">
          {children}
          {error ? <ErrorAlert error={error} /> : null}
          {readOnly ? null : (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-kumo-hairline pt-4">
              {footer ? <div className="me-auto">{footer}</div> : null}
              <Button type="submit" variant="primary" disabled={!dirty} loading={saving}>{submitLabel ?? t('common.save')}</Button>
            </div>
          )}
        </fieldset>
      </form>
    </SettingsCard>
  );
}

/** A setting that is on or off, with its label and description beside the switch */
export function SwitchRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={id} className="text-base font-medium text-kumo-default">{label}</label>
        <div className="flex flex-col gap-1 text-sm leading-snug text-kumo-subtle">{description}</div>
      </div>
      {/* Kumo's switch names itself "Switch" unless it gets an aria-label, which wins over the label element */}
      <Switch id={id} aria-label={label} checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5 shrink-0" />
    </div>
  );
}
