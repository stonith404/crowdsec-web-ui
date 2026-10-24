import { PageHeader } from '@/components/page-header';
import { PageTabs } from '@/components/page-tabs';
import { useI18n } from '@/lib/i18n';
import { SECTION_TABS } from '@/lib/navigation';

export function SettingsLayout() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('pages.settings.title')} />
      <PageTabs tabs={SECTION_TABS['/settings']} />
    </>
  );
}
