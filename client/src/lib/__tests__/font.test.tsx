import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { LANGUAGE_FONTS, getFontStack, loadFontPreset, useLanguageFont, type FontPreset } from '../font';
import { I18nContext, type SupportedLanguage } from '../i18n';

function rootFont() {
  return document.documentElement.style.getPropertyValue('--font-sans');
}

describe('font', () => {
  test('keeps the system stack behind the language font', () => {
    expect(getFontStack(LANGUAGE_FONTS.en).startsWith("'Inter Variable', ")).toBe(true);
    expect(getFontStack(LANGUAGE_FONTS.en)).toContain('sans-serif');
  });

  test('reuses a pending load and retries after a failure', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('chunk missing'))
      .mockResolvedValue([]);
    const preset: FontPreset = { family: 'Retry', load };

    await expect(loadFontPreset(preset)).rejects.toThrow('chunk missing');
    const first = loadFontPreset(preset);
    expect(loadFontPreset(preset)).toBe(first);
    await first;
    expect(load).toHaveBeenCalledTimes(2);
  });

  test('follows the interface language', () => {
    let language: SupportedLanguage = 'ko';
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nContext.Provider value={{ language, preference: language, browserLanguage: language, setLanguagePreference: () => undefined, t: (key) => key }}>
        {children}
      </I18nContext.Provider>
    );

    const { rerender } = renderHook(useLanguageFont, { wrapper });
    expect(rootFont().startsWith("'IBM Plex Sans KR', ")).toBe(true);

    language = 'ru';
    rerender();
    expect(rootFont().startsWith("'Inter Variable', ")).toBe(true);
  });
});
