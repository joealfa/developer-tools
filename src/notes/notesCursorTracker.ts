/**
 * Notes Cursor Tracker - Auto-show/hide side panel based on cursor position
 * Monitors cursor movement and editor changes to manage notes panel visibility
 */

import * as vscode from 'vscode';
import { NotesService } from './notesService';
import { getTrackableDocumentPath } from '../utils';

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
			vscode.window.onDidChangeTextEditorSelection(this.handleSelectionChange.bind(this))
		);

		// Listen to active editor changes
		this.disposables.push(
			vscode.window.onDidChangeActiveTextEditor(this.handleEditorChange.bind(this))
		);

		// Listen to notes changes to update visibility
		this.disposables.push(
			this.notesService.onDidChangeNotes(() => {
				this.checkCurrentPosition();
			})
		);
	}

	/**
	 * Resolve the tracking path for a document.
	 * Returns the workspace-relative path for workspace files,
	 * the absolute path for files outside the workspace,
	 * the fileName for untitled documents, and null for other schemes.
	 */
	private static getDocumentPath(document: vscode.TextDocument): string | null {
		return getTrackableDocumentPath(document);
	}

	/**
	 * Handle cursor selection change
	 */
	private handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent): void {
		const editor = event.textEditor;

		// Skip documents we can't track (output panels, webviews, etc.)
		if (NotesCursorTracker.getDocumentPath(editor.document) === null) {
			return;
		}

		// Get the primary selection's line
		const lineNumber = event.selections[0].active.line;

		// Debounce rapid cursor movements
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			this.checkLineForNotes(editor.document, lineNumber);
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
				// Double-check we still have no active text editor AND no visible
				// trackable editors. This guards against the case where the user
				// focuses the Note Editor sidebar while a file is still visible
				// in the background (e.g. settings.json outside the workspace).
				if (!vscode.window.activeTextEditor) {
					const hasVisibleTrackable = vscode.window.visibleTextEditors.some(
						(e) => NotesCursorTracker.getDocumentPath(e.document) !== null
					);
					if (!hasVisibleTrackable) {
						this.updateVisibility(false, null, null);
					}
				}
			}, 200);
			return;
		}

		// Skip documents we can't track (output panels, webviews, etc.)
		if (NotesCursorTracker.getDocumentPath(editor.document) === null) {
			// Don't hide just because we switched to a non-trackable editor
			// The panel might still be relevant
			return;
		}

		// Check the current line
		const lineNumber = editor.selection.active.line;
		this.checkLineForNotes(editor.document, lineNumber);
	}

	/**
	 * Check if current line has notes and update visibility
	 */
	private checkLineForNotes(document: vscode.TextDocument, lineNumber: number): void {
		const filePath = NotesCursorTracker.getDocumentPath(document);
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
		if (!editor || NotesCursorTracker.getDocumentPath(editor.document) === null) {
			return;
		}

		const lineNumber = editor.selection.active.line;
		this.checkLineForNotes(editor.document, lineNumber);
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
			this.currentFilePath !== filePath || this.currentLineNumber !== lineNumber;

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
		if (!editor) {
			return;
		}

		const filePath = NotesCursorTracker.getDocumentPath(editor.document);
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
