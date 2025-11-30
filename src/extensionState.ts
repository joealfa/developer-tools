/**
 * Shared state for the extension
 * Used to share instances between modules without modifying the extension context
 */

import { NotesCursorTracker } from './notes';

/**
 * Shared extension state
 */
class ExtensionState {
    private static _cursorTracker: NotesCursorTracker | null = null;

    static setCursorTracker(tracker: NotesCursorTracker): void {
        this._cursorTracker = tracker;
    }

    static getCursorTracker(): NotesCursorTracker | null {
        return this._cursorTracker;
    }

    static reset(): void {
        this._cursorTracker = null;
    }
}

export { ExtensionState };
