import { useState } from 'react';
import { CalendarBlankIcon, CaretDownIcon } from '@phosphor-icons/react';
import { Button, ButtonGroup, DatePicker, Input, Popover, type DateRange } from '@cloudflare/kumo';
import type { SearchDateRange } from '../../../../shared/search';
import { useDateTime } from '@/lib/dateTime';
import { useI18n } from '@/lib/i18n';

const PRESETS = ['1h', '24h', '7d', '30d'] as const;

function presetOf(range: SearchDateRange): string {
  const match = /^now-(\d+[mhdw])$/.exec(range.start);
  return match && !range.end ? match[1] : range.start || range.end ? 'custom' : 'all';
}

// The query keeps ISO timestamps or relative values, while the calendar picks days and the time inputs speak local wall time
function toDate(value: string): Date | undefined {
  const relative = /^now-(\d+)([mhdw])$/.exec(value);
  const units: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  const timestamp = relative ? Date.now() - Number(relative[1]) * units[relative[2]] : Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : undefined;
}

function toTime(date: Date | undefined, fallback: string): string {
  return date ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : fallback;
}

function atTime(day: Date, time: string, seconds = 0, milliseconds = 0): string {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours || 0, minutes || 0, seconds, milliseconds).toISOString();
}

interface Draft {
  range: DateRange | undefined;
  startTime: string;
  endTime: string;
  today: Date;
}

/** Cloudflare's time picker: joined relative presets that stay current, the active one in brand blue, and a custom absolute range */
export function TimeRange({ value, onChange, disabled }: { value: SearchDateRange; onChange: (range: SearchDateRange) => void; disabled?: boolean }) {
  const { t } = useI18n();
  const { formatDate } = useDateTime();
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({ range: undefined, startTime: '00:00', endTime: '23:59', today: new Date(0) });
  const preset = presetOf(value);
  const lastMonth = draft.range?.to ?? draft.range?.from ?? draft.today;

  const presetLabel = (key: string) => {
    const amount = Number.parseInt(key, 10);
    if (key.endsWith('h')) return amount === 1 ? t('components.quickFilters.lastHour') : t('components.quickFilters.lastHours', { count: amount });
    return t('components.quickFilters.lastDays', { count: amount });
  };

  return (
    <div className="flex items-center gap-2">
      <ButtonGroup aria-label={t('components.quickFilters.quickRanges')}>
        <Button variant={preset === 'all' ? 'primary' : 'secondary'} disabled={disabled} aria-pressed={preset === 'all'} onClick={() => onChange({ start: '', end: '' })}>
          {t('common.all')}
        </Button>
        {PRESETS.map((key) => (
          <Button
            key={key}
            variant={preset === key ? 'primary' : 'secondary'}
            disabled={disabled}
            aria-pressed={preset === key}
            aria-label={presetLabel(key)}
            className="numeric"
            onClick={() => onChange({ start: `now-${key}`, end: '' })}
          >
            {key}
          </Button>
        ))}
      </ButtonGroup>
      <Popover.Root
        open={customOpen}
        onOpenChange={(open) => {
          setCustomOpen(open);
          if (!open) return;
          const start = toDate(value.start);
          const end = toDate(value.end);
          setDraft({ range: start || end ? { from: start ?? end, to: end } : undefined, startTime: toTime(start, '00:00'), endTime: toTime(end, '23:59'), today: new Date() });
        }}
      >
        <Popover.Trigger
          render={(
            <Button variant={preset === 'custom' ? 'primary' : 'secondary'} disabled={disabled} icon={<CalendarBlankIcon />} aria-label={t('components.quickFilters.customRange')}>
              {preset === 'custom' ? (
                <span className="hidden max-w-56 truncate lg:inline">
                  {[value.start, value.end].map((part) => { const date = toDate(part); return date ? formatDate(date, { month: 'short', day: 'numeric' }) : '…'; }).join(' – ')}
                </span>
              ) : null}
              <CaretDownIcon className="size-3.5" />
            </Button>
          )}
        />
        <Popover.Portal>
          <Popover.Positioner align="end" sideOffset={8}>
            <Popover.Popup className="p-0">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const { range, startTime, endTime } = draft;
                  onChange(range?.from ? { start: atTime(range.from, startTime), end: atTime(range.to ?? range.from, endTime, 59, 999) } : { start: '', end: '' });
                  setCustomOpen(false);
                }}
              >
                <Popover.Title className="border-b border-kumo-hairline px-4 py-2.5 text-sm font-medium">{t('components.quickFilters.customRange')}</Popover.Title>
                <div className="flex flex-col gap-4 p-4">
                  {/* The two months end with the chosen range or the current month, since alerts only exist in the past */}
                  <DatePicker
                    mode="range"
                    numberOfMonths={2}
                    defaultMonth={new Date(lastMonth.getFullYear(), lastMonth.getMonth() - 1)}
                    disabled={{ after: draft.today }}
                    selected={draft.range}
                    onChange={(range: DateRange | undefined) => setDraft((current) => ({ ...current, range }))}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label={t('components.quickFilters.from')} type="time" value={draft.startTime} onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))} />
                    <Input label={t('components.quickFilters.to')} type="time" value={draft.endTime} onChange={(event) => setDraft((current) => ({ ...current, endTime: event.target.value }))} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 border-t border-kumo-hairline px-4 py-3">
                  <Button type="button" variant="ghost" onClick={() => { onChange({ start: '', end: '' }); setCustomOpen(false); }}>
                    {t('components.quickFilters.clearDateTime')}
                  </Button>
                  <Button type="submit" variant="primary" disabled={!draft.range?.from}>{t('components.filters.apply')}</Button>
                </div>
              </form>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
