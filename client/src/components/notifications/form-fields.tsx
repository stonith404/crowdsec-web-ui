import type { ReactNode } from 'react';
import { MagicWandIcon } from '@phosphor-icons/react';
import { Input, InputGroup, Select, cn } from '@cloudflare/kumo';
import { ErrorAlert } from '@/components/error-alert';
import type { ErrorInfo } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import { hasStoredSecret, STORED_SECRET_SENTINEL } from '@/lib/notification-config';

/** A titled group of fields in a destination or rule dialog */
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 border-t border-kumo-hairline pt-5">
      <h3 className="text-base font-semibold text-kumo-default">{title}</h3>
      {children}
    </section>
  );
}

// A stable ref callback runs only when the error appears, not on every render
const scrollIntoView = (node: HTMLElement | null) => node?.scrollIntoView({ block: 'nearest' });

/** The save error at the end of a long dialog form, scrolled into view since the form may be scrolled up */
export function FormError({ error }: { error: ErrorInfo }) {
  return <div ref={scrollIntoView}><ErrorAlert error={error} /></div>;
}

/** A labelled input, where a secret keeps the server's stored value until something new is typed */
export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  description,
  secret = false,
  mono = false,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: 'text' | 'number';
  placeholder?: string;
  description?: ReactNode;
  secret?: boolean;
  mono?: boolean;
}) {
  const { t } = useI18n();
  const stored = secret && hasStoredSecret(String(value));

  return (
    <Input
      label={label}
      description={description}
      type={secret ? 'password' : type}
      value={stored ? '' : value}
      placeholder={stored ? t('pages.notifications.unchanged') : placeholder}
      autoComplete={secret ? 'new-password' : 'off'}
      className={cn(mono && 'font-mono', type === 'number' && 'numeric')}
      onChange={(event) => onChange(event.target.value || (stored ? STORED_SECRET_SENTINEL : ''))}
    />
  );
}

/** The name of a destination or rule, with a button that suggests one from the current settings */
export function NameField({
  value,
  onChange,
  onGenerate,
  placeholder,
  description,
}: {
  value: string;
  onChange: (value: string) => void;
  onGenerate: () => void;
  placeholder?: string;
  description?: ReactNode;
}) {
  const { t } = useI18n();

  return (
    <InputGroup label={t('common.name')} description={description}>
      <InputGroup.Input name="name" autoComplete="off" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      <InputGroup.Addon align="end">
        <InputGroup.Button
          shape="square"
          className="text-kumo-subtle"
          icon={MagicWandIcon}
          aria-label={t('pages.notifications.generateRuleName')}
          tooltip={t('pages.notifications.generateRuleName')}
          onClick={onGenerate}
        />
      </InputGroup.Addon>
    </InputGroup>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <Select
      label={label}
      hideLabel={false}
      className="w-full"
      value={value}
      items={options}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    />
  );
}
