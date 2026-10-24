import type { ReactNode } from 'react';
import { XIcon } from '@phosphor-icons/react';
import { Button, Dialog } from '@cloudflare/kumo';
import { getSearchHelpDefinition, type SearchPage } from '../../../../shared/search';
import { SearchHighlight } from '@/components/filters/search-highlight';
import { useI18n } from '@/lib/i18n';
import { SEARCH_FEATURES } from '@/lib/searchState';

function renderInlineCode(text: string, page: SearchPage): ReactNode {
  return text.split(/(`[^`]+`)/g).filter(Boolean).map((segment, index) => (
    segment.startsWith('`') && segment.endsWith('`') ? (
      <code key={index} className="rounded-sm bg-kumo-recessed px-1 py-0.5 font-mono text-[0.95em]">
        <SearchHighlight query={segment.slice(1, -1)} page={page} inline />
        <span className="sr-only">{segment.slice(1, -1)}</span>
      </code>
    ) : (
      <span key={index}>{segment}</span>
    )
  ));
}

const ITEM_CLASS_NAME = 'flex w-full items-start gap-3 rounded-lg bg-kumo-base px-3 py-2.5 text-start ring-1 ring-kumo-hairline hover:bg-kumo-tint focus-visible:ring-2 focus-visible:ring-kumo-brand outline-none';

/** The query language reference, whose fields, operators and examples insert themselves into the search */
export function SearchSyntaxDialog({
  page,
  open,
  onOpenChange,
  onInsert,
  onApplyExample,
}: {
  page: SearchPage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (snippet: string) => void;
  onApplyExample: (query: string) => void;
}) {
  const { t } = useI18n();
  const help = getSearchHelpDefinition(page, SEARCH_FEATURES);
  const translate = (key: string | undefined, fallback: string) => (key ? t(key, { defaultValue: fallback }) : fallback);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="xl" className="flex max-h-[85vh] flex-col p-0">
        <div className="flex items-start justify-between gap-4 border-b border-kumo-hairline p-6">
          <div className="flex flex-col gap-1.5">
            <Dialog.Title className="text-lg font-semibold">{translate(help.titleKey, help.title)}</Dialog.Title>
            <Dialog.Description className="text-kumo-subtle">{renderInlineCode(translate(help.summaryKey, help.summary), page)}</Dialog.Description>
          </div>
          <Dialog.Close render={(props) => <Button {...props} variant="ghost" shape="square" icon={<XIcon />} aria-label={t('common.close')} />} />
        </div>
        <div className="flex flex-col gap-6 overflow-y-auto p-6">
          <ul className="flex flex-col gap-2 text-sm text-kumo-subtle">
            {help.tips.map((tip) => (
              <li key={tip.translationKey} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-kumo-brand" aria-hidden="true" />
                <span>{renderInlineCode(translate(tip.translationKey, tip.text), page)}</span>
              </li>
            ))}
          </ul>
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">{t('components.searchSyntax.operators')}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {help.operators.map((operator) => (
                <button key={operator.label} type="button" className={ITEM_CLASS_NAME} onClick={() => onInsert(operator.insertText)}>
                  <code className="min-w-10 rounded-md bg-kumo-recessed px-1.5 py-0.5 text-center font-mono text-xs font-medium">{operator.label}</code>
                  <span className="text-sm text-kumo-subtle">{renderInlineCode(translate(operator.descriptionKey, operator.description), page)}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">{t('components.searchSyntax.supportedFields')}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {help.fields.map((field) => (
                <button
                  key={field.name}
                  type="button"
                  className={ITEM_CLASS_NAME}
                  onClick={() => onInsert(field.name)}
                  aria-label={t('components.searchSyntax.insertField', { field: field.name })}
                >
                  <code className="min-w-10 rounded-md bg-kumo-recessed px-1.5 py-0.5 text-center font-mono text-xs font-medium text-kumo-info">{field.name}</code>
                  <span className="text-sm text-kumo-subtle">
                    {renderInlineCode(translate(field.descriptionKey, field.description), page)}
                    {field.aliases.length > 0 ? (
                      <span className="block text-xs">{t('components.searchSyntax.aliases')}: <span className="font-mono">{field.aliases.join(', ')}</span></span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">{t('components.searchSyntax.examples')}</h2>
            {help.examples.map((example) => (
              <button key={example.query} type="button" className={`${ITEM_CLASS_NAME} flex-col gap-1`} onClick={() => onApplyExample(example.query)}>
                <span className="sr-only">{example.query}</span>
                <SearchHighlight query={example.query} page={page} className="font-mono text-xs break-words whitespace-pre-wrap" />
                <span className="text-sm text-kumo-subtle">{renderInlineCode(translate(example.descriptionKey, example.description), page)}</span>
              </button>
            ))}
          </section>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
