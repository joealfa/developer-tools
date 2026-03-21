/// <reference lib="dom" />

interface VsCodeApi {
	postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

interface PortInfo {
	port: number;
	pid: number;
	processName: string;
	command: string;
	protocol: string;
	state: string;
}

type ToExtensionMessage =
	| { command: 'refresh' }
	| { command: 'kill'; pid: number }
	| { command: 'toggle-auto-refresh'; enabled: boolean }
	| { command: 'filter'; text: string };

type ToWebviewMessage = { command: 'ports-updated'; ports: PortInfo[] };

const vscode = acquireVsCodeApi();
let autoRefreshEnabled = true;
let ports: PortInfo[] = [];

document.getElementById('refreshBtn')!.addEventListener('click', () => {
	vscode.postMessage({ command: 'refresh' } satisfies ToExtensionMessage);
});

document.getElementById('autoRefreshBtn')!.addEventListener('click', () => {
	autoRefreshEnabled = !autoRefreshEnabled;
	const btn = document.getElementById('autoRefreshBtn')!;
	btn.classList.toggle('active', autoRefreshEnabled);
	vscode.postMessage({
		command: 'toggle-auto-refresh',
		enabled: autoRefreshEnabled,
	} satisfies ToExtensionMessage);
});
document.getElementById('autoRefreshBtn')!.classList.add('active');

document.getElementById('filterInput')!.addEventListener('input', (e) => {
	vscode.postMessage({
		command: 'filter',
		text: (e.target as HTMLInputElement).value,
	} satisfies ToExtensionMessage);
});

function renderPorts(data: PortInfo[]): void {
	const container = document.getElementById('portList')!;
	if (!data || data.length === 0) {
		container.innerHTML = '';
		const state = document.createElement('div');
		state.className = 'empty-state';

		const msg = document.createElement('p');
		msg.textContent = 'No listening ports found';

		const refreshBtn = document.createElement('button');
		refreshBtn.className = 'toolbar-btn';
		refreshBtn.textContent = 'Refresh';
		refreshBtn.addEventListener('click', () => {
			vscode.postMessage({ command: 'refresh' });
		});

		state.appendChild(msg);
		state.appendChild(refreshBtn);
		container.appendChild(state);
		return;
	}

	container.innerHTML = data
		.map(
			(p) =>
				'<div class="port-item">' +
				'<div class="port-header">' +
				`<span class="port-number">:${p.port}</span>` +
				`<span class="port-meta">PID ${p.pid} · ${p.processName}</span>` +
				'</div>' +
				`<div class="port-command" title="${p.command}">${p.command}</div>` +
				'<div style="margin-top:6px;display:flex;justify-content:flex-end;align-items:center;gap:6px;">' +
				`<button class="kill-btn" data-pid="${p.pid}" data-port="${p.port}">Kill</button>` +
				`<div class="confirm-kill" id="confirm-${p.pid}-${p.port}">` +
				`<span>Kill PID ${p.pid}?</span>` +
				`<button class="confirm-yes" data-pid="${p.pid}">Yes</button>` +
				`<button class="confirm-no" data-pid="${p.pid}" data-port="${p.port}">No</button>` +
				'</div>' +
				'</div>' +
				'</div>'
		)
		.join('');

	container.querySelectorAll<HTMLButtonElement>('.kill-btn').forEach((btn) => {
		btn.addEventListener('click', (e) => {
			const target = e.target as HTMLButtonElement;
			const pid = target.dataset.pid!;
			const port = target.dataset.port!;
			target.style.display = 'none';
			document.getElementById(`confirm-${pid}-${port}`)!.classList.add('visible');
		});
	});

	container.querySelectorAll<HTMLButtonElement>('.confirm-yes').forEach((btn) => {
		btn.addEventListener('click', (e) => {
			const pid = parseInt((e.target as HTMLButtonElement).dataset.pid!);
			vscode.postMessage({ command: 'kill', pid } satisfies ToExtensionMessage);
		});
	});

	container.querySelectorAll<HTMLButtonElement>('.confirm-no').forEach((btn) => {
		btn.addEventListener('click', (e) => {
			const target = e.target as HTMLButtonElement;
			const pid = target.dataset.pid!;
			const port = target.dataset.port!;
			document.getElementById(`confirm-${pid}-${port}`)!.classList.remove('visible');
			const killBtn = container.querySelector<HTMLButtonElement>(
				`.kill-btn[data-pid="${pid}"][data-port="${port}"]`
			);
			if (killBtn) killBtn.style.display = '';
		});
	});
}

window.addEventListener('message', (event: MessageEvent<ToWebviewMessage>) => {
	const message = event.data;
	if (message.command === 'ports-updated') {
		ports = message.ports;
		renderPorts(ports);
	}
});
