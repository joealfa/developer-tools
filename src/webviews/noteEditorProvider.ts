/**
 * Note Editor Provider - Secondary sidebar webview for editing notes
 * Displays and allows editing of notes for the current line
 */

import * as vscode from 'vscode';
import { NotesService, Note, NoteCategory, CATEGORY_CONFIG } from '../notes';
import { Icons } from './icons';

/**
 * WebviewViewProvider for the note editor in the secondary sidebar
 */
export class NoteEditorProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'developer-tools.noteEditor';

    private view: vscode.WebviewView | undefined;
    private notesService: NotesService;
    private context: vscode.ExtensionContext;
    private disposables: vscode.Disposable[] = [];
    private currentFilePath: string | null = null;
    private currentLineNumber: number | null = null;

    constructor(context: vscode.ExtensionContext, notesService: NotesService) {
        this.context = context;
        this.notesService = notesService;

        // Listen to notes changes
        this.disposables.push(
            this.notesService.onDidChangeNotes(() => {
                this.refresh();
            })
        );
    }

    /**
     * Show note editor for a specific file and line
     */
    public async showForLine(filePath: string, lineNumber: number): Promise<void> {
        this.currentFilePath = filePath;
        this.currentLineNumber = lineNumber;

        // Check if there are notes for this line
        const notes = this.notesService.getByLine(filePath, lineNumber);
        
        if (notes.length === 0) {
            // No notes available, update content to show empty state
            this.updateContent();
            return;
        }

        // Focus the note editor view in the Developer Tools sidebar
        await vscode.commands.executeCommand('developer-tools.noteEditor.focus');
        
        // Update content after view is focused
        this.updateContent();
    }

    /**
     * Hide the note editor content
     */
    public async hide(): Promise<void> {
        this.currentFilePath = null;
        this.currentLineNumber = null;
        
        // Update to show empty state
        if (this.view) {
            this.view.webview.html = this.getEmptyStateHtml();
        }
    }

    /**
     * Called when the view is first created
     */
    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri],
        };

        // Set initial content
        if (this.currentFilePath !== null && this.currentLineNumber !== null) {
            this.updateContent();
        } else {
            webviewView.webview.html = this.getEmptyStateHtml();
        }

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            this.handleMessage.bind(this),
            null,
            this.disposables
        );

        // Refresh when view becomes visible
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible && this.currentFilePath !== null && this.currentLineNumber !== null) {
                this.updateContent();
            }
        });
    }

    /**
     * Refresh the view
     */
    private async refresh(): Promise<void> {
        if (this.currentFilePath !== null && this.currentLineNumber !== null) {
            // Always update content, will show empty state if no notes
            this.updateContent();
        }
    }

    /**
     * Update the webview content
     */
    private updateContent(): void {
        if (!this.view || this.currentFilePath === null || this.currentLineNumber === null) {
            return;
        }

        const notes = this.notesService.getByLine(this.currentFilePath, this.currentLineNumber);
        this.view.webview.html = this.getHtml(notes);
    }

    /**
     * Handle messages from the webview
     */
    private async handleMessage(message: any): Promise<void> {
        if (!this.currentFilePath || this.currentLineNumber === null) {
            return;
        }

        switch (message.command) {
            case 'addNote':
                // Get the line content from the active editor
                const editor = vscode.window.activeTextEditor;
                const lineContent = editor?.document.lineAt(this.currentLineNumber).text || '';
                
                await this.notesService.create({
                    filePath: this.currentFilePath,
                    lineNumber: this.currentLineNumber,
                    lineContent: lineContent,
                    text: message.text,
                    category: message.category as NoteCategory
                });
                break;

            case 'updateNote':
                await this.notesService.update(message.noteId, {
                    text: message.text,
                    category: message.category as NoteCategory
                });
                break;

            case 'deleteNote':
                await this.notesService.delete(message.noteId);
                break;
        }
    }

    /**
     * Get HTML content for empty state
     */
    private getEmptyStateHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Note Editor</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 200px;
        }
        .empty-state {
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }
        .empty-state svg {
            width: 48px;
            height: 48px;
            margin-bottom: 12px;
            opacity: 0.5;
        }
    </style>
</head>
<body>
    <div class="empty-state">
        ${Icons.notepadText}
        <p>Click on a line to add or edit notes</p>
    </div>
</body>
</html>`;
    }

    /**
     * Get HTML content for the note editor
     */
    private getHtml(notes: Note[]): string {
        if (!this.currentFilePath || this.currentLineNumber === null) {
            return this.getEmptyStateHtml();
        }

        const categoryOptions = Object.entries(CATEGORY_CONFIG)
            .map(([key, config]) => `<option value="${key}">${config.label}</option>`)
            .join('');

        const existingNotesHtml = notes.length > 0 ? notes.map(note => {
            const categoryConfig = CATEGORY_CONFIG[note.category];
            const createdDate = new Date(note.createdAt).toLocaleString();
            return `
            <div class="note-card">
                <div class="note-header">
                    <span class="category-badge category-${note.category}">
                        ${this.getCategoryIcon(note.category)} ${categoryConfig.label}
                    </span>
                    <button class="icon-btn" onclick="deleteNote('${note.id}')" title="Delete">
                        ${Icons.trash2}
                    </button>
                </div>
                <textarea class="note-text" id="note-${note.id}" onchange="updateNote('${note.id}')">${this.escapeHtml(note.text)}</textarea>
                <div class="note-footer">
                    <span class="note-date">${createdDate}</span>
                    <select class="category-select" onchange="updateNoteCategory('${note.id}', this.value)">
                        ${Object.entries(CATEGORY_CONFIG).map(([key, config]) => 
                            `<option value="${key}" ${key === note.category ? 'selected' : ''}>${config.label}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>`;
        }).join('') : '';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Note Editor</title>
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
        .location-info {
            padding: 8px 12px;
            background-color: var(--vscode-editor-background);
            border-radius: 4px;
            margin-bottom: 12px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .location-file {
            font-weight: bold;
            color: var(--vscode-foreground);
        }
        .note-card {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 12px;
        }
        .note-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .category-badge {
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 10px;
            white-space: nowrap;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .category-badge svg {
            width: 11px;
            height: 11px;
        }
        .category-note { background-color: #3794ff33; color: #3794ff; }
        .category-todo { background-color: #f9a82533; color: #f9a825; }
        .category-fixme { background-color: #f4433633; color: #f44336; }
        .category-question { background-color: #9c27b033; color: #9c27b0; }
        .note-text {
            width: 100%;
            min-height: 80px;
            padding: 8px;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-size: 12px;
            resize: vertical;
            font-family: var(--vscode-font-family);
        }
        .note-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 8px;
            font-size: 10px;
        }
        .note-date {
            color: var(--vscode-descriptionForeground);
        }
        .category-select {
            padding: 4px 8px;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-size: 11px;
        }
        .add-note-section {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 12px;
        }
        .section-title {
            font-weight: bold;
            margin-bottom: 8px;
            font-size: 12px;
        }
        .form-group {
            margin-bottom: 8px;
        }
        .form-group label {
            display: block;
            margin-bottom: 4px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .btn {
            width: 100%;
            padding: 8px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .icon-btn {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            opacity: 0.7;
        }
        .icon-btn:hover {
            opacity: 1;
            background-color: var(--vscode-toolbar-hoverBackground);
        }
        .icon-btn svg {
            width: 14px;
            height: 14px;
        }
    </style>
</head>
<body>
    <div class="location-info">
        <div class="location-file">${this.escapeHtml(this.currentFilePath)}</div>
        <div>Line ${this.currentLineNumber + 1}</div>
    </div>

    ${existingNotesHtml}

    <div class="add-note-section">
        <div class="section-title">Add New Note</div>
        <div class="form-group">
            <label for="newNoteText">Note</label>
            <textarea id="newNoteText" class="note-text" placeholder="Enter your note..."></textarea>
        </div>
        <div class="form-group">
            <label for="newNoteCategory">Category</label>
            <select id="newNoteCategory" class="category-select">
                ${categoryOptions}
            </select>
        </div>
        <button class="btn" onclick="addNote()">Add Note</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function addNote() {
            const text = document.getElementById('newNoteText').value.trim();
            const category = document.getElementById('newNoteCategory').value;
            
            if (!text) {
                return;
            }

            vscode.postMessage({
                command: 'addNote',
                text: text,
                category: category
            });

            // Clear form
            document.getElementById('newNoteText').value = '';
        }

        function updateNote(noteId) {
            const text = document.getElementById('note-' + noteId).value.trim();
            const categorySelect = event.target.closest('.note-card').querySelector('.category-select');
            const category = categorySelect.value;

            if (!text) {
                return;
            }

            vscode.postMessage({
                command: 'updateNote',
                noteId: noteId,
                text: text,
                category: category
            });
        }

        function updateNoteCategory(noteId, category) {
            const textarea = document.getElementById('note-' + noteId);
            const text = textarea.value.trim();

            vscode.postMessage({
                command: 'updateNote',
                noteId: noteId,
                text: text,
                category: category
            });
        }

        function deleteNote(noteId) {
            vscode.postMessage({
                command: 'deleteNote',
                noteId: noteId
            });
        }
    </script>
</body>
</html>`;
    }

    /**
     * Get SVG icon for a category
     */
    private getCategoryIcon(category: NoteCategory): string {
        const iconMap: Record<string, string> = {
            note: Icons.notepadText,
            todo: Icons.listTodo,
            fixme: Icons.locateFixed,
            question: Icons.fileQuestion,
        };
        const icon = iconMap[category] || Icons.notepadText;
        return icon.replace('width="18"', 'width="11"').replace('height="18"', 'height="11"');
    }

    /**
     * Escape HTML special characters
     */
    private escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}
