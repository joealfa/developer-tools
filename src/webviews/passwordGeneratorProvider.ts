import * as vscode from 'vscode';
import { generatePassword, DEFAULT_PASSWORD_OPTIONS, PasswordOptions } from '../generators';
import { insertTextIntoEditor, escapeHtml } from '../utils';
import { Icons } from './icons';
import { createWebviewNonce, getWebviewCspMetaTagWithScript, getWebviewScriptUri } from './security';
import passwordGeneratorHtml from './templates/passwordGenerator.html';

/**
 * Password Generator WebView Provider for the sidebar
 */
export class PasswordGeneratorProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'developer-tools.passwordGenerator';

	constructor(private readonly context: vscode.ExtensionContext) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri],
		};

		const initialPassword = generatePassword(DEFAULT_PASSWORD_OPTIONS);
		webviewView.webview.html = this.getHtml(webviewView.webview, initialPassword);

		webviewView.webview.onDidReceiveMessage(
			(message) => {
				if (
					!message ||
					typeof message !== 'object' ||
					typeof message.command !== 'string'
				) {
					return;
				}

				switch (message.command) {
					case 'generate': {
						const options = this.sanitizeOptions(message.options);
						const newPassword = generatePassword(options);
						webviewView.webview.postMessage({
							command: 'updatePassword',
							password: newPassword,
						});
						break;
					}

					case 'copy': {
						const passwordToCopy =
							typeof message.password === 'string' ? message.password : '';
						vscode.env.clipboard.writeText(passwordToCopy);
						vscode.window.showInformationMessage('Password copied to clipboard!');
						break;
					}

					case 'insert': {
						const passwordToInsert =
							typeof message.password === 'string' ? message.password : '';
						const editor = vscode.window.activeTextEditor;
						if (editor) {
							insertTextIntoEditor(editor, passwordToInsert);
							vscode.window.showInformationMessage('Password inserted!');
						} else {
							vscode.window.showErrorMessage('No active text editor');
						}
						break;
					}
				}
			},
			undefined,
			this.context.subscriptions
		);
	}

	private getHtml(webview: vscode.Webview, initialPassword: string): string {
		const nonce = createWebviewNonce();
		const scriptUri = getWebviewScriptUri(webview, this.context.extensionUri, 'passwordGenerator.js');
		const cspMetaTag = getWebviewCspMetaTagWithScript(nonce, webview);

		return passwordGeneratorHtml
			.replace('{{cspMetaTag}}', cspMetaTag)
			.replace('{{nonce}}', nonce)
			.replace('{{scriptUri}}', scriptUri.toString())
			.replace('{{initialPassword}}', escapeHtml(initialPassword))
			.replace('{{iconRotateCcwKey}}', Icons.rotateCcwKey)
			.replace('{{iconClipboardCopy}}', Icons.clipboardCopy)
			.replace('{{iconInsertIntoDocument}}', Icons.insertIntoDocument);
	}

	private sanitizeOptions(options: unknown): PasswordOptions {
		const source =
			typeof options === 'object' && options !== null
				? (options as Partial<PasswordOptions>)
				: {};

		const length = this.clampNumber(source.length, 5, 128, DEFAULT_PASSWORD_OPTIONS.length);
		const includeUppercase = this.asBoolean(
			source.includeUppercase,
			DEFAULT_PASSWORD_OPTIONS.includeUppercase
		);
		const includeLowercase = this.asBoolean(
			source.includeLowercase,
			DEFAULT_PASSWORD_OPTIONS.includeLowercase
		);
		const includeNumbers = this.asBoolean(
			source.includeNumbers,
			DEFAULT_PASSWORD_OPTIONS.includeNumbers
		);
		const includeSpecial = this.asBoolean(
			source.includeSpecial,
			DEFAULT_PASSWORD_OPTIONS.includeSpecial
		);

		const minNumbers = this.clampNumber(
			source.minNumbers,
			0,
			length,
			DEFAULT_PASSWORD_OPTIONS.minNumbers
		);
		const minSpecial = this.clampNumber(
			source.minSpecial,
			0,
			length,
			DEFAULT_PASSWORD_OPTIONS.minSpecial
		);
		const avoidAmbiguous = this.asBoolean(
			source.avoidAmbiguous,
			DEFAULT_PASSWORD_OPTIONS.avoidAmbiguous
		);

		return {
			length,
			includeUppercase,
			includeLowercase,
			includeNumbers,
			includeSpecial,
			minNumbers,
			minSpecial,
			avoidAmbiguous,
		};
	}

	private clampNumber(value: unknown, min: number, max: number, fallback: number): number {
		if (typeof value !== 'number' || !Number.isFinite(value)) {
			return fallback;
		}
		return Math.max(min, Math.min(max, Math.floor(value)));
	}

	private asBoolean(value: unknown, fallback: boolean): boolean {
		return typeof value === 'boolean' ? value : fallback;
	}
}
