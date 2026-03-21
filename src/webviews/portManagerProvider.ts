/**
 * Port Manager WebView Provider for the sidebar
 */

import * as vscode from 'vscode';
import { PortService, PortInfo } from '../ports';
import { escapeHtml } from '../utils';
import { createWebviewNonce, getWebviewCspMetaTagWithScript, getWebviewScriptUri } from './security';
import portManagerHtml from './templates/portManager.html';

export class PortManagerProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	public static readonly viewType = 'developer-tools.portManager';

	private view?: vscode.WebviewView;
	private disposables: vscode.Disposable[] = [];

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly portService: PortService
	) {
		this.disposables.push(
			portService.onDidChangePorts((ports) => {
				this.view?.webview.postMessage({
					command: 'ports-updated',
					ports: this.sanitizePorts(ports),
				});
			})
		);
	}

	public resolveWebviewView(
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
			async (message) => {
				if (
					!message ||
					typeof message !== 'object' ||
					typeof message.command !== 'string'
				) {
					return;
				}

				switch (message.command) {
					case 'refresh':
						await this.portService.scan();
						break;
					case 'kill': {
						if (!Number.isInteger(message.pid) || message.pid <= 0) {
							break;
						}
						const success = await this.portService.killProcess(message.pid);
						if (success) {
							vscode.window.showInformationMessage(
								`Process ${message.pid} terminated.`
							);
							await this.portService.scan();
						} else {
							vscode.window.showErrorMessage(
								`Failed to kill process ${message.pid}. You may need elevated permissions.`
							);
						}
						break;
					}
					case 'toggle-auto-refresh':
						if (message.enabled === true) {
							this.portService.startAutoRefresh();
						} else if (message.enabled === false) {
							this.portService.stopAutoRefresh();
						}
						break;
					case 'filter': {
						const filterText = typeof message.text === 'string' ? message.text : '';
						const filtered = this.portService.getFilteredPorts(filterText);
						webviewView.webview.postMessage({
							command: 'ports-updated',
							ports: this.sanitizePorts(filtered),
						});
						break;
					}
				}
			},
			undefined,
			this.context.subscriptions
		);

		// Initial scan
		this.portService.scan();
		this.portService.startAutoRefresh();
	}

	private getHtml(webview: vscode.Webview): string {
		const nonce = createWebviewNonce();
		const scriptUri = getWebviewScriptUri(webview, this.context.extensionUri, 'portManager.js');
		const cspMetaTag = getWebviewCspMetaTagWithScript(nonce, webview);

		return portManagerHtml
			.replace('{{cspMetaTag}}', cspMetaTag)
			.replace('{{nonce}}', nonce)
			.replace('{{scriptUri}}', scriptUri.toString());
	}

	private sanitizePorts(ports: PortInfo[]): Array<{
		port: number;
		pid: number;
		processName: string;
		command: string;
		protocol: string;
		state: string;
	}> {
		return ports.map((p) => ({
			port: p.port,
			pid: p.pid,
			processName: escapeHtml(p.processName),
			command: escapeHtml(p.command.substring(0, 80)),
			protocol: p.protocol,
			state: p.state,
		}));
	}

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
