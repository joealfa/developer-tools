/**
 * Port Scanner - Platform-specific port scanning using shell commands
 * Uses execFile (not exec) to avoid shell injection
 */

import { execFile } from 'child_process';
import { PortInfo } from './types';

export class PortScanner {
    /**
     * Scan for listening TCP ports on the current platform
     */
    async scan(): Promise<PortInfo[]> {
        switch (process.platform) {
            case 'linux':
                return this.scanLinux();
            case 'darwin':
                return this.scanMacOS();
            case 'win32':
                return this.scanWindows();
            default:
                console.warn(`[PortScanner] Unsupported platform: ${process.platform}`);
                return [];
        }
    }

    private scanLinux(): Promise<PortInfo[]> {
        return new Promise((resolve) => {
            execFile('ss', ['-tlnp'], (error, stdout) => {
                if (error) {
                    console.error('[PortScanner] ss command failed:', error.message);
                    resolve([]);
                    return;
                }
                resolve(this.parseSSOutput(stdout));
            });
        });
    }

    private parseSSOutput(output: string): PortInfo[] {
        const lines = output.trim().split('\n');
        const results: PortInfo[] = [];

        // Skip header line
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) { continue; }

            // ss -tlnp output format:
            // State  Recv-Q  Send-Q  Local Address:Port  Peer Address:Port  Process
            const parts = line.trim().split(/\s+/);
            if (parts.length < 5) { continue; }

            const state = parts[0];
            const localAddr = parts[3];
            const processInfo = parts.slice(5).join(' ');

            // Parse port from local address
            const portMatch = localAddr.match(/:(\d+)$/);
            if (!portMatch) { continue; }
            const port = parseInt(portMatch[1], 10);

            // Parse PID and process name from process info
            // Format: users:(("node",pid=1234,fd=3))
            const pidMatch = processInfo.match(/pid=(\d+)/);
            const nameMatch = processInfo.match(/\("([^"]+)"/);

            const pid = pidMatch ? parseInt(pidMatch[1], 10) : 0;
            const processName = nameMatch ? nameMatch[1] : 'unknown';
            const protocol: 'tcp' | 'tcp6' = localAddr.includes('[') || localAddr.startsWith('*:') ? 'tcp6' : 'tcp';

            results.push({
                port,
                pid,
                processName,
                command: processInfo.substring(0, 80),
                protocol,
                state,
            });
        }

        return results;
    }

    private scanMacOS(): Promise<PortInfo[]> {
        return new Promise((resolve) => {
            execFile('lsof', ['-iTCP', '-sTCP:LISTEN', '-n', '-P'], (error, stdout) => {
                if (error) {
                    console.error('[PortScanner] lsof command failed:', error.message);
                    resolve([]);
                    return;
                }
                resolve(this.parseLsofOutput(stdout));
            });
        });
    }

    private parseLsofOutput(output: string): PortInfo[] {
        const lines = output.trim().split('\n');
        const results: PortInfo[] = [];

        // Skip header line
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) { continue; }

            // lsof output format:
            // COMMAND  PID  USER  FD  TYPE  DEVICE  SIZE/OFF  NODE  NAME
            const parts = line.trim().split(/\s+/);
            if (parts.length < 9) { continue; }

            const processName = parts[0];
            const pid = parseInt(parts[1], 10);
            const name = parts[parts.length - 1];

            // Parse port from NAME (e.g., *:3000 or 127.0.0.1:8080)
            const portMatch = name.match(/:(\d+)$/);
            if (!portMatch) { continue; }
            const port = parseInt(portMatch[1], 10);

            const protocol: 'tcp' | 'tcp6' = parts[4] === 'IPv6' ? 'tcp6' : 'tcp';

            results.push({
                port,
                pid,
                processName,
                command: `${processName} (PID ${pid})`.substring(0, 80),
                protocol,
                state: 'LISTEN',
            });
        }

        return results;
    }

    private async scanWindows(): Promise<PortInfo[]> {
        const ports = await this.getWindowsNetstat();
        if (ports.length === 0) { return []; }

        const pidNames = await this.getWindowsProcessNames(ports.map(p => p.pid));
        return ports.map(p => ({
            ...p,
            processName: pidNames.get(p.pid) ?? 'unknown',
        }));
    }

    private getWindowsNetstat(): Promise<PortInfo[]> {
        return new Promise((resolve) => {
            execFile('netstat', ['-ano'], (error, stdout) => {
                if (error) {
                    console.error('[PortScanner] netstat command failed:', error.message);
                    resolve([]);
                    return;
                }

                const lines = stdout.trim().split('\n');
                const results: PortInfo[] = [];

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('TCP')) { continue; }

                    const parts = trimmed.split(/\s+/);
                    if (parts.length < 5) { continue; }

                    const state = parts[3];
                    if (state !== 'LISTENING') { continue; }

                    const localAddr = parts[1];
                    const portMatch = localAddr.match(/:(\d+)$/);
                    if (!portMatch) { continue; }

                    const port = parseInt(portMatch[1], 10);
                    const pid = parseInt(parts[4], 10);

                    results.push({
                        port,
                        pid,
                        processName: 'unknown',
                        command: '',
                        protocol: localAddr.startsWith('[') ? 'tcp6' : 'tcp',
                        state: 'LISTEN',
                    });
                }

                resolve(results);
            });
        });
    }

    private getWindowsProcessNames(pids: number[]): Promise<Map<number, string>> {
        return new Promise((resolve) => {
            const uniquePids = [...new Set(pids)];
            execFile('tasklist', ['/FO', 'CSV', '/NH'], (error, stdout) => {
                const pidMap = new Map<number, string>();

                if (error) {
                    resolve(pidMap);
                    return;
                }

                const lines = stdout.trim().split('\n');
                for (const line of lines) {
                    // CSV format: "process.exe","1234","Console","1","12,345 K"
                    const match = line.match(/"([^"]+)","(\d+)"/);
                    if (match) {
                        const pid = parseInt(match[2], 10);
                        if (uniquePids.includes(pid)) {
                            pidMap.set(pid, match[1]);
                        }
                    }
                }

                resolve(pidMap);
            });
        });
    }
}
