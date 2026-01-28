/**
 * Notes Panel - Side panel webview for editing notes
 * Displays and allows editing of notes for the current line
 */

import * as vscode from 'vscode';
import { NotesService, Note, NoteCategory, CATEGORY_CONFIG, NotesCursorTracker } from '../notes';
import { Icons } from './icons';

/**
 * Manager for the notes side panel
 */
export class NotesPanel implements vscode.Disposable {
    private static instance: NotesPanel | null = null;
    private panel: vscode.WebviewPanel | null = null;
    private context: vscode.ExtensionContext;
    private notesService: NotesService;
    private cursorTracker: NotesCursorTracker | null = null;
    private currentFilePath: string | null = null;
    private currentLineNumber: number | null = null;
    private disposables: vscode.Disposable[] = [];
    private keepOpen: boolean = false; // Track if user wants panel to stay open

    private constructor(context: vscode.ExtensionContext, notesService: NotesService) {
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
     * Get or create the singleton instance
     */
    static getInstance(context: vscode.ExtensionContext, notesService: NotesService): NotesPanel {
        if (!NotesPanel.instance) {
            NotesPanel.instance = new NotesPanel(context, notesService);
        }
        return NotesPanel.instance;
    }

    /**
     * Set the cursor tracker reference for focus management
     */
    setCursorTracker(tracker: NotesCursorTracker): void {
        this.cursorTracker = tracker;
    }

    /**
     * Show the panel for a specific file and line
     * @param filePath - The file path
     * @param lineNumber - The line number
     * @param keepOpen - If true, panel stays open even when cursor moves away
     */
    show(filePath: string, lineNumber: number, keepOpen: boolean = false): void {
        this.currentFilePath = filePath;
        this.currentLineNumber = lineNumber;
        
        // Once user navigates via table or command, keep panel open
        if (keepOpen) {
            this.keepOpen = true;
        }

        if (!this.panel) {
            this.createPanel();
        }
        // Don't call reveal() - just update content
        // This preserves the panel's current position (even if moved to a separate window)

        this.updateContent();
    }

    /**
     * Hide the panel (only if not set to keepOpen)
     */
    hide(): void {
        // If keepOpen is set, don't dispose - just leave panel as is
        if (this.keepOpen) {
            return;
        }
        
        if (this.panel) {
            this.panel.dispose();
            this.panel = null;
        }
    }

    /**
     * Force close the panel (ignores keepOpen flag)
     */
    forceClose(): void {
        this.keepOpen = false;
        if (this.panel) {
            this.panel.dispose();
            this.panel = null;
        }
    }

    /**
     * Check if panel is visible
     */
    isVisible(): boolean {
        return this.panel !== null && this.panel.visible;
    }

    /**
     * Refresh the panel content
     */
    refresh(): void {
        if (this.panel && this.currentFilePath !== null && this.currentLineNumber !== null) {
            this.updateContent();
        }
    }

    /**
     * Create the webview panel
     */
    private createPanel(): void {
        this.panel = vscode.window.createWebviewPanel(
            'notesPanel',
            'Line Notes',
            {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: true,
            },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        // Handle panel disposal
        this.panel.onDidDispose(() => {
            this.panel = null;
            this.keepOpen = false; // Reset when user closes panel
            // Notify cursor tracker that panel is no longer focused
            if (this.cursorTracker) {
                this.cursorTracker.setPanelFocused(false);
            }
        }, null, this.disposables);

        // Track panel focus state
        this.panel.onDidChangeViewState((e) => {
            if (this.cursorTracker) {
                this.cursorTracker.setPanelFocused(e.webviewPanel.active);
            }
        }, null, this.disposables);

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            this.handleMessage.bind(this),
            null,
            this.disposables
        );
    }

    /**
     * Update the panel content
     */
    private updateContent(): void {
        if (!this.panel || this.currentFilePath === null || this.currentLineNumber === null) {
            return;
        }

        const notes = this.notesService.getByLine(this.currentFilePath, this.currentLineNumber);
        const lineDisplay = this.currentLineNumber + 1; // 1-based for display

        this.panel.title = `Notes: Line ${lineDisplay}`;
        this.panel.webview.html = this.getHtml(notes, this.currentFilePath, this.currentLineNumber);
    }

    /**
     * Handle messages from the webview
     */
    private async handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'addNote':
                await this.handleAddNote(message);
                break;

            case 'updateNote':
                await this.handleUpdateNote(message);
                break;

            case 'deleteNote':
                await this.handleDeleteNote(message);
                break;

            case 'reanchorNote':
                await this.handleReanchorNote(message);
                break;

            case 'close':
                this.hide();
                break;
        }
    }

    /**
     * Handle add note command
     */
    private async handleAddNote(message: { text: string; category: NoteCategory }): Promise<void> {
        if (this.currentFilePath === null || this.currentLineNumber === null) {
            return;
        }

        const editor = vscode.window.activeTextEditor;
        const lineContent = (editor && this.currentLineNumber < editor.document.lineCount)
            ? editor.document.lineAt(this.currentLineNumber).text
            : '';
        const surroundingContext = this.getSurroundingContext(editor?.document, this.currentLineNumber);

        await this.notesService.create({
            filePath: this.currentFilePath,
            lineNumber: this.currentLineNumber,
            lineContent,
            text: message.text,
            category: message.category,
            surroundingContext,
        });

        vscode.window.showInformationMessage('Note added successfully!');
    }

    /**
     * Handle update note command
     */
    private async handleUpdateNote(message: { id: string; text: string; category: NoteCategory }): Promise<void> {
        await this.notesService.update(message.id, {
            text: message.text,
            category: message.category,
        });

        vscode.window.showInformationMessage('Note updated successfully!');
    }

    /**
     * Handle delete note command
     */
    private async handleDeleteNote(message: { id: string }): Promise<void> {
        const confirmed = await vscode.window.showWarningMessage(
            'Are you sure you want to delete this note?',
            { modal: true },
            'Delete'
        );

        if (confirmed === 'Delete') {
            await this.notesService.delete(message.id);
            vscode.window.showInformationMessage('Note deleted successfully!');
        }
    }

    /**
     * Handle reanchor note command
     */
    private async handleReanchorNote(message: { id: string }): Promise<void> {
        if (this.currentLineNumber === null) {
            return;
        }

        const editor = vscode.window.activeTextEditor;
        const lineContent = (editor && this.currentLineNumber < editor.document.lineCount)
            ? editor.document.lineAt(this.currentLineNumber).text
            : '';
        const surroundingContext = this.getSurroundingContext(editor?.document, this.currentLineNumber);

        await this.notesService.reanchor(
            message.id,
            this.currentLineNumber,
            lineContent,
            surroundingContext
        );

        vscode.window.showInformationMessage('Note re-anchored to current line!');
    }

    /**
     * Get surrounding context for a line
     */
    private getSurroundingContext(
        document: vscode.TextDocument | undefined,
        lineNumber: number
    ): { lineBefore?: string; lineAfter?: string } {
        if (!document) {
            return {};
        }

        const context: { lineBefore?: string; lineAfter?: string } = {};

        if (lineNumber > 0) {
            context.lineBefore = document.lineAt(lineNumber - 1).text;
        }

        if (lineNumber < document.lineCount - 1) {
            context.lineAfter = document.lineAt(lineNumber + 1).text;
        }

        return context;
    }

    /**
     * Generate HTML for the webview
     */
    private getHtml(notes: Note[], filePath: string, lineNumber: number): string {
        const lineDisplay = lineNumber + 1;
        const hasNotes = notes.length > 0;
        const hasOrphanedNotes = notes.some(n => n.status === 'orphaned');

        // Generate category dropdown items with SVG icons
        const categoryDropdownItems = Object.entries(CATEGORY_CONFIG)
            .map(([key, config]) => {
                const icon = this.getCategoryIconSmall(key as NoteCategory);
                return `<div class="custom-dropdown-item" data-value="${key}">${icon}<span>${config.label}</span></div>`;
            })
            .join('');

        // For native select fallback (hidden, used for form value)
        const categoryOptions = Object.entries(CATEGORY_CONFIG)
            .map(([key, config]) => `<option value="${key}">${config.label}</option>`)
            .join('');

        const notesHtml = notes.map(note => this.getNoteCardHtml(note, categoryOptions, categoryDropdownItems)).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Line Notes</title>
    <style>
        * {
            box-sizing: border-box;
        }
        body {
            font-family: var(--vscode-font-family);
            padding: 16px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        .header-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .file-path {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            word-break: break-all;
        }
        .line-number {
            font-size: 14px;
            font-weight: bold;
        }
        .close-btn {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            opacity: 0.7;
        }
        .close-btn:hover {
            opacity: 1;
            background-color: var(--vscode-toolbar-hoverBackground);
        }
        .warning-banner {
            background-color: var(--vscode-inputValidation-warningBackground);
            border: 1px solid var(--vscode-inputValidation-warningBorder);
            color: var(--vscode-inputValidation-warningForeground);
            padding: 8px 12px;
            border-radius: 4px;
            margin-bottom: 16px;
            font-size: 12px;
        }
        .note-card {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 12px;
        }
        .note-card.orphaned {
            border-color: var(--vscode-inputValidation-warningBorder);
        }
        .note-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .category-badge {
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .category-badge svg {
            width: 12px;
            height: 12px;
        }
        .category-note { background-color: #3794ff33; color: #3794ff; }
        .category-todo { background-color: #f9a82533; color: #f9a825; }
        .category-fixme { background-color: #f4433633; color: #f44336; }
        .category-question { background-color: #9c27b033; color: #9c27b0; }
        .note-actions {
            display: flex;
            gap: 4px;
        }
        .icon-btn {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            opacity: 0.7;
            font-size: 12px;
        }
        .icon-btn:hover {
            opacity: 1;
            background-color: var(--vscode-toolbar-hoverBackground);
        }
        .icon-btn.danger:hover {
            background-color: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
        }
        .note-content {
            margin-bottom: 8px;
        }
        .note-textarea {
            width: 100%;
            min-height: 80px;
            padding: 8px;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            resize: vertical;
        }
        .note-textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .note-text {
            white-space: pre-wrap;
            font-size: 13px;
            line-height: 1.4;
        }
        .note-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .note-meta {
            display: flex;
            gap: 12px;
        }
        .edit-controls {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .category-select {
            display: none;
        }
        /* Custom dropdown styles */
        .custom-dropdown {
            position: relative;
            min-width: 120px;
        }
        .custom-dropdown-trigger {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px;
            background-color: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            color: var(--vscode-dropdown-foreground);
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            min-width: 110px;
        }
        .custom-dropdown-trigger:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .custom-dropdown-trigger svg {
            width: 14px;
            height: 14px;
            flex-shrink: 0;
        }
        .custom-dropdown-trigger .arrow {
            margin-left: auto;
            font-size: 10px;
        }
        .custom-dropdown-menu {
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background-color: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            margin-top: 2px;
            z-index: 1000;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }
        .custom-dropdown.open .custom-dropdown-menu {
            display: block;
        }
        .custom-dropdown-item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 8px;
            cursor: pointer;
            font-size: 12px;
        }
        .custom-dropdown-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .custom-dropdown-item.selected {
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        .custom-dropdown-item svg {
            width: 14px;
            height: 14px;
            flex-shrink: 0;
        }
        .add-note-section {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            padding: 12px;
            margin-top: 16px;
        }
        .add-note-title {
            font-size: 13px;
            font-weight: 500;
            margin-bottom: 8px;
        }
        .add-note-controls {
            display: flex;
            gap: 8px;
            margin-top: 8px;
        }
        .btn {
            padding: 6px 12px;
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
        .empty-state {
            text-align: center;
            padding: 24px;
            color: var(--vscode-descriptionForeground);
        }
        .empty-state-icon {
            margin-bottom: 8px;
        }
        .empty-state-icon svg {
            width: 32px;
            height: 32px;
        }
        .icon-btn svg {
            width: 14px;
            height: 14px;
            vertical-align: middle;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-info">
            <span class="file-path">${this.escapeHtml(filePath)}</span>
            <span class="line-number">Line ${lineDisplay}</span>
        </div>
        <button class="close-btn" onclick="closePanel()" title="Close">✕</button>
    </div>

    ${hasOrphanedNotes ? `
    <div class="warning-banner">
        ⚠️ Some notes are orphaned because their original line content has changed. 
        You can re-anchor them to the current line or delete them.
    </div>
    ` : ''}

    <div class="notes-list">
        ${hasNotes ? notesHtml : `
        <div class="empty-state">
            <div class="empty-state-icon">${Icons.notepadText.replace('width="18"', 'width="32"').replace('height="18"', 'height="32"')}</div>
            <div>No notes on this line</div>
            <div style="font-size: 12px; margin-top: 4px;">Add a note below</div>
        </div>
        `}
    </div>

    <div class="add-note-section">
        <div class="add-note-title">Add New Note</div>
        <textarea class="note-textarea" id="newNoteText" placeholder="Enter your note..."></textarea>
        <div class="add-note-controls">
            <select class="category-select" id="newNoteCategory">
                ${categoryOptions}
            </select>
            <div class="custom-dropdown" id="newNoteCategoryDropdown">
                <div class="custom-dropdown-trigger" onclick="toggleDropdown('newNoteCategoryDropdown')">
                    ${this.getCategoryIconSmall('note')}<span id="newNoteCategoryLabel">Note</span><span class="arrow">▼</span>
                </div>
                <div class="custom-dropdown-menu">
                    ${categoryDropdownItems}
                </div>
            </div>
            <button class="btn btn-primary" onclick="addNote()">Add Note</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Dropdown management
        function toggleDropdown(dropdownId) {
            const dropdown = document.getElementById(dropdownId);
            const isOpen = dropdown.classList.contains('open');
            
            // Close all dropdowns first
            document.querySelectorAll('.custom-dropdown.open').forEach(d => d.classList.remove('open'));
            
            if (!isOpen) {
                dropdown.classList.add('open');
            }
        }

        // Handle dropdown item clicks
        document.querySelectorAll('.custom-dropdown-item').forEach(item => {
            item.addEventListener('click', function() {
                const dropdown = this.closest('.custom-dropdown');
                const value = this.dataset.value;
                const label = this.querySelector('span').textContent;
                const icon = this.querySelector('svg').outerHTML;
                
                // Update trigger display
                const trigger = dropdown.querySelector('.custom-dropdown-trigger');
                trigger.querySelector('svg').outerHTML = icon;
                trigger.querySelector('span:not(.arrow)').textContent = label;
                
                // Update hidden select
                const selectId = dropdown.id.replace('Dropdown', '');
                const select = document.getElementById(selectId);
                if (select) {
                    select.value = value;
                }
                
                // Update selected state
                dropdown.querySelectorAll('.custom-dropdown-item').forEach(i => i.classList.remove('selected'));
                this.classList.add('selected');
                
                // Close dropdown
                dropdown.classList.remove('open');
            });
        });

        // Close dropdowns when clicking outside
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.custom-dropdown')) {
                document.querySelectorAll('.custom-dropdown.open').forEach(d => d.classList.remove('open'));
            }
        });

        function closePanel() {
            vscode.postMessage({ command: 'close' });
        }

        function addNote() {
            const text = document.getElementById('newNoteText').value.trim();
            const category = document.getElementById('newNoteCategory').value;
            
            if (!text) {
                return;
            }

            vscode.postMessage({ command: 'addNote', text, category });
            document.getElementById('newNoteText').value = '';
            
            // Reset dropdown to Note
            const dropdown = document.getElementById('newNoteCategoryDropdown');
            const noteItem = dropdown.querySelector('.custom-dropdown-item[data-value="note"]');
            if (noteItem) {
                const icon = noteItem.querySelector('svg').outerHTML;
                const trigger = dropdown.querySelector('.custom-dropdown-trigger');
                trigger.querySelector('svg').outerHTML = icon;
                trigger.querySelector('span:not(.arrow)').textContent = 'Note';
            }
            document.getElementById('newNoteCategory').value = 'note';
            
            // Reset selected state
            dropdown.querySelectorAll('.custom-dropdown-item').forEach(i => i.classList.remove('selected'));
            if (noteItem) noteItem.classList.add('selected');
        }

        function startEdit(noteId) {
            document.getElementById('view-' + noteId).style.display = 'none';
            document.getElementById('edit-' + noteId).style.display = 'block';
        }

        function cancelEdit(noteId) {
            document.getElementById('view-' + noteId).style.display = 'block';
            document.getElementById('edit-' + noteId).style.display = 'none';
        }

        function saveNote(noteId) {
            const text = document.getElementById('text-' + noteId).value.trim();
            const category = document.getElementById('category-' + noteId).value;
            
            if (!text) {
                return;
            }

            vscode.postMessage({ command: 'updateNote', id: noteId, text, category });
        }

        function deleteNote(noteId) {
            vscode.postMessage({ command: 'deleteNote', id: noteId });
        }

        function reanchorNote(noteId) {
            vscode.postMessage({ command: 'reanchorNote', id: noteId });
        }

        // Handle keyboard shortcuts
        document.getElementById('newNoteText').addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                addNote();
            }
        });
    </script>
</body>
</html>`;
    }

    /**
     * Generate HTML for a single note card
     */
    private getNoteCardHtml(note: Note, categoryOptions: string, categoryDropdownItems: string): string {
        const categoryConfig = CATEGORY_CONFIG[note.category];
        const isOrphaned = note.status === 'orphaned';
        const createdDate = new Date(note.createdAt).toLocaleDateString();
        const updatedDate = new Date(note.updatedAt).toLocaleDateString();

        return `
        <div class="note-card ${isOrphaned ? 'orphaned' : ''}" data-id="${note.id}">
            <!-- View Mode -->
            <div id="view-${note.id}">
                <div class="note-header">
                    <span class="category-badge category-${note.category}">
                        ${this.getCategoryIcon(note.category)} ${categoryConfig.label}
                    </span>
                    <div class="note-actions">
                        ${isOrphaned ? `
                        <button class="icon-btn" onclick="reanchorNote('${note.id}')" title="Re-anchor to current line">🔗</button>
                        ` : ''}
                        <button class="icon-btn" onclick="startEdit('${note.id}')" title="Edit">${Icons.notebookPen.replace('width="18"', 'width="14"').replace('height="18"', 'height="14"')}</button>
                        <button class="icon-btn danger" onclick="deleteNote('${note.id}')" title="Delete">${Icons.trash2.replace('width="18"', 'width="14"').replace('height="18"', 'height="14"')}</button>
                    </div>
                </div>
                <div class="note-content">
                    <div class="note-text">${this.escapeHtml(note.text)}</div>
                </div>
                <div class="note-footer">
                    <div class="note-meta">
                        <span>Created: ${createdDate}</span>
                        ${note.createdAt !== note.updatedAt ? `<span>Updated: ${updatedDate}</span>` : ''}
                    </div>
                    ${isOrphaned ? `<span style="color: var(--vscode-inputValidation-warningForeground);">⚠️ Orphaned</span>` : ''}
                </div>
            </div>

            <!-- Edit Mode -->
            <div id="edit-${note.id}" style="display: none;">
                <textarea class="note-textarea" id="text-${note.id}">${this.escapeHtml(note.text)}</textarea>
                <div class="edit-controls" style="margin-top: 8px;">
                    <select class="category-select" id="category-${note.id}">
                        ${categoryOptions.replace(`value="${note.category}"`, `value="${note.category}" selected`)}
                    </select>
                    <div class="custom-dropdown" id="category-${note.id}Dropdown">
                        <div class="custom-dropdown-trigger" onclick="toggleDropdown('category-${note.id}Dropdown')">
                            ${this.getCategoryIconSmall(note.category)}<span>${categoryConfig.label}</span><span class="arrow">▼</span>
                        </div>
                        <div class="custom-dropdown-menu">
                            ${categoryDropdownItems.replace(`data-value="${note.category}"`, `data-value="${note.category}" class="custom-dropdown-item selected"`).replace(`class="custom-dropdown-item" data-value="${note.category}"`, `class="custom-dropdown-item selected" data-value="${note.category}"`)}
                        </div>
                    </div>
                    <button class="btn btn-primary" onclick="saveNote('${note.id}')">Save</button>
                    <button class="btn btn-secondary" onclick="cancelEdit('${note.id}')">Cancel</button>
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Get SVG icon for a category (12px)
     */
    private getCategoryIcon(category: NoteCategory): string {
        const iconMap: Record<string, string> = {
            note: Icons.notepadText,
            todo: Icons.listTodo,
            fixme: Icons.locateFixed,
            question: Icons.fileQuestion,
        };
        const icon = iconMap[category] || Icons.notepadText;
        return icon.replace('width="18"', 'width="12"').replace('height="18"', 'height="12"');
    }

    /**
     * Get SVG icon for a category (14px for dropdowns)
     */
    private getCategoryIconSmall(category: NoteCategory): string {
        const iconMap: Record<string, string> = {
            note: Icons.notepadText,
            todo: Icons.listTodo,
            fixme: Icons.locateFixed,
            question: Icons.fileQuestion,
        };
        const icon = iconMap[category] || Icons.notepadText;
        return icon.replace('width="18"', 'width="14"').replace('height="18"', 'height="14"');
    }

    /**
     * Escape HTML special characters
     */
    private escapeHtml(text: string): string {
        return text
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
        if (this.panel) {
            this.panel.dispose();
            this.panel = null;
        }

        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];

        NotesPanel.instance = null;
    }
}
