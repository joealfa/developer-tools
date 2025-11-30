/**
 * Notes module - Barrel exports
 * Re-exports all public APIs from notes modules
 */

// Types
export {
    Note,
    NoteCategory,
    NoteStatus,
    StorageType,
    SurroundingContext,
    NotesStorageData,
    StorageStats,
    CreateNoteOptions,
    UpdateNoteOptions,
    NotesFilter,
    NotesGroupBy,
    NotesChangeEvent,
    StorageWarningEvent,
    STORAGE_VERSION,
    STORAGE_LIMITS,
    STORAGE_KEYS,
    STORAGE_FILES,
    CATEGORY_CONFIG,
    STATUS_CONFIG,
} from './types';

// Services
export { NotesRepository } from './notesRepository';
export { NotesService } from './notesService';
export { NotesExportService } from './notesExportService';

// Trackers
export { NotesLineTracker } from './notesLineTracker';
export { NotesFileTracker } from './notesFileTracker';
export { NotesCursorTracker, PanelVisibilityCallback } from './notesCursorTracker';
export { NotesWorkspaceTracker } from './notesWorkspaceTracker';

// Decorations
export { NotesDecorations } from './notesDecorations';
