import type { ReactNode } from 'react';
import { LayerDialog } from '@cloudflare/kumo';
import { ErrorAlert } from '@/components/error-alert';
import { useI18n } from '@/lib/i18n';
import type { ErrorInfo } from '@/lib/errors';

/** Asks before deleting, stays open while the delete runs and shows its error in place */
export function ConfirmDeleteDialog({
  open,
  title,
  description,
  error,
  busy,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  error?: ErrorInfo | null;
  busy: boolean;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();

  return (
    <LayerDialog.Alert open={open} onOpenChange={(next) => { if (!next) onCancel(); }} dismissDisabled={busy}>
      <LayerDialog.Content size="sm">
        <LayerDialog.Title>{title}</LayerDialog.Title>
        <LayerDialog.Description>{description}</LayerDialog.Description>
        <LayerDialog.Body>{error ? <ErrorAlert error={error} /> : null}</LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t('common.cancel')}>
          <LayerDialog.Action variant="destructive" loading={busy} onClick={onConfirm}>{confirmLabel ?? t('common.delete')}</LayerDialog.Action>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Alert>
  );
}
