import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';

export type ThemeMode = 'light' | 'system' | 'dark';

const STORAGE_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function readStoredMode(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
}

// Kumo reads data-mode, while the server's branding stylesheet targets the dark class
function applyDark(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.dataset.mode = dark ? 'dark' : 'light';
}

export function useTheme(): [ThemeMode, (mode: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(readStoredMode);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
    if (mode !== 'system') {
      applyDark(mode === 'dark');
      return;
    }
    const query = window.matchMedia(DARK_QUERY);
    const sync = (event: { matches: boolean }) => applyDark(event.matches);
    sync(query);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [mode]);

  return [mode, setMode];
}

export const ThemeContext = createContext<[ThemeMode, (mode: ThemeMode) => void]>(['system', () => undefined]);

export function useThemeMode() {
  return useContext(ThemeContext);
}

function subscribeToMode(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });
  return () => observer.disconnect();
}

/** Whether the page currently renders dark, also when the mode follows the system, for components such as Kumo's charts that take a dark flag */
export function useIsDarkMode(): boolean {
  return useSyncExternalStore(subscribeToMode, () => document.documentElement.dataset.mode === 'dark');
}
