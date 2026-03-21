import * as vscode from 'vscode';
import { SessionService, SessionTracker } from '../session';
import type { CommandDefinition } from './index';

type GetSessionTracker = () => SessionTracker | undefined;
type SetSessionTracker = (tracker: SessionTracker | undefined) => void;

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

export function getSessionCommands(
	getSessionTracker: GetSessionTracker,
	setSessionTracker: SetSessionTracker
): CommandDefinition[] {
	const ensureSessionTracker = (context: vscode.ExtensionContext): void => {
		if (!getSessionTracker()) {
			const tracker = new SessionTracker(SessionService.getInstance());
			setSessionTracker(tracker);
			context.subscriptions.push(tracker);
		}
	};

	return [
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
				vscode.window.showInformationMessage(
					'Session tracking stopped and saved to history.'
				);
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
				const tracker = getSessionTracker();
				setSessionTracker(undefined);
				tracker?.dispose();
				await config.update('session.enabled', false, vscode.ConfigurationTarget.Global);
				vscode.window.showInformationMessage('Session Tracker disabled.');
			},
		},
	];
}
