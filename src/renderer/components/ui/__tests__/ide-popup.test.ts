import { describe, expect, it } from 'vitest';
import { idePopupTooltipClassName } from '../ide-popup';

describe('ide popup tooltip styles', () => {
  it('uses an opaque card background for tooltips', () => {
    expect(idePopupTooltipClassName).toContain('bg-[rgb(var(--card))]');
    expect(idePopupTooltipClassName).not.toContain('var(--appearance-pane-background)');
  });
});
