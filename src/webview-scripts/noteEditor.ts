/// <reference lib="dom" />

import { Icons } from '../webviews/icons';
import { CATEGORY_CONFIG, NoteCategory } from '../notes/types';

interface VsCodeApi {
	postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

interface SerializedNote {
	id: string;
	text: string;
	category: NoteCategory;
	createdAt: string;
}

interface LocationInfo {
	fileName: string;
	compactPath: string;
	fullPath: string;
}

type ToWebviewMessage =
	| {
			command: 'update';
			notes: SerializedNote[];
			locationInfo: LocationInfo | null;
			lineNumber: number;
			showAddForm: boolean;
			isFileFocused: boolean;
	  }
	| { command: 'empty' };

const vscode = acquireVsCodeApi();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCategoryIcon(category: NoteCategory, size = 11): string {
	const iconMap: Record<NoteCategory, string> = {
		note: Icons.notepadText,
		todo: Icons.listTodo,
		fixme: Icons.locateFixed,
		question: Icons.fileQuestion,
	};
	const icon = iconMap[category] ?? Icons.notepadText;
	return icon.replace('width="18"', `width="${size}"`).replace('height="18"', `height="${size}"`);
}

function buildCategoryOptions(selectedCategory: NoteCategory): string {
	return Object.entries(CATEGORY_CONFIG)
		.map(
			([key, config]) =>
				`<option value="${key}" ${key === selectedCategory ? 'selected' : ''}>${config.label}</option>`
		)
		.join('');
}

function buildAddFormCategoryOptions(): string {
	return Object.entries(CATEGORY_CONFIG)
		.map(([key, config]) => `<option value="${key}">${config.label}</option>`)
		.join('');
}

// ── DOM builders ──────────────────────────────────────────────────────────────

function buildLocationBanner(locationInfo: LocationInfo, lineNumber: number): HTMLElement {
	const div = document.createElement('div');
	div.className = 'location-info';
	div.title = locationInfo.fullPath;
	div.innerHTML = `
		<div class="location-top-row">
			<div class="location-file">${escapeText(locationInfo.fileName)}</div>
			<div class="location-line">Line ${lineNumber + 1}</div>
		</div>
		<div class="location-path">${escapeText(locationInfo.compactPath)}</div>
	`;
	return div;
}

function buildNoteCard(note: SerializedNote): HTMLElement {
	const categoryConfig = CATEGORY_CONFIG[note.category];
	const createdDate = new Date(note.createdAt).toLocaleString();

	const card = document.createElement('div');
	card.className = 'note-card';
	card.dataset.noteId = note.id;
	card.innerHTML = `
		<div class="note-header">
			<span class="category-badge category-${note.category}">
				${getCategoryIcon(note.category)} ${categoryConfig.label}
			</span>
			<button class="icon-btn delete-note-btn" data-note-id="${note.id}" title="Delete">
				${Icons.trash2}
			</button>
		</div>
		<textarea class="note-text existing-note-text" id="note-${note.id}" data-note-id="${note.id}">${escapeText(note.text)}</textarea>
		<div class="note-footer">
			<span class="note-date">${createdDate}</span>
			<select class="category-select" data-note-id="${note.id}">
				${buildCategoryOptions(note.category)}
			</select>
		</div>
	`;

	const textarea = card.querySelector<HTMLTextAreaElement>(`#note-${note.id}`)!;
	textarea.addEventListener('change', () => {
		const text = textarea.value.trim();
		if (!text) return;
		const select = card.querySelector<HTMLSelectElement>('.category-select')!;
		vscode.postMessage({ command: 'updateNote', noteId: note.id, text, category: select.value });
	});

	const select = card.querySelector<HTMLSelectElement>('.category-select')!;
	select.addEventListener('change', () => {
		const text = textarea.value.trim();
		vscode.postMessage({
			command: 'updateNote',
			noteId: note.id,
			text,
			category: select.value,
		});
	});

	const deleteBtn = card.querySelector<HTMLButtonElement>('.delete-note-btn')!;
	deleteBtn.addEventListener('click', () => {
		vscode.postMessage({ command: 'deleteNote', noteId: note.id });
	});

	return card;
}

function buildAddNoteForm(isAccordion: boolean): HTMLElement {
	const categoryOptions = buildAddFormCategoryOptions();
	const formInner = `
		<div class="form-group">
			<label for="newNoteText">Note</label>
			<textarea id="newNoteText" class="note-text" placeholder="Enter your note..."></textarea>
		</div>
		<div class="form-group">
			<label for="newNoteCategory">Category</label>
			<select id="newNoteCategory" class="category-select">
				${categoryOptions}
			</select>
		</div>
		<button class="btn" id="addNoteBtn">Add Note</button>
	`;

	let wrapper: HTMLElement;

	if (isAccordion) {
		wrapper = document.createElement('details');
		wrapper.className = 'add-note-accordion';
		wrapper.innerHTML = `
			<summary class="add-note-summary">Add Another Note</summary>
			<div class="add-note-accordion-body">${formInner}</div>
		`;
	} else {
		wrapper = document.createElement('div');
		wrapper.className = 'add-note-section';
		wrapper.innerHTML = `<div class="section-title">Add Note</div>${formInner}`;
	}

	const btn = wrapper.querySelector<HTMLButtonElement>('#addNoteBtn')!;
	btn.addEventListener('click', () => submitAddNote(wrapper));

	return wrapper;
}

function submitAddNote(container: HTMLElement): void {
	const textarea = container.querySelector<HTMLTextAreaElement>('#newNoteText')!;
	const select = container.querySelector<HTMLSelectElement>('#newNoteCategory')!;
	const text = textarea.value.trim();
	if (!text) return;

	vscode.postMessage({ command: 'addNote', text, category: select.value });
	textarea.value = '';
	textarea.focus();
}

function buildEmptyState(locationInfo?: LocationInfo | null, lineNumber?: number): DocumentFragment {
	const frag = document.createDocumentFragment();

	if (locationInfo && typeof lineNumber === 'number') {
		frag.appendChild(buildLocationBanner(locationInfo, lineNumber));
	}

	const div = document.createElement('div');
	div.className = 'empty-state';
	div.innerHTML = `
		${Icons.notepadText}
		<p>Click on a line to add or edit notes</p>
	`;
	frag.appendChild(div);
	return frag;
}

// ── Render ────────────────────────────────────────────────────────────────────

function render(msg: Extract<ToWebviewMessage, { command: 'update' }>): void {
	const root = document.getElementById('root')!;
	root.innerHTML = '';

	const { notes, locationInfo, lineNumber, showAddForm, isFileFocused } = msg;

	if (notes.length === 0 && !showAddForm) {
		root.appendChild(buildEmptyState(locationInfo, lineNumber));
		return;
	}

	if (isFileFocused && locationInfo) {
		root.appendChild(buildLocationBanner(locationInfo, lineNumber));
	}

	for (const note of notes) {
		root.appendChild(buildNoteCard(note));
	}

	if (notes.length > 0) {
		root.appendChild(buildAddNoteForm(true));
	} else if (showAddForm) {
		root.appendChild(buildAddNoteForm(false));
	}
}

window.addEventListener('message', (event: MessageEvent<ToWebviewMessage>) => {
	const msg = event.data;
	if (msg.command === 'update') {
		render(msg);
	} else if (msg.command === 'empty') {
		const root = document.getElementById('root')!;
		root.innerHTML = '';
		root.appendChild(buildEmptyState());
	}
});

// ── Utilities ─────────────────────────────────────────────────────────────────

function escapeText(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
