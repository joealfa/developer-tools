/**
 * Dev Session Tracker type definitions
 */

export interface SessionEvent {
    filePath: string;
    timestamp: number;
    linesAdded: number;
    linesRemoved: number;
}

export interface FileSessionSummary {
    filePath: string;
    totalEdits: number;
    linesAdded: number;
    linesRemoved: number;
    firstTouched: number;
    lastTouched: number;
    estimatedTimeMs: number;
}

export type SessionStatus = 'active' | 'completed' | 'recovered';

export interface SessionSnapshot {
    id: string;
    startedAt: number;
    endedAt: number | null;
    status: SessionStatus;
    files: FileSessionSummary[];
    totalEstimatedTimeMs: number;
    events: SessionEvent[];
}

export interface SessionHistoryEntry {
    id: string;
    fileName: string;
    startedAt: number;
    endedAt: number;
    status: 'completed' | 'recovered';
    totalFiles: number;
    totalEstimatedTimeMs: number;
}

export const SESSION_FILES = {
    SESSIONS_DIR: '.vscode/sessions',
    CURRENT_FILE: '.vscode/sessions/current.json',
    HISTORY_DIR: '.vscode/sessions/history',
} as const;
