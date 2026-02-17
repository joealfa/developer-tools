/**
 * Notes Decorations - Gutter icons for lines with notes
 * Provides visual indicators for lines that have attached notes
 */

import * as vscode from 'vscode';
import { NotesService } from './notesService';
import { NoteCategory, NoteStatus, CATEGORY_CONFIG, STATUS_CONFIG } from './types';
import { getRelativePath } from '../utils';
import { Icons } from '../webviews/icons';

/**
 * Manages gutter decorations for notes
 */
export class NotesDecorations implements vscode.Disposable {
    private notesService: NotesService;
    private disposables: vscode.Disposable[] = [];
    
    // Decoration types for each category
    private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
    
    // Track which editors have decorations
    private decoratedEditors: Set<string> = new Set();

    constructor(notesService: NotesService, context: vscode.ExtensionContext) {
        this.notesService = notesService;
        this.createDecorationTypes(context);
        this.registerListeners();
        
        // Initial decoration of visible editors
        this.decorateAllVisibleEditors();
    }

    /**
     * Create decoration types for each category and status
     */
    private createDecorationTypes(_context: vscode.ExtensionContext): void {
        // Map svgIconKey to Icons entries
        const iconKeyMap: Record<string, string> = {
            notepadText: Icons.notepadText,
            listTodo: Icons.listTodo,
            locateFixed: Icons.locateFixed,
            fileQuestion: Icons.fileQuestion,
            badgeCheck: Icons.badgeCheck,
            badgeAlert: Icons.badgeAlert,
        };

        // Create decorations for each category
        for (const [category, config] of Object.entries(CATEGORY_CONFIG)) {
            const svgSource = iconKeyMap[config.svgIconKey] || Icons.notepadText;
            const decorationType = vscode.window.createTextEditorDecorationType({
                gutterIconPath: this.createSvgUri(svgSource, config.color),
                gutterIconSize: 'contain',
                overviewRulerColor: config.color,
                overviewRulerLane: vscode.OverviewRulerLane.Right,
            });
            this.decorationTypes.set(`category-${category}`, decorationType);
        }

        // Create decoration for orphaned notes (warning style)
        const orphanedConfig = STATUS_CONFIG.orphaned;
        const orphanedSvg = iconKeyMap[orphanedConfig.svgIconKey] || Icons.badgeAlert;
        const orphanedDecoration = vscode.window.createTextEditorDecorationType({
            gutterIconPath: this.createSvgUri(orphanedSvg, orphanedConfig.color),
            gutterIconSize: 'contain',
            overviewRulerColor: orphanedConfig.color,
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            backgroundColor: new vscode.ThemeColor('editorWarning.background'),
            isWholeLine: true,
        });
        this.decorationTypes.set('status-orphaned', orphanedDecoration);
    }

    /**
     * Create an SVG data URI for gutter icon by colorizing a Lucide SVG
     */
    private createSvgUri(svgSource: string, color: string): vscode.Uri {
        // Replace stroke="currentColor" with the actual color
        const colorized = svgSource
            .replace(/stroke="currentColor"/g, `stroke="${color}"`)
            .replace(/width="\d+"/, 'width="16"')
            .replace(/height="\d+"/, 'height="16"');

        const encodedSvg = encodeURIComponent(colorized);
        return vscode.Uri.parse(`data:image/svg+xml,${encodedSvg}`);
    }

    /**
     * Register event listeners
     */
    private registerListeners(): void {
        // Listen to notes changes
        this.disposables.push(
            this.notesService.onDidChangeNotes(() => {
                this.decorateAllVisibleEditors();
            })
        );

        // Listen to visible editor changes
        this.disposables.push(
            vscode.window.onDidChangeVisibleTextEditors(() => {
                this.decorateAllVisibleEditors();
            })
        );

        // Listen to document changes (for immediate visual feedback)
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                const editor = vscode.window.visibleTextEditors.find(
                    e => e.document === event.document
                );
                if (editor) {
                    this.decorateEditor(editor);
                }
            })
        );
    }

    /**
     * Decorate all visible text editors
     */
    private decorateAllVisibleEditors(): void {
        for (const editor of vscode.window.visibleTextEditors) {
            this.decorateEditor(editor);
        }
    }

    /**
     * Decorate a single editor with note indicators
     */
    private decorateEditor(editor: vscode.TextEditor): void {
        // Skip non-file documents
        if (editor.document.uri.scheme !== 'file') {
            return;
        }

        const filePath = getRelativePath(editor.document.uri);
        if (!filePath) {
            return;
        }

        // Get notes for this file
        const notes = this.notesService.getByFile(filePath);

        // Group notes by line and determine which decoration to show
        // Priority: orphaned > fixme > todo > question > note
        const lineDecorations = new Map<number, { category: NoteCategory; status: NoteStatus }>();

        for (const note of notes) {
            const existing = lineDecorations.get(note.lineNumber);
            
            if (!existing) {
                lineDecorations.set(note.lineNumber, {
                    category: note.category,
                    status: note.status,
                });
            } else {
                // Orphaned status takes priority
                if (note.status === 'orphaned') {
                    existing.status = 'orphaned';
                }
                
                // Category priority: fixme > todo > question > note
                const priority: NoteCategory[] = ['fixme', 'todo', 'question', 'note'];
                const existingPriority = priority.indexOf(existing.category);
                const newPriority = priority.indexOf(note.category);
                
                if (newPriority < existingPriority) {
                    existing.category = note.category;
                }
            }
        }

        // Clear all decorations first
        for (const decorationType of this.decorationTypes.values()) {
            editor.setDecorations(decorationType, []);
        }

        // Group ranges by decoration type
        const decorationRanges = new Map<string, vscode.Range[]>();

        for (const [lineNumber, info] of lineDecorations.entries()) {
            // Skip if line is beyond document
            if (lineNumber >= editor.document.lineCount) {
                continue;
            }

            const range = new vscode.Range(lineNumber, 0, lineNumber, 0);
            
            // Determine which decoration to use
            let decorationKey: string;
            if (info.status === 'orphaned') {
                decorationKey = 'status-orphaned';
            } else {
                decorationKey = `category-${info.category}`;
            }

            const ranges = decorationRanges.get(decorationKey) ?? [];
            ranges.push(range);
            decorationRanges.set(decorationKey, ranges);
        }

        // Apply decorations
        for (const [key, ranges] of decorationRanges.entries()) {
            const decorationType = this.decorationTypes.get(key);
            if (decorationType) {
                editor.setDecorations(decorationType, ranges);
            }
        }

        // Track decorated editor
        this.decoratedEditors.add(editor.document.uri.toString());
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        // Dispose all decoration types
        for (const decorationType of this.decorationTypes.values()) {
            decorationType.dispose();
        }
        this.decorationTypes.clear();

        // Dispose all event listeners
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];

        this.decoratedEditors.clear();
    }
}
