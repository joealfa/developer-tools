import * as vscode from 'vscode';
import type { NoteEditorProvider } from '../webviews/noteEditorProvider';
import type { PortService } from '../ports/portService';
import type { ComplexityService } from '../complexity/complexityService';
import type { SessionTracker } from '../session';
import { getGenerateCommands } from './generate';
import { getNotesCommands } from './notes';
import { getSessionCommands } from './session';
import { getPortsCommands } from './ports';
import { getComplexityCommands } from './complexity';

export interface CommandDependencies {
	getNoteEditorProvider: () => NoteEditorProvider | null;
	getSessionTracker: () => SessionTracker | undefined;
	setSessionTracker: (tracker: SessionTracker | undefined) => void;
	getPortService: () => PortService;
	getComplexityService: () => ComplexityService;
}

export interface CommandDefinition {
	id: string;
	handler: (context: vscode.ExtensionContext) => void;
}

/**
 * Register all commands and return disposables
 */
export function registerCommands(
	context: vscode.ExtensionContext,
	deps: CommandDependencies
): vscode.Disposable[] {
	const commands: CommandDefinition[] = [
		...getGenerateCommands(),
		...getNotesCommands(deps.getNoteEditorProvider),
		...getSessionCommands(deps.getSessionTracker, deps.setSessionTracker),
		...getPortsCommands(deps.getPortService),
		...getComplexityCommands(deps.getComplexityService),
	];

	return commands.map((cmd) =>
		vscode.commands.registerCommand(cmd.id, () => cmd.handler(context))
	);
}
