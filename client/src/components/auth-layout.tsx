import type { ReactNode } from 'react';
import { AppLogo } from '@/components/app-logo';
import { useBranding } from '@/contexts/useBranding';

/** The frame of the pages outside the app: a centered column with the logo above a heading and the form, like Cloudflare's sign-in */
export function AuthLayout({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  const { appName } = useBranding();

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-kumo-canvas px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <AppLogo className="size-12" alt="" />
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold text-kumo-default">{title}</h1>
            {description ? <p className="text-balance text-kumo-subtle">{description}</p> : null}
          </div>
        </div>
        <div className="flex flex-col gap-5 rounded-xl bg-kumo-base p-6 shadow-xs ring-1 ring-kumo-line">{children}</div>
        <p className="text-center text-sm text-kumo-subtle">{appName}</p>
      </div>
    </main>
  );
}
