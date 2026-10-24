import { PageHeader } from '@/components/page-header';
import { PageTabs } from '@/components/page-tabs';
import { useI18n } from '@/lib/i18n';
import { SECTION_TABS } from '@/lib/navigation';

export function NotificationsLayout() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('pages.notifications.title')} description={t('pages.notifications.description')} />
      <PageTabs tabs={SECTION_TABS['/notifications']} />
    </>
  );
}
