/// <reference lib="dom" />

interface VsCodeApi {
	postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

interface PasswordOptions {
	length: number;
	includeUppercase: boolean;
	includeLowercase: boolean;
	includeNumbers: boolean;
	includeSpecial: boolean;
	minNumbers: number;
	minSpecial: number;
	avoidAmbiguous: boolean;
}

type ToExtensionMessage =
	| { command: 'generate'; options: PasswordOptions }
	| { command: 'copy'; password: string }
	| { command: 'insert'; password: string };

type ToWebviewMessage = { command: 'updatePassword'; password: string };

const vscode = acquireVsCodeApi();

function getOptions(): PasswordOptions {
	return {
		length: parseInt((document.getElementById('length') as HTMLInputElement).value) || 14,
		includeUppercase: (document.getElementById('includeUppercase') as HTMLInputElement).checked,
		includeLowercase: (document.getElementById('includeLowercase') as HTMLInputElement).checked,
		includeNumbers: (document.getElementById('includeNumbers') as HTMLInputElement).checked,
		includeSpecial: (document.getElementById('includeSpecial') as HTMLInputElement).checked,
		minNumbers: parseInt((document.getElementById('minNumbers') as HTMLInputElement).value) || 0,
		minSpecial: parseInt((document.getElementById('minSpecial') as HTMLInputElement).value) || 0,
		avoidAmbiguous: (document.getElementById('avoidAmbiguous') as HTMLInputElement).checked,
	};
}

function escapeChar(c: string): string {
	if (c === '&') return '&amp;';
	if (c === '<') return '&lt;';
	if (c === '>') return '&gt;';
	if (c === '"') return '&quot;';
	if (c === "'") return '&#039;';
	return c;
}

function highlightPassword(password: string): string {
	return password
		.split('')
		.map((char) => {
			const safe = escapeChar(char);
			if (/[0-9]/.test(char)) {
				return `<span class="number">${safe}</span>`;
			} else if (/[!@#$%^&*]/.test(char)) {
				return `<span class="special">${safe}</span>`;
			}
			return safe;
		})
		.join('');
}

function requestNewPassword(): void {
	const msg: ToExtensionMessage = { command: 'generate', options: getOptions() };
	vscode.postMessage(msg);
}

document.getElementById('regenerateBtn')!.addEventListener('click', requestNewPassword);

document.getElementById('copyBtn')!.addEventListener('click', () => {
	const password = (document.getElementById('passwordDisplay') as HTMLElement).textContent ?? '';
	vscode.postMessage({ command: 'copy', password } satisfies ToExtensionMessage);
});

document.getElementById('insertBtn')!.addEventListener('click', () => {
	const password = (document.getElementById('passwordDisplay') as HTMLElement).textContent ?? '';
	vscode.postMessage({ command: 'insert', password } satisfies ToExtensionMessage);
});

// Auto-regenerate when options change
document.querySelectorAll('input').forEach((input) => {
	input.addEventListener('change', requestNewPassword);
});

window.addEventListener('message', (event: MessageEvent<ToWebviewMessage>) => {
	const message = event.data;
	if (message.command === 'updatePassword') {
		(document.getElementById('passwordDisplay') as HTMLElement).innerHTML = highlightPassword(
			message.password
		);
	}
});

// Initial highlight of the server-rendered password
const display = document.getElementById('passwordDisplay') as HTMLElement;
display.innerHTML = highlightPassword(display.textContent ?? '');
