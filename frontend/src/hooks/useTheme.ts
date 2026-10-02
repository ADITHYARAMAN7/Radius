import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'nearby-objects:theme';

function readStoredTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    // Private browsing and blocked site data both throw here.
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Theme preference, remembered per browser. A stored choice wins over the OS setting;
 * with nothing stored the OS decides, and the page follows along if it changes.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme() ?? systemTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    // Only track the OS while the user has not expressed a preference.
    if (readStoredTheme()) return;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (eventInit: MediaQueryListEvent) => setTheme(eventInit.matches ? 'dark' : 'light');

    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Not being able to remember the choice is not worth failing the toggle.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
