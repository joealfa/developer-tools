/**
 * Notes Workspace Tracker - Handles workspace folder changes
 * Manages notes when workspace folders are added or removed
 */

import * as vscode from 'vscode';
import { NotesService } from './notesService';

/**
 * Tracks workspace folder changes and manages notes accordingly
 */
export class NotesWorkspaceTracker implements vscode.Disposable {
    private notesService: NotesService;
    private disposables: vscode.Disposable[] = [];

    constructor(notesService: NotesService) {
        this.notesService = notesService;
        this.registerListeners();
    }

    private registerListeners(): void {
        // Listen to workspace folder changes
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(
                this.handleWorkspaceFoldersChange.bind(this)
            )
        );
    }

    /**
     * Handle workspace folder changes
     */
    private async handleWorkspaceFoldersChange(
        event: vscode.WorkspaceFoldersChangeEvent
    ): Promise<void> {
        // Handle added folders
        for (const folder of event.added) {
            await this.handleFolderAdded(folder);
        }

        // Handle removed folders
        for (const folder of event.removed) {
            await this.handleFolderRemoved(folder);
        }
    }

    /**
     * Handle when a folder is added to the workspace
     */
    private async handleFolderAdded(folder: vscode.WorkspaceFolder): Promise<void> {
        // Check if there are existing notes in file storage
        const notesFileUri = vscode.Uri.joinPath(folder.uri, '.vscode', 'notes.json');
        
        try {
            await vscode.workspace.fs.stat(notesFileUri);
            
            // Notes file exists - ask user if they want to import
            const action = await vscode.window.showInformationMessage(
                `Found existing notes in "${folder.name}". Would you like to import them?`,
                'Import',
                'Ignore'
            );

            if (action === 'Import') {
                // Trigger import through export service
                await vscode.commands.executeCommand('developer-tools.importNotes');
            }
        } catch {
            // No notes file exists - nothing to do
        }
    }

    /**
     * Handle when a folder is removed from the workspace
     */
    private async handleFolderRemoved(folder: vscode.WorkspaceFolder): Promise<void> {
        // Get all notes that belong to this folder
        const allNotes = this.notesService.getAll();
        const folderPath = vscode.workspace.asRelativePath(folder.uri, false);
        
        // Filter notes that belong to files in this folder
        const affectedNotes = allNotes.filter(note => 
            note.filePath.startsWith(folderPath + '/') || 
            note.filePath === folderPath
        );

        if (affectedNotes.length > 0) {
            const action = await vscode.window.showWarningMessage(
                `The folder "${folder.name}" has ${affectedNotes.length} note(s). What would you like to do?`,
                'Export & Keep',
                'Delete Notes',
                'Keep in Storage'
            );

            switch (action) {
                case 'Export & Keep':
                    // Export notes before potentially losing access
                    await this.notesService.backup();
                    vscode.window.showInformationMessage(
                        'Notes have been backed up to .vscode/notes-backup.json'
                    );
                    break;

                case 'Delete Notes':
                    // Delete all notes for this folder
                    const ids = affectedNotes.map(n => n.id);
                    await this.notesService.bulkDelete(ids);
                    vscode.window.showInformationMessage(
                        `Deleted ${ids.length} note(s) from removed folder.`
                    );
                    break;

                case 'Keep in Storage':
                default:
                    // Notes remain in storage - will be available if folder is re-added
                    vscode.window.showInformationMessage(
                        'Notes will remain in storage. They will be available if the folder is added again.'
                    );
                    break;
            }
        }
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
