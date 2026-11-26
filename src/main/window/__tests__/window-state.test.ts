import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Rect, TrackedWindow, WindowState } from '../window-state';
import {
  DEFAULT_WINDOW_SIZE,
  initialWindowBounds,
  parseWindowState,
  SAVE_DELAY_MS,
  trackWindowState,
} from '../window-state';

const laptop: Rect = { x: 0, y: 25, width: 1512, height: 920 };
// An external monitor to the right of the laptop.
const monitor: Rect = { x: 1512, y: -300, width: 2560, height: 1415 };

const state = (overrides: Partial<WindowState> = {}): WindowState => ({
  x: 100,
  y: 100,
  width: 1000,
  height: 700,
  isMaximized: false,
  ...overrides,
});

describe('parseWindowState', () => {
  it('reads a saved state', () => {
    expect(parseWindowState(JSON.stringify(state()))).toEqual(state());
  });

  it.each([
    ['nothing saved', null],
    ['an empty string', ''],
    ['bad JSON', '{"x":'],
    ['a missing field', JSON.stringify({ x: 1, y: 2, width: 3, height: 4 })],
    ['a zero width', JSON.stringify(state({ width: 0 }))],
    ['a fractional coordinate', JSON.stringify(state({ x: 1.5 }))],
    ['a string number', JSON.stringify({ ...state(), height: '700' })],
  ])('rejects %s', (_label, raw) => {
    expect(parseWindowState(raw)).toBeNull();
  });
});

describe('initialWindowBounds', () => {
  it('uses the defaults when nothing is saved', () => {
    expect(initialWindowBounds(null, [laptop])).toEqual({
      ...DEFAULT_WINDOW_SIZE,
      isMaximized: false,
    });
  });

  it('restores bounds that are on a connected display', () => {
    expect(initialWindowBounds(state(), [laptop])).toEqual(state());
  });

  it('restores bounds on a second display', () => {
    const saved = state({ x: 2000, y: 0, width: 1600, height: 1000 });
    expect(initialWindowBounds(saved, [laptop, monitor])).toEqual(saved);
  });

  it('falls back to the defaults when the display it was on is removed', () => {
    const saved = state({ x: 2000, y: 0, width: 1600, height: 1000 });
    expect(initialWindowBounds(saved, [laptop])).toEqual({
      ...DEFAULT_WINDOW_SIZE,
      isMaximized: false,
    });
  });

  it('falls back to the defaults when the window is off screen', () => {
    expect(initialWindowBounds(state({ x: -5000, y: -5000 }), [laptop])).toEqual({
      ...DEFAULT_WINDOW_SIZE,
      isMaximized: false,
    });
  });

  it('falls back to the defaults when only a sliver is still on screen', () => {
    // 40px of the window pokes in from the left edge: too little to grab.
    const saved = state({ x: -960, y: 100, width: 1000, height: 700 });
    expect(initialWindowBounds(saved, [laptop]).x).toBeUndefined();
  });

  it('keeps a window that is partly on screen', () => {
    const saved = state({ x: -500, y: 100, width: 1000, height: 700 });
    expect(initialWindowBounds(saved, [laptop])).toEqual(saved);
  });

  it('shrinks a window bigger than the display it lands on', () => {
    const saved = state({ x: 0, y: 25, width: 2400, height: 1400 });
    expect(initialWindowBounds(saved, [laptop])).toEqual({
      ...saved,
      width: laptop.width,
      height: laptop.height,
    });
  });

  it('keeps a shrunk window on the display it overlapped', () => {
    // Saved across a left-hand monitor that is gone now: 500px of it was on the laptop.
    const small: Rect = { x: 0, y: 25, width: 1200, height: 800 };
    const saved = state({ x: -1300, y: 100, width: 1800, height: 700 });
    const bounds = initialWindowBounds(saved, [small]);
    expect(bounds.width).toBe(1200);
    expect(bounds.x! + bounds.width).toBeGreaterThanOrEqual(small.x + 100);
  });

  it('keeps the title bar below the top of the display', () => {
    expect(initialWindowBounds(state({ y: -20 }), [laptop]).y).toBe(laptop.y);
  });

  it('fits a window spanning two displays to the one with most of it', () => {
    // Mostly on the monitor, with its left edge on the laptop.
    const saved = state({ x: 1400, y: 0, width: 2600, height: 900 });
    const bounds = initialWindowBounds(saved, [laptop, monitor]);
    expect(bounds.width).toBe(monitor.width);
    expect(bounds.height).toBe(900);
  });

  it('keeps maximized with restored bounds', () => {
    expect(initialWindowBounds(state({ isMaximized: true }), [laptop])).toEqual(
      state({ isMaximized: true }),
    );
  });

  it('keeps maximized when the saved display is gone', () => {
    const saved = state({ x: 2000, y: 0, isMaximized: true });
    expect(initialWindowBounds(saved, [laptop])).toEqual({
      ...DEFAULT_WINDOW_SIZE,
      isMaximized: true,
    });
  });

  it('uses the defaults when no display is connected', () => {
    expect(initialWindowBounds(state(), []).x).toBeUndefined();
  });
});

describe('trackWindowState', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function fakeWindow() {
    const listeners = new Map<string, () => void>();
    const window = {
      bounds: { x: 10, y: 20, width: 800, height: 600 } as Rect,
      maximized: false,
      minimized: false,
      fullScreen: false,
      destroyed: false,
      emit: (event: string) => listeners.get(event)?.(),
      on: (event: string, listener: () => void) => listeners.set(event, listener),
      isDestroyed: () => window.destroyed,
      // Like macOS: a minimized or full-screen window never reports maximized.
      isMaximized: () => window.maximized && !window.minimized && !window.fullScreen,
      isMinimized: () => window.minimized,
      isFullScreen: () => window.fullScreen,
      getNormalBounds: () => window.bounds,
    };
    return window satisfies TrackedWindow;
  }

  it('saves once the window stops moving', () => {
    vi.useFakeTimers();
    const window = fakeWindow();
    const save = vi.fn();
    trackWindowState(window, save);

    window.emit('move');
    vi.advanceTimersByTime(SAVE_DELAY_MS - 1);
    window.bounds = { x: 50, y: 60, width: 800, height: 600 };
    window.emit('move');
    window.emit('resize');
    vi.advanceTimersByTime(SAVE_DELAY_MS - 1);
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledExactlyOnceWith({
      x: 50,
      y: 60,
      width: 800,
      height: 600,
      isMaximized: false,
    });
  });

  it('saves the normal bounds and the maximized flag', () => {
    vi.useFakeTimers();
    const window = fakeWindow();
    const save = vi.fn();
    trackWindowState(window, save);

    window.maximized = true;
    window.emit('maximize');
    vi.advanceTimersByTime(SAVE_DELAY_MS);
    expect(save).toHaveBeenLastCalledWith({ ...window.bounds, isMaximized: true });
  });

  it('remembers maximized when the window closes while minimized', () => {
    const window = fakeWindow();
    const save = vi.fn();
    trackWindowState(window, save);

    window.maximized = true;
    window.emit('maximize');
    window.minimized = true;
    window.emit('close');
    expect(save).toHaveBeenLastCalledWith({ ...window.bounds, isMaximized: true });
  });

  it('remembers maximized when the window closes in full screen', () => {
    const window = fakeWindow();
    const save = vi.fn();
    trackWindowState(window, save);

    window.maximized = true;
    window.emit('maximize');
    window.fullScreen = true;
    window.emit('resize');
    window.emit('close');
    expect(save).toHaveBeenLastCalledWith({ ...window.bounds, isMaximized: true });
  });

  it('saves at once on close and drops the pending save', () => {
    vi.useFakeTimers();
    const window = fakeWindow();
    const save = vi.fn();
    trackWindowState(window, save);

    window.emit('resize');
    window.emit('close');
    expect(save).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(SAVE_DELAY_MS);
    expect(save).toHaveBeenCalledOnce();
  });

  it('rounds fractional bounds', () => {
    const window = fakeWindow();
    window.bounds = { x: 10.4, y: 20.6, width: 800.5, height: 600 };
    const save = vi.fn();
    trackWindowState(window, save);
    window.emit('close');
    expect(save).toHaveBeenCalledWith({
      x: 10,
      y: 21,
      width: 801,
      height: 600,
      isMaximized: false,
    });
  });

  it('does nothing once the window is destroyed', () => {
    vi.useFakeTimers();
    const window = fakeWindow();
    const save = vi.fn();
    trackWindowState(window, save);

    window.emit('move');
    window.destroyed = true;
    vi.advanceTimersByTime(SAVE_DELAY_MS);
    expect(save).not.toHaveBeenCalled();
  });
});
