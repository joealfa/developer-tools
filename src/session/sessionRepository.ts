/**
 * Session Repository - File I/O for .vscode/sessions/
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SessionSnapshot, SessionHistoryEntry, SESSION_FILES } from './types';

export class SessionRepository {
    private workspaceRoot: string | undefined;

    constructor() {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }

    async ensureDirectories(): Promise<void> {
        if (!this.workspaceRoot) { return; }

        const dirs = [
            path.join(this.workspaceRoot, SESSION_FILES.SESSIONS_DIR),
            path.join(this.workspaceRoot, SESSION_FILES.HISTORY_DIR),
        ];

        for (const dir of dirs) {
            try {
                await vscode.workspace.fs.stat(vscode.Uri.file(dir));
            } catch {
                await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
            }
        }
    }

    /**
     * Save the current session (debounced externally)
     */
    async saveCurrent(session: SessionSnapshot): Promise<void> {
        if (!this.workspaceRoot) { return; }
        const filePath = path.join(this.workspaceRoot, SESSION_FILES.CURRENT_FILE);
        const content = JSON.stringify(session, null, 2);
        await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(content, 'utf-8'));
    }

    /**
     * Save current session synchronously (for deactivation)
     */
    saveCurrentSync(session: SessionSnapshot): void {
        if (!this.workspaceRoot) { return; }
        const filePath = path.join(this.workspaceRoot, SESSION_FILES.CURRENT_FILE);
        const content = JSON.stringify(session, null, 2);
        fs.writeFileSync(filePath, content, 'utf-8');
    }

    /**
     * Load the current session if it exists
     */
    async loadCurrent(): Promise<SessionSnapshot | null> {
        if (!this.workspaceRoot) { return null; }
        const filePath = path.join(this.workspaceRoot, SESSION_FILES.CURRENT_FILE);

        try {
            const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
            return JSON.parse(content.toString()) as SessionSnapshot;
        } catch {
            return null;
        }
    }

    /**
     * Delete the current session file
     */
    async deleteCurrent(): Promise<void> {
        if (!this.workspaceRoot) { return; }
        const filePath = path.join(this.workspaceRoot, SESSION_FILES.CURRENT_FILE);
        try {
            await vscode.workspace.fs.delete(vscode.Uri.file(filePath));
        } catch {
            // File may not exist
        }
    }

    /**
     * Move current session to history
     */
    async moveToHistory(session: SessionSnapshot): Promise<string> {
        if (!this.workspaceRoot) { return ''; }

        const date = new Date(session.startedAt);
        const fileName = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}.json`;
        const filePath = path.join(this.workspaceRoot, SESSION_FILES.HISTORY_DIR, fileName);

        const content = JSON.stringify(session, null, 2);
        await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(content, 'utf-8'));
        await this.deleteCurrent();

        return fileName;
    }

    /**
     * List all session history entries
     */
    async getHistory(): Promise<SessionHistoryEntry[]> {
        if (!this.workspaceRoot) { return []; }
        const historyDir = path.join(this.workspaceRoot, SESSION_FILES.HISTORY_DIR);

        try {
            const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(historyDir));
            const results: SessionHistoryEntry[] = [];

            for (const [name, type] of entries) {
                if (type !== vscode.FileType.File || !name.endsWith('.json')) { continue; }

                try {
                    const filePath = path.join(historyDir, name);
                    const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
                    const session: SessionSnapshot = JSON.parse(content.toString());

                    results.push({
                        id: session.id,
                        fileName: name,
                        startedAt: session.startedAt,
                        endedAt: session.endedAt ?? session.startedAt,
                        status: session.status === 'active' ? 'recovered' : session.status as 'completed' | 'recovered',
                        totalFiles: session.files.length,
                        totalEstimatedTimeMs: session.totalEstimatedTimeMs,
                    });
                } catch {
                    // Skip corrupted files
                }
            }

            return results.sort((a, b) => b.startedAt - a.startedAt);
        } catch {
            return [];
        }
    }

    /**
     * Load a specific session from history
     */
    async loadSession(id: string): Promise<SessionSnapshot | null> {
        if (!this.workspaceRoot) { return null; }
        const historyDir = path.join(this.workspaceRoot, SESSION_FILES.HISTORY_DIR);

        try {
            const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(historyDir));
            for (const [name, type] of entries) {
                if (type !== vscode.FileType.File || !name.endsWith('.json')) { continue; }
                const filePath = path.join(historyDir, name);
                const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
                const session: SessionSnapshot = JSON.parse(content.toString());
                if (session.id === id) { return session; }
            }
        } catch {
            // Ignore
        }
        return null;
    }

    /**
     * Delete a session from history
     */
    async deleteSession(id: string): Promise<boolean> {
        if (!this.workspaceRoot) { return false; }
        const historyDir = path.join(this.workspaceRoot, SESSION_FILES.HISTORY_DIR);

        try {
            const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(historyDir));
            for (const [name, type] of entries) {
                if (type !== vscode.FileType.File || !name.endsWith('.json')) { continue; }
                const filePath = path.join(historyDir, name);
                const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
                const session: SessionSnapshot = JSON.parse(content.toString());
                if (session.id === id) {
                    await vscode.workspace.fs.delete(vscode.Uri.file(filePath));
                    return true;
                }
            }
        } catch {
            // Ignore
        }
        return false;
    }

    /**
     * Delete all sessions from history
     */
    async deleteAllSessions(): Promise<void> {
        if (!this.workspaceRoot) { return; }
        const historyDir = path.join(this.workspaceRoot, SESSION_FILES.HISTORY_DIR);

        try {
            const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(historyDir));
            for (const [name, type] of entries) {
                if (type !== vscode.FileType.File) { continue; }
                await vscode.workspace.fs.delete(vscode.Uri.file(path.join(historyDir, name)));
            }
        } catch {
            // Ignore
        }
    }
}
