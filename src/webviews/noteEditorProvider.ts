/**
 * Note Editor Provider - Secondary sidebar webview for editing notes
 * Displays and allows editing of notes for the current line
 */

import * as vscode from 'vscode';
import { NotesService, Note, NoteCategory, CATEGORY_CONFIG } from '../notes';
import { escapeHtml, getTrackableDocumentPath } from '../utils';
import { Icons } from './icons';
import { createWebviewNonce, getWebviewCspMetaTag } from './security';

/**
 * WebviewViewProvider for the note editor in the secondary sidebar
 */
export class NoteEditorProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'developer-tools.noteEditor';

	private view: vscode.WebviewView | undefined;
	private notesService: NotesService;
	private context: vscode.ExtensionContext;
	private disposables: vscode.Disposable[] = [];
	private currentFilePath: string | null = null;
	private currentLineNumber: number | null = null;
	private isActive: boolean = false;
	private cursorTrackingDisposable: vscode.Disposable | undefined;
	private showAddForm: boolean = false;
	private isFileFocused: boolean = false;

	constructor(context: vscode.ExtensionContext, notesService: NotesService) {
		this.context = context;
		this.notesService = notesService;

		// Listen to notes changes
		this.disposables.push(
			this.notesService.onDidChangeNotes(() => {
				this.refresh();
			})
		);

		this.disposables.push(
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				if (editor) {
					const filePath = NoteEditorProvider.getEditorPath(editor);
					if (filePath === null) {
						return;
					}
					if (this.showAddForm) {
						this.showAddForm = false;
					}
					this.isFileFocused = true;
					this.currentFilePath = filePath;
					this.currentLineNumber = editor.selection.active.line;
					this.updateContent();
				} else if (editor === undefined) {
					const hasVisibleFile = vscode.window.visibleTextEditors.some(
						(e) => NoteEditorProvider.getEditorPath(e) !== null
					);
					if (!hasVisibleFile && this.isFileFocused) {
						this.isFileFocused = false;
						this.updateContent();
					}
				}
			})
		);
	}

	/**
	 * Show note editor for a specific file and line
	 * @param shouldFocus - Whether to focus the Note Editor view (default: true)
	 */
	public async showForLine(
		filePath: string,
		lineNumber: number,
		shouldFocus: boolean = true
	): Promise<void> {
		this.currentFilePath = filePath;
		this.currentLineNumber = lineNumber;
		this.isActive = true;
		this.showAddForm = shouldFocus; // Show form when explicitly invoked

		if (shouldFocus) {
			// Use the VS Code focus command to reveal the view.
			// This works even if the view hasn't been resolved yet —
			// VS Code will resolve it, then resolveWebviewView picks up the current state.
			await vscode.commands.executeCommand('developer-tools.noteEditor.focus');
		}

		// Update content after focus so the view is guaranteed to exist
		this.updateContent();
	}

	/**
	 * Update the current line being tracked (without focusing)
	 */
	public updateLine(filePath: string, lineNumber: number): void {
		this.currentFilePath = filePath;
		this.currentLineNumber = lineNumber;
		this.isActive = true;
		this.isFileFocused = true;
		this.showAddForm = false; // Don't show form on automatic updates
		this.updateContent();
	}

	/**
	 * Attempt to restore context from a currently visible trackable editor.
	 * Returns true if context was restored and rendered.
	 */
	public restoreFromVisibleEditor(): boolean {
		const editor = this.getCurrentTrackableEditor();
		if (!editor) {
			return false;
		}

		const filePath = NoteEditorProvider.getEditorPath(editor);
		if (!filePath) {
			return false;
		}

		this.currentFilePath = filePath;
		this.currentLineNumber = editor.selection.active.line;
		this.isActive = true;
		this.isFileFocused = true;
		this.showAddForm = false;
		this.updateContent();
		return true;
	}

	/**
	 * Check if the Note Editor is currently active
	 */
	public isNoteEditorActive(): boolean {
		return this.isActive;
	}

	/**
	 * Hide the note editor content
	 */
	public async hide(): Promise<void> {
		this.currentFilePath = null;
		this.currentLineNumber = null;
		this.isActive = false;
		this.showAddForm = false;

		// Update to show empty state
		if (this.view) {
			this.view.webview.html = this.getEmptyStateHtml();
		}
	}

	/**
	 * Called when the view is first created
	 */
	resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		this.view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri],
		};

		// Set initial content
		if (this.currentFilePath !== null && this.currentLineNumber !== null) {
			this.updateContent();
		} else {
			webviewView.webview.html = this.getEmptyStateHtml();
		}

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(
			this.handleMessage.bind(this),
			null,
			this.disposables
		);

		// Refresh when view becomes visible
		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible) {
				// Start background cursor tracking when visible
				this.startCursorTracking();
				if (this.currentFilePath !== null && this.currentLineNumber !== null) {
					this.updateContent();
				} else {
					// Initialize with current editor position
					this.updateFromCurrentEditor();
				}
			} else {
				// Stop tracking when hidden to save resources
				this.stopCursorTracking();
				// Reset add form flag when view loses visibility
				this.showAddForm = false;
			}
		});

		// Start tracking if view is already visible
		if (webviewView.visible) {
			this.startCursorTracking();
			this.updateFromCurrentEditor();
		}
	}

	/**
	 * Refresh the view
	 */
	private async refresh(): Promise<void> {
		if (this.currentFilePath !== null && this.currentLineNumber !== null) {
			// Always update content, will show empty state if no notes
			this.updateContent();
		}
	}

	/**
	 * Update the webview content
	 */
	private updateContent(): void {
		if (!this.view || this.currentFilePath === null || this.currentLineNumber === null) {
			return;
		}

		const notes = this.notesService.getByLine(this.currentFilePath, this.currentLineNumber);
		this.view.webview.html = this.getHtml(notes);
	}

	/**
	 * Handle messages from the webview
	 */
	private async handleMessage(message: any): Promise<void> {
		if (!this.currentFilePath || this.currentLineNumber === null) {
			return;
		}

		if (!message || typeof message !== 'object' || typeof message.command !== 'string') {
			return;
		}

		switch (message.command) {
			case 'addNote': {
				if (typeof message.text !== 'string') {
					break;
				}
				if (
					message.category !== 'note' &&
					message.category !== 'todo' &&
					message.category !== 'fixme' &&
					message.category !== 'question'
				) {
					break;
				}

				// Get the line content from the active editor
				const editor = vscode.window.activeTextEditor;
				const lineContent =
					editor && this.currentLineNumber < editor.document.lineCount
						? editor.document.lineAt(this.currentLineNumber).text
						: '';

				await this.notesService.create({
					filePath: this.currentFilePath,
					lineNumber: this.currentLineNumber,
					lineContent: lineContent,
					text: message.text,
					category: message.category as NoteCategory,
				});

				// Reset showAddForm after adding note
				this.showAddForm = false;
				break;
			}

			case 'updateNote':
				if (typeof message.noteId !== 'string' || message.noteId.length === 0) {
					break;
				}
				if (typeof message.text !== 'string') {
					break;
				}
				if (
					message.category !== 'note' &&
					message.category !== 'todo' &&
					message.category !== 'fixme' &&
					message.category !== 'question'
				) {
					break;
				}
				await this.notesService.update(message.noteId, {
					text: message.text,
					category: message.category as NoteCategory,
				});
				break;

			case 'deleteNote':
				if (typeof message.noteId !== 'string' || message.noteId.length === 0) {
					break;
				}
				await this.notesService.delete(message.noteId);
				break;
		}
	}

	/**
	 * Get HTML content for empty state
	 */
	private getEmptyStateHtml(
		location?: { fullPath: string; fileName: string; compactPath: string },
		lineNumber?: number
	): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Note Editor</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
			padding: 12px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
		}
		.location-info {
			padding: 8px 12px;
			background-color: var(--vscode-editor-background);
			border-radius: 4px;
			margin-bottom: 12px;
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
		}
		.location-file {
			font-weight: bold;
			color: var(--vscode-foreground);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			min-width: 0;
		}
		.location-top-row {
			display: flex;
			justify-content: space-between;
			align-items: baseline;
			gap: 8px;
		}
		.location-line {
			white-space: nowrap;
			flex-shrink: 0;
		}
		.location-path {
			margin-top: 2px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			font-size: 10px;
        }
        .empty-state {
            text-align: center;
            color: var(--vscode-descriptionForeground);
			min-height: 240px;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
        }
        .empty-state svg {
            width: 48px;
            height: 48px;
            margin-bottom: 12px;
            opacity: 0.5;
        }
    </style>
</head>
<body>
	${
		location && typeof lineNumber === 'number'
			? `<div class="location-info" title="${escapeHtml(location.fullPath)}">
		<div class="location-top-row">
			<div class="location-file">${escapeHtml(location.fileName)}</div>
			<div class="location-line">Line ${lineNumber + 1}</div>
		</div>
		<div class="location-path">${escapeHtml(location.compactPath)}</div>
	</div>`
			: ''
	}
    <div class="empty-state">
        ${Icons.notepadText}
        <p>Click on a line to add or edit notes</p>
    </div>
</body>
</html>`;
	}

	/**
	 * Get HTML content for the note editor
	 */
	private getHtml(notes: Note[]): string {
		if (!this.currentFilePath || this.currentLineNumber === null) {
			return this.getEmptyStateHtml();
		}

		const nonce = createWebviewNonce();
		const cspMetaTag = getWebviewCspMetaTag(nonce);

		const locationInfo = this.getLocationInfo(this.currentFilePath);

		// Preserve the previous UX: when there are no notes and the add form is not
		// explicitly opened, show the empty-state illustration instead of a blank panel.
		if (notes.length === 0 && !this.showAddForm) {
			return this.getEmptyStateHtml(locationInfo, this.currentLineNumber);
		}

		const categoryOptions = Object.entries(CATEGORY_CONFIG)
			.map(([key, config]) => `<option value="${key}">${config.label}</option>`)
			.join('');

		const existingNotesHtml =
			notes.length > 0
				? notes
						.map((note) => {
							const categoryConfig = CATEGORY_CONFIG[note.category];
							const createdDate = new Date(note.createdAt).toLocaleString();
							return `
			<div class="note-card" data-note-id="${note.id}">
                <div class="note-header">
                    <span class="category-badge category-${note.category}">
                        ${this.getCategoryIcon(note.category)} ${categoryConfig.label}
                    </span>
					<button class="icon-btn delete-note-btn" data-note-id="${note.id}" title="Delete">
                        ${Icons.trash2}
                    </button>
                </div>
				<textarea class="note-text existing-note-text" id="note-${note.id}" data-note-id="${note.id}">${escapeHtml(note.text)}</textarea>
                <div class="note-footer">
                    <span class="note-date">${createdDate}</span>
					<select class="category-select" data-note-id="${note.id}">
                        ${Object.entries(CATEGORY_CONFIG)
							.map(
								([key, config]) =>
									`<option value="${key}" ${key === note.category ? 'selected' : ''}>${config.label}</option>`
							)
							.join('')}
                    </select>
                </div>
            </div>`;
						})
						.join('')
				: '';

		const addNoteFormHtml = `
		<div class="form-group">
			<label for="newNoteText">Note</label>
			<textarea id="newNoteText" class="note-text" placeholder="Enter your note..."></textarea>
		</div>
		<div class="form-group">
			<label for="newNoteCategory">Category</label>
			<select id="newNoteCategory" class="category-select">
				${categoryOptions}
			</select>
		</div>
		<button class="btn" id="addNoteBtn">Add Note</button>
	`;

		return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
	${cspMetaTag}
    <title>Note Editor</title>
    <style>
        * {
            box-sizing: border-box;
        }
        body {
            font-family: var(--vscode-font-family);
            padding: 12px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
        }
        .location-info {
            padding: 8px 12px;
            background-color: var(--vscode-editor-background);
            border-radius: 4px;
            margin-bottom: 12px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .location-file {
            font-weight: bold;
            color: var(--vscode-foreground);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			min-width: 0;
		}
		.location-top-row {
			display: flex;
			justify-content: space-between;
			align-items: baseline;
			gap: 8px;
		}
		.location-line {
			white-space: nowrap;
			flex-shrink: 0;
		}
		.location-path {
			margin-top: 2px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			font-size: 10px;
        }
        .note-card {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 12px;
        }
        .note-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .category-badge {
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 10px;
            white-space: nowrap;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .category-badge svg {
            width: 11px;
            height: 11px;
        }
        .note-text {
            width: 100%;
            min-height: 80px;
            padding: 8px;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-size: 12px;
            resize: vertical;
            font-family: var(--vscode-font-family);
        }
        .note-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 8px;
            font-size: 10px;
        }
        .note-date {
            color: var(--vscode-descriptionForeground);
        }
        .category-select {
            padding: 4px 8px;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-size: 11px;
        }
        .add-note-section {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 12px;
        }
		.add-note-accordion {
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
			background-color: var(--vscode-input-background);
			margin-top: 12px;
			overflow: hidden;
		}
		.add-note-summary {
			list-style: none;
			cursor: pointer;
			padding: 12px;
			font-weight: bold;
			font-size: 12px;
			display: flex;
			align-items: center;
			justify-content: space-between;
			user-select: none;
		}
		.add-note-summary::-webkit-details-marker {
			display: none;
		}
		.add-note-summary::after {
			content: '▸';
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			transition: transform 120ms ease;
		}
		.add-note-accordion[open] .add-note-summary::after {
			transform: rotate(90deg);
		}
		.add-note-accordion-body {
			padding: 0 12px 12px 12px;
		}
        .section-title {
            font-weight: bold;
            margin-bottom: 8px;
            font-size: 12px;
        }
        .form-group {
            margin-bottom: 8px;
        }
        .form-group label {
            display: block;
            margin-bottom: 4px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .btn {
            width: 100%;
            padding: 8px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .icon-btn {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            opacity: 0.7;
        }
        .icon-btn:hover {
            opacity: 1;
            background-color: var(--vscode-toolbar-hoverBackground);
        }
        .icon-btn svg {
            width: 14px;
            height: 14px;
        }
    </style>
</head>
<body>
    ${
		this.isFileFocused
			? `<div class="location-info" title="${escapeHtml(locationInfo.fullPath)}">
			<div class="location-top-row">
				<div class="location-file">${escapeHtml(locationInfo.fileName)}</div>
				<div class="location-line">Line ${this.currentLineNumber + 1}</div>
			</div>
			<div class="location-path">${escapeHtml(locationInfo.compactPath)}</div>
    </div>`
			: ''
	}

    ${existingNotesHtml}

    ${
		notes.length > 0 || this.showAddForm
			? `
	${
		notes.length > 0
			? `<details class="add-note-accordion">
		<summary class="add-note-summary">Add Another Note</summary>
		<div class="add-note-accordion-body">
			${addNoteFormHtml}
		</div>
	</details>`
			: `<div class="add-note-section">
		<div class="section-title">Add Note</div>
		${addNoteFormHtml}
	</div>`
	}
    `
			: ''
	}

	<script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        // No auto-focus - let users manually click into the form

        function addNote() {
            const text = document.getElementById('newNoteText').value.trim();
            const category = document.getElementById('newNoteCategory').value;
            
            if (!text) {
                return;
            }

            vscode.postMessage({
                command: 'addNote',
                text: text,
                category: category
            });

            // Clear form
            document.getElementById('newNoteText').value = '';

            // Keep focus so users can quickly add multiple notes.
            document.getElementById('newNoteText').focus();
        }

        function updateNote(noteId) {
            const text = document.getElementById('note-' + noteId).value.trim();
			const categorySelect = document.querySelector('.category-select[data-note-id="' + noteId + '"]');
            const category = categorySelect.value;

            if (!text) {
                return;
            }

            vscode.postMessage({
                command: 'updateNote',
                noteId: noteId,
                text: text,
                category: category
            });
        }

        function updateNoteCategory(noteId, category) {
            const textarea = document.getElementById('note-' + noteId);
            const text = textarea.value.trim();

            vscode.postMessage({
                command: 'updateNote',
                noteId: noteId,
                text: text,
                category: category
            });
        }

        function deleteNote(noteId) {
            vscode.postMessage({
                command: 'deleteNote',
                noteId: noteId
            });
        }

		document.getElementById('addNoteBtn')?.addEventListener('click', () => {
			addNote();
		});

		document.querySelectorAll('.existing-note-text[data-note-id]').forEach((textarea) => {
			textarea.addEventListener('change', (event) => {
				const noteId = event.currentTarget.dataset.noteId;
				updateNote(noteId);
			});
		});

		document.querySelectorAll('.category-select[data-note-id]').forEach((select) => {
			select.addEventListener('change', (event) => {
				const target = event.currentTarget;
				updateNoteCategory(target.dataset.noteId, target.value);
			});
		});

		document.querySelectorAll('.delete-note-btn[data-note-id]').forEach((button) => {
			button.addEventListener('click', (event) => {
				const noteId = event.currentTarget.dataset.noteId;
				deleteNote(noteId);
			});
		});
    </script>
</body>
</html>`;
	}

	/**
	 * Get SVG icon for a category
	 */
	private getCategoryIcon(category: NoteCategory): string {
		const iconMap: Record<string, string> = {
			note: Icons.notepadText,
			todo: Icons.listTodo,
			fixme: Icons.locateFixed,
			question: Icons.fileQuestion,
		};
		const icon = iconMap[category] || Icons.notepadText;
		return icon.replace('width="18"', 'width="11"').replace('height="18"', 'height="11"');
	}

	/**
	 * Get the file path for an editor, supporting both workspace files,
	 * files outside the workspace, and untitled documents.
	 */
	private static getEditorPath(editor: vscode.TextEditor): string | null {
		return getTrackableDocumentPath(editor.document);
	}

	/**
	 * Build user-friendly location text that fits in narrow sidebar layouts.
	 */
	private getLocationInfo(filePath: string): {
		fullPath: string;
		fileName: string;
		compactPath: string;
	} {
		const normalizedPath = filePath.replace(/\\/g, '/');
		const segments = normalizedPath.split('/').filter((segment) => segment.length > 0);
		const fileName = segments.length > 0 ? segments[segments.length - 1] : filePath;

		if (segments.length <= 4) {
			return {
				fullPath: filePath,
				fileName,
				compactPath: filePath,
			};
		}

		const firstTwo = segments.slice(0, 2).join('/');
		const lastTwo = segments.slice(-2).join('/');
		return {
			fullPath: filePath,
			fileName,
			compactPath: `${firstTwo}/.../${lastTwo}`,
		};
	}

	/**
	 * Update from current editor without any focus commands
	 */
	private updateFromCurrentEditor(): void {
		const editor = this.getCurrentTrackableEditor();
		if (!editor) {
			return;
		}

		const filePath = NoteEditorProvider.getEditorPath(editor);
		if (!filePath) {
			return;
		}

		const lineNumber = editor.selection.active.line;

		this.currentFilePath = filePath;
		this.currentLineNumber = lineNumber;
		this.isFileFocused = true;
		this.updateContent();
	}

	/**
	 * Resolve the best editor to use for Note Editor context.
	 * When the Note Editor webview is focused, `activeTextEditor` can be undefined,
	 * so fall back to any visible trackable editor.
	 */
	private getCurrentTrackableEditor(): vscode.TextEditor | undefined {
		if (vscode.window.activeTextEditor) {
			const activePath = NoteEditorProvider.getEditorPath(vscode.window.activeTextEditor);
			if (activePath !== null) {
				return vscode.window.activeTextEditor;
			}
		}

		return vscode.window.visibleTextEditors.find(
			(editor) => NoteEditorProvider.getEditorPath(editor) !== null
		);
	}

	/**
	 * Start background cursor tracking (never steals focus)
	 */
	private startCursorTracking(): void {
		// Avoid duplicate listeners
		if (this.cursorTrackingDisposable) {
			return;
		}

		this.cursorTrackingDisposable = vscode.window.onDidChangeTextEditorSelection((event) => {
			const editor = event.textEditor;

			// Only track file and untitled editors
			const filePath = NoteEditorProvider.getEditorPath(editor);
			if (!filePath) {
				return;
			}

			const lineNumber = event.selections[0].active.line;

			// User interacted with the text editor, so hide the add form
			const formWasVisible = this.showAddForm;
			if (this.showAddForm) {
				this.showAddForm = false;
			}

			this.isFileFocused = true;

			// Update if position changed or form visibility changed
			if (
				this.currentFilePath !== filePath ||
				this.currentLineNumber !== lineNumber ||
				formWasVisible
			) {
				this.currentFilePath = filePath;
				this.currentLineNumber = lineNumber;
				// Only update HTML content - NEVER call focus commands
				this.updateContent();
			}
		});
	}

	/**
	 * Stop cursor tracking
	 */
	private stopCursorTracking(): void {
		if (this.cursorTrackingDisposable) {
			this.cursorTrackingDisposable.dispose();
			this.cursorTrackingDisposable = undefined;
		}
	}

	/**
	 * Dispose of resources
	 */
	dispose(): void {
		this.stopCursorTracking();
		this.disposables.forEach((d) => d.dispose());
	}
}
