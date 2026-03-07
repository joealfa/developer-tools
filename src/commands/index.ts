import * as vscode from 'vscode';
import {
	generateUuid,
	generateGuid,
	generateUuidCompact,
	generateGuidCompact,
	generateUuidBraces,
	generateGuidBraces,
	generatePassword,
	DEFAULT_PASSWORD_OPTIONS,
} from '../generators';
import type { PasswordOptions } from '../generators';
import { getTrackableDocumentPath, insertTextAtCursor } from '../utils';
import { NotesService, NotesExportService, CATEGORY_CONFIG } from '../notes';
import { ExtensionState } from '../extensionState';
import { SessionService, SessionTracker } from '../session';

/**
 * Prompt the user to enable a feature if it's not already enabled.
 * Returns true if the feature is (or becomes) enabled, false if the user declined.
 */
async function promptEnableFeature(
	configKey: string,
	featureName: string,
	context: vscode.ExtensionContext,
	onEnabled?: (context: vscode.ExtensionContext) => void
): Promise<boolean> {
	const config = vscode.workspace.getConfiguration('developer-tools');
	if (config.get<boolean>(configKey, false)) {
		return true;
	}
	const answer = await vscode.window.showInformationMessage(
		`${featureName} is not enabled. Would you like to enable it?`,
		'Enable',
		'Cancel'
	);
	if (answer !== 'Enable') {
		return false;
	}
	await config.update(configKey, true, vscode.ConfigurationTarget.Global);
	onEnabled?.(context);
	return true;
}

/**
 * Ensures a SessionTracker is running (creates one if not already active).
 */
function ensureSessionTracker(context: vscode.ExtensionContext): void {
	if (!ExtensionState.getSessionTracker()) {
		const tracker = new SessionTracker(SessionService.getInstance());
		ExtensionState.setSessionTracker(tracker);
		context.subscriptions.push(tracker);
	}
}

/**
 * Insert text into the captured editor at all cursor positions.
 * For non-text-editor contexts (Settings, Find bar, etc.) VS Code's API
 * cannot insert programmatically, so we copy to clipboard and try the
 * built-in `type` command as a best-effort fallback (works in terminal
 * and some other editor-like inputs).
 */
async function insertOrCopy(value: string, capturedEditor: vscode.TextEditor | undefined): Promise<void> {
	await vscode.env.clipboard.writeText(value);

	// Prefer the editor captured before the pickers opened; fall back to
	// whatever is active now in case focus shifted during the picker flow.
	const editor = capturedEditor ?? vscode.window.activeTextEditor;

	if (editor) {
		await editor.edit((editBuilder) => {
			for (const selection of editor.selections) {
				if (selection.isEmpty) {
					editBuilder.insert(selection.active, value);
				} else {
					editBuilder.replace(selection, value);
				}
			}
		});
	} else {
		// Try the VS Code 'type' command — works in terminal and similar inputs,
		// silently ignored where unsupported (e.g. Settings search, Find bar).
		vscode.commands.executeCommand('type', { text: value }).then(undefined, () => {});
		vscode.window.showInformationMessage(`Copied to clipboard — press Ctrl+V to paste: ${value}`);
	}
}

/**
 * Show the UUID/GUID format picker and return the generated value.
 */
async function pickAndGenerateUuid(): Promise<string | undefined> {
	// Generate one sample UUID upfront so every format shows a real preview value
	const sample = generateUuid();

	const formats = [
		{ label: 'UUID  (lowercase)',                   description: sample,                                   generator: generateUuid },
		{ label: 'GUID  (uppercase)',                   description: sample.toUpperCase(),                     generator: generateGuid },
		{ label: 'UUID  compact (lowercase, no hyphens)', description: sample.replace(/-/g, ''),              generator: generateUuidCompact },
		{ label: 'GUID  compact (uppercase, no hyphens)', description: sample.replace(/-/g, '').toUpperCase(), generator: generateGuidCompact },
		{ label: 'UUID  with braces',                   description: `{${sample}}`,                            generator: generateUuidBraces },
		{ label: 'GUID  with braces',                   description: `{${sample.toUpperCase()}}`,              generator: generateGuidBraces },
	] as const;

	const picked = await vscode.window.showQuickPick(
		formats.map(({ label, description }) => ({ label, description })),
		{ title: 'Generate & Insert — UUID / GUID', placeHolder: 'Select format (description shows a live preview)' }
	);

	if (!picked) {
		return undefined;
	}
	const match = formats.find((f) => f.label === picked.label);
	return match ? match.generator() : undefined;
}

/**
 * Show the password options flow (length → character types) and return generated password.
 */
async function pickAndGeneratePassword(): Promise<string | undefined> {
	// Step 1: Length
	const lengthStr = await vscode.window.showInputBox({
		title: 'Generate & Insert — Password (1/2)',
		prompt: 'Enter password length',
		value: String(DEFAULT_PASSWORD_OPTIONS.length),
		validateInput: (v) => {
			const n = parseInt(v, 10);
			if (isNaN(n) || n < 4 || n > 128) {
				return 'Length must be between 4 and 128';
			}
			return null;
		},
	});
	if (lengthStr === undefined) {
		return undefined;
	}
	const length = parseInt(lengthStr, 10);

	// Step 2: Character type options
	interface OptionItem extends vscode.QuickPickItem {
		key: keyof PasswordOptions;
	}
	const optionItems: OptionItem[] = [
		{
			label: 'Uppercase letters (A–Z)',
			picked: DEFAULT_PASSWORD_OPTIONS.includeUppercase,
			key: 'includeUppercase',
		},
		{
			label: 'Lowercase letters (a–z)',
			picked: DEFAULT_PASSWORD_OPTIONS.includeLowercase,
			key: 'includeLowercase',
		},
		{
			label: 'Numbers (0–9)',
			picked: DEFAULT_PASSWORD_OPTIONS.includeNumbers,
			key: 'includeNumbers',
		},
		{
			label: 'Special characters (!@#$%^&*)',
			picked: DEFAULT_PASSWORD_OPTIONS.includeSpecial,
			key: 'includeSpecial',
		},
		{
			label: 'Avoid ambiguous characters (0, O, l, 1, I)',
			picked: DEFAULT_PASSWORD_OPTIONS.avoidAmbiguous,
			key: 'avoidAmbiguous',
		},
	];

	const selected = await vscode.window.showQuickPick(optionItems, {
		title: 'Generate & Insert — Password (2/2)',
		placeHolder: 'Select character types, then press Enter',
		canPickMany: true,
	});
	if (selected === undefined) {
		return undefined;
	}

	const selectedKeys = new Set(selected.map((i) => i.key));
	const options: PasswordOptions = {
		...DEFAULT_PASSWORD_OPTIONS,
		length,
		includeUppercase: selectedKeys.has('includeUppercase'),
		includeLowercase: selectedKeys.has('includeLowercase'),
		includeNumbers: selectedKeys.has('includeNumbers'),
		includeSpecial: selectedKeys.has('includeSpecial'),
		avoidAmbiguous: selectedKeys.has('avoidAmbiguous'),
		// Keep at least 1 required char only when that type is enabled
		minNumbers: selectedKeys.has('includeNumbers') ? DEFAULT_PASSWORD_OPTIONS.minNumbers : 0,
		minSpecial: selectedKeys.has('includeSpecial') ? DEFAULT_PASSWORD_OPTIONS.minSpecial : 0,
	};

	const password = generatePassword(options);
	if (!password) {
		vscode.window.showErrorMessage(
			'Could not generate password — please select at least one character type.'
		);
		return undefined;
	}
	return password;
}

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
		id: 'developer-tools.generateAndInsert',
		handler: async () => {
			// Capture the active text editor BEFORE the QuickPick steals focus
			const capturedEditor = vscode.window.activeTextEditor;

			const typeItem = await vscode.window.showQuickPick(
				[
					{
						label: '$(symbol-numeric)  UUID / GUID',
						description: 'Generate a unique identifier',
						id: 'uuid',
					},
					{
						label: '$(lock)  Password',
						description: 'Generate a secure password',
						id: 'password',
					},
				],
				{ title: 'Generate & Insert', placeHolder: 'What do you want to generate?' }
			);
			if (!typeItem) {
				return;
			}

			let value: string | undefined;
			if (typeItem.id === 'uuid') {
				value = await pickAndGenerateUuid();
			} else {
				value = await pickAndGeneratePassword();
			}

			if (value !== undefined) {
				await insertOrCopy(value, capturedEditor);
			}
		},
	},
	{
		id: 'developer-tools.insertUuid',
		handler: () => {
			insertTextAtCursor(generateUuid);
		},
	},
	{
		id: 'developer-tools.insertGuid',
		handler: () => {
			insertTextAtCursor(generateGuid);
		},
	},
	{
		id: 'developer-tools.insertUuidCompact',
		handler: () => {
			insertTextAtCursor(generateUuidCompact);
		},
	},
	{
		id: 'developer-tools.insertGuidCompact',
		handler: () => {
			insertTextAtCursor(generateGuidCompact);
		},
	},
	{
		id: 'developer-tools.generatePassword',
		handler: async () => {
			await vscode.commands.executeCommand('developer-tools.passwordGenerator.focus');
		},
	},
	// Notes commands
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

			const noteEditorProvider = ExtensionState.getNoteEditorProvider();
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

			const noteEditorProvider = ExtensionState.getNoteEditorProvider();
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
	// Session Tracker commands
	{
		id: 'developer-tools.startSession',
		handler: async (context) => {
			const config = vscode.workspace.getConfiguration('developer-tools');
			if (!config.get<boolean>('session.enabled', false)) {
				await config.update('session.enabled', true, vscode.ConfigurationTarget.Global);
			}
			ensureSessionTracker(context);
			SessionService.getInstance().startSession();
			await vscode.commands.executeCommand('developer-tools.sessionTracker.focus');
			vscode.window.showInformationMessage('Session tracking started.');
		},
	},
	{
		id: 'developer-tools.stopSession',
		handler: async (context) => {
			const enabled = await promptEnableFeature(
				'session.enabled',
				'Session Tracker',
				context,
				ensureSessionTracker
			);
			if (!enabled) {
				return;
			}
			ensureSessionTracker(context);
			const sessionService = SessionService.getInstance();
			await sessionService.stopSession();
			vscode.window.showInformationMessage('Session tracking stopped and saved to history.');
		},
	},
	{
		id: 'developer-tools.resetSession',
		handler: async (context) => {
			const enabled = await promptEnableFeature(
				'session.enabled',
				'Session Tracker',
				context,
				ensureSessionTracker
			);
			if (!enabled) {
				return;
			}
			ensureSessionTracker(context);
			const sessionService = SessionService.getInstance();
			sessionService.resetSession();
			vscode.window.showInformationMessage('Session reset.');
		},
	},
	{
		id: 'developer-tools.showSessionSummary',
		handler: async (context) => {
			const enabled = await promptEnableFeature(
				'session.enabled',
				'Session Tracker',
				context,
				ensureSessionTracker
			);
			if (!enabled) {
				return;
			}
			await vscode.commands.executeCommand('developer-tools.sessionTracker.focus');
		},
	},
	{
		id: 'developer-tools.showSessionHistory',
		handler: async (context) => {
			const enabled = await promptEnableFeature(
				'session.enabled',
				'Session Tracker',
				context,
				ensureSessionTracker
			);
			if (!enabled) {
				return;
			}
			await vscode.commands.executeCommand('developer-tools.sessionTracker.focus');
		},
	},
	{
		id: 'developer-tools.deleteSession',
		handler: async (context) => {
			const enabled = await promptEnableFeature(
				'session.enabled',
				'Session Tracker',
				context,
				ensureSessionTracker
			);
			if (!enabled) {
				return;
			}
			const sessionService = SessionService.getInstance();
			const history = await sessionService.getSessionHistory();
			if (history.length === 0) {
				vscode.window.showInformationMessage('No session history to delete.');
				return;
			}
			const items = history.map((h) => ({
				label: new Date(h.startedAt).toLocaleString(),
				description: `${h.totalFiles} files, ${h.status}`,
				id: h.id,
			}));
			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: 'Select session to delete',
			});
			if (selected) {
				await sessionService.deleteHistorySession(selected.id);
				vscode.window.showInformationMessage('Session deleted.');
			}
		},
	},
	{
		id: 'developer-tools.deleteAllSessions',
		handler: async (context) => {
			const enabled = await promptEnableFeature(
				'session.enabled',
				'Session Tracker',
				context,
				ensureSessionTracker
			);
			if (!enabled) {
				return;
			}
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
		},
	},
	{
		id: 'developer-tools.disableSession',
		handler: async () => {
			const config = vscode.workspace.getConfiguration('developer-tools');
			if (!config.get<boolean>('session.enabled', false)) {
				vscode.window.showInformationMessage('Session Tracker is already disabled.');
				return;
			}
			const sessionService = SessionService.getInstance();
			if (sessionService.isActive()) {
				await sessionService.stopSession();
			}
			const tracker = ExtensionState.takeSessionTracker();
			tracker?.dispose();
			await config.update('session.enabled', false, vscode.ConfigurationTarget.Global);
			vscode.window.showInformationMessage('Session Tracker disabled.');
		},
	},
	// Port Manager commands
	{
		id: 'developer-tools.refreshPorts',
		handler: async (context) => {
			const enabled = await promptEnableFeature('ports.enabled', 'Port Manager', context);
			if (!enabled) {
				return;
			}
			const portService = ExtensionState.getPortService();
			if (portService) {
				await portService.scan();
			}
		},
	},
	{
		id: 'developer-tools.killPort',
		handler: async (context) => {
			const enabled = await promptEnableFeature('ports.enabled', 'Port Manager', context);
			if (!enabled) {
				return;
			}
			const portService = ExtensionState.getPortService();
			if (!portService) {
				return;
			}
			const ports = portService.getPorts();
			if (ports.length === 0) {
				vscode.window.showInformationMessage('No listening ports found.');
				return;
			}
			const items = ports.map((p) => ({
				label: `:${p.port}`,
				description: `PID ${p.pid} - ${p.processName}`,
				pid: p.pid,
			}));
			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: 'Select port to kill',
			});
			if (selected) {
				const success = await portService.killProcess(selected.pid);
				if (success) {
					vscode.window.showInformationMessage(`Process ${selected.pid} terminated.`);
					await portService.scan();
				} else {
					vscode.window.showErrorMessage(`Failed to kill process ${selected.pid}.`);
				}
			}
		},
	},
	{
		id: 'developer-tools.showPortManager',
		handler: async () => {
			const config = vscode.workspace.getConfiguration('developer-tools');
			if (!config.get<boolean>('ports.enabled', false)) {
				await config.update('ports.enabled', true, vscode.ConfigurationTarget.Global);
			}
			await vscode.commands.executeCommand('developer-tools.portManager.focus');
		},
	},
	{
		id: 'developer-tools.disablePorts',
		handler: async () => {
			const config = vscode.workspace.getConfiguration('developer-tools');
			if (!config.get<boolean>('ports.enabled', false)) {
				vscode.window.showInformationMessage('Port Manager is already disabled.');
				return;
			}
			await config.update('ports.enabled', false, vscode.ConfigurationTarget.Global);
			vscode.window.showInformationMessage('Port Manager disabled.');
		},
	},
	// Complexity commands
	{
		id: 'developer-tools.toggleComplexityHints',
		handler: async () => {
			const config = vscode.workspace.getConfiguration('developer-tools');
			const current = config.get<boolean>('complexity.enabled', false);
			await config.update('complexity.enabled', !current, vscode.ConfigurationTarget.Global);
			vscode.window.showInformationMessage(
				`Complexity hints ${!current ? 'enabled' : 'disabled'}.`
			);
		},
	},
	{
		id: 'developer-tools.analyzeFileComplexity',
		handler: () => {
			const complexityService = ExtensionState.getComplexityService();
			const editor = vscode.window.activeTextEditor;
			if (!editor || !complexityService) {
				return;
			}
			complexityService.analyzeDocument(editor.document);
		},
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
				vscode.window.showInformationMessage(
					'No functions found or language not supported.'
				);
				return;
			}

			const sorted = [...results].sort(
				(a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity
			);
			const channel = vscode.window.createOutputChannel('Complexity Report');
			channel.clear();
			channel.appendLine(
				`Complexity Report: ${vscode.workspace.asRelativePath(editor.document.uri)}`
			);
			channel.appendLine('='.repeat(60));
			channel.appendLine('');
			channel.appendLine(
				`${'Function'.padEnd(35)} ${'CC'.padStart(4)} ${'COG'.padStart(5)} ${'Lines'.padStart(6)}`
			);
			channel.appendLine('-'.repeat(60));

			for (const r of sorted) {
				channel.appendLine(
					`${r.functionName.padEnd(35)} ${String(r.cyclomaticComplexity).padStart(4)} ${String(r.cognitiveComplexity).padStart(5)} ${String(r.lineCount).padStart(6)}`
				);
			}

			channel.show();
		},
	},
];

/**
 * Register all commands and return disposables
 */
export function registerCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
	return commands.map((cmd) =>
		vscode.commands.registerCommand(cmd.id, () => cmd.handler(context))
	);
}
