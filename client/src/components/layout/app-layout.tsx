import { Outlet } from 'react-router-dom';
import { Sidebar } from '@cloudflare/kumo';
import { AppHeader } from '@/components/layout/app-header';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SyncBanner } from '@/components/layout/sync-banner';
import { useI18n } from '@/lib/i18n';
import { useRestoreInstanceScope } from '@/lib/instanceScope';

export function AppLayout() {
  const { t } = useI18n();
  useRestoreInstanceScope();

  return (
    <>
      {/* Keyboard users land on this first and can skip the sidebar's links */}
      <a
        href="#content"
        className="fixed start-2.5 top-2.5 z-50 -translate-y-20 rounded-lg bg-kumo-base px-3 py-2 text-sm font-medium shadow-lg ring-1 ring-kumo-line focus-visible:translate-y-0"
      >
        {t('components.layout.skipToContent')}
      </a>
      {/* The sidebar stays put while the content column scrolls, as on the Cloudflare dashboard */}
      <Sidebar.Provider defaultOpen className="h-svh overflow-hidden">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <AppHeader />
          <main id="content" tabIndex={-1} className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-6 p-4 outline-none md:p-8 lg:px-10">
            <SyncBanner />
            <Outlet />
          </main>
        </div>
      </Sidebar.Provider>
    </>
  );
}
