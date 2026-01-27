import * as vscode from 'vscode';
import { registerCommands } from './commands';
import {
	NotesService,
	NotesLineTracker,
	NotesFileTracker,
	NotesCursorTracker,
	NotesDecorations,
	NotesWorkspaceTracker,
	NotesExportService,
} from './notes';
import { NotesPanel, NotesTableProvider, PasswordGeneratorProvider, NoteEditorProvider } from './webviews';
import { ExtensionState } from './extensionState';

/**
 * This method is called when your extension is activated.
 * The extension is activated the very first time a command is executed.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	console.log('Extension "developer-tools" is now active!');

	// Initialize Notes Service
	const notesService = NotesService.getInstance(context);
	await notesService.initialize();

	// Initialize Notes Trackers
	const lineTracker = new NotesLineTracker(notesService);
	const fileTracker = new NotesFileTracker(notesService);
	const cursorTracker = new NotesCursorTracker(notesService);
	const workspaceTracker = new NotesWorkspaceTracker(notesService);
	const exportService = new NotesExportService(notesService);

	// Initialize Notes Decorations
	const decorations = new NotesDecorations(notesService, context);

	// Initialize Notes Panel
	const notesPanel = NotesPanel.getInstance(context, notesService);

	// Initialize Note Editor Provider for secondary sidebar
	const noteEditorProvider = new NoteEditorProvider(context, notesService);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			NoteEditorProvider.viewType,
			noteEditorProvider
		)
	);

	// Wire up cursor tracker with panel for focus management
	notesPanel.setCursorTracker(cursorTracker);

	// Set up cursor tracker to show/hide notes panel
	cursorTracker.setVisibilityCallback(async (show, filePath, lineNumber) => {
		if (show && filePath !== null && lineNumber !== null) {
			// Show in secondary sidebar instead of panel (will auto-close if no notes)
			await noteEditorProvider.showForLine(filePath, lineNumber);
		} else {
			// Hide when moving away from notes
			await noteEditorProvider.hide();
		}
	});

	// Store cursor tracker and note editor provider in shared state for commands to access
	ExtensionState.setCursorTracker(cursorTracker);
	ExtensionState.setNoteEditorProvider(noteEditorProvider);

	// Register Notes Table Provider
	const notesTableProvider = new NotesTableProvider(context, notesService);
	notesTableProvider.setNoteEditorProvider(noteEditorProvider); // Wire up for navigation
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			NotesTableProvider.viewType,
			notesTableProvider
		)
	);

	// Register Password Generator Provider for sidebar
	const passwordGeneratorProvider = new PasswordGeneratorProvider(context);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			PasswordGeneratorProvider.viewType,
			passwordGeneratorProvider
		)
	);

	// Handle storage warnings
	context.subscriptions.push(
		notesService.onStorageWarning(async (event) => {
			if (event.level === 'critical') {
				const action = await vscode.window.showWarningMessage(
					event.message,
					'Migrate Now',
					'Dismiss'
				);
				if (action === 'Migrate Now') {
					await notesService.migrateToFileStorage();
					vscode.window.showInformationMessage('Notes migrated to file storage.');
				}
			} else {
				vscode.window.showWarningMessage(event.message);
			}
		})
	);

	// Register all commands
	const disposables = registerCommands(context);
	context.subscriptions.push(...disposables);

	// Add trackers to subscriptions for cleanup
	context.subscriptions.push(
		lineTracker,
		fileTracker,
		cursorTracker,
		workspaceTracker,
		exportService,
		decorations,
		notesPanel,
		notesTableProvider,
		notesService
	);
}

/**
 * This method is called when your extension is deactivated.
 */
export function deactivate(): void {
	// Cleanup is handled by disposables in context.subscriptions
	NotesService.resetInstance();
	ExtensionState.reset();
}
