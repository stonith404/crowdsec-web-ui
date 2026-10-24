import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { KumoLocaleProvider, LinkProvider, Loader, Toasty, TooltipProvider } from '@cloudflare/kumo';
import { AppLink } from '@/components/app-link';
import { AppLayout } from '@/components/layout/app-layout';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { BrandingProvider } from '@/contexts/BrandingContext';
import { NotificationUnreadProvider } from '@/contexts/NotificationUnreadContext';
import { RefreshProvider } from '@/contexts/RefreshContext';
import { getBasePath } from '@/lib/basePath';
import { useLanguageFont } from '@/lib/font';
import { useI18n } from '@/lib/i18n';
import { ThemeContext, useTheme } from '@/lib/theme';
import { toastManager } from '@/lib/toast';

const Dashboard = lazy(async () => ({ default: (await import('@/pages/dashboard')).Dashboard }));
const Alerts = lazy(async () => ({ default: (await import('@/pages/alerts')).Alerts }));
const Decisions = lazy(async () => ({ default: (await import('@/pages/decisions')).Decisions }));
const IpProfile = lazy(async () => ({ default: (await import('@/pages/ip')).IpProfile }));
const Metrics = lazy(async () => ({ default: (await import('@/pages/metrics')).Metrics }));
const NotificationsLayout = lazy(async () => ({ default: (await import('@/pages/notifications/layout')).NotificationsLayout }));
const NotificationInbox = lazy(async () => ({ default: (await import('@/pages/notifications/inbox')).NotificationInbox }));
const NotificationDestinations = lazy(async () => ({ default: (await import('@/pages/notifications/destinations')).NotificationDestinations }));
const NotificationRules = lazy(async () => ({ default: (await import('@/pages/notifications/rules')).NotificationRules }));
const SettingsLayout = lazy(async () => ({ default: (await import('@/pages/settings/layout')).SettingsLayout }));
const GeneralSettings = lazy(async () => ({ default: (await import('@/pages/settings/general')).GeneralSettings }));
const AuthenticationSettings = lazy(async () => ({ default: (await import('@/pages/settings/authentication')).AuthenticationSettings }));
const BrandingSettings = lazy(async () => ({ default: (await import('@/pages/settings/branding')).BrandingSettings }));
const Login = lazy(async () => ({ default: (await import('@/pages/login')).Login }));
const Setup = lazy(async () => ({ default: (await import('@/pages/setup')).Setup }));

function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-kumo-subtle">
      <Loader size={20} />
    </div>
  );
}

function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}

function AppRoutes() {
  const { authEnabled, authenticated, loading, setupRequired } = useAuth();

  if (loading) return <Loading />;

  if (authEnabled && setupRequired) {
    return (
      <Routes>
        <Route path="/setup" element={<Page><Setup /></Page>} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  if (authEnabled && !authenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Page><Login /></Page>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <RefreshProvider>
      <NotificationUnreadProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Page><Dashboard /></Page>} />
            <Route path="alerts" element={<Page><Alerts /></Page>} />
            <Route path="decisions" element={<Page><Decisions /></Page>} />
            <Route path="ip/:ip" element={<Page><IpProfile /></Page>} />
            <Route path="metrics" element={<Page><Metrics /></Page>} />
            <Route path="notifications" element={<Page><NotificationsLayout /></Page>}>
              <Route index element={<Page><NotificationInbox /></Page>} />
              <Route path="destinations" element={<Page><NotificationDestinations /></Page>} />
              <Route path="rules" element={<Page><NotificationRules /></Page>} />
            </Route>
            <Route path="settings" element={<Page><SettingsLayout /></Page>}>
              <Route index element={<Page><GeneralSettings /></Page>} />
              <Route path="authentication" element={<Page><AuthenticationSettings /></Page>} />
              <Route path="branding" element={<Page><BrandingSettings /></Page>} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </NotificationUnreadProvider>
    </RefreshProvider>
  );
}

export default function App() {
  const theme = useTheme();
  const { t } = useI18n();
  useLanguageFont();

  return (
    <ThemeContext.Provider value={theme}>
      <KumoLocaleProvider translations={{ label: { optional: t('common.optional') }, layerDialog: { close: t('common.close'), cancel: t('common.cancel') } }}>
        <BrandingProvider>
          <AuthProvider>
            <TooltipProvider>
              <Toasty toastManager={toastManager}>
                <BrowserRouter basename={getBasePath() || '/'}>
                  <LinkProvider component={AppLink}>
                    <AppRoutes />
                  </LinkProvider>
                </BrowserRouter>
              </Toasty>
            </TooltipProvider>
          </AuthProvider>
        </BrandingProvider>
      </KumoLocaleProvider>
    </ThemeContext.Provider>
  );
}
