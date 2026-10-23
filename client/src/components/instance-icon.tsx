// Kumo's badge color pairs, without red so an instance never reads as an error
const INSTANCE_COLOR_CLASSES = [
  'bg-kumo-badge-blue text-white',
  'bg-kumo-badge-green text-white',
  'bg-kumo-badge-purple text-white',
  'bg-kumo-badge-orange text-black',
  'bg-kumo-badge-teal text-white',
  'bg-kumo-badge-neutral text-white',
] as const;

/** A tile with the instance's initial, like Cloudflare's account avatars */
export function InstanceIcon({ name, colorIndex }: { name: string; colorIndex: number }) {
  const color = INSTANCE_COLOR_CLASSES[colorIndex % INSTANCE_COLOR_CLASSES.length];
  return (
    <span className={`inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] text-[11px] leading-none font-semibold ${color}`} aria-hidden="true">
      {Array.from(name.trim())[0]?.toLocaleUpperCase()}
    </span>
  );
}
