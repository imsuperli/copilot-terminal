import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Radix UI ScrollArea uses ResizeObserver which is not available in jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock window.electronAPI for all renderer tests
Object.defineProperty(window, 'electronAPI', {
  value: {
    ping: vi.fn().mockResolvedValue('pong'),
    createWindow: vi.fn().mockResolvedValue({}),
    killTerminal: vi.fn().mockResolvedValue(undefined),
    getTerminalStatus: vi.fn().mockResolvedValue('alive'),
    listTerminals: vi.fn().mockResolvedValue([]),
    closeWindow: vi.fn().mockResolvedValue(undefined),
    deleteWindow: vi.fn().mockResolvedValue(undefined),
    validatePath: vi.fn().mockResolvedValue(true),
    selectDirectory: vi.fn().mockResolvedValue(null),
    onWindowStatusChanged: vi.fn(),
    offWindowStatusChanged: vi.fn(),
  },
  writable: true,
});
