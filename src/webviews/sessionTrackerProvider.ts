/**
 * Session Tracker WebView Provider for the sidebar
 */

import * as vscode from 'vscode';
import { SessionService } from '../session';
import { escapeHtml } from '../utils';

export class SessionTrackerProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'developer-tools.sessionTracker';

    private view?: vscode.WebviewView;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly sessionService: SessionService
    ) {
        this.disposables.push(
            sessionService.onDidChangeSession(() => {
                this.updateWebview();
            })
        );
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.view = webviewView;

        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this.getHtml();

        // Re-send current state when the view becomes visible again
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.updateWebview();
            }
        });

        webviewView.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'start':
                        this.sessionService.startSession();
                        break;
                    case 'stop':
                        await this.sessionService.stopSession();
                        this.updateWebview();
                        break;
                    case 'reset':
                        this.sessionService.resetSession();
                        break;
                    case 'copy-summary': {
                        const md = this.sessionService.exportAsMarkdown();
                        await vscode.env.clipboard.writeText(md);
                        vscode.window.showInformationMessage('Session summary copied to clipboard.');
                        break;
                    }
                    case 'export-json': {
                        const json = this.sessionService.exportAsJson();
                        await vscode.env.clipboard.writeText(json);
                        vscode.window.showInformationMessage('Session JSON copied to clipboard.');
                        break;
                    }
                    case 'load-history':
                        await this.sendHistory();
                        break;
                    case 'view-session': {
                        const session = await this.sessionService.loadHistorySession(message.id);
                        if (session) {
                            this.view?.webview.postMessage({
                                command: 'show-history-session',
                                session: this.sanitizeSession(session),
                            });
                        }
                        break;
                    }
                    case 'delete-session':
                        await this.sessionService.deleteHistorySession(message.id);
                        await this.sendHistory();
                        break;
                    case 'delete-all-sessions':
                        await this.sessionService.deleteAllHistory();
                        await this.sendHistory();
                        break;
                    case 'export-history-session': {
                        const exported = await this.sessionService.exportSession(message.id, message.format);
                        if (exported) {
                            await vscode.env.clipboard.writeText(exported);
                            vscode.window.showInformationMessage(`Session ${message.format} copied to clipboard.`);
                        }
                        break;
                    }
                }
            },
            undefined,
            this.context.subscriptions
        );

        this.updateWebview();
    }

    private updateWebview(): void {
        if (!this.view) { return; }
        const session = this.sessionService.getSummary();
        this.view.webview.postMessage({
            command: 'session-updated',
            session: session ? this.sanitizeSession(session) : null,
            isActive: this.sessionService.isActive(),
        });
    }

    private async sendHistory(): Promise<void> {
        if (!this.view) { return; }
        const history = await this.sessionService.getSessionHistory();
        this.view.webview.postMessage({ command: 'history-updated', history });
    }

    private sanitizeSession(session: { id: string; startedAt: number; endedAt: number | null; status: string; files: Array<{ filePath: string; totalEdits: number; linesAdded: number; linesRemoved: number; estimatedTimeMs: number }>; totalEstimatedTimeMs: number }) {
        return {
            id: session.id,
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            status: session.status,
            totalEstimatedTimeMs: session.totalEstimatedTimeMs,
            files: session.files.map(f => ({
                filePath: escapeHtml(f.filePath),
                totalEdits: f.totalEdits,
                linesAdded: f.linesAdded,
                linesRemoved: f.linesRemoved,
                estimatedTimeMs: f.estimatedTimeMs,
            })),
        };
    }

    private getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Session Tracker</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            padding: 12px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            font-size: 12px;
        }
        .status-bar {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 10px;
            margin-bottom: 12px;
            text-align: center;
        }
        .status-text {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 8px;
        }
        .status-text.active { color: var(--vscode-foreground); }
        .status-text.inactive { color: var(--vscode-descriptionForeground); }
        .btn-group {
            display: flex;
            gap: 6px;
            justify-content: center;
        }
        .btn {
            padding: 4px 10px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
        }
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .btn-danger {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
        }
        .section {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 10px;
            margin-bottom: 12px;
        }
        .section-title {
            font-weight: bold;
            margin-bottom: 8px;
            font-size: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
        }
        .file-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
        }
        .file-table th {
            text-align: left;
            padding: 4px;
            border-bottom: 1px solid var(--vscode-input-border);
            color: var(--vscode-descriptionForeground);
        }
        .file-table td {
            padding: 4px;
            border-bottom: 1px solid var(--vscode-input-border);
        }
        .file-table td:first-child {
            max-width: 120px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .actions {
            display: flex;
            gap: 6px;
            margin-top: 8px;
            justify-content: center;
        }
        .empty-state {
            text-align: center;
            padding: 16px;
            color: var(--vscode-descriptionForeground);
        }
        .history-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 0;
            border-bottom: 1px solid var(--vscode-input-border);
        }
        .history-item:last-child { border-bottom: none; }
        .history-meta { font-size: 11px; color: var(--vscode-descriptionForeground); }
        .history-actions { display: flex; gap: 4px; }
        .history-actions button {
            background: transparent;
            border: none;
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
            font-size: 10px;
            padding: 2px 4px;
        }
        .history-actions button:hover { text-decoration: underline; }
        .history-actions button.delete-btn { color: var(--vscode-textLink-foreground); }
        .badge {
            display: inline-block;
            padding: 1px 6px;
            border-radius: 8px;
            font-size: 10px;
            font-weight: bold;
        }
        .badge-completed {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        .badge-recovered {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        .back-btn {
            cursor: pointer;
            color: var(--vscode-textLink-foreground);
            font-size: 11px;
            margin-bottom: 8px;
            display: none;
        }
        .back-btn:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="status-bar">
        <div class="status-text inactive" id="statusText">Session Inactive</div>
        <div class="btn-group">
            <button class="btn btn-primary" id="startBtn">Start</button>
            <button class="btn btn-secondary" id="stopBtn" style="display:none">Stop</button>
            <button class="btn btn-secondary" id="resetBtn" style="display:none">Reset</button>
        </div>
    </div>

    <div class="back-btn" id="backBtn" onclick="backToCurrent()">← Back to Current Session</div>

    <div class="section" id="filesSection" style="display:none">
        <div class="section-title">Files Touched</div>
        <table class="file-table">
            <thead>
                <tr><th>File</th><th>Edits</th><th>+</th><th>-</th><th>Time</th></tr>
            </thead>
            <tbody id="filesBody"></tbody>
        </table>
        <div class="actions">
            <button class="btn btn-secondary" id="copySummaryBtn">Copy Summary</button>
            <button class="btn btn-secondary" id="exportJsonBtn">Export JSON</button>
        </div>
    </div>

    <div class="section">
        <div class="section-title" id="historyToggle">
            Session History <span id="historyArrow">▶</span>
        </div>
        <div id="historyContent" style="display:none">
            <div id="historyList"><div class="empty-state">Click to load history</div></div>
            <div class="actions" style="margin-top:8px">
                <button class="btn btn-danger" id="clearHistoryBtn" style="display:none">Clear All History</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let isActive = false;
        let historyLoaded = false;
        let viewingHistory = false;

        document.getElementById('startBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'start' });
        });
        document.getElementById('stopBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'stop' });
        });
        document.getElementById('resetBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'reset' });
        });
        document.getElementById('copySummaryBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'copy-summary' });
        });
        document.getElementById('exportJsonBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'export-json' });
        });
        document.getElementById('historyToggle').addEventListener('click', () => {
            const content = document.getElementById('historyContent');
            const arrow = document.getElementById('historyArrow');
            if (content.style.display === 'none') {
                content.style.display = 'block';
                arrow.textContent = '▼';
                if (!historyLoaded) {
                    vscode.postMessage({ command: 'load-history' });
                    historyLoaded = true;
                }
            } else {
                content.style.display = 'none';
                arrow.textContent = '▶';
            }
        });
        document.getElementById('clearHistoryBtn').addEventListener('click', () => {
            if (confirm('Delete all session history?')) {
                vscode.postMessage({ command: 'delete-all-sessions' });
            }
        });

        function formatDuration(ms) {
            const s = Math.floor(ms / 1000);
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            const sec = s % 60;
            if (h > 0) return h + 'h ' + m + 'm';
            if (m > 0) return m + 'm ' + sec + 's';
            return sec + 's';
        }

        function formatDate(ts) {
            return new Date(ts).toLocaleString();
        }

        function updateUI(session, active) {
            if (viewingHistory) return;
            isActive = active;
            const statusText = document.getElementById('statusText');
            const startBtn = document.getElementById('startBtn');
            const stopBtn = document.getElementById('stopBtn');
            const resetBtn = document.getElementById('resetBtn');
            const filesSection = document.getElementById('filesSection');

            if (active && session) {
                const elapsed = Date.now() - session.startedAt;
                statusText.textContent = 'Session Active: ' + formatDuration(elapsed);
                statusText.className = 'status-text active';
                startBtn.style.display = 'none';
                stopBtn.style.display = '';
                resetBtn.style.display = '';
                filesSection.style.display = '';
                renderFiles(session.files);
            } else {
                statusText.textContent = 'Session Inactive';
                statusText.className = 'status-text inactive';
                startBtn.style.display = '';
                stopBtn.style.display = 'none';
                resetBtn.style.display = 'none';
                filesSection.style.display = session && session.files && session.files.length > 0 ? '' : 'none';
                if (session) renderFiles(session.files);
            }
        }

        function renderFiles(files) {
            const tbody = document.getElementById('filesBody');
            if (!files || files.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--vscode-descriptionForeground)">No files edited yet</td></tr>';
                return;
            }
            tbody.innerHTML = files.map(f =>
                '<tr>' +
                '<td title="' + f.filePath + '">' + f.filePath.split('/').pop() + '</td>' +
                '<td>' + f.totalEdits + '</td>' +
                '<td>+' + f.linesAdded + '</td>' +
                '<td>-' + f.linesRemoved + '</td>' +
                '<td>' + formatDuration(f.estimatedTimeMs) + '</td>' +
                '</tr>'
            ).join('');
        }

        function renderHistory(history) {
            const container = document.getElementById('historyList');
            const clearBtn = document.getElementById('clearHistoryBtn');
            if (!history || history.length === 0) {
                container.innerHTML = '<div class="empty-state">No previous sessions</div>';
                clearBtn.style.display = 'none';
                return;
            }
            clearBtn.style.display = '';
            container.innerHTML = history.map(h =>
                '<div class="history-item">' +
                '<div>' +
                    '<div>' + formatDate(h.startedAt) + '</div>' +
                    '<div class="history-meta">' + formatDuration(h.totalEstimatedTimeMs) + ' · ' + h.totalFiles + ' files ' +
                    '<span class="badge badge-' + h.status + '">' + h.status + '</span></div>' +
                '</div>' +
                '<div class="history-actions">' +
                    '<button onclick="viewSession(\\''+h.id+'\\')">View</button>' +
                    '<button onclick="exportSession(\\''+h.id+'\\', \\'markdown\\')">MD</button>' +
                    '<button onclick="exportSession(\\''+h.id+'\\', \\'json\\')">JSON</button>' +
                    '<button class="delete-btn" onclick="deleteSession(\\''+h.id+'\\')">Del</button>' +
                '</div>' +
                '</div>'
            ).join('');
        }

        function viewSession(id) {
            vscode.postMessage({ command: 'view-session', id });
        }
        function exportSession(id, format) {
            vscode.postMessage({ command: 'export-history-session', id, format });
        }
        function deleteSession(id) {
            vscode.postMessage({ command: 'delete-session', id });
        }
        function backToCurrent() {
            viewingHistory = false;
            document.getElementById('backBtn').style.display = 'none';
            document.getElementById('startBtn').style.display = '';
            const session = vscode.getState();
            if (session) updateUI(session.session, session.isActive);
        }

        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.command === 'session-updated') {
                vscode.setState({ session: msg.session, isActive: msg.isActive });
                updateUI(msg.session, msg.isActive);
            } else if (msg.command === 'history-updated') {
                renderHistory(msg.history);
            } else if (msg.command === 'show-history-session') {
                viewingHistory = true;
                document.getElementById('backBtn').style.display = 'block';
                document.getElementById('startBtn').style.display = 'none';
                document.getElementById('filesSection').style.display = '';
                renderFiles(msg.session.files);
                const statusText = document.getElementById('statusText');
                statusText.textContent = 'Viewing: ' + formatDate(msg.session.startedAt);
                statusText.className = 'status-text inactive';
            }
        });

        // Restore state on webview re-creation (e.g., after switching panels)
        const previousState = vscode.getState();
        if (previousState && previousState.session) {
            updateUI(previousState.session, previousState.isActive);
        }

        // Timer to update elapsed time
        setInterval(() => {
            if (isActive && !viewingHistory) {
                const state = vscode.getState();
                if (state && state.session) {
                    const elapsed = Date.now() - state.session.startedAt;
                    document.getElementById('statusText').textContent = 'Session Active: ' + formatDuration(elapsed);
                }
            }
        }, 1000);
    </script>
</body>
</html>`;
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
