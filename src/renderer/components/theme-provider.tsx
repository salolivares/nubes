import { createContext, useContext, useEffect, useState } from 'react';

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

function updateDocumentTheme(isDarkMode: boolean) {
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

  localStorage.setItem(THEME_KEY, newTheme);
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
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );

  useEffect(() => {
    setElectronTheme(theme);
  }, [theme]);

  const value = {
    theme,
    setTheme,
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
