import * as vscode from 'vscode';
import { generatePassword, DEFAULT_PASSWORD_OPTIONS, PasswordOptions } from '../generators';
import { insertTextIntoEditor } from '../utils';
import { Icons } from './icons';

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
			enableScripts: true
		};

		// Generate initial password
		const initialPassword = generatePassword(DEFAULT_PASSWORD_OPTIONS);
		webviewView.webview.html = this.getHtml(initialPassword);

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'generate':
						const newPassword = generatePassword(message.options as PasswordOptions);
						webviewView.webview.postMessage({ command: 'updatePassword', password: newPassword });
						break;
						
					case 'copy':
						vscode.env.clipboard.writeText(message.password);
						vscode.window.showInformationMessage('Password copied to clipboard!');
						break;
						
					case 'insert':
						const editor = vscode.window.activeTextEditor;
						if (editor) {
							insertTextIntoEditor(editor, message.password);
							vscode.window.showInformationMessage('Password inserted!');
						} else {
							vscode.window.showErrorMessage('No active text editor');
						}
						break;
				}
			},
			undefined,
			this.context.subscriptions
		);
	}

	/**
	 * Get the HTML content for the password generator webview
	 */
	private getHtml(initialPassword: string): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Password Generator</title>
	<style>
		* {
			box-sizing: border-box;
		}
		body {
			font-family: var(--vscode-font-family);
			padding: 12px;
			color: var(--vscode-foreground);
			background-color: var(--vscode-sideBar-background);
		}
		.password-display {
			background-color: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
			padding: 12px;
			margin-bottom: 16px;
			display: flex;
			flex-direction: column;
			gap: 8px;
		}
		.password-text {
			font-family: monospace;
			font-size: 14px;
			word-break: break-all;
			line-height: 1.4;
		}
		.password-text .number {
			color: var(--vscode-debugTokenExpression-number);
		}
		.password-text .special {
			color: var(--vscode-debugTokenExpression-error);
		}
		.icon-buttons {
			display: flex;
			gap: 6px;
			margin-top: 4px;
		}
		.icon-btn {
			background: transparent;
			border: none;
			color: var(--vscode-foreground);
			cursor: pointer;
			padding: 6px;
			border-radius: 4px;
			display: flex;
			align-items: center;
			justify-content: center;
			flex: 1;
		}
		.icon-btn:hover {
			background-color: var(--vscode-toolbar-hoverBackground);
		}
		.icon-btn svg {
			width: 16px;
			height: 16px;
			margin-right: 4px;
		}
		.icon-btn-text {
			font-size: 11px;
		}
		.section {
			background-color: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
			padding: 12px;
			margin-bottom: 12px;
		}
		.section-title {
			font-weight: bold;
			margin-bottom: 10px;
			font-size: 12px;
		}
		.form-group {
			margin-bottom: 10px;
		}
		.form-group label {
			display: block;
			margin-bottom: 4px;
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
		}
		input[type="number"] {
			width: 100%;
			padding: 6px;
			background-color: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			color: var(--vscode-input-foreground);
			border-radius: 4px;
			font-size: 12px;
		}
		.hint {
			font-size: 10px;
			color: var(--vscode-descriptionForeground);
			margin-top: 4px;
			line-height: 1.3;
		}
		.checkbox-group {
			display: flex;
			flex-direction: column;
			gap: 8px;
			margin-bottom: 12px;
		}
		.checkbox-item {
			display: flex;
			align-items: center;
			gap: 6px;
		}
		.checkbox-item input[type="checkbox"] {
			width: 14px;
			height: 14px;
			accent-color: var(--vscode-checkbox-background);
		}
		.checkbox-item span {
			font-size: 12px;
		}
		.number-inputs {
			display: flex;
			gap: 8px;
		}
		.number-inputs .form-group {
			flex: 1;
		}
		.action-buttons {
			display: flex;
			flex-direction: column;
			gap: 8px;
			margin-top: 12px;
		}
		.btn {
			padding: 8px 12px;
			border: none;
			border-radius: 4px;
			cursor: pointer;
			font-size: 12px;
		}
		.btn-primary {
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
		}
		.btn-primary:hover {
			background-color: var(--vscode-button-hoverBackground);
		}
		.btn-secondary {
			background-color: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}
		.btn-secondary:hover {
			background-color: var(--vscode-button-secondaryHoverBackground);
		}
	</style>
</head>
<body>
	<div class="password-display">
		<span class="password-text" id="passwordDisplay">${this.escapeHtml(initialPassword)}</span>
		<div class="icon-buttons">
			<button class="icon-btn" id="regenerateBtn" title="Regenerate">
				${Icons.rotateCcwKey}
				<span class="icon-btn-text">New</span>
			</button>
			<button class="icon-btn" id="copyBtn" title="Copy to clipboard">
				${Icons.clipboardCopy}
				<span class="icon-btn-text">Copy</span>
			</button>
		</div>
	</div>

	<div class="section">
		<div class="section-title">Options</div>
		<div class="form-group">
			<label for="length">Length</label>
			<input type="number" id="length" value="14" min="5" max="128">
			<div class="hint">Between 5 and 128. Use 14+ for strong passwords.</div>
		</div>
	</div>

	<div class="section">
		<div class="section-title">Include</div>
		<div class="checkbox-group">
			<label class="checkbox-item">
				<input type="checkbox" id="includeUppercase" checked>
				<span>Uppercase (A-Z)</span>
			</label>
			<label class="checkbox-item">
				<input type="checkbox" id="includeLowercase" checked>
				<span>Lowercase (a-z)</span>
			</label>
			<label class="checkbox-item">
				<input type="checkbox" id="includeNumbers" checked>
				<span>Numbers (0-9)</span>
			</label>
			<label class="checkbox-item">
				<input type="checkbox" id="includeSpecial" checked>
				<span>Special (!@#$%^&*)</span>
			</label>
		</div>
		<div class="number-inputs">
			<div class="form-group">
				<label for="minNumbers">Min numbers</label>
				<input type="number" id="minNumbers" value="1" min="0" max="10">
			</div>
			<div class="form-group">
				<label for="minSpecial">Min special</label>
				<input type="number" id="minSpecial" value="1" min="0" max="10">
			</div>
		</div>
		<label class="checkbox-item">
			<input type="checkbox" id="avoidAmbiguous">
			<span>Avoid ambiguous chars</span>
		</label>
	</div>

	<div class="action-buttons">
		<button class="btn btn-primary" id="insertBtn">Insert to Document</button>
	</div>

	<script>
		const vscode = acquireVsCodeApi();

		function getOptions() {
			return {
				length: parseInt(document.getElementById('length').value) || 14,
				includeUppercase: document.getElementById('includeUppercase').checked,
				includeLowercase: document.getElementById('includeLowercase').checked,
				includeNumbers: document.getElementById('includeNumbers').checked,
				includeSpecial: document.getElementById('includeSpecial').checked,
				minNumbers: parseInt(document.getElementById('minNumbers').value) || 0,
				minSpecial: parseInt(document.getElementById('minSpecial').value) || 0,
				avoidAmbiguous: document.getElementById('avoidAmbiguous').checked
			};
		}

		function escapeChar(c) {
			if (c === '&') return '&amp;';
			if (c === '<') return '&lt;';
			if (c === '>') return '&gt;';
			if (c === '"') return '&quot;';
			if (c === "'") return '&#039;';
			return c;
		}

		function highlightPassword(password) {
			return password.split('').map(char => {
				const safe = escapeChar(char);
				if (/[0-9]/.test(char)) {
					return '<span class="number">' + safe + '</span>';
				} else if (/[!@#$%^&*]/.test(char)) {
					return '<span class="special">' + safe + '</span>';
				}
				return safe;
			}).join('');
		}

		function requestNewPassword() {
			vscode.postMessage({ command: 'generate', options: getOptions() });
		}

		// Event listeners
		document.getElementById('regenerateBtn').addEventListener('click', requestNewPassword);
		
		document.getElementById('copyBtn').addEventListener('click', () => {
			const password = document.getElementById('passwordDisplay').textContent;
			vscode.postMessage({ command: 'copy', password: password });
		});

		document.getElementById('insertBtn').addEventListener('click', () => {
			const password = document.getElementById('passwordDisplay').textContent;
			vscode.postMessage({ command: 'insert', password: password });
		});

		// Auto-regenerate when options change
		document.querySelectorAll('input').forEach(input => {
			input.addEventListener('change', requestNewPassword);
		});

		// Handle messages from extension
		window.addEventListener('message', event => {
			const message = event.data;
			if (message.command === 'updatePassword') {
				document.getElementById('passwordDisplay').innerHTML = highlightPassword(message.password);
			}
		});

		// Initial highlight
		document.getElementById('passwordDisplay').innerHTML = highlightPassword(document.getElementById('passwordDisplay').textContent);
	</script>
</body>
</html>`;
	}

	/**
	 * Escape HTML special characters to prevent XSS
	 */
	private escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}
}
