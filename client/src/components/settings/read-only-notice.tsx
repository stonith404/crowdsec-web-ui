import { LockIcon } from '@phosphor-icons/react';
import { Banner } from '@cloudflare/kumo';

/** Explains why a settings tab that someone may read has nothing to change */
export function ReadOnlyNotice({ children }: { children: string }) {
  return <Banner variant="secondary" icon={<LockIcon weight="fill" />} description={children} />;
}
