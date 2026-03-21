/**
 * Session Service - Singleton service for managing coding sessions
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { SessionEvent, SessionSnapshot, FileSessionSummary, SessionHistoryEntry } from './types';
import { SessionRepository } from './sessionRepository';

export class SessionService implements vscode.Disposable {
	private static instance: SessionService | null = null;
	private repository: SessionRepository;
	private currentSession: SessionSnapshot | null = null;
	private persistDebounceTimer: NodeJS.Timeout | undefined;
	private idleTimeoutMinutes: number;
	/** Running per-file summaries — updated incrementally on each recordEvent. */
	private fileSummaryMap = new Map<string, FileSessionSummary>();

	private readonly _onDidChangeSession = new vscode.EventEmitter<SessionSnapshot | null>();
	public readonly onDidChangeSession = this._onDidChangeSession.event;

	private constructor(private readonly context: vscode.ExtensionContext) {
		this.repository = new SessionRepository();
		this.idleTimeoutMinutes = vscode.workspace
			.getConfiguration('developer-tools')
			.get<number>('session.idleTimeoutMinutes', 5);
	}

	static getInstance(context?: vscode.ExtensionContext): SessionService {
		if (!SessionService.instance) {
			if (!context) {
				throw new Error('SessionService must be initialized with context first');
			}
			SessionService.instance = new SessionService(context);
		}
		return SessionService.instance;
	}

	static resetInstance(): void {
		if (SessionService.instance) {
			SessionService.instance.dispose();
			SessionService.instance = null;
		}
	}

	async initialize(): Promise<void> {
		await this.repository.ensureDirectories();
	}

	/**
	 * Recover a session that was active when VS Code closed
	 */
	async recoverSession(): Promise<SessionSnapshot | null> {
		const current = await this.repository.loadCurrent();
		if (!current || current.status !== 'active') {
			return null;
		}

		// Mark as recovered and move to history
		current.status = 'recovered';
		current.endedAt =
			current.events.length > 0
				? current.events[current.events.length - 1].timestamp
				: current.startedAt;
		// Rebuild summaries from the persisted events (one-time, on recovery only)
		current.files = this.buildSummariesFromEvents(current.events);
		current.totalEstimatedTimeMs = this.computeTotalTime(current.files);

		await this.repository.moveToHistory(current);
		return current;
	}

	startSession(): void {
		this.fileSummaryMap.clear();
		this.currentSession = {
			id: crypto.randomUUID(),
			startedAt: Date.now(),
			endedAt: null,
			status: 'active',
			files: [],
			totalEstimatedTimeMs: 0,
			events: [],
		};
		this.persistCurrentSession();
		this._onDidChangeSession.fire(this.currentSession);
	}

	async stopSession(): Promise<void> {
		if (!this.currentSession) {
			return;
		}

		this.currentSession.endedAt = Date.now();
		this.currentSession.status = 'completed';
		// Summaries are already up-to-date from incremental updates
		this.currentSession.files = this.sortedSummaries();
		this.currentSession.totalEstimatedTimeMs = this.computeTotalTime(this.currentSession.files);

		await this.repository.moveToHistory(this.currentSession);
		this.currentSession = null;
		this.fileSummaryMap.clear();
		this._onDidChangeSession.fire(null);
	}

	resetSession(): void {
		if (!this.currentSession) {
			return;
		}
		this.fileSummaryMap.clear();
		this.currentSession = {
			id: crypto.randomUUID(),
			startedAt: Date.now(),
			endedAt: null,
			status: 'active',
			files: [],
			totalEstimatedTimeMs: 0,
			events: [],
		};
		this.persistCurrentSession();
		this._onDidChangeSession.fire(this.currentSession);
	}

	recordEvent(event: SessionEvent): void {
		if (!this.currentSession) {
			return;
		}
		this.currentSession.events.push(event);
		this.updateFileSummary(event);
		this.currentSession.files = this.sortedSummaries();
		this.currentSession.totalEstimatedTimeMs = this.computeTotalTime(this.currentSession.files);
		this.persistCurrentSession();
		this._onDidChangeSession.fire(this.currentSession);
	}

	getSummary(): SessionSnapshot | null {
		return this.currentSession;
	}

	isActive(): boolean {
		return this.currentSession !== null && this.currentSession.status === 'active';
	}

	exportAsMarkdown(session?: SessionSnapshot): string {
		const s = session ?? this.currentSession;
		if (!s) {
			return 'No session data.';
		}

		const duration = this.formatDuration(s.totalEstimatedTimeMs);
		const lines = [
			`## Session Summary`,
			`**Duration:** ${duration}`,
			`**Files touched:** ${s.files.length}`,
			`**Started:** ${new Date(s.startedAt).toLocaleString()}`,
			s.endedAt ? `**Ended:** ${new Date(s.endedAt).toLocaleString()}` : '',
			'',
			'| File | Edits | +Lines | -Lines | Time |',
			'|------|-------|--------|--------|------|',
		];

		for (const f of s.files) {
			lines.push(
				`| ${f.filePath} | ${f.totalEdits} | +${f.linesAdded} | -${f.linesRemoved} | ${this.formatDuration(f.estimatedTimeMs)} |`
			);
		}

		return lines.filter((l) => l !== '').join('\n');
	}

	exportAsJson(session?: SessionSnapshot): string {
		const s = session ?? this.currentSession;
		return JSON.stringify(s, null, 2);
	}

	// History methods

	async getSessionHistory(): Promise<SessionHistoryEntry[]> {
		return this.repository.getHistory();
	}

	async loadHistorySession(id: string): Promise<SessionSnapshot | null> {
		return this.repository.loadSession(id);
	}

	async deleteHistorySession(id: string): Promise<boolean> {
		return this.repository.deleteSession(id);
	}

	async deleteAllHistory(): Promise<void> {
		return this.repository.deleteAllSessions();
	}

	async exportSession(id: string, format: 'markdown' | 'json'): Promise<string> {
		const session = await this.repository.loadSession(id);
		if (!session) {
			return '';
		}
		return format === 'markdown' ? this.exportAsMarkdown(session) : this.exportAsJson(session);
	}

	/**
	 * Persist current session synchronously (for deactivation)
	 */
	persistCurrentSessionSync(): void {
		if (!this.currentSession) {
			return;
		}
		this.repository.saveCurrentSync(this.currentSession);
	}

	// Private helpers

	private persistCurrentSession(): void {
		if (!this.currentSession) {
			return;
		}

		if (this.persistDebounceTimer) {
			clearTimeout(this.persistDebounceTimer);
		}

		this.persistDebounceTimer = setTimeout(() => {
			if (this.currentSession) {
				this.repository.saveCurrent(this.currentSession).catch(console.error);
			}
		}, 2000);
	}

	/**
	 * Incrementally update the summary for the file touched by `event`.
	 * Called on every recordEvent — O(1) per call instead of O(total events).
	 */
	private updateFileSummary(event: SessionEvent): void {
		const idleThresholdMs = this.idleTimeoutMinutes * 60 * 1000;
		const existing = this.fileSummaryMap.get(event.filePath);

		if (!existing) {
			this.fileSummaryMap.set(event.filePath, {
				filePath: event.filePath,
				totalEdits: 1,
				linesAdded: event.linesAdded,
				linesRemoved: event.linesRemoved,
				firstTouched: event.timestamp,
				lastTouched: event.timestamp,
				estimatedTimeMs: 0,
			});
			return;
		}

		const gap = event.timestamp - existing.lastTouched;
		existing.totalEdits += 1;
		existing.linesAdded += event.linesAdded;
		existing.linesRemoved += event.linesRemoved;
		existing.lastTouched = event.timestamp;
		if (gap <= idleThresholdMs) {
			existing.estimatedTimeMs += gap;
		}
	}

	private sortedSummaries(): FileSessionSummary[] {
		return [...this.fileSummaryMap.values()].sort((a, b) => b.estimatedTimeMs - a.estimatedTimeMs);
	}

	/**
	 * Full rebuild from a list of events — used only when recovering a persisted session.
	 */
	private buildSummariesFromEvents(events: SessionEvent[]): FileSessionSummary[] {
		const idleThresholdMs = this.idleTimeoutMinutes * 60 * 1000;
		const fileMap = new Map<string, SessionEvent[]>();

		for (const event of events) {
			const bucket = fileMap.get(event.filePath) ?? [];
			bucket.push(event);
			fileMap.set(event.filePath, bucket);
		}

		const summaries: FileSessionSummary[] = [];

		for (const [filePath, fileEvents] of fileMap) {
			const sorted = fileEvents.slice().sort((a, b) => a.timestamp - b.timestamp);
			let linesAdded = 0;
			let linesRemoved = 0;
			let estimatedTimeMs = 0;

			for (let i = 0; i < sorted.length; i++) {
				linesAdded += sorted[i].linesAdded;
				linesRemoved += sorted[i].linesRemoved;
				if (i > 0) {
					const gap = sorted[i].timestamp - sorted[i - 1].timestamp;
					if (gap <= idleThresholdMs) {
						estimatedTimeMs += gap;
					}
				}
			}

			summaries.push({
				filePath,
				totalEdits: sorted.length,
				linesAdded,
				linesRemoved,
				firstTouched: sorted[0].timestamp,
				lastTouched: sorted[sorted.length - 1].timestamp,
				estimatedTimeMs,
			});
		}

		return summaries.sort((a, b) => b.estimatedTimeMs - a.estimatedTimeMs);
	}

	private computeTotalTime(summaries: FileSessionSummary[]): number {
		return summaries.reduce((sum, f) => sum + f.estimatedTimeMs, 0);
	}

	formatDuration(ms: number): string {
		const totalSeconds = Math.floor(ms / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		if (hours > 0) {
			return `${hours}h ${minutes}m`;
		}
		if (minutes > 0) {
			return `${minutes}m ${seconds}s`;
		}
		return `${seconds}s`;
	}

	dispose(): void {
		if (this.persistDebounceTimer) {
			clearTimeout(this.persistDebounceTimer);
		}
		// Persist immediately on dispose
		if (this.currentSession) {
			this.repository.saveCurrentSync(this.currentSession);
		}
		this._onDidChangeSession.dispose();
	}
}
