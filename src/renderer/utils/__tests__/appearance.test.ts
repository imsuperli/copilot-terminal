import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE_SETTINGS } from '../../../shared/utils/appearance';
import { applyAppearanceToDocument, getAppearanceSkinStyle } from '../appearance';

describe('renderer appearance utilities', () => {
  it('applies app and terminal theme tokens to the document root', () => {
    applyAppearanceToDocument({
      ...DEFAULT_APPEARANCE_SETTINGS,
      themeId: 'aurora',
      terminalOpacity: 0.75,
    });

    const style = document.documentElement.style;
    expect(style.getPropertyValue('--background')).toBe('6 15 18');
    expect(style.getPropertyValue('--terminal-background')).toBe('#061114');
    expect(style.getPropertyValue('--appearance-terminal-opacity-percent')).toBe('75%');
    expect(style.getPropertyValue('--terminal-background-effective')).toContain('var(--terminal-background)');
  });

  it('builds one global skin background style', () => {
    const style = getAppearanceSkinStyle({
      ...DEFAULT_APPEARANCE_SETTINGS,
      skin: {
        ...DEFAULT_APPEARANCE_SETTINGS.skin,
        kind: 'image',
        imagePath: 'C:\\Wallpapers\\skin.png',
      },
    });

    expect(style.backgroundImage).toBe('url("C:/Wallpapers/skin.png")');
    expect(style.backgroundSize).toBe('cover');
  });
});
