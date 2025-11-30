/**
 * Notes Repository - Storage abstraction layer
 * Handles persistence with dual storage strategy (workspaceState + file fallback)
 */

import * as vscode from 'vscode';
import {
    Note,
    NotesStorageData,
    StorageStats,
    StorageType,
    STORAGE_VERSION,
    STORAGE_LIMITS,
    STORAGE_KEYS,
    STORAGE_FILES,
} from './types';

/**
 * Repository for notes storage operations
 * Supports workspaceState as primary storage with automatic file-based fallback
 */
export class NotesRepository {
    private context: vscode.ExtensionContext;
    private currentStorageType: StorageType = 'workspaceState';
    private debounceTimer: NodeJS.Timeout | undefined;
    private pendingSave: Note[] | null = null;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Initialize the repository and determine storage type
     */
    async initialize(): Promise<void> {
        // Check if we have existing file-based storage
        const fileStorageExists = await this.fileStorageExists();
        const workspaceData = this.context.workspaceState.get<NotesStorageData>(STORAGE_KEYS.NOTES_DATA);

        if (fileStorageExists && !workspaceData) {
            // File storage exists but no workspace state - use file
            this.currentStorageType = 'file';
        } else if (workspaceData?.storageType === 'file') {
            // Previously migrated to file storage
            this.currentStorageType = 'file';
        } else {
            this.currentStorageType = 'workspaceState';
        }
    }

    /**
     * Load all notes from storage
     */
    async load(): Promise<Note[]> {
        try {
            if (this.currentStorageType === 'file') {
                return await this.loadFromFile();
            } else {
                return this.loadFromWorkspaceState();
            }
        } catch (error) {
            console.error('[NotesRepository] Failed to load notes:', error);
            return [];
        }
    }

    /**
     * Save notes to storage with debouncing
     */
    async save(notes: Note[]): Promise<void> {
        this.pendingSave = notes;

        // Clear existing debounce timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // Debounce save operations (500ms)
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
                storageType: this.currentStorageType,
                notes,
            };

            if (this.currentStorageType === 'file') {
                await this.saveToFile(data);
            } else {
                // Check if we need to migrate to file storage
                const stats = this.calculateStorageStats(data);
                
                if (stats.percentage >= STORAGE_LIMITS.CRITICAL_THRESHOLD * 100) {
                    // Auto-migrate to file storage
                    await this.migrateToFileStorage(data);
                } else {
                    await this.saveToWorkspaceState(data);
                }
            }
        } catch (error) {
            console.error('[NotesRepository] Failed to save notes:', error);
            throw error;
        }
    }

    /**
     * Get current storage statistics
     */
    getStorageStats(notes?: Note[]): StorageStats {
        const data: NotesStorageData = {
            version: STORAGE_VERSION,
            storageType: this.currentStorageType,
            notes: notes ?? [],
        };
        return this.calculateStorageStats(data);
    }

    /**
     * Get current storage type
     */
    getStorageType(): StorageType {
        return this.currentStorageType;
    }

    /**
     * Migrate storage to file-based storage
     */
    async migrateToFileStorage(data?: NotesStorageData): Promise<void> {
        const storageData = data ?? {
            version: STORAGE_VERSION,
            storageType: 'file' as StorageType,
            notes: await this.load(),
        };

        storageData.storageType = 'file';
        await this.saveToFile(storageData);
        
        // Update workspace state to indicate file storage
        await this.context.workspaceState.update(STORAGE_KEYS.NOTES_DATA, {
            version: STORAGE_VERSION,
            storageType: 'file',
            notes: [], // Clear notes from workspace state
        });

        this.currentStorageType = 'file';
    }

    /**
     * Migrate storage back to workspace state (if size allows)
     */
    async migrateToWorkspaceState(): Promise<boolean> {
        const notes = await this.load();
        const testData: NotesStorageData = {
            version: STORAGE_VERSION,
            storageType: 'workspaceState',
            notes,
        };

        const stats = this.calculateStorageStats(testData);
        if (stats.percentage >= STORAGE_LIMITS.WARNING_THRESHOLD * 100) {
            // Too large to migrate back
            return false;
        }

        await this.saveToWorkspaceState(testData);
        this.currentStorageType = 'workspaceState';
        return true;
    }

    /**
     * Create a backup of current notes
     */
    async backup(): Promise<void> {
        const notes = await this.load();
        const data: NotesStorageData = {
            version: STORAGE_VERSION,
            storageType: 'file',
            notes,
        };

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        const backupUri = vscode.Uri.joinPath(
            workspaceFolders[0].uri,
            STORAGE_FILES.BACKUP_FILE
        );

        const content = JSON.stringify(data, null, 2);
        await vscode.workspace.fs.writeFile(backupUri, Buffer.from(content, 'utf-8'));
    }

    /**
     * Check if storage warning should be shown
     */
    shouldShowWarning(notes: Note[]): { show: boolean; level: 'warning' | 'critical'; stats: StorageStats } {
        const stats = this.getStorageStats(notes);
        
        if (stats.percentage >= STORAGE_LIMITS.CRITICAL_THRESHOLD * 100) {
            return { show: true, level: 'critical', stats };
        }
        
        if (stats.percentage >= STORAGE_LIMITS.WARNING_THRESHOLD * 100) {
            return { show: true, level: 'warning', stats };
        }

        return { show: false, level: 'warning', stats };
    }

    // Private methods

    private loadFromWorkspaceState(): Note[] {
        const data = this.context.workspaceState.get<NotesStorageData>(STORAGE_KEYS.NOTES_DATA);
        if (!data) {
            return [];
        }

        // Handle migrations if needed
        if (data.version < STORAGE_VERSION) {
            return this.migrateData(data);
        }

        return data.notes;
    }

    private async loadFromFile(): Promise<Note[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return [];
        }

        const fileUri = vscode.Uri.joinPath(
            workspaceFolders[0].uri,
            STORAGE_FILES.NOTES_FILE
        );

        try {
            const content = await vscode.workspace.fs.readFile(fileUri);
            const data: NotesStorageData = JSON.parse(content.toString());

            // Handle migrations if needed
            if (data.version < STORAGE_VERSION) {
                return this.migrateData(data);
            }

            return data.notes;
        } catch {
            return [];
        }
    }

    private async saveToWorkspaceState(data: NotesStorageData): Promise<void> {
        await this.context.workspaceState.update(STORAGE_KEYS.NOTES_DATA, data);
    }

    private async saveToFile(data: NotesStorageData): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('No workspace folder available for file storage');
        }

        // Ensure .vscode directory exists
        const vscodeDir = vscode.Uri.joinPath(workspaceFolders[0].uri, '.vscode');
        try {
            await vscode.workspace.fs.stat(vscodeDir);
        } catch {
            await vscode.workspace.fs.createDirectory(vscodeDir);
        }

        const fileUri = vscode.Uri.joinPath(
            workspaceFolders[0].uri,
            STORAGE_FILES.NOTES_FILE
        );

        const content = JSON.stringify(data, null, 2);
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
    }

    private async fileStorageExists(): Promise<boolean> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return false;
        }

        const fileUri = vscode.Uri.joinPath(
            workspaceFolders[0].uri,
            STORAGE_FILES.NOTES_FILE
        );

        try {
            await vscode.workspace.fs.stat(fileUri);
            return true;
        } catch {
            return false;
        }
    }

    private calculateStorageStats(data: NotesStorageData): StorageStats {
        const jsonString = JSON.stringify(data);
        const size = Buffer.byteLength(jsonString, 'utf-8');
        const limit = STORAGE_LIMITS.WORKSPACE_STATE_MAX;
        const percentage = (size / limit) * 100;

        return {
            size,
            limit,
            percentage,
            storageType: this.currentStorageType,
        };
    }

    private migrateData(data: NotesStorageData): Note[] {
        // Future: Add migration logic when schema changes
        // For now, just return notes as-is
        return data.notes;
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        // Save any pending changes immediately
        if (this.pendingSave) {
            this.saveImmediate(this.pendingSave).catch(console.error);
        }
    }
}
