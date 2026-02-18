/**
 * Complexity Service - Manages analysis lifecycle, caching, and debouncing
 */

import * as vscode from 'vscode';
import { ComplexityResult } from './types';
import { ComplexityAnalyzer } from './complexityAnalyzer';

export class ComplexityService implements vscode.Disposable {
    private analyzer: ComplexityAnalyzer;
    private cache: Map<string, { version: number; results: ComplexityResult[] }> = new Map();
    private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
    private disposables: vscode.Disposable[] = [];

    private readonly _onDidChangeComplexity = new vscode.EventEmitter<{ uri: vscode.Uri; results: ComplexityResult[] }>();
    public readonly onDidChangeComplexity = this._onDidChangeComplexity.event;

    constructor() {
        this.analyzer = new ComplexityAnalyzer();

        // Analyze on document change (debounced)
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((e) => {
                if (e.document.uri.scheme !== 'file') { return; }
                if (!this.isEnabled()) { return; }
                if (!this.analyzer.isSupported(e.document.languageId)) { return; }
                this.debouncedAnalyze(e.document);
            })
        );

        // Analyze on document open
        this.disposables.push(
            vscode.workspace.onDidOpenTextDocument((doc) => {
                if (doc.uri.scheme !== 'file') { return; }
                if (!this.isEnabled()) { return; }
                if (!this.analyzer.isSupported(doc.languageId)) { return; }
                this.analyzeDocument(doc);
            })
        );

        // Analyze visible editors on activation
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (!editor) { return; }
                if (editor.document.uri.scheme !== 'file') { return; }
                if (!this.isEnabled()) { return; }
                if (!this.analyzer.isSupported(editor.document.languageId)) { return; }

                const key = editor.document.uri.toString();
                const cached = this.cache.get(key);
                if (!cached || cached.version !== editor.document.version) {
                    this.analyzeDocument(editor.document);
                }
            })
        );
    }

    getComplexity(uri: vscode.Uri): ComplexityResult[] {
        return this.cache.get(uri.toString())?.results ?? [];
    }

    analyzeDocument(document: vscode.TextDocument): void {
        const key = document.uri.toString();
        const filePath = vscode.workspace.asRelativePath(document.uri, false);
        const results = this.analyzer.analyze(document.getText(), document.languageId, filePath);

        this.cache.set(key, { version: document.version, results });
        this._onDidChangeComplexity.fire({ uri: document.uri, results });
    }

    private debouncedAnalyze(document: vscode.TextDocument): void {
        const key = document.uri.toString();

        const existing = this.debounceTimers.get(key);
        if (existing) { clearTimeout(existing); }

        this.debounceTimers.set(key, setTimeout(() => {
            this.debounceTimers.delete(key);
            this.analyzeDocument(document);
        }, 500));
    }

    private isEnabled(): boolean {
        return vscode.workspace.getConfiguration('developer-tools')
            .get<boolean>('complexity.enabled', true);
    }

    dispose(): void {
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this._onDidChangeComplexity.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
