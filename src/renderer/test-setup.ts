import '@testing-library/jest-dom/vitest';

import { vi } from 'vitest';

// Mock window.* preload APIs exposed via contextBridge

window.storage = {
  secureRead: vi.fn().mockResolvedValue(''),
  secureWrite: vi.fn().mockResolvedValue(undefined),
  read: vi.fn().mockResolvedValue(''),
  write: vi.fn().mockResolvedValue(undefined),
  onStorageChange: vi.fn().mockReturnValue(() => {}),
};

window.themeMode = {
  toggle: vi.fn().mockResolvedValue(true),
  dark: vi.fn().mockResolvedValue(undefined),
  light: vi.fn().mockResolvedValue(undefined),
  system: vi.fn().mockResolvedValue(true),
  current: vi.fn().mockResolvedValue('system' as const),
};

window.imageProcessor = {
  resize: vi.fn(),
  onProgressChange: vi.fn().mockReturnValue(() => {}),
  onComplete: vi.fn().mockReturnValue(() => {}),
};

window.imagePicker = {
  open: vi.fn().mockResolvedValue([]),
  readThumbnail: vi.fn().mockResolvedValue(''),
};

window.photosets = {
  list: vi.fn().mockResolvedValue([]),
  get: vi.fn().mockResolvedValue(undefined),
  create: vi.fn().mockResolvedValue({}),
  update: vi.fn().mockResolvedValue({}),
  delete: vi.fn().mockResolvedValue(undefined),
  addImages: vi.fn().mockResolvedValue([]),
  publish: vi.fn().mockResolvedValue({}),
  markUploaded: vi.fn().mockResolvedValue({}),
};

// Stub scrollIntoView not available in jsdom
Element.prototype.scrollIntoView = vi.fn();

// Stub URL methods not available in jsdom
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
}
if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = vi.fn();
}
