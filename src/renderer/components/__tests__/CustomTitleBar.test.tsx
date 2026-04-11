import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { CustomTitleBar } from '../CustomTitleBar';

describe('CustomTitleBar', () => {
  beforeEach(() => {
    Object.assign(window.electronAPI, {
      platform: 'linux',
      windowMinimize: vi.fn().mockResolvedValue({ success: true }),
      windowMaximize: vi.fn().mockResolvedValue({ success: true }),
      windowToggleFullScreen: vi.fn().mockResolvedValue({ success: true }),
      windowClose: vi.fn().mockResolvedValue({ success: true }),
      windowIsMaximized: vi.fn().mockResolvedValue({ success: true, data: false }),
      windowIsFullScreen: vi.fn().mockResolvedValue({ success: true, data: false }),
      onWindowMaximized: vi.fn(() => () => {}),
      onWindowFullScreen: vi.fn(() => () => {}),
    });
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/');
  });

  it('resolves the title bar logo relative to the current renderer page', () => {
    window.history.replaceState({}, '', '/dist/renderer/index.html');

    render(
      <CustomTitleBar
        title="Workspace"
        showAppName={true}
        appName="Copilot-Terminal"
      />,
    );

    const logo = screen.getByAltText('Logo');
    expect(logo).toHaveAttribute('src', 'http://localhost:3000/dist/renderer/resources/icon.png');
  });

  it('uses native full screen semantics for the macOS green button', () => {
    window.electronAPI.platform = 'darwin';

    render(<CustomTitleBar title="Workspace" />);

    fireEvent.click(screen.getByLabelText('Maximize'));

    expect(window.electronAPI.windowToggleFullScreen).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.windowMaximize).not.toHaveBeenCalled();
  });

  it('prevents mouse focus on title bar buttons', () => {
    const { container } = render(
      <CustomTitleBar
        title="Workspace"
        onReturn={vi.fn()}
      />,
    );

    const homeButton = container.querySelector('button');
    expect(homeButton).not.toBeNull();
    expect(homeButton).toHaveAttribute('tabIndex', '-1');

    const mouseDownEvent = createEvent.mouseDown(homeButton!);
    fireEvent(homeButton!, mouseDownEvent);

    expect(mouseDownEvent.defaultPrevented).toBe(true);
  });
});
