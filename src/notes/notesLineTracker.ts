/**
 * Notes Line Tracker - Handles document changes and line number adjustments
 * Tracks line insertions, deletions, and content changes to maintain note accuracy
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { NotesService } from './notesService';

/**
 * Tracks document changes and updates note line numbers accordingly
 */
export class NotesLineTracker implements vscode.Disposable {
    private notesService: NotesService;
    private disposables: vscode.Disposable[] = [];
    private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
    private pendingChanges: Map<string, vscode.TextDocumentContentChangeEvent[]> = new Map();

    constructor(notesService: NotesService) {
        this.notesService = notesService;
        this.registerListeners();
    }

    private registerListeners(): void {
        // Listen to document changes
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(this.handleDocumentChange.bind(this))
        );
    }

    private handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
        const document = event.document;

        // Skip non-file documents
        if (document.uri.scheme !== 'file') {
            return;
        }

        // Get relative file path
        const filePath = this.getRelativePath(document.uri);
        if (!filePath) {
            return;
        }

        // Check if we have notes for this file
        const fileNotes = this.notesService.getByFile(filePath);
        if (fileNotes.length === 0) {
            return;
        }

        // Accumulate changes for debouncing
        const existingChanges = this.pendingChanges.get(filePath) ?? [];
        existingChanges.push(...event.contentChanges);
        this.pendingChanges.set(filePath, existingChanges);

        // Clear existing debounce timer
        const existingTimer = this.debounceTimers.get(filePath);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Set new debounce timer (300ms)
        const timer = setTimeout(() => {
            this.processChanges(filePath, document);
        }, 300);
        this.debounceTimers.set(filePath, timer);
    }

    private async processChanges(filePath: string, document: vscode.TextDocument): Promise<void> {
        const changes = this.pendingChanges.get(filePath);
        if (!changes || changes.length === 0) {
            return;
        }

        // Clear pending changes
        this.pendingChanges.delete(filePath);
        this.debounceTimers.delete(filePath);

        // Sort changes by line number in reverse order (bottom to top)
        // This ensures line number adjustments don't affect each other
        const sortedChanges = [...changes].sort(
            (a, b) => b.range.start.line - a.range.start.line
        );

        // Get current notes for this file
        const notes = this.notesService.getByFile(filePath);
        const notesToDelete: string[] = [];
        const notesToUpdate: Array<{ id: string; lineNumber: number; needsVerification: boolean }> = [];
        const notesToOrphan: string[] = [];

        // Create a map of note line numbers for tracking
        const noteLineMap = new Map<number, typeof notes>();
        for (const note of notes) {
            const existing = noteLineMap.get(note.lineNumber) ?? [];
            existing.push(note);
            noteLineMap.set(note.lineNumber, existing);
        }

        // Process each change
        for (const change of sortedChanges) {
            const startLine = change.range.start.line;
            const endLine = change.range.end.line;
            const deletedLines = endLine - startLine;
            const addedLines = (change.text.match(/\n/g) || []).length;
            const lineDelta = addedLines - deletedLines;

            // Check if this is a pure line deletion
            const isPureDeletion = deletedLines > 0 && change.text === '';
            
            // Check if content was modified on a single line
            const isSingleLineEdit = deletedLines === 0 && addedLines === 0;

            // Process each note
            for (const [lineNum, lineNotes] of noteLineMap.entries()) {
                for (const note of lineNotes) {
                    // Skip already processed notes
                    if (notesToDelete.includes(note.id) || notesToOrphan.includes(note.id)) {
                        continue;
                    }

                    if (lineNum >= startLine && lineNum <= endLine) {
                        // Note is within the changed range
                        if (isPureDeletion) {
                            // Line was deleted - mark note for deletion
                            notesToDelete.push(note.id);
                        } else if (isSingleLineEdit) {
                            // Content on the line changed - verify later
                            notesToUpdate.push({
                                id: note.id,
                                lineNumber: lineNum,
                                needsVerification: true,
                            });
                        } else {
                            // Complex change - attempt to relocate or orphan
                            notesToOrphan.push(note.id);
                        }
                    } else if (lineNum > endLine) {
                        // Note is below the change - adjust line number
                        const existing = notesToUpdate.find(u => u.id === note.id);
                        if (existing) {
                            existing.lineNumber += lineDelta;
                        } else {
                            notesToUpdate.push({
                                id: note.id,
                                lineNumber: lineNum + lineDelta,
                                needsVerification: false,
                            });
                        }

                        // Update the map for subsequent changes
                        const oldNotes = noteLineMap.get(lineNum) ?? [];
                        noteLineMap.set(lineNum, oldNotes.filter(n => n.id !== note.id));
                        
                        const newLineNum = lineNum + lineDelta;
                        const newNotes = noteLineMap.get(newLineNum) ?? [];
                        newNotes.push({ ...note, lineNumber: newLineNum });
                        noteLineMap.set(newLineNum, newNotes);
                    }
                }
            }
        }

        // Apply deletions
        if (notesToDelete.length > 0) {
            await this.notesService.bulkDelete(notesToDelete);
        }

        // Apply orphaning
        for (const id of notesToOrphan) {
            await this.notesService.markOrphaned(id);
        }

        // Apply line number updates and verify content
        const bulkUpdates: Array<{ id: string; options: { lineNumber?: number; status?: 'active' | 'orphaned'; lineContent?: string; surroundingContext?: { lineBefore?: string; lineAfter?: string } } }> = [];

        for (const update of notesToUpdate) {
            const note = this.notesService.getById(update.id);
            if (!note) {
                continue;
            }

            if (update.needsVerification) {
                // Check if line content still matches
                const currentContent = this.getLineContent(document, update.lineNumber);
                if (currentContent !== null) {
                    if (note.lineContentHash !== this.hashContent(currentContent)) {
                        // Content changed - try to relocate
                        const newLocation = this.findNoteLocation(document, note);
                        if (newLocation !== null) {
                            bulkUpdates.push({
                                id: update.id,
                                options: {
                                    lineNumber: newLocation.lineNumber,
                                    lineContent: newLocation.lineContent,
                                    surroundingContext: newLocation.surroundingContext,
                                    status: 'active',
                                },
                            });
                        } else {
                            // Could not relocate - orphan the note
                            bulkUpdates.push({
                                id: update.id,
                                options: { status: 'orphaned' },
                            });
                        }
                    }
                }
            } else if (update.lineNumber !== note.lineNumber) {
                // Just update the line number
                const currentContent = this.getLineContent(document, update.lineNumber);
                bulkUpdates.push({
                    id: update.id,
                    options: {
                        lineNumber: update.lineNumber,
                        lineContent: currentContent ?? note.lineContent,
                        surroundingContext: this.getSurroundingContext(document, update.lineNumber),
                    },
                });
            }
        }

        if (bulkUpdates.length > 0) {
            await this.notesService.bulkUpdate(bulkUpdates);
        }
    }

    /**
     * Try to find the new location of a note based on content matching
     */
    private findNoteLocation(
        document: vscode.TextDocument,
        note: { lineContent: string; surroundingContext: { lineBefore?: string; lineAfter?: string } }
    ): { lineNumber: number; lineContent: string; surroundingContext: { lineBefore?: string; lineAfter?: string } } | null {
        // First, try exact content match
        for (let i = 0; i < document.lineCount; i++) {
            const lineContent = document.lineAt(i).text;
            if (lineContent === note.lineContent) {
                return {
                    lineNumber: i,
                    lineContent,
                    surroundingContext: this.getSurroundingContext(document, i),
                };
            }
        }

        // Second, try matching by surrounding context
        if (note.surroundingContext.lineBefore || note.surroundingContext.lineAfter) {
            for (let i = 0; i < document.lineCount; i++) {
                const context = this.getSurroundingContext(document, i);
                
                const beforeMatch = !note.surroundingContext.lineBefore || 
                    context.lineBefore === note.surroundingContext.lineBefore;
                const afterMatch = !note.surroundingContext.lineAfter || 
                    context.lineAfter === note.surroundingContext.lineAfter;

                if (beforeMatch && afterMatch) {
                    return {
                        lineNumber: i,
                        lineContent: document.lineAt(i).text,
                        surroundingContext: context,
                    };
                }
            }
        }

        return null;
    }

    /**
     * Get the content of a specific line
     */
    private getLineContent(document: vscode.TextDocument, lineNumber: number): string | null {
        if (lineNumber < 0 || lineNumber >= document.lineCount) {
            return null;
        }
        return document.lineAt(lineNumber).text;
    }

    /**
     * Get surrounding context for a line
     */
    private getSurroundingContext(
        document: vscode.TextDocument,
        lineNumber: number
    ): { lineBefore?: string; lineAfter?: string } {
        const context: { lineBefore?: string; lineAfter?: string } = {};

        if (lineNumber > 0) {
            context.lineBefore = document.lineAt(lineNumber - 1).text;
        }

        if (lineNumber < document.lineCount - 1) {
            context.lineAfter = document.lineAt(lineNumber + 1).text;
        }

        return context;
    }

    /**
     * Hash content for comparison (must match NotesService.hashContent)
     */
    private hashContent(content: string): string {
        return crypto.createHash('md5').update(content).digest('hex');
    }

    /**
     * Get relative file path from URI
     */
    private getRelativePath(uri: vscode.Uri): string | null {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }

        return vscode.workspace.asRelativePath(uri, false);
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        // Clear all debounce timers
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
        this.pendingChanges.clear();

        // Dispose all event listeners
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}
