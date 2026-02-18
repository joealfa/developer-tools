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
import {
	NotesTableProvider,
	PasswordGeneratorProvider,
	NoteEditorProvider,
	PortManagerProvider,
	SessionTrackerProvider,
} from './webviews';
import { ExtensionState } from './extensionState';
import { SessionService, SessionTracker } from './session';
import { PortService } from './ports';
import { ComplexityService, ComplexityDecorations } from './complexity';

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

	// Initialize Note Editor Provider for secondary sidebar
	const noteEditorProvider = new NoteEditorProvider(context, notesService);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			NoteEditorProvider.viewType,
			noteEditorProvider
		)
	);

	// Set up cursor tracker to show/hide note editor
	cursorTracker.setVisibilityCallback(async (show, filePath, lineNumber) => {
		if (show && filePath !== null && lineNumber !== null) {
			await noteEditorProvider.showForLine(filePath, lineNumber, false);
		} else {
			if (noteEditorProvider.isNoteEditorActive() && filePath !== null && lineNumber !== null) {
				noteEditorProvider.updateLine(filePath, lineNumber);
			} else {
				await noteEditorProvider.hide();
			}
		}
	});

	// Store cursor tracker and note editor provider in shared state for commands to access
	ExtensionState.setCursorTracker(cursorTracker);
	ExtensionState.setNoteEditorProvider(noteEditorProvider);

	// Register Notes Table Provider
	const notesTableProvider = new NotesTableProvider(context, notesService);
	notesTableProvider.setNoteEditorProvider(noteEditorProvider);
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

	// ===== Session Tracker =====
	const sessionService = SessionService.getInstance(context);
	await sessionService.initialize();

	const sessionProvider = new SessionTrackerProvider(context, sessionService);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			SessionTrackerProvider.viewType,
			sessionProvider
		)
	);

	const config = vscode.workspace.getConfiguration('developer-tools');
	let sessionTracker: SessionTracker | undefined;
	if (config.get('session.enabled')) {
		sessionTracker = new SessionTracker(sessionService);

		// Recover any unsaved session from a previous VS Code instance
		const recovered = await sessionService.recoverSession();
		if (recovered) {
			const duration = sessionService.formatDuration(recovered.totalEstimatedTimeMs);
			const action = await vscode.window.showInformationMessage(
				`Recovered unsaved session from ${new Date(recovered.startedAt).toLocaleString()} (${duration}, ${recovered.files.length} files).`,
				'View Session',
				'Dismiss'
			);
			if (action === 'View Session') {
				vscode.commands.executeCommand('developer-tools.sessionTracker.focus');
			}
		}

		// Auto-start session if configured
		if (config.get('session.autoStart')) {
			sessionService.startSession();
		}
	}

	// ===== Port Manager =====
	const portService = new PortService();
	ExtensionState.setPortService(portService);

	const portManagerProvider = new PortManagerProvider(context, portService);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			PortManagerProvider.viewType,
			portManagerProvider
		)
	);

	// ===== Complexity Hints =====
	const complexityService = new ComplexityService();
	ExtensionState.setComplexityService(complexityService);

	const complexityDecorations = new ComplexityDecorations(complexityService, context);

	// Register all commands
	const disposables = registerCommands(context);
	context.subscriptions.push(...disposables);

	// Add all disposables to subscriptions for cleanup
	context.subscriptions.push(
		lineTracker,
		fileTracker,
		cursorTracker,
		workspaceTracker,
		exportService,
		decorations,
		notesTableProvider,
		notesService,
		sessionService,
		sessionProvider,
		portService,
		portManagerProvider,
		complexityService,
		complexityDecorations,
		...(sessionTracker ? [sessionTracker] : []),
	);
}

/**
 * This method is called when your extension is deactivated.
 */
export function deactivate(): void {
	// Persist current session immediately so nothing is lost
	try {
		SessionService.getInstance()?.persistCurrentSessionSync();
	} catch {
		// Service may not be initialized
	}

	NotesService.resetInstance();
	SessionService.resetInstance();
	ExtensionState.reset();
}
