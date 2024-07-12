import { createContext, useContext, useEffect, useState } from 'react';
import { theme as themeIPC } from '#preload';

type Theme = 'dark' | 'light' | 'system';

const THEME_KEY = 'ui-theme';
const DEFAULT_THEME = 'system';

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

export interface ThemePreferences {
  system: Theme;
  local: Theme | null;
}

async function getCurrentTheme() {
  const currentTheme = await themeIPC.current();
  const localTheme = localStorage.getItem(THEME_KEY) as Theme | null;

  return {
    system: currentTheme,
    local: localTheme,
  };
}

function updateDocumentTheme(isDarkMode: boolean) {
  if (!isDarkMode) {
    document.documentElement.classList.remove('dark');
  } else {
    document.documentElement.classList.add('dark');
  }
}

async function setElectronTheme(newTheme: Theme) {
  switch (newTheme) {
    case 'dark':
      await themeIPC.dark();
      updateDocumentTheme(true);
      break;
    case 'light':
      await themeIPC.light();
      updateDocumentTheme(false);
      break;
    case 'system':
      updateDocumentTheme(await themeIPC.system());
      break;
  }

  localStorage.setItem(THEME_KEY, newTheme);
}

async function syncThemeWithLocal(defaultTheme: Theme) {
  const { local } = await getCurrentTheme();
  if (!local) {
    setElectronTheme(defaultTheme);
    return;
  }

  await setElectronTheme(local);
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = DEFAULT_THEME,
  storageKey = THEME_KEY,
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
  );

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    syncThemeWithLocal(defaultTheme);
  }, [theme, defaultTheme]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};
