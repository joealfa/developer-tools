/**
 * Note Editor Provider - Secondary sidebar webview for editing notes
 * Displays and allows editing of notes for the current line
 */

import * as vscode from 'vscode';
import { NotesService, Note, NoteCategory } from '../notes';
import { getTrackableDocumentPath } from '../utils';
import { createWebviewNonce, getWebviewCspMetaTagWithScript, getWebviewScriptUri } from './security';
import noteEditorHtml from './templates/noteEditor.html';

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
	 */
	public async showForLine(
		filePath: string,
		lineNumber: number,
		shouldFocus: boolean = true
	): Promise<void> {
		this.currentFilePath = filePath;
		this.currentLineNumber = lineNumber;
		this.isActive = true;
		this.showAddForm = shouldFocus;

		if (shouldFocus) {
			await vscode.commands.executeCommand('developer-tools.noteEditor.focus');
		}

		this.updateContent();
	}

	public updateLine(filePath: string, lineNumber: number): void {
		this.currentFilePath = filePath;
		this.currentLineNumber = lineNumber;
		this.isActive = true;
		this.isFileFocused = true;
		this.showAddForm = false;
		this.updateContent();
	}

	public restoreFromVisibleEditor(): boolean {
		const editor = this.getCurrentTrackableEditor();
		if (!editor) return false;

		const filePath = NoteEditorProvider.getEditorPath(editor);
		if (!filePath) return false;

		this.currentFilePath = filePath;
		this.currentLineNumber = editor.selection.active.line;
		this.isActive = true;
		this.isFileFocused = true;
		this.showAddForm = false;
		this.updateContent();
		return true;
	}

	public isNoteEditorActive(): boolean {
		return this.isActive;
	}

	public async hide(): Promise<void> {
		this.currentFilePath = null;
		this.currentLineNumber = null;
		this.isActive = false;
		this.showAddForm = false;
		this.view?.webview.postMessage({ command: 'empty' });
	}

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

		// Set the HTML shell once — all content changes go through postMessage
		webviewView.webview.html = this.getHtmlShell(webviewView.webview);

		// Send initial state
		if (this.currentFilePath !== null && this.currentLineNumber !== null) {
			this.updateContent();
		} else {
			webviewView.webview.postMessage({ command: 'empty' });
		}

		webviewView.webview.onDidReceiveMessage(
			this.handleMessage.bind(this),
			null,
			this.disposables
		);

		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible) {
				this.startCursorTracking();
				if (this.currentFilePath !== null && this.currentLineNumber !== null) {
					this.updateContent();
				} else {
					this.updateFromCurrentEditor();
				}
			} else {
				this.stopCursorTracking();
				this.showAddForm = false;
			}
		});

		if (webviewView.visible) {
			this.startCursorTracking();
			this.updateFromCurrentEditor();
		}
	}

	private async refresh(): Promise<void> {
		if (this.currentFilePath !== null && this.currentLineNumber !== null) {
			this.updateContent();
		}
	}

	private updateContent(): void {
		if (!this.view || this.currentFilePath === null || this.currentLineNumber === null) {
			return;
		}

		const notes = this.notesService.getByLine(this.currentFilePath, this.currentLineNumber);
		const locationInfo = this.getLocationInfo(this.currentFilePath);

		this.view.webview.postMessage({
			command: 'update',
			notes: notes.map((n) => this.serializeNote(n)),
			locationInfo,
			lineNumber: this.currentLineNumber,
			showAddForm: this.showAddForm,
			isFileFocused: this.isFileFocused,
		});
	}

	private serializeNote(note: Note) {
		return {
			id: note.id,
			text: note.text,
			category: note.category,
			createdAt: note.createdAt,
		};
	}

	private async handleMessage(message: unknown): Promise<void> {
		if (!this.currentFilePath || this.currentLineNumber === null) return;
		if (!message || typeof message !== 'object' || typeof (message as Record<string, unknown>).command !== 'string') return;

		const msg = message as Record<string, unknown>;

		switch (msg.command) {
			case 'addNote': {
				if (typeof msg.text !== 'string') break;
				if (!this.isValidCategory(msg.category)) break;

				const editor = vscode.window.activeTextEditor;
				const lineContent =
					editor && this.currentLineNumber < editor.document.lineCount
						? editor.document.lineAt(this.currentLineNumber).text
						: '';

				await this.notesService.create({
					filePath: this.currentFilePath,
					lineNumber: this.currentLineNumber,
					lineContent,
					text: msg.text,
					category: msg.category as NoteCategory,
				});
				this.showAddForm = false;
				break;
			}

			case 'updateNote':
				if (typeof msg.noteId !== 'string' || msg.noteId.length === 0) break;
				if (typeof msg.text !== 'string') break;
				if (!this.isValidCategory(msg.category)) break;
				await this.notesService.update(msg.noteId, {
					text: msg.text as string,
					category: msg.category as NoteCategory,
				});
				break;

			case 'deleteNote':
				if (typeof msg.noteId !== 'string' || msg.noteId.length === 0) break;
				await this.notesService.delete(msg.noteId);
				break;
		}
	}

	private isValidCategory(value: unknown): boolean {
		return (
			value === 'note' || value === 'todo' || value === 'fixme' || value === 'question'
		);
	}

	private getHtmlShell(webview: vscode.Webview): string {
		const nonce = createWebviewNonce();
		const scriptUri = getWebviewScriptUri(webview, this.context.extensionUri, 'noteEditor.js');
		const cspMetaTag = getWebviewCspMetaTagWithScript(nonce, webview);

		return noteEditorHtml
			.replace('{{cspMetaTag}}', cspMetaTag)
			.replace('{{nonce}}', nonce)
			.replace('{{scriptUri}}', scriptUri.toString());
	}

	private static getEditorPath(editor: vscode.TextEditor): string | null {
		return getTrackableDocumentPath(editor.document);
	}

	private getLocationInfo(filePath: string): {
		fullPath: string;
		fileName: string;
		compactPath: string;
	} {
		const normalizedPath = filePath.replace(/\\/g, '/');
		const segments = normalizedPath.split('/').filter((segment) => segment.length > 0);
		const fileName = segments.length > 0 ? segments[segments.length - 1] : filePath;

		if (segments.length <= 4) {
			return { fullPath: filePath, fileName, compactPath: filePath };
		}

		const firstTwo = segments.slice(0, 2).join('/');
		const lastTwo = segments.slice(-2).join('/');
		return { fullPath: filePath, fileName, compactPath: `${firstTwo}/.../${lastTwo}` };
	}

	private updateFromCurrentEditor(): void {
		const editor = this.getCurrentTrackableEditor();
		if (!editor) return;

		const filePath = NoteEditorProvider.getEditorPath(editor);
		if (!filePath) return;

		this.currentFilePath = filePath;
		this.currentLineNumber = editor.selection.active.line;
		this.isFileFocused = true;
		this.updateContent();
	}

	private getCurrentTrackableEditor(): vscode.TextEditor | undefined {
		if (vscode.window.activeTextEditor) {
			const activePath = NoteEditorProvider.getEditorPath(vscode.window.activeTextEditor);
			if (activePath !== null) return vscode.window.activeTextEditor;
		}
		return vscode.window.visibleTextEditors.find(
			(editor) => NoteEditorProvider.getEditorPath(editor) !== null
		);
	}

	private startCursorTracking(): void {
		if (this.cursorTrackingDisposable) return;

		this.cursorTrackingDisposable = vscode.window.onDidChangeTextEditorSelection((event) => {
			const editor = event.textEditor;
			const filePath = NoteEditorProvider.getEditorPath(editor);
			if (!filePath) return;

			const lineNumber = event.selections[0].active.line;
			const formWasVisible = this.showAddForm;
			if (this.showAddForm) this.showAddForm = false;

			this.isFileFocused = true;

			if (
				this.currentFilePath !== filePath ||
				this.currentLineNumber !== lineNumber ||
				formWasVisible
			) {
				this.currentFilePath = filePath;
				this.currentLineNumber = lineNumber;
				this.updateContent();
			}
		});
	}

	private stopCursorTracking(): void {
		if (this.cursorTrackingDisposable) {
			this.cursorTrackingDisposable.dispose();
			this.cursorTrackingDisposable = undefined;
		}
	}

	dispose(): void {
		this.stopCursorTracking();
		this.disposables.forEach((d) => d.dispose());
	}
}
