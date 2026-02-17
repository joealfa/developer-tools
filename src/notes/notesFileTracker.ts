/**
 * Notes File Tracker - Handles file renames and deletions
 * Maintains note integrity when files are moved, renamed, or deleted
 */

import * as vscode from 'vscode';
import { NotesService } from './notesService';
import { getRelativePath } from '../utils';

/**
 * Tracks file system changes and updates notes accordingly
 */
export class NotesFileTracker implements vscode.Disposable {
    private notesService: NotesService;
    private disposables: vscode.Disposable[] = [];

    constructor(notesService: NotesService) {
        this.notesService = notesService;
        this.registerListeners();
    }

    private registerListeners(): void {
        // Listen to file renames
        this.disposables.push(
            vscode.workspace.onDidRenameFiles(this.handleFileRename.bind(this))
        );

        // Listen to file deletions
        this.disposables.push(
            vscode.workspace.onDidDeleteFiles(this.handleFileDelete.bind(this))
        );
    }

    /**
     * Handle file rename events
     */
    private async handleFileRename(event: vscode.FileRenameEvent): Promise<void> {
        const pathUpdates: Array<{ oldPath: string; newPath: string }> = [];

        for (const { oldUri, newUri } of event.files) {
            const oldPath = getRelativePath(oldUri);
            const newPath = getRelativePath(newUri);

            if (!oldPath || !newPath) {
                continue;
            }

            // Check if this is a directory rename
            const isDirectory = await this.isDirectory(newUri);

            if (isDirectory) {
                // Handle folder rename - update all nested file paths
                const allNotes = this.notesService.getAll();
                for (const note of allNotes) {
                    if (note.filePath.startsWith(oldPath + '/') || note.filePath === oldPath) {
                        const updatedPath = newPath + note.filePath.slice(oldPath.length);
                        pathUpdates.push({ oldPath: note.filePath, newPath: updatedPath });
                    }
                }
            } else {
                // Handle single file rename
                const notesForFile = this.notesService.getByFile(oldPath);
                if (notesForFile.length > 0) {
                    pathUpdates.push({ oldPath, newPath });
                }
            }
        }

        // Apply all path updates in batch
        for (const { oldPath, newPath } of pathUpdates) {
            await this.notesService.updateFilePath(oldPath, newPath);
        }
    }

    /**
     * Handle file delete events
     */
    private async handleFileDelete(event: vscode.FileDeleteEvent): Promise<void> {
        const pathsToDelete: string[] = [];

        for (const uri of event.files) {
            const filePath = getRelativePath(uri);
            if (!filePath) {
                continue;
            }

            // Check if we have notes for this path
            const notesForFile = this.notesService.getByFile(filePath);
            if (notesForFile.length > 0) {
                pathsToDelete.push(filePath);
            }

            // Also check for nested files if this might be a directory
            // (We can't check isDirectory after deletion, so check for notes with path prefix)
            const allNotes = this.notesService.getAll();
            for (const note of allNotes) {
                if (note.filePath.startsWith(filePath + '/')) {
                    if (!pathsToDelete.includes(note.filePath)) {
                        pathsToDelete.push(note.filePath);
                    }
                }
            }
        }

        // Delete notes for all affected files
        for (const filePath of pathsToDelete) {
            await this.notesService.deleteByFile(filePath);
        }
    }

    /**
     * Check if a URI points to a directory
     */
    private async isDirectory(uri: vscode.Uri): Promise<boolean> {
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            return stat.type === vscode.FileType.Directory;
        } catch {
            return false;
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
