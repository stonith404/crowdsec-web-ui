import { Fragment } from 'react';
import { useLocation } from 'react-router-dom';
import { CaretUpDownIcon, CheckIcon, StackIcon } from '@phosphor-icons/react';
import { Breadcrumbs, Button, DropdownMenu, Sidebar, useSidebar } from '@cloudflare/kumo';
import { InstanceIcon } from '@/components/instance-icon';
import { RefreshMenu } from '@/components/layout/refresh-menu';
import { UserMenu } from '@/components/layout/user-menu';
import { useI18n } from '@/lib/i18n';
import { useInstanceScope } from '@/lib/instanceScope';
import { getBreadcrumbs } from '@/lib/navigation';

/** Picks which instance the pages show, the way Cloudflare's breadcrumb switches between zones */
function InstanceSwitcher() {
  const { t } = useI18n();
  const { instances, current, changeInstance } = useInstanceScope();
  const currentIndex = instances.findIndex((instance) => instance.id === current);
  const currentInstance = instances[currentIndex];

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={(
          <Button variant="ghost" size="sm" className="gap-1.5 font-medium" aria-label={t('components.sidebar.instance')}>
            {currentInstance ? <InstanceIcon name={currentInstance.name} colorIndex={currentIndex} /> : <StackIcon className="size-4" />}
            <span className="max-sm:sr-only">{currentInstance?.name ?? t('components.sidebar.allInstances')}</span>
            <CaretUpDownIcon className="size-3.5 text-kumo-subtle" />
          </Button>
        )}
      />
      <DropdownMenu.Content align="start">
        <DropdownMenu.Group>
          <DropdownMenu.Label>{t('components.sidebar.instance')}</DropdownMenu.Label>
          <DropdownMenu.Item icon={<StackIcon />} onClick={() => changeInstance('all')}>
            <span className="flex-1">{t('components.sidebar.allInstances')}</span>
            {current === 'all' ? <CheckIcon className="size-4" /> : null}
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          {instances.map((instance, index) => (
            <DropdownMenu.Item key={instance.id} icon={<InstanceIcon name={instance.name} colorIndex={index} />} onClick={() => changeInstance(instance.id)}>
              <span className="flex-1 truncate">{instance.name}</span>
              {current === instance.id ? <CheckIcon className="size-4" /> : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Group>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}

export function AppHeader() {
  const { t } = useI18n();
  const location = useLocation();
  const { instances } = useInstanceScope();
  const breadcrumbs = getBreadcrumbs(location.pathname);
  const { isMobile } = useSidebar();

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-kumo-hairline bg-kumo-base px-4 md:px-6">
      {/* On phones the sidebar is a sheet, and this is the only way to open it */}
      {isMobile ? <Sidebar.Trigger /> : null}
      <Breadcrumbs className="min-w-0 flex-1">
        {instances.length > 1 ? (
          <>
            <InstanceSwitcher />
            <Breadcrumbs.Separator />
          </>
        ) : null}
        {breadcrumbs.map((crumb, index) => (
          <Fragment key={crumb.labelKey}>
            {index > 0 ? <Breadcrumbs.Separator /> : null}
            {crumb.to ? <Breadcrumbs.Link href={crumb.to}>{t(crumb.labelKey)}</Breadcrumbs.Link> : <Breadcrumbs.Current>{t(crumb.labelKey)}</Breadcrumbs.Current>}
          </Fragment>
        ))}
      </Breadcrumbs>
      <div className="flex shrink-0 items-center gap-1">
        <RefreshMenu />
        <UserMenu />
      </div>
    </header>
  );
}
