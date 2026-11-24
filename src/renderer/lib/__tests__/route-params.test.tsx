import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { routePatterns } from '../paths';
import { idParam, photosetRouteParams, useRouteParams } from '../route-params';

describe('idParam', () => {
  it.each([
    ['7', 7],
    ['123', 123],
    ['007', 7],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ])('parses %s as %s', (raw, expected) => {
    expect(idParam.parse(raw)).toBe(expected);
  });

  it.each([
    undefined,
    '',
    '0',
    '-1',
    '1.5',
    '1e3',
    ' 7',
    'abc',
    'NaN',
    '7abc',
    '99999999999999999999',
  ])('rejects %s', (raw) => {
    expect(idParam.safeParse(raw).success).toBe(false);
  });
});

function Probe() {
  const params = useRouteParams(photosetRouteParams);
  return <div data-testid="params">{JSON.stringify(params)}</div>;
}

function renderAt(path: string) {
  render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path={routePatterns.photoset} element={<Probe />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
  return JSON.parse(screen.getByTestId('params').textContent ?? '') as unknown;
}

describe('useRouteParams', () => {
  afterEach(cleanup);

  it('returns the parsed params', () => {
    expect(renderAt('/photoset/42')).toEqual({ photosetId: 42 });
  });

  it('returns null when a param does not parse', () => {
    expect(renderAt('/photoset/abc')).toBeNull();
  });

  it('returns null when a param is missing', () => {
    expect(renderAt('/elsewhere')).toBeNull();
  });
});
