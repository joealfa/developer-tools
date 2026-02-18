/**
 * Notes Export Service - Import/Export functionality
 * Enables sharing notes via version control
 */

import * as vscode from 'vscode';
import { NotesService } from './notesService';
import { Note, NotesStorageData, STORAGE_VERSION } from './types';

/**
 * Service for importing and exporting notes
 */
export class NotesExportService implements vscode.Disposable {
    private notesService: NotesService;
    private disposables: vscode.Disposable[] = [];
    private autoExportEnabled: boolean = false;

    constructor(notesService: NotesService) {
        this.notesService = notesService;
        this.loadSettings();
        this.registerListeners();
    }

    /**
     * Load settings from configuration
     */
    private loadSettings(): void {
        const config = vscode.workspace.getConfiguration('developer-tools.notes');
        this.autoExportEnabled = config.get<boolean>('autoExport', false);
    }

    /**
     * Register event listeners
     */
    private registerListeners(): void {
        // Listen to configuration changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration('developer-tools.notes.autoExport')) {
                    this.loadSettings();
                }
            })
        );

        // Auto-export on notes change if enabled
        this.disposables.push(
            this.notesService.onDidChangeNotes(async (event) => {
                if (this.autoExportEnabled && event.type !== 'reloaded') {
                    await this.exportNotes(true); // Silent export
                }
            })
        );
    }

    /**
     * Export notes to .vscode/notes.json
     */
    async exportNotes(silent: boolean = false): Promise<boolean> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            if (!silent) {
                vscode.window.showErrorMessage('No workspace folder available for export.');
            }
            return false;
        }

        try {
            const notes = this.notesService.getAll();
            
            if (notes.length === 0) {
                if (!silent) {
                    vscode.window.showInformationMessage('No notes to export.');
                }
                return false;
            }

            const data: NotesStorageData = {
                version: STORAGE_VERSION,
                notes,
            };

            // Ensure .vscode directory exists
            const vscodeDir = vscode.Uri.joinPath(workspaceFolders[0].uri, '.vscode');
            try {
                await vscode.workspace.fs.stat(vscodeDir);
            } catch {
                await vscode.workspace.fs.createDirectory(vscodeDir);
            }

            const exportUri = vscode.Uri.joinPath(vscodeDir, 'notes.json');
            const content = JSON.stringify(data, null, 2);
            await vscode.workspace.fs.writeFile(exportUri, Buffer.from(content, 'utf-8'));

            if (!silent) {
                const openAction = await vscode.window.showInformationMessage(
                    `Exported ${notes.length} note(s) to .vscode/notes.json`,
                    'Open File',
                    'Add to .gitignore'
                );

                if (openAction === 'Open File') {
                    const doc = await vscode.workspace.openTextDocument(exportUri);
                    await vscode.window.showTextDocument(doc);
                } else if (openAction === 'Add to .gitignore') {
                    await this.addToGitignore(workspaceFolders[0].uri);
                }
            }

            return true;
        } catch (error) {
            if (!silent) {
                vscode.window.showErrorMessage(`Failed to export notes: ${error}`);
            }
            return false;
        }
    }

    /**
     * Import notes from .vscode/notes.json
     */
    async importNotes(): Promise<boolean> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder available for import.');
            return false;
        }

        const importUri = vscode.Uri.joinPath(
            workspaceFolders[0].uri,
            '.vscode',
            'notes.json'
        );

        try {
            // Check if file exists
            await vscode.workspace.fs.stat(importUri);
        } catch {
            vscode.window.showErrorMessage('No notes.json file found in .vscode folder.');
            return false;
        }

        try {
            const content = await vscode.workspace.fs.readFile(importUri);
            const data: NotesStorageData = JSON.parse(content.toString());

            if (!data.notes || !Array.isArray(data.notes)) {
                vscode.window.showErrorMessage('Invalid notes file format.');
                return false;
            }

            const existingNotes = this.notesService.getAll();
            const existingIds = new Set(existingNotes.map(n => n.id));

            // Separate new notes from potential conflicts
            const newNotes: Note[] = [];
            const conflictNotes: Note[] = [];

            for (const note of data.notes) {
                if (existingIds.has(note.id)) {
                    conflictNotes.push(note);
                } else {
                    newNotes.push(note);
                }
            }

            // Handle conflicts
            let importConflicts = false;
            if (conflictNotes.length > 0) {
                const action = await vscode.window.showWarningMessage(
                    `Found ${conflictNotes.length} note(s) that already exist. How would you like to handle them?`,
                    'Skip Duplicates',
                    'Overwrite Existing',
                    'Cancel'
                );

                if (action === 'Cancel') {
                    return false;
                }

                importConflicts = action === 'Overwrite Existing';
            }

            // Import new notes
            let importedCount = 0;
            for (const note of newNotes) {
                await this.notesService.create({
                    filePath: note.filePath,
                    lineNumber: note.lineNumber,
                    lineContent: note.lineContent,
                    text: note.text,
                    category: note.category,
                    surroundingContext: note.surroundingContext,
                });
                importedCount++;
            }

            // Import conflict notes if user chose to overwrite
            if (importConflicts) {
                for (const note of conflictNotes) {
                    await this.notesService.update(note.id, {
                        text: note.text,
                        category: note.category,
                        status: note.status,
                        lineNumber: note.lineNumber,
                        lineContent: note.lineContent,
                        surroundingContext: note.surroundingContext,
                    });
                    importedCount++;
                }
            }

            vscode.window.showInformationMessage(
                `Imported ${importedCount} note(s).${conflictNotes.length > 0 && !importConflicts ? ` Skipped ${conflictNotes.length} duplicate(s).` : ''}`
            );

            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to import notes: ${error}`);
            return false;
        }
    }

    /**
     * Add notes.json to .gitignore
     */
    private async addToGitignore(workspaceFolderUri: vscode.Uri): Promise<void> {
        const gitignoreUri = vscode.Uri.joinPath(workspaceFolderUri, '.gitignore');
        const entry = '.vscode/notes.json';

        try {
            let content = '';
            
            try {
                const existing = await vscode.workspace.fs.readFile(gitignoreUri);
                content = existing.toString();
            } catch {
                // .gitignore doesn't exist
            }

            // Check if entry already exists
            if (content.includes(entry)) {
                vscode.window.showInformationMessage('notes.json is already in .gitignore');
                return;
            }

            // Add entry
            const newContent = content + (content.endsWith('\n') ? '' : '\n') + entry + '\n';
            await vscode.workspace.fs.writeFile(gitignoreUri, Buffer.from(newContent, 'utf-8'));
            
            vscode.window.showInformationMessage('Added notes.json to .gitignore');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to update .gitignore: ${error}`);
        }
    }

    /**
     * Enable auto-export
     */
    async enableAutoExport(): Promise<void> {
        const config = vscode.workspace.getConfiguration('developer-tools.notes');
        await config.update('autoExport', true, vscode.ConfigurationTarget.Workspace);
        this.autoExportEnabled = true;
        vscode.window.showInformationMessage('Auto-export enabled. Notes will be saved to .vscode/notes.json automatically.');
    }

    /**
     * Disable auto-export
     */
    async disableAutoExport(): Promise<void> {
        const config = vscode.workspace.getConfiguration('developer-tools.notes');
        await config.update('autoExport', false, vscode.ConfigurationTarget.Workspace);
        this.autoExportEnabled = false;
        vscode.window.showInformationMessage('Auto-export disabled.');
    }

    /**
     * Check if auto-export is enabled
     */
    isAutoExportEnabled(): boolean {
        return this.autoExportEnabled;
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}
