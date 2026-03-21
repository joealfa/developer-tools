import * as vscode from 'vscode';
import type { PortService } from '../ports/portService';
import type { CommandDefinition } from './index';

async function promptEnableFeature(
	configKey: string,
	featureName: string,
	context: vscode.ExtensionContext
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
	return true;
}

export function getPortsCommands(getPortService: () => PortService): CommandDefinition[] {
	return [
		{
			id: 'developer-tools.refreshPorts',
			handler: async (context) => {
				const enabled = await promptEnableFeature('ports.enabled', 'Port Manager', context);
				if (!enabled) {
					return;
				}
				await getPortService().scan();
			},
		},
		{
			id: 'developer-tools.killPort',
			handler: async (context) => {
				const enabled = await promptEnableFeature('ports.enabled', 'Port Manager', context);
				if (!enabled) {
					return;
				}
				const portService = getPortService();
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
	];
}
