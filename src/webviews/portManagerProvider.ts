/**
 * Port Manager WebView Provider for the sidebar
 */

import * as vscode from 'vscode';
import { PortService, PortInfo } from '../ports';
import { escapeHtml } from '../utils';

export class PortManagerProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'developer-tools.portManager';

    private view?: vscode.WebviewView;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly portService: PortService
    ) {
        this.disposables.push(
            portService.onDidChangePorts((ports) => {
                this.view?.webview.postMessage({ command: 'ports-updated', ports: this.sanitizePorts(ports) });
            })
        );
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
        };

        webviewView.webview.html = this.getHtml();

        webviewView.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'refresh':
                        await this.portService.scan();
                        break;
                    case 'kill': {
                        const success = await this.portService.killProcess(message.pid);
                        if (success) {
                            vscode.window.showInformationMessage(`Process ${message.pid} terminated.`);
                            await this.portService.scan();
                        } else {
                            vscode.window.showErrorMessage(`Failed to kill process ${message.pid}. You may need elevated permissions.`);
                        }
                        break;
                    }
                    case 'toggle-auto-refresh':
                        if (message.enabled) {
                            this.portService.startAutoRefresh();
                        } else {
                            this.portService.stopAutoRefresh();
                        }
                        break;
                    case 'filter':
                        const filtered = this.portService.getFilteredPorts(message.text);
                        webviewView.webview.postMessage({
                            command: 'ports-updated',
                            ports: this.sanitizePorts(filtered),
                        });
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        // Initial scan
        this.portService.scan();
        this.portService.startAutoRefresh();
    }

    private sanitizePorts(ports: PortInfo[]): Array<{ port: number; pid: number; processName: string; command: string; protocol: string; state: string }> {
        return ports.map(p => ({
            port: p.port,
            pid: p.pid,
            processName: escapeHtml(p.processName),
            command: escapeHtml(p.command.substring(0, 80)),
            protocol: p.protocol,
            state: p.state,
        }));
    }

    private getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Port Manager</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            padding: 12px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            font-size: 12px;
        }
        .toolbar {
            display: flex;
            gap: 6px;
            margin-bottom: 12px;
            align-items: center;
        }
        .search-input {
            flex: 1;
            padding: 4px 8px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-size: 11px;
        }
        .toolbar-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            white-space: nowrap;
        }
        .toolbar-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .toolbar-btn.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .port-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .port-item {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 8px;
        }
        .port-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }
        .port-number {
            font-weight: bold;
            font-size: 13px;
            color: var(--vscode-foreground);
        }
        .port-meta {
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
        }
        .port-command {
            font-family: monospace;
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            margin-top: 4px;
        }
        .kill-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 2px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
        }
        .kill-btn:hover {
            opacity: 0.9;
        }
        .confirm-kill {
            display: none;
            gap: 4px;
            align-items: center;
            font-size: 11px;
        }
        .confirm-kill.visible {
            display: flex;
        }
        .confirm-yes {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 2px 6px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 10px;
        }
        .confirm-no {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 2px 6px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 10px;
        }
        .empty-state {
            text-align: center;
            padding: 24px 12px;
            color: var(--vscode-descriptionForeground);
        }
        .empty-state p {
            margin-bottom: 12px;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <input type="text" class="search-input" id="filterInput" placeholder="Filter by port or process...">
        <button class="toolbar-btn" id="refreshBtn" title="Refresh">Refresh</button>
        <button class="toolbar-btn" id="autoRefreshBtn" title="Toggle auto-refresh">Auto</button>
    </div>
    <div id="portList" class="port-list">
        <div class="empty-state">
            <p>Scanning ports...</p>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let autoRefreshEnabled = true;
        let ports = [];

        document.getElementById('refreshBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'refresh' });
        });

        document.getElementById('autoRefreshBtn').addEventListener('click', () => {
            autoRefreshEnabled = !autoRefreshEnabled;
            const btn = document.getElementById('autoRefreshBtn');
            btn.classList.toggle('active', autoRefreshEnabled);
            vscode.postMessage({ command: 'toggle-auto-refresh', enabled: autoRefreshEnabled });
        });
        document.getElementById('autoRefreshBtn').classList.add('active');

        document.getElementById('filterInput').addEventListener('input', (e) => {
            vscode.postMessage({ command: 'filter', text: e.target.value });
        });

        function renderPorts(data) {
            const container = document.getElementById('portList');
            if (!data || data.length === 0) {
                container.innerHTML = '<div class="empty-state"><p>No listening ports found</p><button class="toolbar-btn" onclick="vscode.postMessage({command:\\'refresh\\'})">Refresh</button></div>';
                return;
            }

            container.innerHTML = data.map(p =>
                '<div class="port-item">' +
                    '<div class="port-header">' +
                        '<span class="port-number">:' + p.port + '</span>' +
                        '<span class="port-meta">PID ' + p.pid + ' · ' + p.processName + '</span>' +
                    '</div>' +
                    '<div class="port-command" title="' + p.command + '">' + p.command + '</div>' +
                    '<div style="margin-top:6px;display:flex;justify-content:flex-end;align-items:center;gap:6px;">' +
                        '<button class="kill-btn" data-pid="' + p.pid + '" data-port="' + p.port + '">Kill</button>' +
                        '<div class="confirm-kill" id="confirm-' + p.pid + '-' + p.port + '">' +
                            '<span>Kill PID ' + p.pid + '?</span>' +
                            '<button class="confirm-yes" data-pid="' + p.pid + '">Yes</button>' +
                            '<button class="confirm-no" data-pid="' + p.pid + '" data-port="' + p.port + '">No</button>' +
                        '</div>' +
                    '</div>' +
                '</div>'
            ).join('');

            // Kill button handlers
            container.querySelectorAll('.kill-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const pid = e.target.dataset.pid;
                    const port = e.target.dataset.port;
                    e.target.style.display = 'none';
                    document.getElementById('confirm-' + pid + '-' + port).classList.add('visible');
                });
            });

            container.querySelectorAll('.confirm-yes').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    vscode.postMessage({ command: 'kill', pid: parseInt(e.target.dataset.pid) });
                });
            });

            container.querySelectorAll('.confirm-no').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const pid = e.target.dataset.pid;
                    const port = e.target.dataset.port;
                    document.getElementById('confirm-' + pid + '-' + port).classList.remove('visible');
                    const killBtn = document.querySelector('.kill-btn[data-pid="' + pid + '"][data-port="' + port + '"]');
                    if (killBtn) killBtn.style.display = '';
                });
            });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'ports-updated') {
                ports = message.ports;
                renderPorts(ports);
            }
        });
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
