import { cn } from '@cloudflare/kumo';

export function CountryFlag({ code, className }: { code?: string | null; className?: string }) {
  const normalized = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(normalized)) return null;

  return (
    <span
      role="img"
      aria-label={normalized}
      title={normalized}
      className={cn(`fi fi-${normalized.toLowerCase()} shrink-0 overflow-hidden rounded-[2px]`, className)}
    />
  );
}
