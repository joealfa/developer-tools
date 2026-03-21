import * as vscode from 'vscode';
import type { ComplexityService } from '../complexity/complexityService';
import type { CommandDefinition } from './index';

export function getComplexityCommands(
	getComplexityService: () => ComplexityService
): CommandDefinition[] {
	return [
		{
			id: 'developer-tools.toggleComplexityHints',
			handler: async () => {
				const config = vscode.workspace.getConfiguration('developer-tools');
				const current = config.get<boolean>('complexity.enabled', false);
				await config.update(
					'complexity.enabled',
					!current,
					vscode.ConfigurationTarget.Global
				);
				vscode.window.showInformationMessage(
					`Complexity hints ${!current ? 'enabled' : 'disabled'}.`
				);
			},
		},
		{
			id: 'developer-tools.analyzeFileComplexity',
			handler: () => {
				const complexityService = getComplexityService();
				const editor = vscode.window.activeTextEditor;
				if (!editor) {
					return;
				}
				complexityService.analyzeDocument(editor.document);
			},
		},
		{
			id: 'developer-tools.showComplexityReport',
			handler: () => {
				const complexityService = getComplexityService();
				const editor = vscode.window.activeTextEditor;
				if (!editor) {
					vscode.window.showInformationMessage('Open a file to see complexity report.');
					return;
				}

				complexityService.analyzeDocument(editor.document);
				const results = complexityService.getComplexity(editor.document.uri);

				if (results.length === 0) {
					vscode.window.showInformationMessage(
						'No functions found or language not supported.'
					);
					return;
				}

				const sorted = [...results].sort(
					(a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity
				);
				const channel = vscode.window.createOutputChannel('Complexity Report');
				channel.clear();
				channel.appendLine(
					`Complexity Report: ${vscode.workspace.asRelativePath(editor.document.uri)}`
				);
				channel.appendLine('='.repeat(60));
				channel.appendLine('');
				channel.appendLine(
					`${'Function'.padEnd(35)} ${'CC'.padStart(4)} ${'COG'.padStart(5)} ${'Lines'.padStart(6)}`
				);
				channel.appendLine('-'.repeat(60));

				for (const r of sorted) {
					channel.appendLine(
						`${r.functionName.padEnd(35)} ${String(r.cyclomaticComplexity).padStart(4)} ${String(r.cognitiveComplexity).padStart(5)} ${String(r.lineCount).padStart(6)}`
					);
				}

				channel.show();
			},
		},
	];
}
