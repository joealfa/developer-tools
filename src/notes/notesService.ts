/**
 * Notes Service - Business logic and CRUD operations
 * Singleton service for managing notes with event-based notifications
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import {
    Note,
    CreateNoteOptions,
    UpdateNoteOptions,
    NotesFilter,
    NotesChangeEvent,
} from './types';
import { NotesRepository } from './notesRepository';

/**
 * Service for managing notes with CRUD operations
 */
export class NotesService implements vscode.Disposable {
    private static instance: NotesService | null = null;
    private repository: NotesRepository;
    private notes: Map<string, Note> = new Map();
    private initialized: boolean = false;

    // Event emitters
    private readonly _onDidChangeNotes = new vscode.EventEmitter<NotesChangeEvent>();

    /** Event fired when notes change */
    public readonly onDidChangeNotes = this._onDidChangeNotes.event;

    private constructor(context: vscode.ExtensionContext) {
        this.repository = new NotesRepository(context);
    }

    /**
     * Get the singleton instance of NotesService
     */
    static getInstance(context?: vscode.ExtensionContext): NotesService {
        if (!NotesService.instance) {
            if (!context) {
                throw new Error('NotesService must be initialized with context first');
            }
            NotesService.instance = new NotesService(context);
        }
        return NotesService.instance;
    }

    /**
     * Reset the singleton instance (for testing)
     */
    static resetInstance(): void {
        if (NotesService.instance) {
            NotesService.instance.dispose();
            NotesService.instance = null;
        }
    }

    /**
     * Initialize the service and load notes from storage
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        await this.repository.initialize();
        const notes = await this.repository.load();

        this.notes.clear();
        for (const note of notes) {
            this.notes.set(note.id, note);
        }

        this.initialized = true;
        this._onDidChangeNotes.fire({
            type: 'reloaded',
            noteIds: Array.from(this.notes.keys()),
            filePaths: this.getUniqueFilePaths(),
        });
    }

    /**
     * Create a new note
     */
    async create(options: CreateNoteOptions): Promise<Note> {
        const now = new Date().toISOString();
        const note: Note = {
            id: crypto.randomUUID(),
            filePath: options.filePath,
            lineNumber: options.lineNumber,
            lineContent: options.lineContent,
            lineContentHash: this.hashContent(options.lineContent),
            surroundingContext: options.surroundingContext ?? {},
            text: options.text,
            category: options.category ?? 'note',
            status: 'active',
            createdAt: now,
            updatedAt: now,
        };

        this.notes.set(note.id, note);
        await this.saveAndNotify('created', [note.id], [note.filePath]);

        return note;
    }

    /**
     * Get a note by ID
     */
    getById(id: string): Note | undefined {
        return this.notes.get(id);
    }

    /**
     * Get all notes for a specific file
     */
    getByFile(filePath: string): Note[] {
        return Array.from(this.notes.values())
            .filter(note => note.filePath === filePath)
            .sort((a, b) => a.lineNumber - b.lineNumber);
    }

    /**
     * Get notes for a specific line in a file
     */
    getByLine(filePath: string, lineNumber: number): Note[] {
        return Array.from(this.notes.values())
            .filter(note => note.filePath === filePath && note.lineNumber === lineNumber);
    }

    /**
     * Get all notes
     */
    getAll(): Note[] {
        return Array.from(this.notes.values())
            .sort((a, b) => {
                const fileCompare = a.filePath.localeCompare(b.filePath);
                if (fileCompare !== 0) {
                    return fileCompare;
                }
                return a.lineNumber - b.lineNumber;
            });
    }

    /**
     * Get notes with filtering
     */
    getFiltered(filter: NotesFilter): Note[] {
        let notes = Array.from(this.notes.values());

        if (filter.filePath) {
            notes = notes.filter(n => n.filePath === filter.filePath);
        }

        if (filter.category) {
            notes = notes.filter(n => n.category === filter.category);
        }

        if (filter.status) {
            notes = notes.filter(n => n.status === filter.status);
        }

        if (filter.searchText) {
            const search = filter.searchText.toLowerCase();
            notes = notes.filter(n =>
                n.text.toLowerCase().includes(search) ||
                n.lineContent.toLowerCase().includes(search) ||
                n.filePath.toLowerCase().includes(search)
            );
        }

        return notes.sort((a, b) => {
            const fileCompare = a.filePath.localeCompare(b.filePath);
            if (fileCompare !== 0) {
                return fileCompare;
            }
            return a.lineNumber - b.lineNumber;
        });
    }

    /**
     * Update an existing note
     */
    async update(id: string, options: UpdateNoteOptions): Promise<Note | undefined> {
        const note = this.notes.get(id);
        if (!note) {
            return undefined;
        }

        const updatedNote: Note = {
            ...note,
            ...options,
            updatedAt: new Date().toISOString(),
        };

        if (options.lineContent) {
            updatedNote.lineContentHash = this.hashContent(options.lineContent);
        }

        this.notes.set(id, updatedNote);
        await this.saveAndNotify('updated', [id], [updatedNote.filePath]);

        return updatedNote;
    }

    /**
     * Delete a note by ID
     */
    async delete(id: string): Promise<boolean> {
        const note = this.notes.get(id);
        if (!note) {
            return false;
        }

        this.notes.delete(id);
        await this.saveAndNotify('deleted', [id], [note.filePath]);

        return true;
    }

    /**
     * Bulk delete notes by IDs
     */
    async bulkDelete(ids: string[]): Promise<number> {
        const deletedIds: string[] = [];
        const filePaths = new Set<string>();

        for (const id of ids) {
            const note = this.notes.get(id);
            if (note) {
                this.notes.delete(id);
                deletedIds.push(id);
                filePaths.add(note.filePath);
            }
        }

        if (deletedIds.length > 0) {
            await this.saveAndNotify('bulk-deleted', deletedIds, Array.from(filePaths));
        }

        return deletedIds.length;
    }

    /**
     * Bulk update notes
     */
    async bulkUpdate(updates: Array<{ id: string; options: UpdateNoteOptions }>): Promise<number> {
        const updatedIds: string[] = [];
        const filePaths = new Set<string>();

        for (const { id, options } of updates) {
            const note = this.notes.get(id);
            if (note) {
                const updatedNote: Note = {
                    ...note,
                    ...options,
                    updatedAt: new Date().toISOString(),
                };

                if (options.lineContent) {
                    updatedNote.lineContentHash = this.hashContent(options.lineContent);
                }

                this.notes.set(id, updatedNote);
                updatedIds.push(id);
                filePaths.add(updatedNote.filePath);
            }
        }

        if (updatedIds.length > 0) {
            await this.saveAndNotify('bulk-updated', updatedIds, Array.from(filePaths));
        }

        return updatedIds.length;
    }

    /**
     * Delete all notes for a file
     */
    async deleteByFile(filePath: string): Promise<number> {
        const notesToDelete = this.getByFile(filePath);
        const ids = notesToDelete.map(n => n.id);
        return this.bulkDelete(ids);
    }

    /**
     * Update file paths when a file is renamed
     */
    async updateFilePath(oldPath: string, newPath: string): Promise<number> {
        const notes = this.getByFile(oldPath);

        for (const note of notes) {
            const existing = this.notes.get(note.id);
            if (existing) {
                existing.filePath = newPath;
                existing.updatedAt = new Date().toISOString();
            }
        }

        if (notes.length > 0) {
            await this.saveAndNotify('bulk-updated', notes.map(n => n.id), [oldPath, newPath]);
        }

        return notes.length;
    }

    /**
     * Mark a note as orphaned
     */
    async markOrphaned(id: string): Promise<Note | undefined> {
        return this.update(id, { status: 'orphaned' });
    }

    /**
     * Re-anchor an orphaned note to a new line
     */
    async reanchor(id: string, lineNumber: number, lineContent: string, surroundingContext?: { lineBefore?: string; lineAfter?: string }): Promise<Note | undefined> {
        return this.update(id, {
            lineNumber,
            lineContent,
            surroundingContext,
            status: 'active',
        });
    }

    /**
     * Adjust line numbers when document changes
     */
    async adjustLineNumbers(filePath: string, startLine: number, delta: number): Promise<void> {
        const notes = this.getByFile(filePath);
        const updates: Array<{ id: string; options: UpdateNoteOptions }> = [];

        for (const note of notes) {
            if (note.lineNumber >= startLine) {
                const newLineNumber = note.lineNumber + delta;
                if (newLineNumber >= 0) {
                    updates.push({
                        id: note.id,
                        options: { lineNumber: newLineNumber },
                    });
                }
            }
        }

        if (updates.length > 0) {
            await this.bulkUpdate(updates);
        }
    }

    /**
     * Create a backup of notes
     */
    async backup(): Promise<void> {
        await this.repository.backup();
    }

    /**
     * Get count of notes
     */
    get count(): number {
        return this.notes.size;
    }

    /**
     * Check if there are notes for a specific line
     */
    hasNotesForLine(filePath: string, lineNumber: number): boolean {
        return this.getByLine(filePath, lineNumber).length > 0;
    }

    // Private methods

    private async saveAndNotify(
        type: NotesChangeEvent['type'],
        noteIds: string[],
        filePaths: string[]
    ): Promise<void> {
        const notes = Array.from(this.notes.values());
        await this.repository.save(notes);

        this._onDidChangeNotes.fire({
            type,
            noteIds,
            filePaths,
        });
    }

    private getUniqueFilePaths(): string[] {
        const paths = new Set<string>();
        for (const note of this.notes.values()) {
            paths.add(note.filePath);
        }
        return Array.from(paths);
    }

    private hashContent(content: string): string {
        return crypto.createHash('md5').update(content).digest('hex');
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this._onDidChangeNotes.dispose();
        this.repository.dispose();
    }
}
