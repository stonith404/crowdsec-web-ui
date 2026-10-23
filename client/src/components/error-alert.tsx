import { WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import { Banner, Button, Link } from '@cloudflare/kumo';
import { useI18n } from '@/lib/i18n';
import type { ErrorInfo } from '@/lib/errors';

export function ErrorAlert({ error, onDismiss }: { error: ErrorInfo; onDismiss?: () => void }) {
  const { t } = useI18n();

  return (
    <Banner
      variant="error"
      role="alert"
      icon={<WarningCircleIcon weight="fill" />}
      description={(
        <>
          {error.message}
          {error.helpLink ? (
            <>
              {' '}{t('common.seeReadme')}{' '}
              <Link href={error.helpLink} target="_blank" rel="noopener noreferrer">{error.helpText || t('common.learnMore')}</Link>
            </>
          ) : null}
        </>
      )}
      action={onDismiss ? <Button variant="ghost" size="sm" shape="square" icon={<XIcon />} aria-label={t('common.dismissError')} onClick={onDismiss} /> : undefined}
    />
  );
}
