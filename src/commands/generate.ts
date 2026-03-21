import * as vscode from 'vscode';
import {
	generateUuid,
	generateGuid,
	generateUuidCompact,
	generateGuidCompact,
	generateUuidBraces,
	generateGuidBraces,
	generatePassword,
	DEFAULT_PASSWORD_OPTIONS,
} from '../generators';
import type { PasswordOptions } from '../generators';
import { insertTextAtCursor } from '../utils';
import type { CommandDefinition } from './index';

/**
 * Insert text into the captured editor at all cursor positions.
 * For non-text-editor contexts (Settings, Find bar, etc.) VS Code's API
 * cannot insert programmatically, so we copy to clipboard and try the
 * built-in `type` command as a best-effort fallback (works in terminal
 * and some other editor-like inputs).
 */
async function insertOrCopy(
	value: string,
	capturedEditor: vscode.TextEditor | undefined
): Promise<void> {
	await vscode.env.clipboard.writeText(value);

	// Prefer the editor captured before the pickers opened; fall back to
	// whatever is active now in case focus shifted during the picker flow.
	const editor = capturedEditor ?? vscode.window.activeTextEditor;

	if (editor) {
		await editor.edit((editBuilder) => {
			for (const selection of editor.selections) {
				if (selection.isEmpty) {
					editBuilder.insert(selection.active, value);
				} else {
					editBuilder.replace(selection, value);
				}
			}
		});
	} else {
		// Try the VS Code 'type' command — works in terminal and similar inputs,
		// silently ignored where unsupported (e.g. Settings search, Find bar)
		vscode.commands.executeCommand('type', { text: value }).then(undefined, () => {});
		vscode.window.showInformationMessage(
			`Copied to clipboard — press Ctrl+V to paste: ${value}`
		);
	}
}

/**
 * Show the UUID/GUID format picker and return the generated value.
 */
async function pickAndGenerateUuid(): Promise<string | undefined> {
	// Generate one sample UUID upfront so every format shows a real preview value
	const sample = generateUuid();

	const formats = [
		{ label: 'UUID  (lowercase)', description: sample, generator: generateUuid },
		{ label: 'GUID  (uppercase)', description: sample.toUpperCase(), generator: generateGuid },
		{
			label: 'UUID  compact (lowercase, no hyphens)',
			description: sample.replace(/-/g, ''),
			generator: generateUuidCompact,
		},
		{
			label: 'GUID  compact (uppercase, no hyphens)',
			description: sample.replace(/-/g, '').toUpperCase(),
			generator: generateGuidCompact,
		},
		{ label: 'UUID  with braces', description: `{${sample}}`, generator: generateUuidBraces },
		{
			label: 'GUID  with braces',
			description: `{${sample.toUpperCase()}}`,
			generator: generateGuidBraces,
		},
	] as const;

	const picked = await vscode.window.showQuickPick(
		formats.map(({ label, description }) => ({ label, description })),
		{
			title: 'Generate & Insert — UUID / GUID',
			placeHolder: 'Select format (description shows a live preview)',
		}
	);

	if (!picked) {
		return undefined;
	}
	const match = formats.find((f) => f.label === picked.label);
	return match ? match.generator() : undefined;
}

/**
 * Show the password options flow (length → character types) and return generated password.
 */
async function pickAndGeneratePassword(): Promise<string | undefined> {
	// Step 1: Length
	const lengthStr = await vscode.window.showInputBox({
		title: 'Generate & Insert — Password (1/2)',
		prompt: 'Enter password length',
		value: String(DEFAULT_PASSWORD_OPTIONS.length),
		validateInput: (v) => {
			const n = parseInt(v, 10);
			if (isNaN(n) || n < 4 || n > 128) {
				return 'Length must be between 4 and 128';
			}
			return null;
		},
	});
	if (lengthStr === undefined) {
		return undefined;
	}
	const length = parseInt(lengthStr, 10);

	// Step 2: Character type options
	interface OptionItem extends vscode.QuickPickItem {
		key: keyof PasswordOptions;
	}
	const optionItems: OptionItem[] = [
		{
			label: 'Uppercase letters (A–Z)',
			picked: DEFAULT_PASSWORD_OPTIONS.includeUppercase,
			key: 'includeUppercase',
		},
		{
			label: 'Lowercase letters (a–z)',
			picked: DEFAULT_PASSWORD_OPTIONS.includeLowercase,
			key: 'includeLowercase',
		},
		{
			label: 'Numbers (0–9)',
			picked: DEFAULT_PASSWORD_OPTIONS.includeNumbers,
			key: 'includeNumbers',
		},
		{
			label: 'Special characters (!@#$%^&*)',
			picked: DEFAULT_PASSWORD_OPTIONS.includeSpecial,
			key: 'includeSpecial',
		},
		{
			label: 'Avoid ambiguous characters (0, O, l, 1, I)',
			picked: DEFAULT_PASSWORD_OPTIONS.avoidAmbiguous,
			key: 'avoidAmbiguous',
		},
	];

	const selected = await vscode.window.showQuickPick(optionItems, {
		title: 'Generate & Insert — Password (2/2)',
		placeHolder: 'Select character types, then press Enter',
		canPickMany: true,
	});
	if (selected === undefined) {
		return undefined;
	}

	const selectedKeys = new Set(selected.map((i) => i.key));
	const options: PasswordOptions = {
		...DEFAULT_PASSWORD_OPTIONS,
		length,
		includeUppercase: selectedKeys.has('includeUppercase'),
		includeLowercase: selectedKeys.has('includeLowercase'),
		includeNumbers: selectedKeys.has('includeNumbers'),
		includeSpecial: selectedKeys.has('includeSpecial'),
		avoidAmbiguous: selectedKeys.has('avoidAmbiguous'),
		// Keep at least 1 required char only when that type is enabled
		minNumbers: selectedKeys.has('includeNumbers') ? DEFAULT_PASSWORD_OPTIONS.minNumbers : 0,
		minSpecial: selectedKeys.has('includeSpecial') ? DEFAULT_PASSWORD_OPTIONS.minSpecial : 0,
	};

	const password = generatePassword(options);
	if (!password) {
		vscode.window.showErrorMessage(
			'Could not generate password — please select at least one character type.'
		);
		return undefined;
	}
	return password;
}

export function getGenerateCommands(): CommandDefinition[] {
	return [
		{
			id: 'developer-tools.generateAndInsert',
			handler: async () => {
				// Capture the active text editor BEFORE the QuickPick steals focus
				const capturedEditor = vscode.window.activeTextEditor;

				const typeItem = await vscode.window.showQuickPick(
					[
						{
							label: '$(symbol-numeric)  UUID / GUID',
							description: 'Generate a unique identifier',
							id: 'uuid',
						},
						{
							label: '$(lock)  Password',
							description: 'Generate a secure password',
							id: 'password',
						},
					],
					{ title: 'Generate & Insert', placeHolder: 'What do you want to generate?' }
				);
				if (!typeItem) {
					return;
				}

				let value: string | undefined;
				if (typeItem.id === 'uuid') {
					value = await pickAndGenerateUuid();
				} else {
					value = await pickAndGeneratePassword();
				}

				if (value !== undefined) {
					await insertOrCopy(value, capturedEditor);
				}
			},
		},
		{
			id: 'developer-tools.insertUuid',
			handler: () => {
				insertTextAtCursor(generateUuid);
			},
		},
		{
			id: 'developer-tools.insertGuid',
			handler: () => {
				insertTextAtCursor(generateGuid);
			},
		},
		{
			id: 'developer-tools.insertUuidCompact',
			handler: () => {
				insertTextAtCursor(generateUuidCompact);
			},
		},
		{
			id: 'developer-tools.insertGuidCompact',
			handler: () => {
				insertTextAtCursor(generateGuidCompact);
			},
		},
		{
			id: 'developer-tools.generatePassword',
			handler: async () => {
				await vscode.commands.executeCommand('developer-tools.passwordGenerator.focus');
			},
		},
	];
}
