/**
 * Notes Table Provider - Bottom panel with notes navigation
 * Displays all notes in a searchable, filterable table with grouping
 */

import * as vscode from 'vscode';
import {
    NotesService,
    Note,
    NoteCategory,
    NoteStatus,
    NotesGroupBy,
    CATEGORY_CONFIG,
    STATUS_CONFIG,
} from '../notes';
import { Icons } from './icons';
import type { NoteEditorProvider } from './noteEditorProvider';

/**
 * WebviewViewProvider for the notes table in the bottom panel
 */
export class NotesTableProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'developer-tools.notesTable';

    private view: vscode.WebviewView | undefined;
    private notesService: NotesService;
    private context: vscode.ExtensionContext;
    private disposables: vscode.Disposable[] = [];
    private noteEditorProvider: NoteEditorProvider | null = null;

    // Current filter/group state
    private searchText: string = '';
    private categoryFilter: NoteCategory | 'all' = 'all';
    private statusFilter: NoteStatus | 'all' = 'all';
    private groupBy: NotesGroupBy = 'file';
    private selectedNotes: Set<string> = new Set();

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
     * Set the note editor provider reference for navigation
     */
    setNoteEditorProvider(provider: NoteEditorProvider): void {
        this.noteEditorProvider = provider;
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

        webviewView.webview.html = this.getHtml();

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            this.handleMessage.bind(this),
            null,
            this.disposables
        );

        // Refresh when view becomes visible
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.refresh();
            }
        });
    }

    /**
     * Refresh the view
     */
    refresh(): void {
        if (this.view) {
            this.view.webview.html = this.getHtml();
        }
    }

    /**
     * Handle messages from the webview
     */
    private async handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'navigate':
                await this.navigateToNote(message.noteId);
                break;

            case 'search':
                this.searchText = message.text;
                this.refresh();
                break;

            case 'filterCategory':
                this.categoryFilter = message.category;
                this.refresh();
                break;

            case 'filterStatus':
                this.statusFilter = message.status;
                this.refresh();
                break;

            case 'groupBy':
                this.groupBy = message.groupBy;
                this.refresh();
                break;

            case 'selectNote':
                if (message.selected) {
                    this.selectedNotes.add(message.noteId);
                } else {
                    this.selectedNotes.delete(message.noteId);
                }
                break;

            case 'selectAll':
                const notes = this.getFilteredNotes();
                if (message.selected) {
                    notes.forEach(n => this.selectedNotes.add(n.id));
                } else {
                    this.selectedNotes.clear();
                }
                this.refresh();
                break;

            case 'deleteSelected':
                await this.deleteSelectedNotes();
                break;

            case 'changeCategorySelected':
                await this.changeCategoryForSelected(message.category);
                break;

            case 'deleteNote':
                await this.deleteNote(message.noteId);
                break;

            case 'refresh':
                this.refresh();
                break;
        }
    }

    /**
     * Navigate to a note's location and show the side panel
     */
    private async navigateToNote(noteId: string): Promise<void> {
        const note = this.notesService.getById(noteId);
        if (!note) {
            return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, note.filePath);

        try {
            const document = await vscode.workspace.openTextDocument(fileUri);
            const editor = await vscode.window.showTextDocument(document, {
                viewColumn: vscode.ViewColumn.One,
                preserveFocus: false,
            });

            // Navigate to the line
            const position = new vscode.Position(note.lineNumber, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(
                new vscode.Range(position, position),
                vscode.TextEditorRevealType.InCenter
            );

            // Show the note editor in secondary sidebar
            if (this.noteEditorProvider) {
                await this.noteEditorProvider.showForLine(note.filePath, note.lineNumber);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Could not open file: ${note.filePath}`);
        }
    }

    /**
     * Delete a single note
     */
    private async deleteNote(noteId: string): Promise<void> {
        const confirmed = await vscode.window.showWarningMessage(
            'Are you sure you want to delete this note?',
            { modal: true },
            'Delete'
        );

        if (confirmed === 'Delete') {
            await this.notesService.delete(noteId);
            this.selectedNotes.delete(noteId);
        }
    }

    /**
     * Delete all selected notes
     */
    private async deleteSelectedNotes(): Promise<void> {
        if (this.selectedNotes.size === 0) {
            return;
        }

        const confirmed = await vscode.window.showWarningMessage(
            `Are you sure you want to delete ${this.selectedNotes.size} note(s)?`,
            { modal: true },
            'Delete'
        );

        if (confirmed === 'Delete') {
            await this.notesService.bulkDelete(Array.from(this.selectedNotes));
            this.selectedNotes.clear();
        }
    }

    /**
     * Change category for all selected notes
     */
    private async changeCategoryForSelected(category: NoteCategory): Promise<void> {
        if (this.selectedNotes.size === 0) {
            return;
        }

        const updates = Array.from(this.selectedNotes).map(id => ({
            id,
            options: { category },
        }));

        await this.notesService.bulkUpdate(updates);
        vscode.window.showInformationMessage(
            `Updated category for ${this.selectedNotes.size} note(s)`
        );
    }

    /**
     * Get filtered notes based on current filters
     */
    private getFilteredNotes(): Note[] {
        return this.notesService.getFiltered({
            category: this.categoryFilter === 'all' ? undefined : this.categoryFilter,
            status: this.statusFilter === 'all' ? undefined : this.statusFilter,
            searchText: this.searchText || undefined,
        });
    }

    /**
     * Group notes by the current groupBy setting
     */
    private groupNotes(notes: Note[]): Map<string, Note[]> {
        const groups = new Map<string, Note[]>();

        if (this.groupBy === 'none') {
            groups.set('All Notes', notes);
            return groups;
        }

        for (const note of notes) {
            let key: string;
            
            switch (this.groupBy) {
                case 'file':
                    key = note.filePath;
                    break;
                case 'category':
                    key = CATEGORY_CONFIG[note.category].label;
                    break;
                case 'status':
                    key = STATUS_CONFIG[note.status].label;
                    break;
                default:
                    key = 'All Notes';
            }

            const existing = groups.get(key) ?? [];
            existing.push(note);
            groups.set(key, existing);
        }

        return groups;
    }

    /**
     * Generate HTML for the webview
     */
    private getHtml(): string {
        const notes = this.getFilteredNotes();
        const groupedNotes = this.groupNotes(notes);
        const totalCount = this.notesService.count;
        const filteredCount = notes.length;
        const storageStats = this.notesService.getStorageStats();

        const categoryOptions = [
            '<option value="all">All Categories</option>',
            ...Object.entries(CATEGORY_CONFIG).map(
                ([key, config]) => `<option value="${key}" ${this.categoryFilter === key ? 'selected' : ''}>${config.icon} ${config.label}</option>`
            ),
        ].join('');

        const statusOptions = [
            '<option value="all">All Status</option>',
            ...Object.entries(STATUS_CONFIG).map(
                ([key, config]) => `<option value="${key}" ${this.statusFilter === key ? 'selected' : ''}>${config.icon} ${config.label}</option>`
            ),
        ].join('');

        const groupByOptions = [
            { value: 'file', label: 'File' },
            { value: 'category', label: 'Category' },
            { value: 'status', label: 'Status' },
            { value: 'none', label: 'None' },
        ].map(opt => `<option value="${opt.value}" ${this.groupBy === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('');

        const changeCategoryOptions = Object.entries(CATEGORY_CONFIG)
            .map(([key, config]) => `<option value="${key}">${config.icon} ${config.label}</option>`)
            .join('');

        const tableHtml = this.generateTableHtml(groupedNotes);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Notes</title>
    <style>
        * {
            box-sizing: border-box;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: 12px;
            padding: 8px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-panel-background);
            margin: 0;
        }
        .toolbar {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 8px;
            padding: 8px;
            background-color: var(--vscode-editor-background);
            border-radius: 4px;
        }
        .search-box {
            flex: 1;
            min-width: 150px;
            padding: 4px 8px;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-size: 12px;
        }
        .search-box:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .filter-select {
            padding: 4px 8px;
            background-color: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            color: var(--vscode-dropdown-foreground);
            border-radius: 4px;
            font-size: 11px;
        }
        .stats {
            display: flex;
            gap: 12px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            padding: 4px 0;
        }
        .storage-indicator {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .storage-bar {
            width: 40px;
            height: 6px;
            background-color: var(--vscode-progressBar-background);
            border-radius: 3px;
            overflow: hidden;
        }
        .storage-fill {
            height: 100%;
            background-color: var(--vscode-progressBar-background);
            transition: width 0.3s;
        }
        .storage-fill.warning { background-color: var(--vscode-inputValidation-warningBackground); }
        .storage-fill.critical { background-color: var(--vscode-inputValidation-errorBackground); }
        .bulk-actions {
            display: flex;
            gap: 8px;
            padding: 8px;
            background-color: var(--vscode-editor-background);
            border-radius: 4px;
            margin-bottom: 8px;
            align-items: center;
        }
        .bulk-actions.hidden {
            display: none;
        }
        .btn {
            padding: 4px 8px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
        }
        .btn-danger {
            background-color: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
        }
        .btn-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .notes-container {
            padding: 4px;
        }
        .note-row {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px;
            border-bottom: 1px solid var(--vscode-widget-border);
            cursor: pointer;
            font-size: 11px;
        }
        .note-row:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .note-checkbox-col {
            flex-shrink: 0;
        }
        .note-status-col {
            flex-shrink: 0;
        }
        .note-content-col {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .note-first-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .note-second-row {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
        }
        .note-actions-col {
            flex-shrink: 0;
        }
        .group-header {
            background-color: var(--vscode-editor-background);
            font-weight: 600;
            padding: 8px;
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        .group-toggle {
            cursor: pointer;
            user-select: none;
        }
        .category-badge {
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 10px;
            white-space: nowrap;
            display: inline-flex;
            align-items: center;
            gap: 3px;
        }
        .category-badge svg {
            width: 11px;
            height: 11px;
        }
        .category-note { background-color: #3794ff33; color: #3794ff; }
        .category-todo { background-color: #f9a82533; color: #f9a825; }
        .category-fixme { background-color: #f4433633; color: #f44336; }
        .category-question { background-color: #9c27b033; color: #9c27b0; }
        .status-icon {
            font-size: 12px;
        }
        .status-orphaned {
            color: var(--vscode-inputValidation-warningForeground);
        }
        .note-file {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .note-line {
            flex-shrink: 0;
        }
        .note-date {
            flex-shrink: 0;
        }
        .action-btn {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 2px 4px;
            border-radius: 2px;
            opacity: 0.7;
            font-size: 11px;
        }
        .action-btn:hover {
            opacity: 1;
            background-color: var(--vscode-toolbar-hoverBackground);
        }
        .action-btn.danger:hover {
            background-color: var(--vscode-inputValidation-errorBackground);
        }
        .empty-state {
            text-align: center;
            padding: 24px;
            color: var(--vscode-descriptionForeground);
        }
        input[type="checkbox"] {
            width: 14px;
            height: 14px;
        }
        .action-btn svg {
            width: 14px;
            height: 14px;
            vertical-align: middle;
        }
        .empty-state-icon svg {
            width: 32px;
            height: 32px;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <input type="text" class="search-box" id="searchBox" placeholder="Search notes..." value="${this.escapeHtml(this.searchText)}">
        <select class="filter-select" id="categoryFilter">
            ${categoryOptions}
        </select>
        <select class="filter-select" id="statusFilter">
            ${statusOptions}
        </select>
        <select class="filter-select" id="groupBy">
            ${groupByOptions}
        </select>
    </div>

    <div class="stats">
        <span>Showing ${filteredCount} of ${totalCount} notes</span>
        <span class="storage-indicator">
            Storage: ${Math.round(storageStats.percentage)}%
            <div class="storage-bar">
                <div class="storage-fill ${storageStats.percentage >= 95 ? 'critical' : storageStats.percentage >= 80 ? 'warning' : ''}" 
                     style="width: ${Math.min(storageStats.percentage, 100)}%"></div>
            </div>
        </span>
    </div>

    <div class="bulk-actions ${this.selectedNotes.size === 0 ? 'hidden' : ''}" id="bulkActions">
        <span>${this.selectedNotes.size} selected</span>
        <select class="filter-select" id="bulkCategory">
            <option value="">Change Category...</option>
            ${changeCategoryOptions}
        </select>
        <button class="btn btn-danger" onclick="deleteSelected()">Delete Selected</button>
    </div>

    <div class="table-container">
        ${notes.length > 0 ? tableHtml : `
        <div class="empty-state">
            <div class="empty-state-icon">${Icons.notepadText.replace('width="18"', 'width="32"').replace('height="18"', 'height="32"')}</div>
            <div>No notes found</div>
            <div style="margin-top: 4px;">Add notes to your code by right-clicking on a line</div>
        </div>
        `}
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Search
        let searchTimeout;
        document.getElementById('searchBox').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                vscode.postMessage({ command: 'search', text: e.target.value });
            }, 300);
        });

        // Filters
        document.getElementById('categoryFilter').addEventListener('change', (e) => {
            vscode.postMessage({ command: 'filterCategory', category: e.target.value });
        });

        document.getElementById('statusFilter').addEventListener('change', (e) => {
            vscode.postMessage({ command: 'filterStatus', status: e.target.value });
        });

        document.getElementById('groupBy').addEventListener('change', (e) => {
            vscode.postMessage({ command: 'groupBy', groupBy: e.target.value });
        });

        // Bulk category change
        document.getElementById('bulkCategory').addEventListener('change', (e) => {
            if (e.target.value) {
                vscode.postMessage({ command: 'changeCategorySelected', category: e.target.value });
                e.target.value = '';
            }
        });

        // Navigation
        function navigateToNote(noteId) {
            vscode.postMessage({ command: 'navigate', noteId });
        }

        // Selection
        function toggleSelection(noteId, checked) {
            vscode.postMessage({ command: 'selectNote', noteId, selected: checked });
            updateBulkActions();
        }

        function toggleSelectAll(checked) {
            vscode.postMessage({ command: 'selectAll', selected: checked });
        }

        function updateBulkActions() {
            const checkboxes = document.querySelectorAll('.note-checkbox:checked');
            const bulkActions = document.getElementById('bulkActions');
            if (checkboxes.length > 0) {
                bulkActions.classList.remove('hidden');
            } else {
                bulkActions.classList.add('hidden');
            }
        }

        // Delete
        function deleteNote(noteId, event) {
            event.stopPropagation();
            vscode.postMessage({ command: 'deleteNote', noteId });
        }

        function deleteSelected() {
            vscode.postMessage({ command: 'deleteSelected' });
        }

        // Group toggle
        function toggleGroup(groupId) {
            const rows = document.querySelectorAll('[data-group="' + groupId + '"]');
            const toggle = document.getElementById('toggle-' + groupId);
            const isHidden = rows[0]?.style.display === 'none';
            
            rows.forEach(row => {
                row.style.display = isHidden ? '' : 'none';
            });
            
            toggle.textContent = isHidden ? '▼' : '▶';
        }
    </script>
</body>
</html>`;
    }

    /**
     * Generate table HTML for grouped notes
     */
    private generateTableHtml(groupedNotes: Map<string, Note[]>): string {
        const rows: string[] = [];
        let groupIndex = 0;

        rows.push('<div class="notes-container">');

        for (const [groupName, notes] of groupedNotes) {
            const groupId = `group-${groupIndex++}`;
            
            if (this.groupBy !== 'none') {
                rows.push(`
                <div class="group-header">
                    <span class="group-toggle" onclick="toggleGroup('${groupId}')" id="toggle-${groupId}">▼</span>
                    ${this.escapeHtml(groupName)} (${notes.length})
                </div>
                `);
            }

            for (const note of notes) {
                const categoryConfig = CATEGORY_CONFIG[note.category];
                const isOrphaned = note.status === 'orphaned';
                const isSelected = this.selectedNotes.has(note.id);
                const createdDate = new Date(note.createdAt).toLocaleDateString();

                rows.push(`
                <div class="note-row" data-group="${groupId}" onclick="navigateToNote('${note.id}')">
                    <div class="note-checkbox-col" onclick="event.stopPropagation()">
                        <input type="checkbox" class="note-checkbox" 
                               ${isSelected ? 'checked' : ''} 
                               onchange="toggleSelection('${note.id}', this.checked)">
                    </div>
                    <div class="note-status-col">
                        <span class="status-icon ${isOrphaned ? 'status-orphaned' : ''}" title="${isOrphaned ? 'Orphaned' : 'Active'}">
                            ${isOrphaned ? '⚠️' : '✓'}
                        </span>
                    </div>
                    <div class="note-content-col">
                        <div class="note-first-row">
                            <span class="category-badge category-${note.category}">
                                ${this.getCategoryIcon(note.category)} ${categoryConfig.label}
                            </span>
                            <span class="note-file" title="${this.escapeHtml(note.filePath)}">
                                ${this.escapeHtml(note.filePath)}
                            </span>
                        </div>
                        <div class="note-second-row">
                            <span class="note-line">Line ${note.lineNumber + 1}</span>
                            <span>•</span>
                            <span class="note-date">${createdDate}</span>
                        </div>
                    </div>
                    <div class="note-actions-col">
                        <button class="action-btn danger" onclick="deleteNote('${note.id}', event)" title="Delete">${Icons.trash2.replace('width="18"', 'width="14"').replace('height="18"', 'height="14"')}</button>
                    </div>
                </div>
                `);
            }
        }

        rows.push('</div>');
        return rows.join('');
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
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}
