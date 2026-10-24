import { BellIcon, ChartBarIcon, GavelIcon, GearSixIcon, ShieldWarningIcon, SquaresFourIcon, type Icon } from '@phosphor-icons/react';
import { compileAlertSearch, compileDecisionSearch } from '../../../shared/search';
import type { ConfigResponse } from '../types';

export interface NavItem {
  to: string;
  labelKey: string;
  icon: Icon;
}

export interface NavGroup {
  labelKey?: string;
  items: NavItem[];
}

export function getNavGroups(config: ConfigResponse | null): NavGroup[] {
  return [
    { items: [{ to: '/', labelKey: 'components.sidebar.nav.dashboard', icon: SquaresFourIcon }] },
    {
      labelKey: 'components.sidebar.group.security',
      items: [
        { to: '/alerts', labelKey: 'components.sidebar.nav.alerts', icon: ShieldWarningIcon },
        { to: '/decisions', labelKey: 'components.sidebar.nav.decisions', icon: GavelIcon },
      ],
    },
    {
      labelKey: 'components.sidebar.group.monitoring',
      items: [
        ...(config?.metrics_sidebar_visible !== false ? [{ to: '/metrics', labelKey: 'components.sidebar.nav.metrics', icon: ChartBarIcon }] : []),
        { to: '/notifications', labelKey: 'components.sidebar.nav.notifications', icon: BellIcon },
      ],
    },
  ];
}

export const SETTINGS_NAV_ITEM: NavItem = { to: '/settings', labelKey: 'components.sidebar.nav.settings', icon: GearSixIcon };

export function isNavItemActive(to: string, pathname: string): boolean {
  return to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);
}

const SEARCH_PAGES = ['/', '/alerts', '/decisions'];
const SCOPED_PAGES = [...SEARCH_PAGES, '/metrics'];
const SEARCH_OPTIONS = { machineEnabled: true, originEnabled: true };

function supportsQuery(path: string, query: string): boolean {
  if (path === '/alerts') return compileAlertSearch(query, SEARCH_OPTIONS).ok;
  if (path === '/decisions') return compileDecisionSearch(query, SEARCH_OPTIONS).ok;
  return compileAlertSearch(query, SEARCH_OPTIONS).ok && compileDecisionSearch(query, SEARCH_OPTIONS).ok;
}

/** Links between the data pages keep the instance scope and a search that the target page understands. */
export function scopedLink(path: string, location: { pathname: string; search: string }, instanceScope: string | null): string {
  if (location.pathname === path) return `${path}${location.search}`;
  if (!SCOPED_PAGES.includes(path)) return path;

  const params = new URLSearchParams();
  if (instanceScope) params.set('instance', instanceScope);
  const query = new URLSearchParams(location.search).get('q');
  if (query && SEARCH_PAGES.includes(location.pathname) && SEARCH_PAGES.includes(path) && supportsQuery(path, query)) {
    params.set('q', query);
  }
  return params.size > 0 ? `${path}?${params}` : path;
}

export interface SectionTab {
  to: string;
  labelKey: string;
}

/** Sections whose sub pages are tabs, each its own route so tabs are linkable */
export const SECTION_TABS: Record<string, SectionTab[]> = {
  '/notifications': [
    { to: '/notifications', labelKey: 'pages.notifications.recentNotifications' },
    { to: '/notifications/destinations', labelKey: 'pages.notifications.destinations' },
    { to: '/notifications/rules', labelKey: 'pages.notifications.rules' },
  ],
  '/settings': [
    { to: '/settings', labelKey: 'pages.settings.general' },
    { to: '/settings/authentication', labelKey: 'pages.settings.authentication' },
    { to: '/settings/branding', labelKey: 'pages.settings.branding' },
  ],
};

const PAGE_TITLE_KEYS: Record<string, string> = {
  '/': 'pages.dashboard.title',
  '/alerts': 'pages.alerts.title',
  '/decisions': 'pages.decisions.title',
  '/metrics': 'pages.metrics.title',
  '/notifications': 'pages.notifications.title',
  '/settings': 'pages.settings.title',
};

export interface Breadcrumb {
  labelKey: string;
  to?: string;
}

export function getBreadcrumbs(pathname: string): Breadcrumb[] {
  const section = `/${pathname.split('/')[1] ?? ''}`;
  if (section === '/ip') return [{ labelKey: PAGE_TITLE_KEYS['/alerts'], to: '/alerts' }, { labelKey: 'pages.ip.title' }];
  const sectionTitle = PAGE_TITLE_KEYS[section] ?? PAGE_TITLE_KEYS['/'];
  const tab = section !== pathname ? SECTION_TABS[section]?.find((candidate) => candidate.to === pathname) : undefined;
  return tab ? [{ labelKey: sectionTitle, to: section }, { labelKey: tab.labelKey }] : [{ labelKey: sectionTitle }];
}
