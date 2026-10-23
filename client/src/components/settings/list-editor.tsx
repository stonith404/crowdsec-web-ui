import { useState, type KeyboardEvent } from 'react';
import { XIcon } from '@phosphor-icons/react';
import { Button, cn, inputVariants } from '@cloudflare/kumo';

/**
 * A list of short values, such as scopes or group names, as chips in a field that adds what is typed on Enter or when it loses focus.
 * It looks like Kumo's TagInput, which can't keep a chip from being removed.
 */
export function ListEditor({
  id,
  label,
  description,
  items,
  onChange,
  placeholder,
  removeLabel,
  canRemove = () => true,
  splitOnSpaces = false,
  validate,
}: {
  id: string;
  label: string;
  description?: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  removeLabel: (item: string) => string;
  canRemove?: (item: string) => boolean;
  /** Adds every word of the draft, for space-separated values such as OIDC scopes */
  splitOnSpaces?: boolean;
  /** Returns why an item can't be added, or null */
  validate?: (item: string) => string | null;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const values = splitOnSpaces ? draft.trim().split(/\s+/).filter(Boolean) : [draft.trim()].filter(Boolean);
    const invalid = values.map((value) => validate?.(value)).find(Boolean);
    if (invalid) {
      setError(invalid);
      return;
    }
    const added = values.filter((value, index) => !items.includes(value) && values.indexOf(value) === index);
    if (added.length > 0) onChange([...items, ...added]);
    setDraft('');
  };

  // Enter adds the draft instead of submitting the card's form
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    add();
  };

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-base font-medium text-kumo-default">{label}</label>
      <div className={cn(inputVariants({ variant: error ? 'error' : 'default', parentFocusIndicator: true }), 'flex h-auto min-h-9 flex-wrap items-center gap-x-2 gap-y-1.5 px-2 py-1.5')}>
        {items.map((item) => {
          const removable = canRemove(item);
          return (
            <span key={item} className={cn('flex h-6 max-w-full items-center gap-1 rounded-sm bg-kumo-overlay ps-2 font-mono text-sm text-kumo-default ring ring-kumo-hairline', removable ? 'pe-0.5' : 'pe-2')}>
              <span className="truncate">{item}</span>
              {removable ? (
                <Button
                  variant="ghost"
                  size="xs"
                  shape="square"
                  icon={<XIcon size={10} />}
                  aria-label={removeLabel(item)}
                  onClick={() => onChange(items.filter((candidate) => candidate !== item))}
                />
              ) : null}
            </span>
          );
        })}
        <input
          id={id}
          value={draft}
          placeholder={items.length === 0 ? placeholder : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          className="min-w-32 flex-1 bg-transparent px-1 py-0.5 outline-none disabled:cursor-not-allowed"
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={add}
        />
      </div>
      {error ? (
        <p className="text-sm leading-snug text-kumo-danger">{error}</p>
      ) : description ? (
        <p className="text-sm leading-snug text-kumo-subtle">{description}</p>
      ) : null}
    </div>
  );
}
