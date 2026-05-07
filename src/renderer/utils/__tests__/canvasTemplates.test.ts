import { describe, expect, it } from 'vitest'
import type { CanvasWorkspace } from '../../../shared/types/canvas'
import { createSinglePaneWindow } from '../layoutHelpers'
import {
  createDefaultCanvasTemplates,
  createTemplateFromWorkspace,
  findCanvasTemplateInsertOffset,
  instantiateCanvasWorkspaceFromTemplate,
  mergeCanvasWorkspaceContents,
  reconcileCanvasWorkspaceTemplates,
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

  it('finds a non-overlapping insert offset for template groups', () => {
    const current = createWorkspace()
    const incoming = {
      ...createWorkspace(),
      blocks: [
        {
          id: 'incoming-window',
          type: 'window' as const,
          windowId: 'incoming-win-1',
          x: 60,
          y: 80,
          width: 360,
          height: 252,
          zIndex: 1,
          label: 'Incoming window',
          displayMode: 'summary' as const,
        },
        {
          id: 'incoming-note',
          type: 'note' as const,
          x: 60,
          y: 372,
          width: 320,
          height: 200,
          zIndex: 2,
          label: 'Incoming note',
          content: 'Template note',
        },
      ],
      links: [],
      nextZIndex: 3,
    }

    const offset = findCanvasTemplateInsertOffset(current.blocks, incoming.blocks)
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
      offset,
    )

    const shiftedIncomingBlocks = merged.blocks.filter((block) => block.id.startsWith('incoming-'))
    for (const currentBlock of current.blocks) {
      for (const incomingBlock of shiftedIncomingBlocks) {
        const overlaps = !(
          incomingBlock.x + incomingBlock.width <= currentBlock.x
          || currentBlock.x + currentBlock.width <= incomingBlock.x
          || incomingBlock.y + incomingBlock.height <= currentBlock.y
          || currentBlock.y + currentBlock.height <= incomingBlock.y
        )
        expect(overlaps).toBe(false)
      }
    }
  })

  it('uses taller default dimensions for chat blocks in system templates', () => {
    const templates = createDefaultCanvasTemplates()
    const troubleshooting = templates.find((template) => template.id === 'canvas-template-troubleshooting')
    const chatBlock = troubleshooting?.blocks.find((block) => block.kind === 'chat')

    expect(chatBlock).toBeDefined()
    expect(chatBlock?.width).toBeGreaterThan(360)
    expect(chatBlock?.height).toBeGreaterThan(220)
  })

  it('reconciles persisted system templates back to the latest defaults without touching custom templates', () => {
    const templates = createDefaultCanvasTemplates()
    const legacyTroubleshooting = {
      ...templates[0],
      blocks: templates[0].blocks.map((block) => (
        block.id === 'repro-terminal'
          ? { ...block, height: 220 }
          : block
      )),
    }
    const customTemplate = {
      ...templates[0],
      id: 'custom-template',
      name: 'Custom template',
      system: false,
    }

    const reconciled = reconcileCanvasWorkspaceTemplates([legacyTroubleshooting, customTemplate])
    const troubleshooting = reconciled.find((template) => template.id === 'canvas-template-troubleshooting')
    const custom = reconciled.find((template) => template.id === 'custom-template')

    expect(troubleshooting?.blocks.find((block) => block.id === 'repro-terminal')?.height).toBeGreaterThan(220)
    expect(custom?.name).toBe('Custom template')
    expect(reconciled.filter((template) => template.system).length).toBe(createDefaultCanvasTemplates().length)
  })
})
