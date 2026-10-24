import { useEffect } from 'react';
import { useI18n, type SupportedLanguage } from './i18n';

// Tailwind's default sans stack. It stays behind the language's font so missing glyphs still render.
const SYSTEM_FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'";

export interface FontPreset {
  family: string;
  load: () => Promise<unknown>;
}

const INTER: FontPreset = { family: 'Inter Variable', load: () => import('@fontsource-variable/inter') };

// Inter has no glyphs for these scripts, so their languages get a face that covers them
export const LANGUAGE_FONTS: Record<SupportedLanguage, FontPreset> = {
  ar: {
    family: 'IBM Plex Sans Arabic',
    load: () => Promise.all([
      import('@fontsource/ibm-plex-sans-arabic/400.css'),
      import('@fontsource/ibm-plex-sans-arabic/500.css'),
      import('@fontsource/ibm-plex-sans-arabic/600.css'),
      import('@fontsource/ibm-plex-sans-arabic/700.css'),
    ]),
  },
  de: INTER,
  en: INTER,
  es: INTER,
  fr: INTER,
  hi: {
    family: 'IBM Plex Sans Devanagari',
    load: () => Promise.all([
      import('@fontsource/ibm-plex-sans-devanagari/400.css'),
      import('@fontsource/ibm-plex-sans-devanagari/500.css'),
      import('@fontsource/ibm-plex-sans-devanagari/600.css'),
      import('@fontsource/ibm-plex-sans-devanagari/700.css'),
    ]),
  },
  ja: {
    family: 'IBM Plex Sans JP',
    load: () => Promise.all([
      import('@fontsource/ibm-plex-sans-jp/400.css'),
      import('@fontsource/ibm-plex-sans-jp/500.css'),
      import('@fontsource/ibm-plex-sans-jp/600.css'),
      import('@fontsource/ibm-plex-sans-jp/700.css'),
    ]),
  },
  ko: {
    family: 'IBM Plex Sans KR',
    load: () => Promise.all([
      import('@fontsource/ibm-plex-sans-kr/400.css'),
      import('@fontsource/ibm-plex-sans-kr/500.css'),
      import('@fontsource/ibm-plex-sans-kr/600.css'),
      import('@fontsource/ibm-plex-sans-kr/700.css'),
    ]),
  },
  pt: INTER,
  ru: INTER,
  zh: { family: 'Noto Sans SC Variable', load: () => import('@fontsource-variable/noto-sans-sc') },
};

const loadPromises = new Map<string, Promise<void>>();

export function getFontStack(preset: FontPreset): string {
  return `'${preset.family}', ${SYSTEM_FONT_STACK}`;
}

export function loadFontPreset(preset: FontPreset): Promise<void> {
  const existing = loadPromises.get(preset.family);
  if (existing) return existing;

  const promise = preset.load().then(() => undefined);
  promise.catch(() => loadPromises.delete(preset.family));
  loadPromises.set(preset.family, promise);
  return promise;
}

/** Sets the page font to the one of the interface language and loads it */
export function useLanguageFont(): void {
  const { language } = useI18n();
  const preset = LANGUAGE_FONTS[language];

  useEffect(() => {
    document.documentElement.style.setProperty('--font-sans', getFontStack(preset));
    loadFontPreset(preset).catch((error) => {
      console.error(`Failed to load ${preset.family}`, error);
    });
  }, [preset]);
}
