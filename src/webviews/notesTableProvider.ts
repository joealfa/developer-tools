/**
 * Notes Table Provider - Bottom panel with notes navigation
 * Displays all notes in a searchable, filterable table with grouping
 */

import * as vscode from 'vscode';
import { NotesService, Note, NoteCategory } from '../notes';
import { createWebviewNonce, getWebviewCspMetaTagWithScript, getWebviewScriptUri } from './security';
import type { NoteEditorProvider } from './noteEditorProvider';
import notesTableHtml from './templates/notesTable.html';

/**
 * WebviewViewProvider for the notes table in the bottom panel
 */
export class NotesTableProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'developer-tools.notesTable';

	private view: vscode.WebviewView | undefined;
	private notesService: NotesService;
	private context: vscode.ExtensionContext;
	private disposables: vscode.Disposable[] = [];
	private noteEditorProvider: NoteEditorProvider | null = null;

	constructor(context: vscode.ExtensionContext, notesService: NotesService) {
		this.context = context;
		this.notesService = notesService;

		this.disposables.push(
			this.notesService.onDidChangeNotes(() => {
				this.refresh();
			})
		);
	}

	/**
	 * Set the note editor provider reference for navigation
	 */
	setNoteEditorProvider(provider: NoteEditorProvider): void {
		this.noteEditorProvider = provider;
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

		webviewView.webview.html = this.getHtml(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(
			this.handleMessage.bind(this),
			null,
			this.disposables
		);

		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible) {
				this.refresh();
			}
		});

		this.refresh();
	}

	/**
	 * Push the full notes list to the webview
	 */
	refresh(): void {
		if (!this.view) {
			return;
		}
		const notes = this.notesService.getAll();
		this.view.webview.postMessage({
			command: 'notes-updated',
			notes: notes.map((n) => this.serializeNote(n)),
			totalCount: this.notesService.count,
		});
	}

	/**
	 * Handle messages from the webview
	 */
	private async handleMessage(message: unknown): Promise<void> {
		if (!message || typeof message !== 'object' || typeof (message as Record<string, unknown>).command !== 'string') {
			return;
		}

		const msg = message as Record<string, unknown>;

		switch (msg.command) {
			case 'navigate':
				if (typeof msg.noteId !== 'string' || msg.noteId.length === 0) break;
				await this.navigateToNote(msg.noteId, false);
				break;

			case 'openEditor':
				if (typeof msg.noteId !== 'string' || msg.noteId.length === 0) break;
				await this.navigateToNote(msg.noteId, true);
				break;

			case 'deleteNote':
				if (typeof msg.noteId !== 'string' || msg.noteId.length === 0) break;
				await this.deleteNote(msg.noteId);
				break;

			case 'deleteSelected': {
				if (!Array.isArray(msg.ids)) break;
				const ids = (msg.ids as unknown[]).filter((id): id is string => typeof id === 'string');
				await this.deleteSelectedNotes(ids);
				break;
			}

			case 'changeCategorySelected': {
				if (!this.isValidCategory(msg.category)) break;
				if (!Array.isArray(msg.ids)) break;
				const ids = (msg.ids as unknown[]).filter((id): id is string => typeof id === 'string');
				await this.changeCategoryForSelected(ids, msg.category as NoteCategory);
				break;
			}
		}
	}

	/**
	 * Navigate to a note's location and optionally show the note editor
	 */
	private async navigateToNote(noteId: string, showEditor: boolean): Promise<void> {
		const note = this.notesService.getById(noteId);
		if (!note) {
			return;
		}

		let fileUri: vscode.Uri;
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return;
		}

		const isAbsolute = /^[a-zA-Z]:[\\/]|^\//.test(note.filePath);
		if (isAbsolute) {
			const normalizedNotePath = note.filePath.replace(/\\/g, '/').toLowerCase();
			const inWorkspace = workspaceFolders.some((folder) => {
				const root = folder.uri.fsPath.replace(/\\/g, '/').toLowerCase();
				return normalizedNotePath === root || normalizedNotePath.startsWith(root + '/');
			});

			if (!inWorkspace) {
				vscode.window.showWarningMessage(
					'Refusing to open note target outside the current workspace.'
				);
				return;
			}

			fileUri = vscode.Uri.file(note.filePath);
		} else {
			fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, note.filePath);
		}

		try {
			const document = await vscode.workspace.openTextDocument(fileUri);
			const editor = await vscode.window.showTextDocument(document, {
				viewColumn: vscode.ViewColumn.One,
				preserveFocus: false,
			});

			const position = new vscode.Position(note.lineNumber, 0);
			editor.selection = new vscode.Selection(position, position);
			editor.revealRange(
				new vscode.Range(position, position),
				vscode.TextEditorRevealType.InCenter
			);

			if (showEditor && this.noteEditorProvider) {
				await this.noteEditorProvider.showForLine(note.filePath, note.lineNumber);
			}
		} catch {
			vscode.window.showErrorMessage(`Could not open file: ${note.filePath}`);
		}
	}

	/**
	 * Delete a single note
	 */
	private async deleteNote(noteId: string): Promise<void> {
		const confirmed = await vscode.window.showWarningMessage(
			'Are you sure you want to delete this note?',
			{ modal: true },
			'Delete'
		);

		if (confirmed === 'Delete') {
			await this.notesService.delete(noteId);
		}
	}

	/**
	 * Delete a list of selected notes
	 */
	private async deleteSelectedNotes(ids: string[]): Promise<void> {
		if (ids.length === 0) {
			return;
		}

		const confirmed = await vscode.window.showWarningMessage(
			`Are you sure you want to delete ${ids.length} note(s)?`,
			{ modal: true },
			'Delete'
		);

		if (confirmed === 'Delete') {
			await this.notesService.bulkDelete(ids);
		}
	}

	/**
	 * Change category for a list of notes
	 */
	private async changeCategoryForSelected(ids: string[], category: NoteCategory): Promise<void> {
		if (ids.length === 0) {
			return;
		}

		const updates = ids.map((id) => ({ id, options: { category } }));
		await this.notesService.bulkUpdate(updates);
		vscode.window.showInformationMessage(`Updated category for ${ids.length} note(s)`);
	}

	private isValidCategory(value: unknown): boolean {
		return value === 'note' || value === 'todo' || value === 'fixme' || value === 'question';
	}

	private serializeNote(note: Note) {
		return {
			id: note.id,
			filePath: note.filePath,
			lineNumber: note.lineNumber,
			text: note.text,
			category: note.category,
			status: note.status,
			createdAt: note.createdAt,
		};
	}

	private getHtml(webview: vscode.Webview): string {
		const nonce = createWebviewNonce();
		const scriptUri = getWebviewScriptUri(webview, this.context.extensionUri, 'notesTable.js');
		const cspMetaTag = getWebviewCspMetaTagWithScript(nonce, webview);

		return notesTableHtml
			.replace('{{cspMetaTag}}', cspMetaTag)
			.replace('{{nonce}}', nonce)
			.replace('{{scriptUri}}', scriptUri.toString());
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
