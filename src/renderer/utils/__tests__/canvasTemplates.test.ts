import { describe, expect, it } from 'vitest'
import type { CanvasWorkspace } from '../../../shared/types/canvas'
import { createSinglePaneWindow } from '../layoutHelpers'
import {
  createTemplateFromWorkspace,
  instantiateCanvasWorkspaceFromTemplate,
  mergeCanvasWorkspaceContents,
} from '../canvasTemplates'

function createWorkspace(): CanvasWorkspace {
  return {
    id: 'canvas-1',
    name: 'Ops Board',
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T00:00:00.000Z',
    blocks: [
      {
        id: 'note-1',
        type: 'note',
        x: 10,
        y: 20,
        width: 200,
        height: 120,
        zIndex: 1,
        label: 'Checklist',
        content: 'Inspect logs',
      },
      {
        id: 'window-1',
        type: 'window',
        windowId: 'win-1',
        x: 280,
        y: 40,
        width: 320,
        height: 220,
        zIndex: 2,
        label: 'Terminal',
        displayMode: 'summary',
      },
    ],
    links: [
      {
        id: 'link-1',
        fromBlockId: 'note-1',
        toBlockId: 'window-1',
        kind: 'evidence',
        createdAt: '2026-05-04T00:00:00.000Z',
      },
    ],
    viewport: { tx: 0, ty: 0, zoom: 1 },
    nextZIndex: 3,
  }
}

describe('canvasTemplates', () => {
  it('preserves link relationships when saving and instantiating a template', () => {
    const windowItem = createSinglePaneWindow('Terminal', '/workspace', 'bash')
    windowItem.id = 'win-1'

    const template = createTemplateFromWorkspace(
      createWorkspace(),
      new Map([[windowItem.id, windowItem]]),
    )
    const instantiated = instantiateCanvasWorkspaceFromTemplate(template)

    expect(template.links).toHaveLength(1)
    expect(instantiated.workspace.blocks).toHaveLength(2)
    expect(instantiated.workspace.links).toHaveLength(1)

    const [instantiatedLink] = instantiated.workspace.links ?? []
    const blockIds = new Set(instantiated.workspace.blocks.map((block) => block.id))
    expect(blockIds.has(instantiatedLink.fromBlockId)).toBe(true)
    expect(blockIds.has(instantiatedLink.toBlockId)).toBe(true)
  })

  it('merges instantiated template content into the current canvas instead of replacing it', () => {
    const current = createWorkspace()
    const incoming = {
      ...createWorkspace(),
      blocks: [
        {
          id: 'incoming-note',
          type: 'note' as const,
          x: 0,
          y: 0,
          width: 160,
          height: 100,
          zIndex: 1,
          label: 'Incoming',
          content: 'Template note',
        },
      ],
      links: [],
      nextZIndex: 2,
    }

    const merged = mergeCanvasWorkspaceContents(
      {
        blocks: current.blocks,
        links: current.links ?? [],
        nextZIndex: current.nextZIndex,
      },
      {
        blocks: incoming.blocks,
        links: incoming.links ?? [],
        nextZIndex: incoming.nextZIndex,
      },
      { x: 80, y: 60 },
    )

    expect(merged.blocks).toHaveLength(3)
    expect(merged.blocks.some((block) => block.id === 'note-1')).toBe(true)
    expect(merged.blocks.some((block) => block.id === 'incoming-note')).toBe(true)
    expect(merged.nextZIndex).toBeGreaterThan(current.nextZIndex)
  })
})
