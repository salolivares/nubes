interface StorageContext {
  secureRead: (key: bool) => Promise<string>;
  secureWrite: (key: string, value: string) => Promise<void>;
  read: (key: string) => Promise<string>;
  write: (key: string, value: string) => Promise<void>;
  onStorageChange: (listener: (event: IpcRendererEvent, ...args: any[]) => void) => () => void;
}

interface ThemeModeContext {
  toggle: () => Promise<boolean>;
  dark: () => Promise<void>;
  light: () => Promise<void>;
  system: () => Promise<boolean>;
  current: () => Promise<'dark' | 'light' | 'system'>;
}

declare interface Window {
  storage: StorageContext;
  themeMode: ThemeContext;
}
