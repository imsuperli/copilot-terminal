import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE_SETTINGS } from '../../../shared/utils/appearance';
import { applyAppearanceToDocument, getAppearanceBackdropDescriptor, getAppearanceSkinStyle } from '../appearance';

describe('renderer appearance utilities', () => {
  it('applies app and terminal theme tokens to the document root', () => {
    applyAppearanceToDocument({
      ...DEFAULT_APPEARANCE_SETTINGS,
      skin: {
        ...DEFAULT_APPEARANCE_SETTINGS.skin,
        presetId: 'aurora',
      },
      terminalOpacity: 0.75,
    });

    const style = document.documentElement.style;
    expect(style.getPropertyValue('--background')).toBe('6 15 18');
    expect(style.getPropertyValue('--terminal-background')).toBe('#061114');
    expect(style.getPropertyValue('--appearance-terminal-opacity-percent')).toBe('75%');
    expect(style.getPropertyValue('--terminal-background-effective')).toContain('rgba(var(--terminal-background-rgb');
    expect(style.getPropertyValue('--appearance-skin-motion-duration')).toBe('0s');
    expect(style.getPropertyValue('--appearance-skin-motion-opacity')).toBe('0');
    expect(style.getPropertyValue('--appearance-remote-tab-active-background')).toBe('rgb(var(--card))');
    expect(style.getPropertyValue('--appearance-remote-tab-hover-background')).toBe('rgb(var(--accent))');
    expect(style.getPropertyValue('--appearance-remote-tab-separator-color')).toBe('rgba(var(--border), 0.72)');
  });

  it('applies the violet midnight palette tokens', () => {
    applyAppearanceToDocument({
      ...DEFAULT_APPEARANCE_SETTINGS,
      skin: {
        ...DEFAULT_APPEARANCE_SETTINGS.skin,
        presetId: 'midnight',
      },
    });

    const style = document.documentElement.style;
    expect(style.getPropertyValue('--background')).toBe('8 6 15');
    expect(style.getPropertyValue('--primary')).toBe('176 126 255');
    expect(style.getPropertyValue('--titlebar')).toBe('24 20 38');
    expect(style.getPropertyValue('--terminal-background')).toBe('#080611');
    expect(style.getPropertyValue('--terminal-cursor')).toBe('#b07eff');
  });

  it('applies a crisp white palette for the paper preset', () => {
    applyAppearanceToDocument({
      ...DEFAULT_APPEARANCE_SETTINGS,
      skin: {
        ...DEFAULT_APPEARANCE_SETTINGS.skin,
        presetId: 'paper',
        dim: 0.04,
      },
    });

    const style = document.documentElement.style;
    expect(style.getPropertyValue('--background')).toBe('252 253 255');
    expect(style.getPropertyValue('--card')).toBe('255 255 255');
    expect(style.getPropertyValue('--titlebar')).toBe('250 251 253');
    expect(style.getPropertyValue('--terminal-background')).toBe('#ffffff');
    expect(style.getPropertyValue('--appearance-skin-dim')).toBe('0.04');
    expect(style.getPropertyValue('--appearance-pane-background')).toBe('rgba(var(--terminal-background-rgb, 12, 12, 12), 0.860)');
    expect(style.getPropertyValue('--appearance-pane-chrome-background')).toBe('rgba(var(--terminal-background-rgb, 12, 12, 12), 0.900)');
  });

  it('builds one global skin background style', () => {
    const style = getAppearanceSkinStyle({
      ...DEFAULT_APPEARANCE_SETTINGS,
      skin: {
        ...DEFAULT_APPEARANCE_SETTINGS.skin,
        presetId: 'custom',
        kind: 'image',
        imagePath: 'C:\\Wallpapers\\skin.png',
      },
    });

    expect(style.backgroundImage).toBe('url("app-image:///C%3A/Wallpapers/skin.png")');
    expect(style.backgroundSize).toBe('cover');
  });

  it('builds layered backdrop descriptors for animated presets', () => {
    const descriptor = getAppearanceBackdropDescriptor({
      ...DEFAULT_APPEARANCE_SETTINGS,
      reduceMotion: false,
      skin: {
        ...DEFAULT_APPEARANCE_SETTINGS.skin,
        presetId: 'aurora',
        motion: 'ambient',
      },
    });

    expect(descriptor.layers.length).toBeGreaterThan(0);
    expect(descriptor.layers[0]?.style?.animation).toContain('appearance-skin-drift');
  });

  it('skips motion-only layers when skin motion is disabled', () => {
    const descriptor = getAppearanceBackdropDescriptor({
      ...DEFAULT_APPEARANCE_SETTINGS,
      reduceMotion: true,
      skin: {
        ...DEFAULT_APPEARANCE_SETTINGS.skin,
        presetId: 'aurora',
        motion: 'none',
      },
    });

    expect(descriptor.layers).toHaveLength(1);
    expect(descriptor.layers[0]?.style?.animation).toBeUndefined();
  });
});
