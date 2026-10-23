import { forwardRef } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import type { LinkComponentProps } from '@cloudflare/kumo';

/** Kumo renders links through this, so its sidebar, breadcrumbs and links navigate with the router */
export const AppLink = forwardRef<HTMLAnchorElement, LinkComponentProps>(({ href, to, ...props }, ref) => {
  const target = href ?? to ?? '';
  // External links and in-page anchors stay plain anchors
  if (/^(https?:|mailto:|#)/.test(target)) return <a ref={ref} href={target} {...props} />;
  return <RouterLink ref={ref} to={target} {...props} />;
});
AppLink.displayName = 'AppLink';
