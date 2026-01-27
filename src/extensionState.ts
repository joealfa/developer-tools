/**
 * Shared state for the extension
 * Used to share instances between modules without modifying the extension context
 */

import { NotesCursorTracker } from './notes';
import type { NoteEditorProvider } from './webviews/noteEditorProvider';

/**
 * Shared extension state
 */
class ExtensionState {
    private static _cursorTracker: NotesCursorTracker | null = null;
    private static _noteEditorProvider: NoteEditorProvider | null = null;

    static setCursorTracker(tracker: NotesCursorTracker): void {
        this._cursorTracker = tracker;
    }

    static getCursorTracker(): NotesCursorTracker | null {
        return this._cursorTracker;
    }

    static setNoteEditorProvider(provider: NoteEditorProvider): void {
        this._noteEditorProvider = provider;
    }

    static getNoteEditorProvider(): NoteEditorProvider | null {
        return this._noteEditorProvider;
    }

    static reset(): void {
        this._cursorTracker = null;
        this._noteEditorProvider = null;
    }
}

export { ExtensionState };
