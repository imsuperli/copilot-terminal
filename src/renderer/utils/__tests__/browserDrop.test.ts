import { describe, expect, it } from 'vitest';
import { DragItemTypes, type BrowserPaneDragItem, type BrowserToolDragItem, type NativeBrowserUrlDragItem } from '../../components/dnd';
import { WindowStatus, type Pane } from '../../types/window';
import { canBrowserDropTargetAcceptItem, resolveBrowserDropAction } from '../browserDrop';

function createTerminalPane(id: string): Pane {
  return {
    id,
    cwd: '/workspace/project',
    command: 'bash',
    status: WindowStatus.Running,
    pid: 101,
  };
}

function createBrowserPane(id: string): Pane {
  return {
    id,
    cwd: '',
    command: '',
    status: WindowStatus.Paused,
    pid: null,
    kind: 'browser',
    browser: {
      url: 'https://example.com',
    },
  };
}

describe('browserDrop', () => {
  it('opens a dragged URL inside the current browser pane when dropped in the center', () => {
    const item: NativeBrowserUrlDragItem = {
      urls: ['https://docs.example.com/guides'],
    };

    expect(resolveBrowserDropAction(
      item,
      {
        position: 'center',
        targetPaneId: 'pane-browser',
        targetWindowId: 'win-1',
      },
      createBrowserPane('pane-browser'),
      'win-1',
    )).toEqual({
      type: 'open-in-browser-pane',
      targetPaneId: 'pane-browser',
      url: 'https://docs.example.com/guides',
    });
  });

  it('creates a nested vertical browser split when a URL is dropped at the bottom of a browser pane', () => {
    const item: NativeBrowserUrlDragItem = {
      urls: ['https://docs.example.com/reference'],
    };

    expect(resolveBrowserDropAction(
      item,
      {
        position: 'bottom',
        targetPaneId: 'pane-browser',
        targetWindowId: 'win-1',
      },
      createBrowserPane('pane-browser'),
      'win-1',
    )).toEqual({
      type: 'create-browser-pane',
      targetPaneId: 'pane-browser',
      url: 'https://docs.example.com/reference',
      direction: 'vertical',
      insertBefore: false,
    });
  });

  it('keeps browser pane move drops on the existing re-layout path', () => {
    const item: BrowserPaneDragItem = {
      type: DragItemTypes.BROWSER_PANE,
      windowId: 'win-1',
      paneId: 'pane-browser-source',
      url: 'https://example.com/source',
    };

    expect(resolveBrowserDropAction(
      item,
      {
        position: 'left',
        targetPaneId: 'pane-browser-target',
        targetWindowId: 'win-1',
      },
      createBrowserPane('pane-browser-target'),
      'win-1',
    )).toEqual({
      type: 'move-browser-pane',
      paneId: 'pane-browser-source',
      targetPaneId: 'pane-browser-target',
      direction: 'horizontal',
      insertBefore: true,
    });
  });

  it('allows the toolbar browser tool to create a blank browser pane beside a terminal pane', () => {
    const item: BrowserToolDragItem = {
      type: DragItemTypes.BROWSER_TOOL,
      windowId: 'win-1',
      sourcePaneId: 'pane-terminal',
      url: 'about:blank',
    };

    expect(resolveBrowserDropAction(
      item,
      {
        position: 'right',
        targetPaneId: 'pane-terminal',
        targetWindowId: 'win-1',
      },
      createTerminalPane('pane-terminal'),
      'win-1',
    )).toEqual({
      type: 'create-browser-pane',
      targetPaneId: 'pane-terminal',
      url: 'about:blank',
      direction: 'horizontal',
      insertBefore: false,
    });
  });

  it('rejects incompatible browser pane drops onto the same pane or another window', () => {
    const item: BrowserPaneDragItem = {
      type: DragItemTypes.BROWSER_PANE,
      windowId: 'win-1',
      paneId: 'pane-browser-source',
      url: 'https://example.com/source',
    };

    expect(canBrowserDropTargetAcceptItem(item, 'win-1', 'pane-browser-source')).toBe(false);
    expect(canBrowserDropTargetAcceptItem(item, 'win-2', 'pane-browser-target')).toBe(false);
  });
});
