import * as vscode from 'vscode';
import { generateUuid, generateGuid, generateUuidCompact, generateGuidCompact } from '../generators';
import { insertTextAtCursor } from '../utils';
import {
	NotesService,
	NotesExportService,
	CATEGORY_CONFIG,
} from '../notes';
import { ExtensionState } from '../extensionState';
import { SessionService } from '../session';

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
	// Session Tracker commands
	{
		id: 'developer-tools.startSession',
		handler: () => {
			const sessionService = SessionService.getInstance();
			sessionService.startSession();
			vscode.window.showInformationMessage('Session tracking started.');
		}
	},
	{
		id: 'developer-tools.stopSession',
		handler: async () => {
			const sessionService = SessionService.getInstance();
			await sessionService.stopSession();
			vscode.window.showInformationMessage('Session tracking stopped and saved to history.');
		}
	},
	{
		id: 'developer-tools.resetSession',
		handler: () => {
			const sessionService = SessionService.getInstance();
			sessionService.resetSession();
			vscode.window.showInformationMessage('Session reset.');
		}
	},
	{
		id: 'developer-tools.showSessionSummary',
		handler: async () => {
			await vscode.commands.executeCommand('developer-tools.sessionTracker.focus');
		}
	},
	{
		id: 'developer-tools.showSessionHistory',
		handler: async () => {
			await vscode.commands.executeCommand('developer-tools.sessionTracker.focus');
		}
	},
	{
		id: 'developer-tools.deleteSession',
		handler: async () => {
			const sessionService = SessionService.getInstance();
			const history = await sessionService.getSessionHistory();
			if (history.length === 0) {
				vscode.window.showInformationMessage('No session history to delete.');
				return;
			}
			const items = history.map(h => ({
				label: new Date(h.startedAt).toLocaleString(),
				description: `${h.totalFiles} files, ${h.status}`,
				id: h.id,
			}));
			const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select session to delete' });
			if (selected) {
				await sessionService.deleteHistorySession(selected.id);
				vscode.window.showInformationMessage('Session deleted.');
			}
		}
	},
	{
		id: 'developer-tools.deleteAllSessions',
		handler: async () => {
			const confirmed = await vscode.window.showWarningMessage(
				'Delete all session history?',
				{ modal: true },
				'Delete All'
			);
			if (confirmed === 'Delete All') {
				const sessionService = SessionService.getInstance();
				await sessionService.deleteAllHistory();
				vscode.window.showInformationMessage('All session history deleted.');
			}
		}
	},
	// Port Manager commands
	{
		id: 'developer-tools.refreshPorts',
		handler: async () => {
			const portService = ExtensionState.getPortService();
			if (portService) {
				await portService.scan();
			}
		}
	},
	{
		id: 'developer-tools.killPort',
		handler: async () => {
			const portService = ExtensionState.getPortService();
			if (!portService) { return; }
			const ports = portService.getPorts();
			if (ports.length === 0) {
				vscode.window.showInformationMessage('No listening ports found.');
				return;
			}
			const items = ports.map(p => ({
				label: `:${p.port}`,
				description: `PID ${p.pid} - ${p.processName}`,
				pid: p.pid,
			}));
			const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select port to kill' });
			if (selected) {
				const success = await portService.killProcess(selected.pid);
				if (success) {
					vscode.window.showInformationMessage(`Process ${selected.pid} terminated.`);
					await portService.scan();
				} else {
					vscode.window.showErrorMessage(`Failed to kill process ${selected.pid}.`);
				}
			}
		}
	},
	{
		id: 'developer-tools.showPortManager',
		handler: async () => {
			await vscode.commands.executeCommand('developer-tools.portManager.focus');
		}
	},
	// Complexity commands
	{
		id: 'developer-tools.toggleComplexityHints',
		handler: async () => {
			const config = vscode.workspace.getConfiguration('developer-tools');
			const current = config.get<boolean>('complexity.enabled', true);
			await config.update('complexity.enabled', !current, vscode.ConfigurationTarget.Global);
			vscode.window.showInformationMessage(`Complexity hints ${!current ? 'enabled' : 'disabled'}.`);
		}
	},
	{
		id: 'developer-tools.analyzeFileComplexity',
		handler: () => {
			const complexityService = ExtensionState.getComplexityService();
			const editor = vscode.window.activeTextEditor;
			if (!editor || !complexityService) { return; }
			complexityService.analyzeDocument(editor.document);
		}
	},
	{
		id: 'developer-tools.showComplexityReport',
		handler: () => {
			const complexityService = ExtensionState.getComplexityService();
			const editor = vscode.window.activeTextEditor;
			if (!editor || !complexityService) {
				vscode.window.showInformationMessage('Open a file to see complexity report.');
				return;
			}

			complexityService.analyzeDocument(editor.document);
			const results = complexityService.getComplexity(editor.document.uri);

			if (results.length === 0) {
				vscode.window.showInformationMessage('No functions found or language not supported.');
				return;
			}

			const sorted = [...results].sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity);
			const channel = vscode.window.createOutputChannel('Complexity Report');
			channel.clear();
			channel.appendLine(`Complexity Report: ${vscode.workspace.asRelativePath(editor.document.uri)}`);
			channel.appendLine('='.repeat(60));
			channel.appendLine('');
			channel.appendLine(`${'Function'.padEnd(35)} ${'CC'.padStart(4)} ${'COG'.padStart(5)} ${'Lines'.padStart(6)}`);
			channel.appendLine('-'.repeat(60));

			for (const r of sorted) {
				channel.appendLine(
					`${r.functionName.padEnd(35)} ${String(r.cyclomaticComplexity).padStart(4)} ${String(r.cognitiveComplexity).padStart(5)} ${String(r.lineCount).padStart(6)}`
				);
			}

			channel.show();
		}
	},
];

/**
 * Register all commands and return disposables
 */
export function registerCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
	return commands.map(cmd =>
		vscode.commands.registerCommand(cmd.id, () => cmd.handler(context))
	);
}
