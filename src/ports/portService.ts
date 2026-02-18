/**
 * Port Service - Orchestrates scanning, filtering, and kill operations
 */

import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { PortInfo } from './types';
import { PortScanner } from './portScanner';

export class PortService implements vscode.Disposable {
    private scanner: PortScanner;
    private cachedPorts: PortInfo[] = [];
    private autoRefreshTimer: NodeJS.Timeout | undefined;

    private readonly _onDidChangePorts = new vscode.EventEmitter<PortInfo[]>();
    public readonly onDidChangePorts = this._onDidChangePorts.event;

    constructor() {
        this.scanner = new PortScanner();
    }

    /**
     * Scan for currently listening ports
     */
    async scan(): Promise<PortInfo[]> {
        this.cachedPorts = await this.scanner.scan();
        this._onDidChangePorts.fire(this.cachedPorts);
        return this.cachedPorts;
    }

    /**
     * Kill a process by PID
     */
    async killProcess(pid: number): Promise<boolean> {
        return new Promise((resolve) => {
            if (process.platform === 'win32') {
                execFile('taskkill', ['/PID', pid.toString(), '/F'], (error) => {
                    resolve(!error);
                });
            } else {
                execFile('kill', ['-TERM', pid.toString()], (error) => {
                    resolve(!error);
                });
            }
        });
    }

    /**
     * Get filtered ports from cache
     */
    getFilteredPorts(filter?: string): PortInfo[] {
        if (!filter) { return this.cachedPorts; }

        const lowerFilter = filter.toLowerCase();
        return this.cachedPorts.filter(p =>
            p.port.toString().includes(lowerFilter) ||
            p.processName.toLowerCase().includes(lowerFilter) ||
            p.command.toLowerCase().includes(lowerFilter)
        );
    }

    /**
     * Start auto-refresh at configured interval
     */
    startAutoRefresh(): void {
        this.stopAutoRefresh();
        const seconds = vscode.workspace.getConfiguration('developer-tools')
            .get<number>('ports.autoRefreshSeconds', 10);

        if (seconds <= 0) { return; }

        this.autoRefreshTimer = setInterval(() => {
            this.scan();
        }, seconds * 1000);
    }

    /**
     * Stop auto-refresh
     */
    stopAutoRefresh(): void {
        if (this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
            this.autoRefreshTimer = undefined;
        }
    }

    /**
     * Get cached ports
     */
    getPorts(): PortInfo[] {
        return this.cachedPorts;
    }

    dispose(): void {
        this.stopAutoRefresh();
        this._onDidChangePorts.dispose();
    }
}
