import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getBrowserDropDragActive,
  setBrowserDropDragActive,
  subscribeBrowserDropDragActive,
} from '../browserDropDragState';

describe('browserDropDragState', () => {
  beforeEach(() => {
    setBrowserDropDragActive(false);
  });

  it('publishes explicit browser drop drag activation changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeBrowserDropDragActive(listener);

    setBrowserDropDragActive(true);
    setBrowserDropDragActive(false);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, true);
    expect(listener).toHaveBeenNthCalledWith(2, false);

    unsubscribe();
  });

  it('resets active state when the window receives drop or dragend', () => {
    subscribeBrowserDropDragActive(() => undefined);
    setBrowserDropDragActive(true);

    window.dispatchEvent(new Event('drop'));
    expect(getBrowserDropDragActive()).toBe(false);

    setBrowserDropDragActive(true);
    window.dispatchEvent(new Event('dragend'));
    expect(getBrowserDropDragActive()).toBe(false);
  });
});
