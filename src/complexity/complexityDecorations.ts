/**
 * Complexity Decorations - Renders inline hints using TextEditorDecorationType
 */

import * as vscode from 'vscode';
import { ComplexityResult, ComplexityLevel, ComplexityThresholds, DEFAULT_THRESHOLDS } from './types';
import { ComplexityService } from './complexityService';

export class ComplexityDecorations implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private decorationTypes: Map<ComplexityLevel, vscode.TextEditorDecorationType> = new Map();

    constructor(
        private readonly complexityService: ComplexityService,
        private readonly context: vscode.ExtensionContext
    ) {
        this.createDecorationTypes();

        // Update decorations when complexity changes
        this.disposables.push(
            complexityService.onDidChangeComplexity(({ uri }) => {
                const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
                if (editor) { this.applyDecorations(editor); }
            })
        );

        // Update decorations when active editor changes
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (editor) { this.applyDecorations(editor); }
            })
        );

        // Update when config changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('developer-tools.complexity')) {
                    this.createDecorationTypes();
                    const editor = vscode.window.activeTextEditor;
                    if (editor) { this.applyDecorations(editor); }
                }
            })
        );

        // Apply to current editor
        if (vscode.window.activeTextEditor) {
            const doc = vscode.window.activeTextEditor.document;
            if (complexityService.getComplexity(doc.uri).length === 0) {
                complexityService.analyzeDocument(doc);
            }
            this.applyDecorations(vscode.window.activeTextEditor);
        }
    }

    private createDecorationTypes(): void {
        // Dispose old types
        for (const dt of this.decorationTypes.values()) {
            dt.dispose();
        }
        this.decorationTypes.clear();

        this.decorationTypes.set('low', vscode.window.createTextEditorDecorationType({
            after: {
                color: new vscode.ThemeColor('editorInfo.foreground'),
                fontStyle: 'italic',
                margin: '0 0 0 16px',
            },
            isWholeLine: false,
        }));

        this.decorationTypes.set('moderate', vscode.window.createTextEditorDecorationType({
            after: {
                color: new vscode.ThemeColor('editorWarning.foreground'),
                fontStyle: 'italic',
                margin: '0 0 0 16px',
            },
            isWholeLine: false,
        }));

        this.decorationTypes.set('high', vscode.window.createTextEditorDecorationType({
            after: {
                color: new vscode.ThemeColor('editorError.foreground'),
                fontStyle: 'italic',
                margin: '0 0 0 16px',
            },
            isWholeLine: false,
        }));

        this.decorationTypes.set('very-high', vscode.window.createTextEditorDecorationType({
            after: {
                color: new vscode.ThemeColor('editorError.foreground'),
                fontWeight: 'bold',
                margin: '0 0 0 16px',
            },
            backgroundColor: new vscode.ThemeColor('inputValidation.errorBackground'),
            isWholeLine: false,
        }));
    }

    private applyDecorations(editor: vscode.TextEditor): void {
        if (!this.isEnabled()) {
            this.clearDecorations(editor);
            return;
        }

        const results = this.complexityService.getComplexity(editor.document.uri);
        const thresholds = this.getThresholds();
        const minLevel = this.getMinLevel();
        const showCognitive = this.getShowCognitive();

        // Group results by level
        const groups: Map<ComplexityLevel, vscode.DecorationOptions[]> = new Map([
            ['low', []],
            ['moderate', []],
            ['high', []],
            ['very-high', []],
        ]);

        for (const result of results) {
            const level = this.getLevel(result.cyclomaticComplexity, thresholds);
            if (!this.shouldShow(level, minLevel)) { continue; }

            const line = result.lineNumber;
            if (line >= editor.document.lineCount) { continue; }

            const lineEnd = editor.document.lineAt(line).range.end;
            let text = `  \u2298 CC:${result.cyclomaticComplexity}`;
            if (showCognitive) {
                text += ` COG:${result.cognitiveComplexity}`;
            }

            groups.get(level)!.push({
                range: new vscode.Range(line, lineEnd.character, line, lineEnd.character),
                renderOptions: {
                    after: { contentText: text },
                },
            });
        }

        // Apply each decoration type
        for (const [level, decorations] of groups) {
            const decorationType = this.decorationTypes.get(level);
            if (decorationType) {
                editor.setDecorations(decorationType, decorations);
            }
        }
    }

    private clearDecorations(editor: vscode.TextEditor): void {
        for (const dt of this.decorationTypes.values()) {
            editor.setDecorations(dt, []);
        }
    }

    private getLevel(cc: number, thresholds: ComplexityThresholds): ComplexityLevel {
        if (cc >= thresholds.veryHigh) { return 'very-high'; }
        if (cc >= thresholds.high) { return 'high'; }
        if (cc >= thresholds.moderate) { return 'moderate'; }
        return 'low';
    }

    private shouldShow(level: ComplexityLevel, minLevel: ComplexityLevel): boolean {
        const order: ComplexityLevel[] = ['low', 'moderate', 'high', 'very-high'];
        return order.indexOf(level) >= order.indexOf(minLevel);
    }

    private isEnabled(): boolean {
        return vscode.workspace.getConfiguration('developer-tools')
            .get<boolean>('complexity.enabled', true);
    }

    private getMinLevel(): ComplexityLevel {
        return vscode.workspace.getConfiguration('developer-tools')
            .get<ComplexityLevel>('complexity.minLevel', 'moderate');
    }

    private getShowCognitive(): boolean {
        return vscode.workspace.getConfiguration('developer-tools')
            .get<boolean>('complexity.showCognitive', true);
    }

    private getThresholds(): ComplexityThresholds {
        return vscode.workspace.getConfiguration('developer-tools')
            .get<ComplexityThresholds>('complexity.thresholds', DEFAULT_THRESHOLDS);
    }

    dispose(): void {
        for (const dt of this.decorationTypes.values()) {
            dt.dispose();
        }
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
