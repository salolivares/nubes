import { z } from 'zod';

/** A rectangle in screen coordinates (DIPs), the shape of Electron's `Rectangle`. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What is saved between launches: the window's normal (unmaximized) bounds, and whether it was maximized. */
export const windowStateSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  isMaximized: z.boolean(),
});

export type WindowState = z.infer<typeof windowStateSchema>;

export const DEFAULT_WINDOW_SIZE = { width: 1200, height: 800 } as const;

/**
 * How much of the saved window must still overlap a display, in each direction, for it to count
 * as on screen. Enough to see the window and grab its title bar.
 */
export const MIN_VISIBLE = { width: 100, height: 50 } as const;

/** Parse a saved window state. Anything that isn't one, including bad JSON, gives null. */
export function parseWindowState(raw: string | null): WindowState | null {
  if (!raw) return null;
  try {
    const result = windowStateSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function overlap(a: Rect, b: Rect): { width: number; height: number } {
  return {
    width: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    height: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  };
}

export interface InitialWindowBounds {
  /** Undefined means Electron's default position: centered on the primary display. */
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

/**
 * Where to open the window, given the saved state and the work areas of the connected displays.
 *
 * Saved bounds are used only when they still overlap a display by at least MIN_VISIBLE, so a
 * window saved on an unplugged monitor, or dragged almost off screen, opens at the default size
 * and position instead. A window bigger than the display it lands on is shrunk to fit it, then
 * moved so at least MIN_VISIBLE of it stays on that display, with its title bar below the top.
 * Maximized state is kept either way: maximize() fills whichever display the window opens on.
 */
export function initialWindowBounds(
  saved: WindowState | null,
  workAreas: readonly Rect[],
): InitialWindowBounds {
  if (!saved) return { ...DEFAULT_WINDOW_SIZE, isMaximized: false };

  const visible = workAreas
    .map((area) => ({ area, overlap: overlap(saved, area) }))
    .filter(
      ({ overlap }) => overlap.width >= MIN_VISIBLE.width && overlap.height >= MIN_VISIBLE.height,
    )
    .sort((a, b) => b.overlap.width * b.overlap.height - a.overlap.width * a.overlap.height);

  const best = visible[0]?.area;
  if (!best) return { ...DEFAULT_WINDOW_SIZE, isMaximized: saved.isMaximized };

  const width = Math.min(saved.width, best.width);
  const height = Math.min(saved.height, best.height);
  return {
    // Shrinking keeps the left edge, which can leave the window off the display it overlapped.
    x: clamp(saved.x, best.x - width + MIN_VISIBLE.width, best.x + best.width - MIN_VISIBLE.width),
    y: clamp(saved.y, best.y, best.y + best.height - MIN_VISIBLE.height),
    width,
    height,
    isMaximized: saved.isMaximized,
  };
}

/** The parts of BrowserWindow that trackWindowState() uses. */
export interface TrackedWindow {
  on(event: 'move' | 'resize' | 'maximize' | 'unmaximize' | 'close', listener: () => void): unknown;
  isDestroyed(): boolean;
  isMaximized(): boolean;
  isMinimized(): boolean;
  isFullScreen(): boolean;
  getNormalBounds(): Rect;
}

/** How long the window must sit still after a move or resize before its state is saved. */
export const SAVE_DELAY_MS = 500;

/**
 * Save the window's state after it stops moving or resizing, and once more as it closes.
 * Saves the normal bounds, so a maximized window comes back to its old size when unmaximized.
 */
export function trackWindowState(
  window: TrackedWindow,
  save: (state: WindowState) => void,
  delayMs = SAVE_DELAY_MS,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // macOS reports isMaximized() false while the window is minimized or full screen, so quitting
  // from the Dock with a minimized window would forget it was maximized. Keep the last answer
  // from when the window was in neither state.
  let wasMaximized = window.isMaximized();
  const maximized = () => {
    if (!window.isMinimized() && !window.isFullScreen()) wasMaximized = window.isMaximized();
    return wasMaximized;
  };

  const saveNow = () => {
    clearTimeout(timer);
    timer = undefined;
    if (window.isDestroyed()) return;
    const { x, y, width, height } = window.getNormalBounds();
    const state = {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      isMaximized: maximized(),
    };
    const parsed = windowStateSchema.safeParse(state);
    if (parsed.success) save(parsed.data);
  };

  const saveLater = () => {
    maximized();
    clearTimeout(timer);
    timer = setTimeout(saveNow, delayMs);
  };

  window.on('move', saveLater);
  window.on('resize', saveLater);
  window.on('maximize', saveLater);
  window.on('unmaximize', saveLater);
  window.on('close', saveNow);
}
