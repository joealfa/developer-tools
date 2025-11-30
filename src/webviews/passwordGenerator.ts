import * as vscode from 'vscode';
import { generatePassword, DEFAULT_PASSWORD_OPTIONS, PasswordOptions } from '../generators';
import { insertTextIntoEditor } from '../utils';
import { Icons } from './icons';

/**
 * Get the HTML content for the password generator webview
 */
function getHtml(initialPassword: string): string {
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
			padding: 20px;
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
		}
		.password-display {
			background-color: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
			padding: 16px;
			margin-bottom: 20px;
			display: flex;
			align-items: center;
			justify-content: space-between;
		}
		.password-text {
			font-family: monospace;
			font-size: 18px;
			word-break: break-all;
			flex: 1;
		}
		.password-text .number {
			color: var(--vscode-debugTokenExpression-number);
		}
		.password-text .special {
			color: var(--vscode-debugTokenExpression-error);
		}
		.icon-buttons {
			display: flex;
			gap: 8px;
			margin-left: 12px;
		}
		.icon-btn {
			background: transparent;
			border: none;
			color: var(--vscode-foreground);
			cursor: pointer;
			padding: 8px;
			border-radius: 4px;
			display: flex;
			align-items: center;
			justify-content: center;
		}
		.icon-btn:hover {
			background-color: var(--vscode-toolbar-hoverBackground);
		}
		.icon-btn svg {
			width: 18px;
			height: 18px;
		}
		.section {
			background-color: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
			padding: 16px;
			margin-bottom: 16px;
		}
		.section-title {
			font-weight: bold;
			margin-bottom: 12px;
		}
		.form-group {
			margin-bottom: 12px;
		}
		.form-group label {
			display: block;
			margin-bottom: 4px;
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		}
		input[type="number"] {
			width: 100%;
			padding: 8px;
			background-color: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			color: var(--vscode-input-foreground);
			border-radius: 4px;
			font-size: 14px;
		}
		.hint {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			margin-top: 4px;
		}
		.checkbox-group {
			display: flex;
			flex-wrap: wrap;
			gap: 16px;
			margin-bottom: 16px;
		}
		.checkbox-item {
			display: flex;
			align-items: center;
			gap: 6px;
		}
		.checkbox-item input[type="checkbox"] {
			width: 16px;
			height: 16px;
			accent-color: var(--vscode-checkbox-background);
		}
		.number-inputs {
			display: flex;
			gap: 16px;
		}
		.number-inputs .form-group {
			flex: 1;
		}
		.action-buttons {
			display: flex;
			gap: 12px;
			margin-top: 20px;
		}
		.btn {
			flex: 1;
			padding: 10px 16px;
			border: none;
			border-radius: 4px;
			cursor: pointer;
			font-size: 14px;
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
		<span class="password-text" id="passwordDisplay">${initialPassword}</span>
		<div class="icon-buttons">
			<button class="icon-btn" id="regenerateBtn" title="Regenerate">${Icons.rotateCcwKey}</button>
			<button class="icon-btn" id="copyBtn" title="Copy to clipboard">${Icons.clipboardCopy}</button>
		</div>
	</div>

	<div class="section">
		<div class="section-title">Options</div>
		<div class="form-group">
			<label for="length">Length</label>
			<input type="number" id="length" value="14" min="5" max="128">
			<div class="hint">Value must be between 5 and 128. Use 14 characters or more to generate a strong password.</div>
		</div>
	</div>

	<div class="section">
		<div class="section-title">Include</div>
		<div class="checkbox-group">
			<label class="checkbox-item">
				<input type="checkbox" id="includeUppercase" checked>
				<span>A-Z</span>
			</label>
			<label class="checkbox-item">
				<input type="checkbox" id="includeLowercase" checked>
				<span>a-z</span>
			</label>
			<label class="checkbox-item">
				<input type="checkbox" id="includeNumbers" checked>
				<span>0-9</span>
			</label>
			<label class="checkbox-item">
				<input type="checkbox" id="includeSpecial" checked>
				<span>!@#$%^&*</span>
			</label>
		</div>
		<div class="number-inputs">
			<div class="form-group">
				<label for="minNumbers">Minimum numbers</label>
				<input type="number" id="minNumbers" value="1" min="0" max="10">
			</div>
			<div class="form-group">
				<label for="minSpecial">Minimum special</label>
				<input type="number" id="minSpecial" value="1" min="0" max="10">
			</div>
		</div>
		<label class="checkbox-item">
			<input type="checkbox" id="avoidAmbiguous">
			<span>Avoid ambiguous characters</span>
		</label>
	</div>

	<div class="action-buttons">
		<button class="btn btn-secondary" id="copyCloseBtn">Copy & Close</button>
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

		function highlightPassword(password) {
			return password.split('').map(char => {
				if (/[0-9]/.test(char)) {
					return '<span class="number">' + char + '</span>';
				} else if (/[!@#$%^&*]/.test(char)) {
					return '<span class="special">' + char + '</span>';
				}
				return char;
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

		document.getElementById('copyCloseBtn').addEventListener('click', () => {
			const password = document.getElementById('passwordDisplay').textContent;
			vscode.postMessage({ command: 'copyAndClose', password: password });
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
 * Show the password generator panel
 */
export function showPasswordGenerator(context: vscode.ExtensionContext): void {
	// Capture the active editor BEFORE creating the panel
	const targetEditor = vscode.window.activeTextEditor;

	const panel = vscode.window.createWebviewPanel(
		'passwordGenerator',
		'Password Generator',
		vscode.ViewColumn.Beside,
		{
			enableScripts: true
		}
	);

	// Generate initial password
	const initialPassword = generatePassword(DEFAULT_PASSWORD_OPTIONS);
	panel.webview.html = getHtml(initialPassword);

	// Handle messages from the webview
	panel.webview.onDidReceiveMessage(
		message => {
			switch (message.command) {
				case 'generate':
					const newPassword = generatePassword(message.options as PasswordOptions);
					panel.webview.postMessage({ command: 'updatePassword', password: newPassword });
					break;
					
				case 'copy':
					vscode.env.clipboard.writeText(message.password);
					vscode.window.showInformationMessage('Password copied to clipboard!');
					break;
					
				case 'copyAndClose':
					vscode.env.clipboard.writeText(message.password);
					vscode.window.showInformationMessage('Password copied to clipboard!');
					panel.dispose();
					break;
					
				case 'insert':
					if (targetEditor) {
						insertTextIntoEditor(targetEditor, message.password);
						panel.dispose();
					} else {
						vscode.window.showErrorMessage('No active text editor was open when password generator was launched');
					}
					break;
			}
		},
		undefined,
		context.subscriptions
	);
}
