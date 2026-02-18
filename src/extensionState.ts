/**
 * Shared state for the extension
 * Used to share instances between modules without modifying the extension context
 */

import { NotesCursorTracker } from './notes';
import type { NoteEditorProvider } from './webviews/noteEditorProvider';
import type { PortService } from './ports/portService';
import type { ComplexityService } from './complexity/complexityService';

/**
 * Shared extension state
 */
class ExtensionState {
    private static _cursorTracker: NotesCursorTracker | null = null;
    private static _noteEditorProvider: NoteEditorProvider | null = null;
    private static _portService: PortService | null = null;
    private static _complexityService: ComplexityService | null = null;

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

    static setPortService(service: PortService): void {
        this._portService = service;
    }

    static getPortService(): PortService | null {
        return this._portService;
    }

    static setComplexityService(service: ComplexityService): void {
        this._complexityService = service;
    }

    static getComplexityService(): ComplexityService | null {
        return this._complexityService;
    }

    static reset(): void {
        this._cursorTracker = null;
        this._noteEditorProvider = null;
        this._portService = null;
        this._complexityService = null;
    }
}

export { ExtensionState };
