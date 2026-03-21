/// <reference lib="dom" />

interface VsCodeApi<S = unknown> {
	postMessage(message: unknown): void;
	getState(): S | undefined;
	setState<T extends S>(newState: T): T;
}

declare function acquireVsCodeApi<S = unknown>(): VsCodeApi<S>;

interface SessionFile {
	filePath: string;
	totalEdits: number;
	linesAdded: number;
	linesRemoved: number;
	estimatedTimeMs: number;
}

interface SessionSummary {
	id: string;
	startedAt: number;
	endedAt: number | null;
	status: string;
	totalEstimatedTimeMs: number;
	files: SessionFile[];
	totalFiles?: number;
}

interface AppState {
	session: SessionSummary | null;
	isActive: boolean;
}

type ToWebviewMessage =
	| { command: 'session-updated'; session: SessionSummary | null; isActive: boolean }
	| { command: 'history-updated'; history: (SessionSummary & { totalFiles: number })[] }
	| { command: 'show-history-session'; session: SessionSummary };

const vscode = acquireVsCodeApi<AppState>();
let isActive = false;
let historyLoaded = false;
let viewingHistory = false;

document.getElementById('startBtn')!.addEventListener('click', () => {
	vscode.postMessage({ command: 'start' });
});
document.getElementById('stopBtn')!.addEventListener('click', () => {
	vscode.postMessage({ command: 'stop' });
});
document.getElementById('resetBtn')!.addEventListener('click', () => {
	vscode.postMessage({ command: 'reset' });
});
document.getElementById('copySummaryBtn')!.addEventListener('click', () => {
	vscode.postMessage({ command: 'copy-summary' });
});
document.getElementById('exportJsonBtn')!.addEventListener('click', () => {
	vscode.postMessage({ command: 'export-json' });
});
document.getElementById('historyToggle')!.addEventListener('click', () => {
	const content = document.getElementById('historyContent')!;
	const arrow = document.getElementById('historyArrow')!;
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
document.getElementById('clearHistoryBtn')!.addEventListener('click', () => {
	if (confirm('Delete all session history?')) {
		vscode.postMessage({ command: 'delete-all-sessions' });
	}
});
document.getElementById('backBtn')!.addEventListener('click', () => {
	backToCurrent();
});

function formatDuration(ms: number): string {
	const s = Math.floor(ms / 1000);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	if (h > 0) return `${h}h ${m}m`;
	if (m > 0) return `${m}m ${sec}s`;
	return `${sec}s`;
}

function formatDate(ts: number): string {
	return new Date(ts).toLocaleString();
}

function updateUI(session: SessionSummary | null, active: boolean): void {
	if (viewingHistory) return;
	isActive = active;
	const statusText = document.getElementById('statusText')!;
	const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
	const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
	const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
	const filesSection = document.getElementById('filesSection')!;

	if (active && session) {
		const elapsed = Date.now() - session.startedAt;
		statusText.textContent = `Session Active: ${formatDuration(elapsed)}`;
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
		filesSection.style.display =
			session && session.files && session.files.length > 0 ? '' : 'none';
		if (session) renderFiles(session.files);
	}
}

function renderFiles(files: SessionFile[]): void {
	const tbody = document.getElementById('filesBody')!;
	if (!files || files.length === 0) {
		tbody.innerHTML =
			'<tr><td colspan="5" style="text-align:center;color:var(--vscode-descriptionForeground)">No files edited yet</td></tr>';
		return;
	}
	tbody.innerHTML = '';
	files.forEach((f) => {
		const row = document.createElement('tr');

		const fileCell = document.createElement('td');
		fileCell.title = f.filePath;
		fileCell.textContent = (f.filePath || '').split('/').pop() || f.filePath;

		const editsCell = document.createElement('td');
		editsCell.textContent = String(f.totalEdits);

		const addedCell = document.createElement('td');
		addedCell.textContent = `+${f.linesAdded}`;

		const removedCell = document.createElement('td');
		removedCell.textContent = `-${f.linesRemoved}`;

		const timeCell = document.createElement('td');
		timeCell.textContent = formatDuration(f.estimatedTimeMs);

		row.appendChild(fileCell);
		row.appendChild(editsCell);
		row.appendChild(addedCell);
		row.appendChild(removedCell);
		row.appendChild(timeCell);
		tbody.appendChild(row);
	});
}

function renderHistory(history: (SessionSummary & { totalFiles: number })[]): void {
	const container = document.getElementById('historyList')!;
	const clearBtn = document.getElementById('clearHistoryBtn') as HTMLButtonElement;
	if (!history || history.length === 0) {
		container.innerHTML = '<div class="empty-state">No previous sessions</div>';
		clearBtn.style.display = 'none';
		return;
	}
	clearBtn.style.display = '';
	container.innerHTML = '';

	history.forEach((h) => {
		const item = document.createElement('div');
		item.className = 'history-item';

		const infoWrap = document.createElement('div');
		const dateRow = document.createElement('div');
		dateRow.textContent = formatDate(h.startedAt);

		const metaRow = document.createElement('div');
		metaRow.className = 'history-meta';

		const badge = document.createElement('span');
		const safeStatus =
			h.status === 'completed' || h.status === 'recovered' ? h.status : 'completed';
		badge.className = `badge badge-${safeStatus}`;
		badge.textContent = safeStatus;

		metaRow.textContent = `${formatDuration(h.totalEstimatedTimeMs)} · ${h.totalFiles} files `;
		metaRow.appendChild(badge);

		infoWrap.appendChild(dateRow);
		infoWrap.appendChild(metaRow);

		const actions = document.createElement('div');
		actions.className = 'history-actions';

		const viewBtn = document.createElement('button');
		viewBtn.textContent = 'View';
		viewBtn.addEventListener('click', () => viewSession(h.id));

		const mdBtn = document.createElement('button');
		mdBtn.textContent = 'MD';
		mdBtn.addEventListener('click', () => exportSession(h.id, 'markdown'));

		const jsonBtn = document.createElement('button');
		jsonBtn.textContent = 'JSON';
		jsonBtn.addEventListener('click', () => exportSession(h.id, 'json'));

		const delBtn = document.createElement('button');
		delBtn.className = 'delete-btn';
		delBtn.textContent = 'Del';
		delBtn.addEventListener('click', () => deleteSession(h.id));

		actions.appendChild(viewBtn);
		actions.appendChild(mdBtn);
		actions.appendChild(jsonBtn);
		actions.appendChild(delBtn);

		item.appendChild(infoWrap);
		item.appendChild(actions);
		container.appendChild(item);
	});
}

function viewSession(id: string): void {
	vscode.postMessage({ command: 'view-session', id });
}
function exportSession(id: string, format: string): void {
	vscode.postMessage({ command: 'export-history-session', id, format });
}
function deleteSession(id: string): void {
	vscode.postMessage({ command: 'delete-session', id });
}
function backToCurrent(): void {
	viewingHistory = false;
	(document.getElementById('backBtn') as HTMLElement).style.display = 'none';
	(document.getElementById('startBtn') as HTMLElement).style.display = '';
	const state = vscode.getState();
	if (state) updateUI(state.session, state.isActive);
}

window.addEventListener('message', (event: MessageEvent<ToWebviewMessage>) => {
	const msg = event.data;
	if (msg.command === 'session-updated') {
		vscode.setState({ session: msg.session, isActive: msg.isActive });
		updateUI(msg.session, msg.isActive);
	} else if (msg.command === 'history-updated') {
		renderHistory(msg.history);
	} else if (msg.command === 'show-history-session') {
		viewingHistory = true;
		(document.getElementById('backBtn') as HTMLElement).style.display = 'block';
		(document.getElementById('startBtn') as HTMLElement).style.display = 'none';
		(document.getElementById('filesSection') as HTMLElement).style.display = '';
		renderFiles(msg.session.files);
		const statusText = document.getElementById('statusText')!;
		statusText.textContent = `Viewing: ${formatDate(msg.session.startedAt)}`;
		statusText.className = 'status-text inactive';
	}
});

// Restore state on webview re-creation (e.g. after switching panels)
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
			document.getElementById('statusText')!.textContent = `Session Active: ${formatDuration(elapsed)}`;
		}
	}
}, 1000);
