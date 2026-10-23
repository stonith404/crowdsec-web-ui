import { useState, type CSSProperties } from 'react';
import { ArrowCounterClockwiseIcon, GavelIcon, ShieldWarningIcon, WarningIcon } from '@phosphor-icons/react';
import { Badge, Banner, Button, Field, Input, LayerCard, Link, Select } from '@cloudflare/kumo';
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_BRANDING_THEME,
  DEFAULT_NEUTRAL_TONE,
  MIN_ACCENT_CONTRAST,
  NEUTRAL_TONES,
  THEME_MODES,
  THEME_SHADES,
  getAccentContrast,
  getResolvedThemeModeVariables,
  isDefaultBrandingTheme,
  normalizeHexColor,
  resolveThemeMode,
  type BrandingTheme,
  type NeutralTone,
  type ThemeModeColors,
  type ThemeModeName,
} from '../../../../shared/branding-theme';
import { FormCard } from '@/components/settings/settings-card';
import { useSubmit } from '@/components/settings/use-submit';
import { useBranding } from '@/contexts/useBranding';
import { updateAppTheme } from '@/lib/branding';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/lib/toast';

// A select option needs a value, so this stands for a neutral tone that is not set
const INHERITED_NEUTRAL = 'inherit';

const sameTheme = (left: BrandingTheme, right: BrandingTheme) =>
  THEME_MODES.every((mode) => left[mode].accent === right[mode].accent && left[mode].neutral === right[mode].neutral);

/** The accent color and neutral tone of each theme, previewed live before they are saved */
export function ColorsCard({ readOnly }: { readOnly: boolean }) {
  const { t } = useI18n();
  const { theme: savedTheme, setBranding } = useBranding();
  const [theme, setTheme] = useState(savedTheme);
  // What is typed into a hex field, which only reaches the theme once it is a valid color
  const [hexDrafts, setHexDrafts] = useState<Partial<Record<ThemeModeName, string>>>({});
  const { saving, error, run } = useSubmit();

  const updateMode = (mode: ThemeModeName, colors: Partial<ThemeModeColors>) => {
    setTheme((current) => ({ ...current, [mode]: { ...current[mode], ...colors } }));
  };

  const setHexDraft = (mode: ThemeModeName, value: string | undefined) => setHexDrafts((drafts) => ({ ...drafts, [mode]: value }));

  const changeHex = (mode: ThemeModeName, value: string) => {
    setHexDraft(mode, value);
    const accent = value.trim() ? normalizeHexColor(value) : null;
    if (accent || !value.trim()) updateMode(mode, { accent });
  };

  const save = () => run(async () => {
    const branding = await updateAppTheme(theme);
    setBranding(branding);
    setTheme(branding.theme);
    setHexDrafts({});
    toast.success(t('pages.settings.colorsSaved'));
  }, t('pages.settings.failedToSaveColors'));

  return (
    <FormCard
      title={t('pages.settings.colors')}
      description={t('pages.settings.colorsDescription')}
      readOnly={readOnly}
      dirty={!sameTheme(theme, savedTheme)}
      saving={saving}
      error={error}
      submitLabel={t('pages.settings.saveColors')}
      footer={(
        <Button
          icon={ArrowCounterClockwiseIcon}
          disabled={isDefaultBrandingTheme(theme)}
          onClick={() => {
            setTheme(DEFAULT_BRANDING_THEME);
            setHexDrafts({});
          }}
        >
          {t('pages.settings.restoreDefaultColors')}
        </Button>
      )}
      onSubmit={() => void save()}
    >
      <div className="grid gap-x-6 gap-y-8 md:grid-cols-2">
        {THEME_MODES.map((mode) => {
          const colors = theme[mode];
          // Dark mode falls back to the light mode's colors, light mode to the built-in palette
          const inheritsLight = mode === 'dark';
          const modeLabel = t(mode === 'light' ? 'pages.settings.lightMode' : 'pages.settings.darkMode');
          const contrast = getAccentContrast(theme, mode);
          const minContrast = contrast ? Math.min(contrast.buttonText, contrast.accentText) : null;
          const resetAccentLabel = t(inheritsLight ? 'pages.settings.useLightModeAccent' : 'pages.settings.useDefaultAccent');

          return (
            <fieldset key={mode} className="flex min-w-0 flex-col gap-5">
              <legend className="mb-5 font-semibold text-kumo-default">{modeLabel}</legend>
              <Field label={t('pages.settings.accentColor')} description={t(inheritsLight ? 'pages.settings.darkAccentHelp' : 'pages.settings.accentHelp')}>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={colors.accent ?? resolveThemeMode(theme, mode).accent ?? DEFAULT_ACCENT_COLOR}
                    aria-label={t('pages.settings.accentColorPicker', { mode: modeLabel })}
                    className="h-9 w-11 shrink-0 cursor-pointer rounded-lg bg-kumo-control p-1 ring ring-kumo-line disabled:cursor-not-allowed disabled:opacity-50"
                    onChange={(event) => {
                      setHexDraft(mode, undefined);
                      updateMode(mode, { accent: event.target.value.toLowerCase() });
                    }}
                  />
                  <Input
                    aria-label={t('pages.settings.accentColor')}
                    className="min-w-0 flex-1 font-mono"
                    maxLength={7}
                    spellCheck={false}
                    value={hexDrafts[mode] ?? colors.accent ?? ''}
                    placeholder={inheritsLight && theme.light.accent
                      ? t('pages.settings.sameAsLightMode')
                      : t('pages.settings.defaultColor', { color: DEFAULT_ACCENT_COLOR })}
                    onChange={(event) => changeHex(mode, event.target.value)}
                    onBlur={() => setHexDraft(mode, undefined)}
                  />
                  {colors.accent ? (
                    <Button
                      shape="square"
                      icon={ArrowCounterClockwiseIcon}
                      aria-label={resetAccentLabel}
                      title={resetAccentLabel}
                      onClick={() => {
                        setHexDraft(mode, undefined);
                        updateMode(mode, { accent: null });
                      }}
                    />
                  ) : null}
                </div>
              </Field>
              <Select
                label={t('pages.settings.neutralTone')}
                className="w-full"
                value={colors.neutral ?? INHERITED_NEUTRAL}
                onValueChange={(value) => updateMode(mode, { neutral: value === INHERITED_NEUTRAL ? null : value as NeutralTone })}
                items={[
                  {
                    value: INHERITED_NEUTRAL,
                    label: inheritsLight
                      ? t('pages.settings.sameAsLightMode')
                      : t('pages.settings.defaultNeutralTone', { tone: t(`pages.settings.neutralTones.${DEFAULT_NEUTRAL_TONE}`) }),
                  },
                  ...NEUTRAL_TONES.map((tone) => ({ value: tone, label: t(`pages.settings.neutralTones.${tone}`) })),
                ]}
              />
              <ThemePreview theme={theme} mode={mode} />
              {minContrast !== null && minContrast < MIN_ACCENT_CONTRAST ? (
                <Banner
                  variant="alert"
                  icon={<WarningIcon weight="fill" />}
                  description={t('pages.settings.lowAccentContrast', { ratio: minContrast.toFixed(1) })}
                />
              ) : null}
            </fieldset>
          );
        })}
      </div>
    </FormCard>
  );
}

let lightTokens: Record<string, string> | undefined;

/**
 * The light token declarations of Kumo and index.css, read from the loaded stylesheets.
 * Kumo's `[data-mode="dark"] [data-theme="kumo"]` rule outranks its light rule inside a dark page, so the light preview sets them inline.
 */
function getLightTokens(): Record<string, string> {
  if (lightTokens) return lightTokens;
  const tokens: Record<string, string> = {};
  const collect = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSGroupingRule || rule instanceof CSSLayerBlockRule) collect(rule.cssRules);
      if (rule instanceof CSSStyleRule && rule.selectorText === ':root, [data-theme="kumo"]') {
        for (const name of rule.style) tokens[name] = rule.style.getPropertyValue(name);
      }
    }
  };
  for (const sheet of document.styleSheets) collect(sheet.cssRules);
  lightTokens = tokens;
  return tokens;
}

/**
 * Renders a few Kumo components with the theme's scales set on a wrapper of the mode's data-mode.
 * index.css maps Kumo's tokens onto these scales again on [data-theme="kumo"], so they derive from the previewed scales.
 */
function ThemePreview({ theme, mode }: { theme: BrandingTheme; mode: ThemeModeName }) {
  const { t } = useI18n();

  return (
    <div
      inert
      data-theme="kumo"
      data-mode={mode}
      style={{ ...(mode === 'light' ? getLightTokens() : {}), ...getResolvedThemeModeVariables(theme, mode) } as CSSProperties}
      className="flex flex-col gap-3 rounded-lg bg-kumo-canvas p-3 text-kumo-default ring ring-kumo-hairline"
    >
      <div className="flex gap-3">
        <div className="flex w-36 shrink-0 flex-col gap-0.5 rounded-lg bg-kumo-base p-1.5 text-sm font-medium ring ring-kumo-hairline max-sm:hidden">
          <span className="flex min-h-8 items-center gap-2.5 rounded-lg bg-kumo-tint px-3">
            <ShieldWarningIcon className="size-4" />
            {t('components.sidebar.nav.alerts')}
          </span>
          <span className="flex min-h-8 items-center gap-2.5 rounded-lg px-3">
            <GavelIcon className="size-4" />
            {t('components.sidebar.nav.decisions')}
          </span>
        </div>
        <LayerCard className="min-w-0 flex-1">
          <LayerCard.Secondary className="flex-wrap justify-between py-3">
            <span className="text-kumo-default">{t('pages.settings.themePreviewTitle')}</span>
            <Badge variant="info">{t('pages.settings.themePreviewBadge')}</Badge>
          </LayerCard.Secondary>
          <LayerCard.Primary className="gap-3">
            <p className="text-sm text-kumo-subtle">{t('pages.settings.themePreviewText')}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" size="sm">{t('pages.settings.themePreviewButton')}</Button>
              <Link href="#">{t('pages.settings.themePreviewLink')}</Link>
            </div>
          </LayerCard.Primary>
        </LayerCard>
      </div>
      <div className="flex overflow-hidden rounded-md" aria-hidden="true">
        {THEME_SHADES.map((shade) => <span key={shade} className="h-3 flex-1" style={{ backgroundColor: `var(--color-primary-${shade})` }} />)}
      </div>
    </div>
  );
}
