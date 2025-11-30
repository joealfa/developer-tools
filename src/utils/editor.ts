import * as vscode from 'vscode';

/**
 * Insert text at cursor positions in the active editor.
 * Supports multiple cursors - each cursor gets a unique generated value.
 * If a selection spans multiple lines, replaces with one value per line.
 * 
 * @param generator - Function that generates the text to insert
 */
export function insertTextAtCursor(generator: () => string): void {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage('No active text editor found');
		return;
	}

	editor.edit(editBuilder => {
		editor.selections.forEach(selection => {
			if (selection.isEmpty) {
				// Single cursor - insert at cursor position
				const text = generator();
				editBuilder.insert(selection.active, text);
			} else {
				// Selection spans text - replace with values (one per line)
				const startLine = selection.start.line;
				const endLine = selection.end.line;
				const lineCount = endLine - startLine + 1;
				
				// Generate one value per line, joined by newlines
				const values: string[] = [];
				for (let i = 0; i < lineCount; i++) {
					values.push(generator());
				}
				
				editBuilder.replace(selection, values.join('\n'));
			}
		});
	});
}

/**
 * Insert text into a specific editor at its cursor positions.
 * Used when the editor reference is captured before opening a panel.
 * 
 * @param editor - The target editor
 * @param text - The text to insert
 */
export function insertTextIntoEditor(editor: vscode.TextEditor, text: string): void {
	editor.edit(editBuilder => {
		editor.selections.forEach(selection => {
			if (selection.isEmpty) {
				editBuilder.insert(selection.active, text);
			} else {
				editBuilder.replace(selection, text);
			}
		});
	});
}
