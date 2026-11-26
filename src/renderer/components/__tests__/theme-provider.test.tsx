import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider, useTheme } from '../theme-provider';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubThemeMode(current: () => Promise<'dark' | 'light' | 'system'>) {
  const themeMode = {
    current: vi.fn(current),
    toggle: vi.fn(async () => false),
    dark: vi.fn(async () => {}),
    light: vi.fn(async () => {}),
    system: vi.fn(async () => false),
  };
  vi.stubGlobal('themeMode', themeMode);
  return themeMode;
}

function renderProvider() {
  const state: { setTheme?: (theme: 'dark' | 'light' | 'system') => void } = {};
  function Probe() {
    state.setTheme = useTheme().setTheme;
    return null;
  }
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  return state;
}

describe('ThemeProvider', () => {
  it('applies the saved theme without first resetting it to system', async () => {
    const themeMode = stubThemeMode(async () => 'dark');
    renderProvider();

    await vi.waitFor(() => expect(themeMode.dark).toHaveBeenCalled());
    expect(themeMode.system).not.toHaveBeenCalled();
  });

  it('keeps a choice made before the saved theme arrives', async () => {
    let reply: (theme: 'dark') => void = () => {};
    const themeMode = stubThemeMode(() => new Promise((resolve) => (reply = resolve)));
    const state = renderProvider();

    act(() => state.setTheme!('light'));
    await act(async () => reply('dark'));

    expect(themeMode.light).toHaveBeenCalledOnce();
    expect(themeMode.dark).not.toHaveBeenCalled();
  });
});
