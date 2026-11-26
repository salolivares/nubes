import { describe, expect, it } from 'vitest';

import { contentSecurityPolicy } from '../csp';

function directives(policy: string): Record<string, string> {
  return Object.fromEntries(
    policy.split('; ').map((d) => {
      const [name, ...values] = d.split(' ');
      return [name, values.join(' ')];
    }),
  );
}

describe('contentSecurityPolicy', () => {
  it('production allows no inline scripts, eval or websockets', () => {
    const csp = directives(contentSecurityPolicy(false));
    expect(csp['script-src']).toBe("'self'");
    expect(csp['connect-src']).toBe("'self'");
    expect(csp['img-src']).toBe("'self' data: blob: nubes-media:");
    for (const name of [
      'object-src',
      'base-uri',
      'frame-src',
      'worker-src',
      'media-src',
      'frame-ancestors',
    ]) {
      expect(csp[name]).toBe("'none'");
    }
    expect(contentSecurityPolicy(false)).not.toContain('unsafe-eval');
  });

  it('dev only adds inline scripts and the HMR websocket', () => {
    const csp = directives(contentSecurityPolicy(true));
    expect(csp['script-src']).toBe("'self' 'unsafe-inline'");
    expect(csp['connect-src']).toBe("'self' ws://localhost:* ws://127.0.0.1:*");
    expect(contentSecurityPolicy(true)).not.toContain('unsafe-eval');
  });
});
