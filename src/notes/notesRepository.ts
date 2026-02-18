/**
 * Notes Repository - File-based storage in .vscode/notes/
 * Migrates from workspaceState on first use
 */

import * as vscode from 'vscode';
import {
    Note,
    NotesStorageData,
    STORAGE_VERSION,
    STORAGE_KEYS,
    STORAGE_FILES,
} from './types';

export class NotesRepository {
    private context: vscode.ExtensionContext;
    private debounceTimer: NodeJS.Timeout | undefined;
    private pendingSave: Note[] | null = null;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Initialize the repository, ensure directory, and migrate from workspaceState if needed
     */
    async initialize(): Promise<void> {
        await this.ensureDirectory();
        await this.migrateFromWorkspaceState();
        await this.migrateFromOldFileLocation();
    }

    /**
     * Load all notes from .vscode/notes/notes.json
     */
    async load(): Promise<Note[]> {
        try {
            return await this.loadFromFile();
        } catch (error) {
            console.error('[NotesRepository] Failed to load notes:', error);
            return [];
        }
    }

    /**
     * Save notes with debouncing
     */
    async save(notes: Note[]): Promise<void> {
        this.pendingSave = notes;

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        return new Promise((resolve, reject) => {
            this.debounceTimer = setTimeout(async () => {
                try {
                    await this.saveImmediate(this.pendingSave!);
                    this.pendingSave = null;
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }, 500);
        });
    }

    /**
     * Save notes immediately without debouncing
     */
    async saveImmediate(notes: Note[]): Promise<void> {
        try {
            const data: NotesStorageData = {
                version: STORAGE_VERSION,
                notes,
            };
            await this.saveToFile(data);
        } catch (error) {
            console.error('[NotesRepository] Failed to save notes:', error);
            throw error;
        }
    }

    /**
     * Create a backup
     */
    async backup(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) { return; }

        const sourceUri = vscode.Uri.joinPath(workspaceFolders[0].uri, STORAGE_FILES.NOTES_FILE);
        const backupUri = vscode.Uri.joinPath(workspaceFolders[0].uri, STORAGE_FILES.BACKUP_FILE);

        try {
            const content = await vscode.workspace.fs.readFile(sourceUri);
            await vscode.workspace.fs.writeFile(backupUri, content);
        } catch {
            // Source file may not exist yet
        }
    }

    // Private methods

    private async loadFromFile(): Promise<Note[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) { return []; }

        const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, STORAGE_FILES.NOTES_FILE);

        try {
            const content = await vscode.workspace.fs.readFile(fileUri);
            const data: NotesStorageData = JSON.parse(content.toString());
            return data.notes;
        } catch {
            return [];
        }
    }

    private async saveToFile(data: NotesStorageData): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('No workspace folder available for file storage');
        }

        await this.ensureDirectory();

        const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, STORAGE_FILES.NOTES_FILE);
        const content = JSON.stringify(data, null, 2);
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
    }

    private async ensureDirectory(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) { return; }

        const notesDir = vscode.Uri.joinPath(workspaceFolders[0].uri, STORAGE_FILES.NOTES_DIR);
        try {
            await vscode.workspace.fs.stat(notesDir);
        } catch {
            // Ensure .vscode exists first
            const vscodeDir = vscode.Uri.joinPath(workspaceFolders[0].uri, '.vscode');
            try {
                await vscode.workspace.fs.stat(vscodeDir);
            } catch {
                await vscode.workspace.fs.createDirectory(vscodeDir);
            }
            await vscode.workspace.fs.createDirectory(notesDir);
        }
    }

    /**
     * One-time migration from workspaceState to file
     */
    private async migrateFromWorkspaceState(): Promise<void> {
        const oldData = this.context.workspaceState.get<{ notes?: Note[]; version?: number; storageType?: string }>(STORAGE_KEYS.NOTES_DATA);

        if (!oldData?.notes || oldData.notes.length === 0) { return; }

        // Check if we already have file-based notes
        const existingNotes = await this.loadFromFile();
        if (existingNotes.length > 0) {
            // Already migrated, just clear workspaceState
            await this.context.workspaceState.update(STORAGE_KEYS.NOTES_DATA, undefined);
            return;
        }

        // Migrate
        await this.saveImmediate(oldData.notes);
        await this.context.workspaceState.update(STORAGE_KEYS.NOTES_DATA, undefined);
        await this.context.workspaceState.update('developer-tools.notes.storageType', undefined);
        vscode.window.showInformationMessage('Notes have been migrated to .vscode/notes/');
    }

    /**
     * Migrate from old .vscode/notes.json to new .vscode/notes/notes.json
     */
    private async migrateFromOldFileLocation(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) { return; }

        const oldFileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.vscode/notes.json');

        try {
            const content = await vscode.workspace.fs.readFile(oldFileUri);
            const data = JSON.parse(content.toString());
            const notes: Note[] = data.notes ?? data;

            // Check if new location already has notes
            const existingNotes = await this.loadFromFile();
            if (existingNotes.length === 0 && notes.length > 0) {
                await this.saveImmediate(notes);
            }

            // Delete old file
            await vscode.workspace.fs.delete(oldFileUri);
        } catch {
            // Old file doesn't exist, nothing to migrate
        }
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        if (this.pendingSave) {
            this.saveImmediate(this.pendingSave).catch(console.error);
        }
    }
}
