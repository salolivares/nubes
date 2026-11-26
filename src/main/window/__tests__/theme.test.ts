import { describe, expect, it } from 'vitest';

import { parseThemeSource } from '../theme';

describe('parseThemeSource', () => {
  it.each(['system', 'light', 'dark'] as const)('reads %s', (source) => {
    expect(parseThemeSource(source)).toBe(source);
  });

  it.each([null, '', 'Dark', 'sepia'])('falls back to system for %j', (raw) => {
    expect(parseThemeSource(raw)).toBe('system');
  });
});
