import { useEffect, useMemo, useRef, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import { cn } from '@cloudflare/kumo';
import { analyzeSearchQuery, type SearchPage, type SearchParseError } from '../../../../shared/search';
import { SearchHighlight } from '@/components/filters/search-highlight';
import { SEARCH_FEATURES } from '@/lib/searchState';

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & {
  value: string;
  page: SearchPage;
  error?: SearchParseError | null;
  ref?: Ref<HTMLInputElement>;
  /** Controls at the end of the field, like the query help in Cloudflare's log search */
  addon?: ReactNode;
};

/** A Kumo-styled text input whose query is colored by a layer underneath, which follows the input's horizontal scroll */
export function SearchInput({ value, page, error, className, onScroll, onSelect, onKeyUp, ref, addon, ...props }: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const analysisError = useMemo(() => analyzeSearchQuery(value, page, SEARCH_FEATURES).error, [page, value]);
  const invalid = Boolean(error ?? analysisError);

  const syncScroll = () => {
    if (highlightRef.current && inputRef.current) highlightRef.current.style.transform = `translateX(-${inputRef.current.scrollLeft}px)`;
  };

  useEffect(syncScroll, [value]);

  return (
    <div
      className={cn(
        'relative flex h-9 min-w-0 flex-1 items-center rounded-lg bg-kumo-control ring ring-kumo-line focus-within:ring-[1.5px] focus-within:ring-kumo-focus/50',
        invalid && 'ring-kumo-danger focus-within:ring-kumo-danger',
        className,
      )}
    >
      <MagnifyingGlassIcon className="pointer-events-none absolute start-3 z-20 size-4 text-kumo-subtle" />
      <div className="relative h-full min-w-0 flex-1">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 flex items-center overflow-hidden ps-9 pe-3 font-mono text-sm">
            <SearchHighlight ref={highlightRef} query={value} page={page} error={error} highlightErrors className="min-w-full shrink-0 whitespace-pre" />
          </div>
        </div>
        <input
          {...props}
          ref={(node) => {
            inputRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          }}
          type="text"
          value={value}
          aria-invalid={invalid || undefined}
          onScroll={(event) => { syncScroll(); onScroll?.(event); }}
          onSelect={(event) => { syncScroll(); onSelect?.(event); }}
          onKeyUp={(event) => { syncScroll(); onKeyUp?.(event); }}
          // The text itself is transparent so the colored layer shows through, while the caret, selection and placeholder stay visible
          className="relative z-10 block h-full w-full bg-transparent ps-9 pe-3 font-mono text-sm text-transparent caret-(--text-color-kumo-default) outline-none [-webkit-text-fill-color:transparent] placeholder:font-sans placeholder:[-webkit-text-fill-color:var(--text-color-kumo-placeholder)]"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      {addon ? <div className="z-20 flex shrink-0 items-center pe-1">{addon}</div> : null}
    </div>
  );
}
