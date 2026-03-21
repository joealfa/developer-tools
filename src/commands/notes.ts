import * as vscode from 'vscode';
import { getTrackableDocumentPath } from '../utils';
import { NotesService, NotesExportService, CATEGORY_CONFIG } from '../notes';
import type { NoteEditorProvider } from '../webviews/noteEditorProvider';
import type { CommandDefinition } from './index';

export function getNotesCommands(
	getNoteEditorProvider: () => NoteEditorProvider | null
): CommandDefinition[] {
	return [
		{
			id: 'developer-tools.addNote',
			handler: async () => {
				const editor = vscode.window.activeTextEditor;
				if (!editor) {
					vscode.window.showErrorMessage('Please open a text document to add a note.');
					return;
				}

				const filePath = getTrackableDocumentPath(editor.document);
				if (!filePath) {
					vscode.window.showErrorMessage('This document type does not support notes.');
					return;
				}

				const noteEditorProvider = getNoteEditorProvider();
				const lineNumber = editor.selection.active.line;

				if (noteEditorProvider) {
					await noteEditorProvider.showForLine(filePath, lineNumber, true);
				}
			},
		},
		{
			id: 'developer-tools.editNote',
			handler: async () => {
				const editor = vscode.window.activeTextEditor;
				if (!editor) {
					vscode.window.showErrorMessage('Please open a text document to edit notes.');
					return;
				}

				const filePath = getTrackableDocumentPath(editor.document);
				if (!filePath) {
					vscode.window.showErrorMessage('This document type does not support notes.');
					return;
				}

				const notesService = NotesService.getInstance();
				const lineNumber = editor.selection.active.line;

				if (!notesService.hasNotesForLine(filePath, lineNumber)) {
					vscode.window.showInformationMessage(
						'No notes on this line. Use "Add Note" to create one.'
					);
					return;
				}

				const noteEditorProvider = getNoteEditorProvider();
				if (noteEditorProvider) {
					await noteEditorProvider.showForLine(filePath, lineNumber);
				}
			},
		},
		{
			id: 'developer-tools.deleteNote',
			handler: async () => {
				const editor = vscode.window.activeTextEditor;
				if (!editor) {
					vscode.window.showErrorMessage('Please open a text document to delete notes.');
					return;
				}

				const filePath = getTrackableDocumentPath(editor.document);
				if (!filePath) {
					vscode.window.showErrorMessage('This document type does not support notes.');
					return;
				}

				const notesService = NotesService.getInstance();
				const lineNumber = editor.selection.active.line;
				const notes = notesService.getByLine(filePath, lineNumber);

				if (notes.length === 0) {
					vscode.window.showInformationMessage('No notes on this line.');
					return;
				}

				if (notes.length === 1) {
					const confirmed = await vscode.window.showWarningMessage(
						'Delete this note?',
						{ modal: true },
						'Delete'
					);
					if (confirmed === 'Delete') {
						await notesService.delete(notes[0].id);
						vscode.window.showInformationMessage('Note deleted.');
					}
				} else {
					const items = notes.map((note) => ({
						label: note.text.substring(0, 50) + (note.text.length > 50 ? '...' : ''),
						description: CATEGORY_CONFIG[note.category].label,
						id: note.id,
					}));

					const selected = await vscode.window.showQuickPick(items, {
						placeHolder: 'Select note to delete',
						canPickMany: true,
					});

					if (selected && selected.length > 0) {
						await notesService.bulkDelete(selected.map((s) => s.id));
						vscode.window.showInformationMessage(`Deleted ${selected.length} note(s).`);
					}
				}
			},
		},
		{
			id: 'developer-tools.showNotesPanel',
			handler: async () => {
				await vscode.commands.executeCommand('developer-tools.notesTable.focus');
			},
		},
		{
			id: 'developer-tools.exportNotes',
			handler: async () => {
				const notesService = NotesService.getInstance();
				const exportService = new NotesExportService(notesService);
				await exportService.exportNotes();
				exportService.dispose();
			},
		},
		{
			id: 'developer-tools.importNotes',
			handler: async () => {
				const notesService = NotesService.getInstance();
				const exportService = new NotesExportService(notesService);
				await exportService.importNotes();
				exportService.dispose();
			},
		},
	];
}
