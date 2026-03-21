/**
 * Session Tracker WebView Provider for the sidebar
 */

import * as vscode from 'vscode';
import { SessionService } from '../session';
import { escapeHtml } from '../utils';
import { createWebviewNonce, getWebviewCspMetaTagWithScript, getWebviewScriptUri } from './security';
import sessionTrackerHtml from './templates/sessionTracker.html';

export class SessionTrackerProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	public static readonly viewType = 'developer-tools.sessionTracker';

	private view?: vscode.WebviewView;
	private disposables: vscode.Disposable[] = [];

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly sessionService: SessionService
	) {
		this.disposables.push(
			sessionService.onDidChangeSession(() => {
				this.updateWebview();
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

		// Re-send current state when the view becomes visible again
		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible) {
				this.updateWebview();
			}
		});

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
					case 'start':
						this.sessionService.startSession();
						break;
					case 'stop':
						await this.sessionService.stopSession();
						this.updateWebview();
						break;
					case 'reset':
						this.sessionService.resetSession();
						break;
					case 'copy-summary': {
						const md = this.sessionService.exportAsMarkdown();
						await vscode.env.clipboard.writeText(md);
						vscode.window.showInformationMessage(
							'Session summary copied to clipboard.'
						);
						break;
					}
					case 'export-json': {
						const json = this.sessionService.exportAsJson();
						await vscode.env.clipboard.writeText(json);
						vscode.window.showInformationMessage('Session JSON copied to clipboard.');
						break;
					}
					case 'load-history':
						await this.sendHistory();
						break;
					case 'view-session': {
						if (typeof message.id !== 'string' || message.id.length === 0) {
							break;
						}
						const session = await this.sessionService.loadHistorySession(message.id);
						if (session) {
							this.view?.webview.postMessage({
								command: 'show-history-session',
								session: this.sanitizeSession(session),
							});
						}
						break;
					}
					case 'delete-session':
						if (typeof message.id !== 'string' || message.id.length === 0) {
							break;
						}
						await this.sessionService.deleteHistorySession(message.id);
						await this.sendHistory();
						break;
					case 'delete-all-sessions':
						await this.sessionService.deleteAllHistory();
						await this.sendHistory();
						break;
					case 'export-history-session': {
						if (typeof message.id !== 'string' || message.id.length === 0) {
							break;
						}
						if (message.format !== 'markdown' && message.format !== 'json') {
							break;
						}
						const exported = await this.sessionService.exportSession(
							message.id,
							message.format
						);
						if (exported) {
							await vscode.env.clipboard.writeText(exported);
							vscode.window.showInformationMessage(
								`Session ${message.format} copied to clipboard.`
							);
						}
						break;
					}
				}
			},
			undefined,
			this.context.subscriptions
		);

		this.updateWebview();
	}

	private updateWebview(): void {
		if (!this.view) {
			return;
		}
		const session = this.sessionService.getSummary();
		this.view.webview.postMessage({
			command: 'session-updated',
			session: session ? this.sanitizeSession(session) : null,
			isActive: this.sessionService.isActive(),
		});
	}

	private async sendHistory(): Promise<void> {
		if (!this.view) {
			return;
		}
		const history = await this.sessionService.getSessionHistory();
		this.view.webview.postMessage({ command: 'history-updated', history });
	}

	private sanitizeSession(session: {
		id: string;
		startedAt: number;
		endedAt: number | null;
		status: string;
		files: Array<{
			filePath: string;
			totalEdits: number;
			linesAdded: number;
			linesRemoved: number;
			estimatedTimeMs: number;
		}>;
		totalEstimatedTimeMs: number;
	}) {
		return {
			id: session.id,
			startedAt: session.startedAt,
			endedAt: session.endedAt,
			status: session.status,
			totalEstimatedTimeMs: session.totalEstimatedTimeMs,
			files: session.files.map((f) => ({
				filePath: escapeHtml(f.filePath),
				totalEdits: f.totalEdits,
				linesAdded: f.linesAdded,
				linesRemoved: f.linesRemoved,
				estimatedTimeMs: f.estimatedTimeMs,
			})),
		};
	}

	private getHtml(webview: vscode.Webview): string {
		const nonce = createWebviewNonce();
		const scriptUri = getWebviewScriptUri(webview, this.context.extensionUri, 'sessionTracker.js');
		const cspMetaTag = getWebviewCspMetaTagWithScript(nonce, webview);

		return sessionTrackerHtml
			.replace('{{cspMetaTag}}', cspMetaTag)
			.replace('{{nonce}}', nonce)
			.replace('{{scriptUri}}', scriptUri.toString());
	}

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
