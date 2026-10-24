import { useLocation } from 'react-router-dom';
import { ArrowCircleUpIcon } from '@phosphor-icons/react';
import { Sidebar, useSidebar } from '@cloudflare/kumo';
import { AppLogo } from '@/components/app-logo';
import { useBranding } from '@/contexts/useBranding';
import { useNotificationUnreadCount } from '@/contexts/useNotificationUnreadCount';
import { useRefresh } from '@/contexts/useRefresh';
import { useI18n } from '@/lib/i18n';
import { useInstanceScope } from '@/lib/instanceScope';
import { getNavGroups, isNavItemActive, scopedLink, SETTINGS_NAV_ITEM, type NavItem } from '@/lib/navigation';
import { useUpdateStatus } from '@/lib/updateCheck';

export function AppSidebar() {
  const { t } = useI18n();
  const { appName } = useBranding();
  const { config, refreshSignal } = useRefresh();
  const { unreadCount } = useNotificationUnreadCount();
  const { instances, current } = useInstanceScope();
  const updateStatus = useUpdateStatus(refreshSignal);
  const location = useLocation();
  const { open } = useSidebar();
  const instanceScope = instances.length > 1 ? current : null;

  const renderItem = (item: NavItem) => (
    <Sidebar.MenuButton
      key={item.to}
      icon={item.icon}
      href={scopedLink(item.to, location, instanceScope)}
      active={isNavItemActive(item.to, location.pathname)}
      tooltip={t(item.labelKey)}
    >
      {t(item.labelKey)}
      {item.to === '/notifications' && unreadCount > 0 ? (
        <Sidebar.MenuBadge aria-label={t('components.sidebar.unreadNotifications', { count: unreadCount })}>{unreadCount}</Sidebar.MenuBadge>
      ) : null}
    </Sidebar.MenuButton>
  );

  return (
    <Sidebar>
      <Sidebar.Header>
        <div className="flex h-8 min-w-0 items-center gap-2.5 px-1">
          <AppLogo className="size-7" alt="" />
          {open ? <span className="truncate font-medium text-kumo-default">{appName}</span> : null}
        </div>
      </Sidebar.Header>
      <Sidebar.Content>
        <nav aria-label={t('components.sidebar.mainNavigation')}>
          {getNavGroups(config).map((group, index) => (
            <Sidebar.Group key={group.labelKey ?? index}>
              {group.labelKey ? <Sidebar.GroupLabel>{t(group.labelKey)}</Sidebar.GroupLabel> : null}
              <Sidebar.Menu>{group.items.map(renderItem)}</Sidebar.Menu>
            </Sidebar.Group>
          ))}
          <Sidebar.Separator />
          <Sidebar.Group>
            <Sidebar.Menu>
              {renderItem(SETTINGS_NAV_ITEM)}
              {updateStatus?.update_available ? (
                <Sidebar.MenuButton icon={ArrowCircleUpIcon} href={updateStatus.release_url || undefined} target="_blank" tooltip={t('components.sidebar.updateAvailable')}>
                  {t('components.sidebar.updateAvailable')}
                  {updateStatus.remote_version ? <Sidebar.MenuBadge>{updateStatus.remote_version}</Sidebar.MenuBadge> : null}
                </Sidebar.MenuButton>
              ) : null}
            </Sidebar.Menu>
          </Sidebar.Group>
        </nav>
      </Sidebar.Content>
      <Sidebar.Footer>
        <Sidebar.Trigger />
      </Sidebar.Footer>
    </Sidebar>
  );
}
