/**
 * Notes Cursor Tracker - Auto-show/hide side panel based on cursor position
 * Monitors cursor movement and editor changes to manage notes panel visibility
 */

import * as vscode from 'vscode';
import { NotesService } from './notesService';
import { getRelativePath } from '../utils';

/**
 * Callback type for panel visibility changes
 */
export type PanelVisibilityCallback = (
    show: boolean,
    filePath: string | null,
    lineNumber: number | null
) => void;

/**
 * Tracks cursor position and manages notes panel visibility
 */
export class NotesCursorTracker implements vscode.Disposable {
    private notesService: NotesService;
    private disposables: vscode.Disposable[] = [];
    private visibilityCallback: PanelVisibilityCallback | null = null;
    private currentFilePath: string | null = null;
    private currentLineNumber: number | null = null;
    private debounceTimer: NodeJS.Timeout | undefined;
    private isPanelFocused: boolean = false;
    private lastEditorUri: string | null = null;

    constructor(notesService: NotesService) {
        this.notesService = notesService;
        this.registerListeners();
    }

    /**
     * Set the callback for panel visibility changes
     */
    setVisibilityCallback(callback: PanelVisibilityCallback): void {
        this.visibilityCallback = callback;
    }

    /**
     * Mark that the panel is currently focused (prevents auto-hide)
     */
    setPanelFocused(focused: boolean): void {
        this.isPanelFocused = focused;
    }

    private registerListeners(): void {
        // Listen to cursor position changes
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection(
                this.handleSelectionChange.bind(this)
            )
        );

        // Listen to active editor changes
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(
                this.handleEditorChange.bind(this)
            )
        );

        // Listen to notes changes to update visibility
        this.disposables.push(
            this.notesService.onDidChangeNotes(() => {
                this.checkCurrentPosition();
            })
        );

        // Initialize with current editor
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            this.lastEditorUri = editor.document.uri.toString();
        }
    }

    /**
     * Handle cursor selection change
     */
    private handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent): void {
        const editor = event.textEditor;
        
        // Skip non-file documents
        if (editor.document.uri.scheme !== 'file') {
            return;
        }

        // Track the last editor we were in
        this.lastEditorUri = editor.document.uri.toString();

        // Get the primary selection's line
        const lineNumber = event.selections[0].active.line;
        
        // Debounce rapid cursor movements
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.checkLineForNotes(editor.document.uri, lineNumber);
        }, 100);
    }

    /**
     * Handle active editor change
     */
    private handleEditorChange(editor: vscode.TextEditor | undefined): void {
        // If panel is focused, don't auto-hide
        if (this.isPanelFocused) {
            return;
        }

        if (!editor) {
            // No active editor - but don't hide if we're just switching to the panel
            // Only hide if we've been without an editor for a bit
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }
            this.debounceTimer = setTimeout(() => {
                // Double-check we still have no text editor
                if (!vscode.window.activeTextEditor) {
                    this.updateVisibility(false, null, null);
                }
            }, 200);
            return;
        }

        // Skip non-file documents (like output, webviews, etc.)
        if (editor.document.uri.scheme !== 'file') {
            // Don't hide just because we switched to a non-file
            // The panel might still be relevant
            return;
        }

        // Track the last editor we were in
        this.lastEditorUri = editor.document.uri.toString();

        // Check the current line
        const lineNumber = editor.selection.active.line;
        this.checkLineForNotes(editor.document.uri, lineNumber);
    }

    /**
     * Check if current line has notes and update visibility
     */
    private checkLineForNotes(uri: vscode.Uri, lineNumber: number): void {
        const filePath = getRelativePath(uri);
        if (!filePath) {
            this.updateVisibility(false, null, null);
            return;
        }

        const hasNotes = this.notesService.hasNotesForLine(filePath, lineNumber);
        this.updateVisibility(hasNotes, filePath, lineNumber);
    }

    /**
     * Re-check current position (called when notes change)
     */
    private checkCurrentPosition(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'file') {
            return;
        }

        const lineNumber = editor.selection.active.line;
        this.checkLineForNotes(editor.document.uri, lineNumber);
    }

    /**
     * Update panel visibility
     */
    private updateVisibility(
        show: boolean,
        filePath: string | null,
        lineNumber: number | null
    ): void {
        // Only fire callback if state changed
        const stateChanged = 
            this.currentFilePath !== filePath || 
            this.currentLineNumber !== lineNumber;

        if (stateChanged) {
            this.currentFilePath = filePath;
            this.currentLineNumber = lineNumber;

            if (this.visibilityCallback) {
                this.visibilityCallback(show, filePath, lineNumber);
            }
        }
    }

    /**
     * Get current file path
     */
    getCurrentFilePath(): string | null {
        return this.currentFilePath;
    }

    /**
     * Get current line number
     */
    getCurrentLineNumber(): number | null {
        return this.currentLineNumber;
    }

    /**
     * Force show panel for current position (used when adding notes)
     */
    forceShow(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'file') {
            return;
        }

        const filePath = getRelativePath(editor.document.uri);
        const lineNumber = editor.selection.active.line;

        if (filePath !== null) {
            this.currentFilePath = filePath;
            this.currentLineNumber = lineNumber;

            if (this.visibilityCallback) {
                this.visibilityCallback(true, filePath, lineNumber);
            }
        }
    }

    /**
     * Force hide panel
     */
    forceHide(): void {
        this.currentFilePath = null;
        this.currentLineNumber = null;

        if (this.visibilityCallback) {
            this.visibilityCallback(false, null, null);
        }
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
        this.visibilityCallback = null;
    }
}
