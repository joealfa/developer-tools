/**
 * Session Tracker - Listens to VS Code events and feeds SessionEvents into SessionService
 */

import * as vscode from 'vscode';
import { SessionService } from './sessionService';
import { SessionEvent } from './types';

export class SessionTracker implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private debounceTimer: NodeJS.Timeout | undefined;
    private pendingEvent: SessionEvent | null = null;

    constructor(private readonly sessionService: SessionService) {
        // Track document changes (lines added/removed)
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((e) => {
                if (!this.sessionService.isActive()) { return; }
                if (e.document.uri.scheme !== 'file') { return; }

                const filePath = vscode.workspace.asRelativePath(e.document.uri, false);
                let linesAdded = 0;
                let linesRemoved = 0;

                for (const change of e.contentChanges) {
                    const addedLines = change.text.split('\n').length - 1;
                    const removedLines = change.range.end.line - change.range.start.line;
                    linesAdded += addedLines;
                    linesRemoved += removedLines;
                }

                this.debouncedRecord({
                    filePath,
                    timestamp: Date.now(),
                    linesAdded,
                    linesRemoved,
                });
            })
        );

        // Track active editor changes for time estimation
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (!this.sessionService.isActive()) { return; }
                if (!editor || editor.document.uri.scheme !== 'file') { return; }

                // Flush any pending event when switching files
                this.flushPending();
            })
        );
    }

    private debouncedRecord(event: SessionEvent): void {
        if (this.pendingEvent && this.pendingEvent.filePath === event.filePath) {
            // Merge into pending event
            this.pendingEvent.linesAdded += event.linesAdded;
            this.pendingEvent.linesRemoved += event.linesRemoved;
            this.pendingEvent.timestamp = event.timestamp;
        } else {
            // Flush existing and start new
            this.flushPending();
            this.pendingEvent = { ...event };
        }

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.flushPending();
        }, 1000);
    }

    private flushPending(): void {
        if (this.pendingEvent) {
            this.sessionService.recordEvent(this.pendingEvent);
            this.pendingEvent = null;
        }
    }

    dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.flushPending();
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
