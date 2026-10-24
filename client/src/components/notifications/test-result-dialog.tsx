import { Badge, LayerDialog } from '@cloudflare/kumo';
import { DELIVERY_STATUSES } from '@/components/notifications/notification-types';
import { useI18n } from '@/lib/i18n';
import type { NotificationDeliveryResult } from '@/types';

export interface TestResult {
  name: string;
  help?: string;
  title: string;
  message: string;
  deliveries: NotificationDeliveryResult[];
}

/** What a test sent and how each destination took it */
export function TestResultDialog({ result, onClose }: { result: TestResult | null; onClose: () => void }) {
  const { t } = useI18n();

  return (
    <LayerDialog.Root open={result !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <LayerDialog.Content>
        <LayerDialog.Title>{t('pages.notifications.channelTestResultTitle', { name: result?.name ?? '' })}</LayerDialog.Title>
        {result?.help ? <LayerDialog.Description>{result.help}</LayerDialog.Description> : null}
        <LayerDialog.Body>
          {result ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg bg-kumo-recessed p-3">
                <p className="font-medium text-kumo-default">{result.title}</p>
                <p className="mt-1.5 text-sm whitespace-pre-wrap text-kumo-subtle">{result.message}</p>
              </div>
              <ul className="flex flex-col gap-2 text-sm">
                {result.deliveries.map((delivery) => (
                  <li key={delivery.channel_id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-kumo-default">{delivery.channel_name}</span>
                    <Badge variant={DELIVERY_STATUSES[delivery.status].variant}>{t(DELIVERY_STATUSES[delivery.status].labelKey)}</Badge>
                    {delivery.error ? <span className="basis-full text-kumo-danger">{delivery.error}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </LayerDialog.Body>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
