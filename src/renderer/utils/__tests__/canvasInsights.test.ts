import { describe, expect, it } from 'vitest';
import { exportCanvasWorkspaceReport } from '../canvasInsights';
import type { CanvasWorkspace } from '../../../shared/types/canvas';

describe('canvasInsights', () => {
  it('omits overview details when the overview section is disabled', () => {
    const workspace: CanvasWorkspace = {
      id: 'canvas-1',
      name: 'Ops Board',
      createdAt: '2026-05-04T00:00:00.000Z',
      updatedAt: '2026-05-04T00:00:00.000Z',
      workingDirectory: '/workspace/project',
      blocks: [],
      viewport: { tx: 0, ty: 0, zoom: 1 },
      nextZIndex: 1,
      exportSettings: {
        sections: ['blocks'],
      },
    };

    const report = exportCanvasWorkspaceReport({
      workspace,
      windowsById: new Map(),
      t: (key) => key,
    });

    expect(report.markdown).toContain('# Ops Board report');
    expect(report.markdown).not.toContain('- Workspace: Ops Board');
    expect(report.markdown).not.toContain('- Default directory: /workspace/project');
    expect(report.markdown).toContain('## Blocks');
  });
});
