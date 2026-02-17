import * as vscode from 'vscode';
import { generateUuid, generateGuid, generateUuidCompact, generateGuidCompact } from '../generators';
import { insertTextAtCursor } from '../utils';
import {
	NotesService,
	NotesExportService,
	CATEGORY_CONFIG,
} from '../notes';
import { ExtensionState } from '../extensionState';

/**
 * Command definitions for the extension
 */
interface CommandDefinition {
	id: string;
	handler: (context: vscode.ExtensionContext) => void;
}

/**
 * All available commands
 */
const commands: CommandDefinition[] = [
	{
		id: 'developer-tools.insertUuid',
		handler: () => {
			insertTextAtCursor(generateUuid);
		}
	},
	{
		id: 'developer-tools.insertGuid',
		handler: () => {
			insertTextAtCursor(generateGuid);
		}
	},
	{
		id: 'developer-tools.insertUuidCompact',
		handler: () => {
			insertTextAtCursor(generateUuidCompact);
		}
	},
	{
		id: 'developer-tools.insertGuidCompact',
		handler: () => {
			insertTextAtCursor(generateGuidCompact);
		}
	},
	{
		id: 'developer-tools.generatePassword',
		handler: async () => {
			// Open the Developer Tools sidebar and focus on Password Generator view
			await vscode.commands.executeCommand('developer-tools.passwordGenerator.focus');
		}
	},
	// Notes commands
	{
		id: 'developer-tools.addNote',
		handler: async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.uri.scheme !== 'file') {
				vscode.window.showErrorMessage('Please open a file to add a note.');
				return;
			}

			const noteEditorProvider = ExtensionState.getNoteEditorProvider();
			
			const filePath = vscode.workspace.asRelativePath(editor.document.uri, false);
			const lineNumber = editor.selection.active.line;
			
			// Always show the Note Editor with add form, without stealing focus
			if (noteEditorProvider) {
				await noteEditorProvider.showForLine(filePath, lineNumber, true);
			}
		}
	},
	{
		id: 'developer-tools.editNote',
		handler: async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.uri.scheme !== 'file') {
				vscode.window.showErrorMessage('Please open a file to edit notes.');
				return;
			}

			const notesService = NotesService.getInstance();
			const filePath = vscode.workspace.asRelativePath(editor.document.uri, false);
			const lineNumber = editor.selection.active.line;
			
			if (!notesService.hasNotesForLine(filePath, lineNumber)) {
				vscode.window.showInformationMessage('No notes on this line. Use "Add Note" to create one.');
				return;
			}

			const noteEditorProvider = ExtensionState.getNoteEditorProvider();
			if (noteEditorProvider) {
				await noteEditorProvider.showForLine(filePath, lineNumber);
			}
		}
	},
	{
		id: 'developer-tools.deleteNote',
		handler: async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.uri.scheme !== 'file') {
				vscode.window.showErrorMessage('Please open a file to delete notes.');
				return;
			}

			const notesService = NotesService.getInstance();
			const filePath = vscode.workspace.asRelativePath(editor.document.uri, false);
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
				// Multiple notes - let user choose
				const items = notes.map(note => ({
					label: note.text.substring(0, 50) + (note.text.length > 50 ? '...' : ''),
					description: CATEGORY_CONFIG[note.category].label,
					id: note.id,
				}));

				const selected = await vscode.window.showQuickPick(items, {
					placeHolder: 'Select note to delete',
					canPickMany: true,
				});

				if (selected && selected.length > 0) {
					await notesService.bulkDelete(selected.map(s => s.id));
					vscode.window.showInformationMessage(`Deleted ${selected.length} note(s).`);
				}
			}
		}
	},
	{
		id: 'developer-tools.showNotesPanel',
		handler: async () => {
			// Open the Developer Tools sidebar and focus on Notes view
			await vscode.commands.executeCommand('developer-tools.notesTable.focus');
		}
	},
	{
		id: 'developer-tools.exportNotes',
		handler: async () => {
			const notesService = NotesService.getInstance();
			const exportService = new NotesExportService(notesService);
			await exportService.exportNotes();
			exportService.dispose();
		}
	},
	{
		id: 'developer-tools.importNotes',
		handler: async () => {
			const notesService = NotesService.getInstance();
			const exportService = new NotesExportService(notesService);
			await exportService.importNotes();
			exportService.dispose();
		}
	},
	{
		id: 'developer-tools.manageNotesStorage',
		handler: async () => {
			const notesService = NotesService.getInstance();
			const stats = notesService.getStorageStats();
			const storageType = notesService.getStorageType();

			const sizeKB = (stats.size / 1024).toFixed(2);
			const limitMB = (stats.limit / (1024 * 1024)).toFixed(0);

			const message = `Notes Storage\n\nType: ${storageType}\nUsage: ${sizeKB} KB (${stats.percentage.toFixed(1)}%)\nLimit: ${limitMB} MB`;

			const action = await vscode.window.showInformationMessage(
				message,
				'Migrate to File Storage',
				'Export Notes',
				'Close'
			);

			if (action === 'Migrate to File Storage') {
				await notesService.migrateToFileStorage();
				vscode.window.showInformationMessage('Migrated to file-based storage.');
			} else if (action === 'Export Notes') {
				await vscode.commands.executeCommand('developer-tools.exportNotes');
			}
		}
	}
];

/**
 * Register all commands and return disposables
 */
export function registerCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
	return commands.map(cmd => 
		vscode.commands.registerCommand(cmd.id, () => cmd.handler(context))
	);
}
