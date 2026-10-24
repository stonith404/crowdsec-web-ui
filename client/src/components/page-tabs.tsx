import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Tabs } from '@cloudflare/kumo';
import { useI18n } from '@/lib/i18n';
import type { SectionTab } from '@/lib/navigation';

/** Underlined tabs that are routes, like the sub navigation of a Cloudflare product page, so each tab is linkable */
export function PageTabs({ tabs }: { tabs: SectionTab[] }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-full overflow-x-auto">
        <Tabs
          variant="underline"
          value={pathname}
          onValueChange={(value) => navigate(value)}
          tabs={tabs.map((tab) => ({ value: tab.to, label: t(tab.labelKey) }))}
        />
      </div>
      <Outlet />
    </div>
  );
}
