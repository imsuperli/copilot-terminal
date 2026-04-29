import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const xtermCssPath = path.resolve(__dirname, '../xterm.css');
const xtermCss = readFileSync(xtermCssPath, 'utf8');

describe('xterm scrollbar css', () => {
  it('keeps the scrollbar gutter stable while expanding only the visible thumb on hover', () => {
    expect(xtermCss).toContain('.xterm .xterm-scrollable-element > .xterm-scrollbar,\n.xterm .xterm-scrollable-element > .scrollbar {\n  width: 12px !important;');
    expect(xtermCss).toContain('.xterm .xterm-scrollable-element > .xterm-scrollbar:hover,\n.xterm .xterm-scrollable-element > .scrollbar:hover {\n  width: 12px !important;');
    expect(xtermCss).toContain('.xterm .xterm-scrollable-element > .xterm-scrollbar:hover > .xterm-slider,');
    expect(xtermCss).toContain('.xterm .xterm-scrollable-element > .scrollbar:hover > .slider,');
    expect(xtermCss).toContain('width: 8px !important;');
  });
});
