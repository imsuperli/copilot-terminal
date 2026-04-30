import { create } from 'zustand';

export interface PaneNoteRecord {
  text: string;
  pinned: boolean;
  side: 'left' | 'right';
}

interface PaneNoteStore {
  notes: Record<string, PaneNoteRecord>;
  draftOpenKeys: Record<string, true>;
  setNote: (windowId: string, paneId: string, note: PaneNoteRecord) => void;
  removeNote: (windowId: string, paneId: string) => void;
  setPinned: (windowId: string, paneId: string, pinned: boolean) => void;
  setSide: (windowId: string, paneId: string, side: PaneNoteRecord['side']) => void;
  openDraft: (windowId: string, paneId: string) => void;
  closeDraft: (windowId: string, paneId: string) => void;
}

function getPaneNoteKey(windowId: string, paneId: string): string {
  return `${windowId}::${paneId}`;
}

export const usePaneNoteStore = create<PaneNoteStore>((set) => ({
  notes: {},
  draftOpenKeys: {},
  setNote: (windowId, paneId, note) => {
    const key = getPaneNoteKey(windowId, paneId);
    const trimmedText = note.text.trim();

    set((state) => {
      if (!trimmedText) {
        if (!(key in state.notes)) {
          return state;
        }

        const nextNotes = { ...state.notes };
        delete nextNotes[key];
        const nextDraftOpenKeys = { ...state.draftOpenKeys };
        delete nextDraftOpenKeys[key];
        return { notes: nextNotes, draftOpenKeys: nextDraftOpenKeys };
      }

      const previousNote = state.notes[key];
      if (previousNote && previousNote.text === trimmedText && previousNote.pinned === note.pinned) {
        return state;
      }

      return {
        notes: {
          ...state.notes,
          [key]: {
            text: trimmedText,
            pinned: note.pinned,
            side: note.side,
          },
        },
        draftOpenKeys: {
          ...state.draftOpenKeys,
          [key]: true,
        },
      };
    });
  },
  removeNote: (windowId, paneId) => {
    const key = getPaneNoteKey(windowId, paneId);

    set((state) => {
      if (!(key in state.notes)) {
        return state;
      }

      const nextNotes = { ...state.notes };
      delete nextNotes[key];
      const nextDraftOpenKeys = { ...state.draftOpenKeys };
      delete nextDraftOpenKeys[key];
      return { notes: nextNotes, draftOpenKeys: nextDraftOpenKeys };
    });
  },
  setPinned: (windowId, paneId, pinned) => {
    const key = getPaneNoteKey(windowId, paneId);

    set((state) => {
      const previousNote = state.notes[key];
      if (!previousNote || previousNote.pinned === pinned) {
        return state;
      }

      return {
        notes: {
          ...state.notes,
          [key]: {
            ...previousNote,
            pinned,
          },
        },
      };
    });
  },
  setSide: (windowId, paneId, side) => {
    const key = getPaneNoteKey(windowId, paneId);

    set((state) => {
      const previousNote = state.notes[key];
      if (!previousNote || previousNote.side === side) {
        return state;
      }

      return {
        notes: {
          ...state.notes,
          [key]: {
            ...previousNote,
            side,
          },
        },
      };
    });
  },
  openDraft: (windowId, paneId) => {
    const key = getPaneNoteKey(windowId, paneId);

    set((state) => ({
      draftOpenKeys: {
        ...state.draftOpenKeys,
        [key]: true,
      },
    }));
  },
  closeDraft: (windowId, paneId) => {
    const key = getPaneNoteKey(windowId, paneId);

    set((state) => {
      if (!(key in state.draftOpenKeys)) {
        return state;
      }

      const nextDraftOpenKeys = { ...state.draftOpenKeys };
      delete nextDraftOpenKeys[key];
      return { draftOpenKeys: nextDraftOpenKeys };
    });
  },
}));

export function getPaneNote(windowId: string, paneId: string): PaneNoteRecord | undefined {
  return usePaneNoteStore.getState().notes[getPaneNoteKey(windowId, paneId)];
}

export function __resetPaneNoteStoreForTests(): void {
  usePaneNoteStore.setState({ notes: {} });
}
