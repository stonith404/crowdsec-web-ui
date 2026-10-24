import { describe, expect, test } from 'vitest';
import type { ConfigResponse } from '../../types';
import { getBreadcrumbs, getNavGroups, isNavItemActive, scopedLink } from '../navigation';

describe('scopedLink', () => {
  test('keeps the instance scope and a query the target page understands', () => {
    expect(scopedLink('/decisions', { pathname: '/alerts', search: '?q=country%3DFR&instance=all' }, 'primary'))
      .toBe('/decisions?instance=primary&q=country%3DFR');
  });

  test('carries a query to the dashboard only when it compiles for alerts and decisions', () => {
    expect(scopedLink('/', { pathname: '/alerts', search: '?q=country%3DFR' }, null)).toBe('/?q=country%3DFR');
    expect(scopedLink('/', { pathname: '/alerts', search: '?q=decision%3Dactive' }, null)).toBe('/');
  });

  test('drops a query the target page cannot compile', () => {
    expect(scopedLink('/decisions', { pathname: '/alerts', search: '?q=decision%3Dactive' }, null)).toBe('/decisions');
  });

  test('keeps the current URL when linking to the current page, and adds nothing for unscoped pages', () => {
    expect(scopedLink('/alerts', { pathname: '/alerts', search: '?q=ssh&page=3' }, 'all')).toBe('/alerts?q=ssh&page=3');
    expect(scopedLink('/settings', { pathname: '/alerts', search: '?q=ssh' }, 'all')).toBe('/settings');
    expect(scopedLink('/metrics', { pathname: '/alerts', search: '?q=ssh' }, 'edge')).toBe('/metrics?instance=edge');
  });
});

describe('getBreadcrumbs', () => {
  test('names a tab after its section, which links back', () => {
    expect(getBreadcrumbs('/settings/branding')).toEqual([
      { labelKey: 'pages.settings.title', to: '/settings' },
      { labelKey: 'pages.settings.branding' },
    ]);
    expect(getBreadcrumbs('/alerts')).toEqual([{ labelKey: 'pages.alerts.title' }]);
    expect(getBreadcrumbs('/')).toEqual([{ labelKey: 'pages.dashboard.title' }]);
  });
});

test('isNavItemActive matches sub pages but not the dashboard for every path', () => {
  expect(isNavItemActive('/notifications', '/notifications/rules')).toBe(true);
  expect(isNavItemActive('/', '/alerts')).toBe(false);
  expect(isNavItemActive('/alerts', '/alerts-archive')).toBe(false);
});

test('getNavGroups hides metrics only when the sidebar preference turns them off', () => {
  const paths = (config: Partial<ConfigResponse> | null) => getNavGroups(config as ConfigResponse | null).flatMap((group) => group.items.map((item) => item.to));
  expect(paths(null)).toContain('/metrics');
  expect(paths({ metrics_sidebar_visible: false })).not.toContain('/metrics');
});
