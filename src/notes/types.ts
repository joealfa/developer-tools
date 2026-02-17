/**
 * Notes feature type definitions
 */

/**
 * Note category types for classification
 */
export type NoteCategory = 'note' | 'todo' | 'fixme' | 'question';

/**
 * Note status indicating its validity state
 */
export type NoteStatus = 'active' | 'orphaned';

/**
 * Storage type for notes persistence
 */
export type StorageType = 'workspaceState' | 'file';

/**
 * Surrounding context for fuzzy line matching when content changes
 */
export interface SurroundingContext {
    /** Content of the line before the noted line */
    lineBefore?: string;
    /** Content of the line after the noted line */
    lineAfter?: string;
}

/**
 * Main Note interface representing a single note attached to a line
 */
export interface Note {
    /** Unique identifier (UUID) */
    id: string;
    /** Relative file path from workspace root */
    filePath: string;
    /** 0-based line number */
    lineNumber: number;
    /** Content of the line when note was created */
    lineContent: string;
    /** Hash of line content for quick comparison */
    lineContentHash: string;
    /** Surrounding lines for fuzzy matching */
    surroundingContext: SurroundingContext;
    /** The actual note text */
    text: string;
    /** Note category */
    category: NoteCategory;
    /** Note status */
    status: NoteStatus;
    /** ISO timestamp when created */
    createdAt: string;
    /** ISO timestamp when last updated */
    updatedAt: string;
}

/**
 * Storage data wrapper with versioning for migrations
 */
export interface NotesStorageData {
    /** Schema version for migrations */
    version: number;
    /** Current storage type */
    storageType: StorageType;
    /** Array of all notes */
    notes: Note[];
}

/**
 * Storage statistics for monitoring usage
 */
export interface StorageStats {
    /** Current size in bytes */
    size: number;
    /** Maximum size limit in bytes */
    limit: number;
    /** Usage percentage (0-100) */
    percentage: number;
    /** Current storage type being used */
    storageType: StorageType;
}

/**
 * Options for creating a new note
 */
export interface CreateNoteOptions {
    /** Relative file path */
    filePath: string;
    /** Line number (0-based) */
    lineNumber: number;
    /** Content of the line */
    lineContent: string;
    /** Note text */
    text: string;
    /** Note category (defaults to 'note') */
    category?: NoteCategory;
    /** Surrounding context for fuzzy matching */
    surroundingContext?: SurroundingContext;
}

/**
 * Options for updating an existing note
 */
export interface UpdateNoteOptions {
    /** Updated note text */
    text?: string;
    /** Updated category */
    category?: NoteCategory;
    /** Updated status */
    status?: NoteStatus;
    /** Updated line number (for re-anchoring) */
    lineNumber?: number;
    /** Updated line content */
    lineContent?: string;
    /** Updated surrounding context */
    surroundingContext?: SurroundingContext;
}

/**
 * Filter options for querying notes
 */
export interface NotesFilter {
    /** Filter by file path */
    filePath?: string;
    /** Filter by category */
    category?: NoteCategory;
    /** Filter by status */
    status?: NoteStatus;
    /** Search text in note content */
    searchText?: string;
}

/**
 * Grouping options for notes display
 */
export type NotesGroupBy = 'file' | 'category' | 'status' | 'none';

/**
 * Event data emitted when notes change
 */
export interface NotesChangeEvent {
    /** Type of change */
    type: 'created' | 'updated' | 'deleted' | 'bulk-deleted' | 'bulk-updated' | 'reloaded';
    /** Affected note IDs */
    noteIds: string[];
    /** Affected file paths */
    filePaths: string[];
}

/**
 * Storage warning event data
 */
export interface StorageWarningEvent {
    /** Warning level */
    level: 'warning' | 'critical';
    /** Current storage stats */
    stats: StorageStats;
    /** Human-readable message */
    message: string;
}

/**
 * Current storage schema version
 */
export const STORAGE_VERSION = 1;

/**
 * Storage limits (in bytes)
 */
export const STORAGE_LIMITS = {
    /** Maximum size for workspaceState (~5MB) */
    WORKSPACE_STATE_MAX: 5 * 1024 * 1024,
    /** Warning threshold (80%) */
    WARNING_THRESHOLD: 0.8,
    /** Critical threshold for auto-migration (95%) */
    CRITICAL_THRESHOLD: 0.95,
} as const;

/**
 * Storage keys
 */
export const STORAGE_KEYS = {
    /** Key for notes data in workspaceState */
    NOTES_DATA: 'developer-tools.notes',
    /** Key for storage type preference */
    STORAGE_TYPE: 'developer-tools.notes.storageType',
} as const;

/**
 * File paths for file-based storage
 */
export const STORAGE_FILES = {
    /** Primary notes file */
    NOTES_FILE: '.vscode/notes.json',
    /** Backup file */
    BACKUP_FILE: '.vscode/notes-backup.json',
} as const;

/**
 * Category display configuration
 */
export const CATEGORY_CONFIG: Record<NoteCategory, { label: string; color: string; svgIconKey: string }> = {
    note: { label: 'Note', color: '#3794ff', svgIconKey: 'notepadText' },
    todo: { label: 'ToDo', color: '#f9a825', svgIconKey: 'listTodo' },
    fixme: { label: 'FixMe', color: '#f44336', svgIconKey: 'locateFixed' },
    question: { label: 'Question', color: '#9c27b0', svgIconKey: 'fileQuestion' },
} as const;

/**
 * Status display configuration
 */
export const STATUS_CONFIG: Record<NoteStatus, { label: string; color: string; svgIconKey: string }> = {
    active: { label: 'Active', color: '#4caf50', svgIconKey: 'badgeCheck' },
    orphaned: { label: 'Orphaned', color: '#ff9800', svgIconKey: 'badgeAlert' },
} as const;
