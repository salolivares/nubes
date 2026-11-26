import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';

type ThemeProviderProps = {
  children: React.ReactNode;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

export function updateDocumentTheme(isDarkMode: boolean) {
  if (!isDarkMode) {
    window.document.documentElement.classList.remove('dark');
  } else {
    window.document.documentElement.classList.add('dark');
  }
}

async function setElectronTheme(newTheme: Theme) {
  switch (newTheme) {
    case 'dark':
      await window.themeMode.dark();
      updateDocumentTheme(true);
      break;
    case 'light':
      await window.themeMode.light();
      updateDocumentTheme(false);
      break;
    case 'system':
      updateDocumentTheme(await window.themeMode.system());
      break;
  }
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({ children }: ThemeProviderProps) {
  // Null until main says which theme is saved. Applying the 'system' default before that would
  // overwrite the saved theme.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    window.themeMode.current().then((stored: Theme) => {
      // A choice the user made while this was in flight wins over the saved one.
      setTheme((current) => current ?? (stored || 'system'));
    });
  }, []);

  useEffect(() => {
    if (theme) setElectronTheme(theme);
  }, [theme]);

  const value = {
    theme: theme ?? 'system',
    setTheme,
  };

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>;
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};
