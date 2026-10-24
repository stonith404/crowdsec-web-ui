import type { ReactNode } from 'react';

/** The page title block of the Cloudflare dashboard: a large title, a sentence under it, a muted line of facts and actions at the end */
export function PageHeader({
  title,
  description,
  meta,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="text-3xl font-semibold break-words text-kumo-default">{title}</h1>
        {description ? <p className="max-w-prose text-base text-kumo-subtle">{description}</p> : null}
        {meta ? <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-kumo-subtle">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
