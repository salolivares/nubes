import { z } from 'zod';

export const themeSourceSchema = z.enum(['system', 'light', 'dark']);
export type ThemeSource = z.infer<typeof themeSourceSchema>;

/** Parse the saved theme. Anything else, including nothing saved, means follow the OS. */
export function parseThemeSource(raw: string | null): ThemeSource {
  const result = themeSourceSchema.safeParse(raw);
  return result.success ? result.data : 'system';
}

/**
 * The window color shown before the page paints, and behind it while resizing. Matches
 * `--background` in src/renderer/index.css: oklch(1 0 0) light, oklch(0.145 0 0) dark.
 */
export function windowBackgroundColor(dark: boolean): string {
  return dark ? '#0a0a0a' : '#ffffff';
}
