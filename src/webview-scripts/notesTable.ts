/// <reference lib="dom" />

import { Icons } from '../webviews/icons';
import { CATEGORY_CONFIG, STATUS_CONFIG, NoteCategory, NoteStatus } from '../notes/types';

interface VsCodeApi {
	postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

interface SerializedNote {
	id: string;
	filePath: string;
	lineNumber: number;
	text: string;
	category: NoteCategory;
	status: NoteStatus;
	createdAt: string;
}

type NotesGroupBy = 'file' | 'category' | 'status' | 'none';

type ToWebviewMessage = { command: 'notes-updated'; notes: SerializedNote[]; totalCount: number };

const vscode = acquireVsCodeApi();

// ── Local state ───────────────────────────────────────────────────────────────

let allNotes: SerializedNote[] = [];
let totalCount = 0;
let searchText = '';
let categoryFilter: NoteCategory | 'all' = 'all';
let statusFilter: NoteStatus | 'all' = 'all';
let groupBy: NotesGroupBy = 'file';
const selectedNotes = new Set<string>();

// ── Icon helpers ──────────────────────────────────────────────────────────────

function getCategoryIcon(category: NoteCategory, size: number): string {
	const map: Record<NoteCategory, string> = {
		note: Icons.notepadText,
		todo: Icons.listTodo,
		fixme: Icons.locateFixed,
		question: Icons.fileQuestion,
	};
	const icon = map[category] ?? Icons.notepadText;
	return icon.replace('width="18"', `width="${size}"`).replace('height="18"', `height="${size}"`);
}

function getStatusIcon(status: NoteStatus, size: number): string {
	const map: Record<NoteStatus, string> = {
		active: Icons.badgeCheck,
		orphaned: Icons.badgeAlert,
	};
	const icon = map[status] ?? Icons.badgeCheck;
	return icon.replace('width="24"', `width="${size}"`).replace('height="24"', `height="${size}"`);
}

// ── Filter & group ────────────────────────────────────────────────────────────

function getFilteredNotes(): SerializedNote[] {
	return allNotes.filter((note) => {
		if (categoryFilter !== 'all' && note.category !== categoryFilter) return false;
		if (statusFilter !== 'all' && note.status !== statusFilter) return false;
		if (searchText) {
			const q = searchText.toLowerCase();
			if (
				!note.text.toLowerCase().includes(q) &&
				!note.filePath.toLowerCase().includes(q)
			) {
				return false;
			}
		}
		return true;
	});
}

function groupNotes(notes: SerializedNote[]): Map<string, SerializedNote[]> {
	const groups = new Map<string, SerializedNote[]>();
	if (groupBy === 'none') {
		groups.set('All Notes', notes);
		return groups;
	}
	for (const note of notes) {
		let key: string;
		switch (groupBy) {
			case 'file':
				key = note.filePath;
				break;
			case 'category':
				key = CATEGORY_CONFIG[note.category].label;
				break;
			case 'status':
				key = STATUS_CONFIG[note.status].label;
				break;
			default:
				key = 'All Notes';
		}
		const existing = groups.get(key) ?? [];
		existing.push(note);
		groups.set(key, existing);
	}
	return groups;
}

// ── DOM rendering ─────────────────────────────────────────────────────────────

function escapeText(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function renderTable(): void {
	const notes = getFilteredNotes();
	const grouped = groupNotes(notes);
	const filteredCount = notes.length;

	document.getElementById('statsCount')!.textContent = `Showing ${filteredCount} of ${totalCount} notes`;

	const bulkActions = document.getElementById('bulkActions')!;
	const selectedCount = document.getElementById('selectedCount')!;
	if (selectedNotes.size > 0) {
		bulkActions.classList.remove('hidden');
		selectedCount.textContent = `${selectedNotes.size} selected`;
	} else {
		bulkActions.classList.add('hidden');
	}

	const container = document.getElementById('tableContainer')!;
	container.innerHTML = '';

	if (notes.length === 0) {
		container.innerHTML = `
			<div class="empty-state">
				<div class="empty-state-icon">${Icons.notepadText.replace('width="18"', 'width="32"').replace('height="18"', 'height="32"')}</div>
				<div>No notes found</div>
				<div style="margin-top: 4px;">Add notes to your code by right-clicking on a line</div>
			</div>`;
		return;
	}

	const notesContainer = document.createElement('div');
	notesContainer.className = 'notes-container';
	let groupIndex = 0;

	for (const [groupName, groupNotesList] of grouped) {
		const groupId = `group-${groupIndex++}`;

		if (groupBy !== 'none') {
			const header = document.createElement('div');
			header.className = 'group-header';
			header.innerHTML = `
				<span class="group-toggle" data-group-id="${groupId}" id="toggle-${groupId}">▼</span>
				${escapeText(groupName)} (${groupNotesList.length})
			`;
			notesContainer.appendChild(header);
		}

		for (const note of groupNotesList) {
			const isOrphaned = note.status === 'orphaned';
			const isSelected = selectedNotes.has(note.id);
			const createdDate = new Date(note.createdAt).toLocaleDateString();
			const preview = note.text.length > 90 ? note.text.substring(0, 90) + '\u2026' : note.text;
			const categoryConfig = CATEGORY_CONFIG[note.category];

			const row = document.createElement('div');
			row.className = 'note-row';
			row.dataset.group = groupId;
			row.dataset.noteId = note.id;
			row.innerHTML = `
				<div class="note-checkbox-col">
					<input type="checkbox" class="note-checkbox" data-note-id="${note.id}" ${isSelected ? 'checked' : ''}>
				</div>
				<div class="note-status-col">
					<span class="status-icon" title="${isOrphaned ? 'Orphaned' : 'Active'}">
						${getStatusIcon(note.status, 12)}
					</span>
				</div>
				<div class="note-content-col">
					<div class="note-first-row">
						<span class="category-badge category-${note.category}">
							${getCategoryIcon(note.category, 11)} ${categoryConfig.label}
						</span>
						<span class="note-file" title="${escapeText(note.filePath)}">${escapeText(note.filePath)}</span>
					</div>
					<div class="note-second-row">
						<span class="note-line">Line ${note.lineNumber + 1}</span>
						<span>•</span>
						<span class="note-date">${createdDate}</span>
					</div>
					<div class="note-preview-row" title="${escapeText(note.text)}">${escapeText(preview)}</div>
				</div>
				<div class="note-actions-col">
					<button class="action-btn danger delete-note-btn" data-note-id="${note.id}" title="Delete">
						${Icons.trash2.replace('width="18"', 'width="14"').replace('height="18"', 'height="14"')}
					</button>
				</div>
			`;
			notesContainer.appendChild(row);
		}
	}

	container.appendChild(notesContainer);
	attachRowListeners(container);
}

function attachRowListeners(container: HTMLElement): void {
	container.querySelectorAll<HTMLInputElement>('.note-checkbox[data-note-id]').forEach((cb) => {
		cb.addEventListener('change', () => {
			if (cb.checked) {
				selectedNotes.add(cb.dataset.noteId!);
			} else {
				selectedNotes.delete(cb.dataset.noteId!);
			}
			renderTable();
		});
	});
}

// ── Dropdown helpers ──────────────────────────────────────────────────────────

function setDropdownTrigger(trigger: HTMLElement, item: HTMLElement): void {
	const labelText = item.querySelector('span')?.textContent ?? '';
	trigger.textContent = '';

	const sourceIcon = item.querySelector('svg');
	if (sourceIcon) trigger.appendChild(sourceIcon.cloneNode(true));

	const label = document.createElement('span');
	label.textContent = labelText;
	trigger.appendChild(label);

	const arrow = document.createElement('span');
	arrow.className = 'arrow';
	arrow.textContent = '▼';
	trigger.appendChild(arrow);
}

function toggleDropdown(dropdownId: string): void {
	const dropdown = document.getElementById(dropdownId)!;
	const isOpen = dropdown.classList.contains('open');
	document.querySelectorAll('.custom-dropdown.open').forEach((d) => d.classList.remove('open'));
	if (!isOpen) dropdown.classList.add('open');
}

function buildDropdownMenu(
	containerId: string,
	items: { value: string; label: string; icon?: string }[],
	currentValue: string,
	onSelect: (value: string, item: HTMLElement) => void
): void {
	const menu = document.querySelector(`#${containerId} .custom-dropdown-menu`)!;
	menu.innerHTML = '';
	const trigger = document.querySelector<HTMLElement>(`#${containerId} .custom-dropdown-trigger`)!;

	items.forEach(({ value, label, icon }) => {
		const item = document.createElement('div');
		item.className = `custom-dropdown-item ${value === currentValue ? 'selected' : ''}`;
		item.dataset.value = value;
		item.innerHTML = `${icon ?? ''}<span>${label}</span>`;

		if (value === currentValue) {
			setDropdownTrigger(trigger, item);
		}

		item.addEventListener('click', () => {
			menu.querySelectorAll('.custom-dropdown-item').forEach((i) =>
				i.classList.remove('selected')
			);
			item.classList.add('selected');
			setDropdownTrigger(trigger, item);
			document.getElementById(containerId)!.classList.remove('open');
			onSelect(value, item);
		});

		menu.appendChild(item);
	});
}

// ── Toolbar setup ─────────────────────────────────────────────────────────────

function setupToolbar(): void {
	// Search
	let searchTimeout: ReturnType<typeof setTimeout>;
	document.getElementById('searchBox')!.addEventListener('input', (e) => {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			searchText = (e.target as HTMLInputElement).value;
			selectedNotes.clear();
			renderTable();
		}, 300);
	});

	// Category filter dropdown
	const categoryItems = [
		{ value: 'all', label: 'All Categories' },
		...Object.entries(CATEGORY_CONFIG).map(([key, config]) => ({
			value: key,
			label: config.label,
			icon: getCategoryIcon(key as NoteCategory, 14),
		})),
	];
	buildDropdownMenu('categoryFilterDropdown', categoryItems, categoryFilter, (value) => {
		categoryFilter = value as NoteCategory | 'all';
		selectedNotes.clear();
		renderTable();
	});

	// Status filter dropdown
	const statusItems = [
		{ value: 'all', label: 'All Status' },
		...Object.entries(STATUS_CONFIG).map(([key, config]) => ({
			value: key,
			label: config.label,
			icon: getStatusIcon(key as NoteStatus, 14),
		})),
	];
	buildDropdownMenu('statusFilterDropdown', statusItems, statusFilter, (value) => {
		statusFilter = value as NoteStatus | 'all';
		selectedNotes.clear();
		renderTable();
	});

	// Bulk category change dropdown
	const bulkCategoryItems = Object.entries(CATEGORY_CONFIG).map(([key, config]) => ({
		value: key,
		label: config.label,
		icon: getCategoryIcon(key as NoteCategory, 14),
	}));
	buildDropdownMenu('bulkCategoryDropdown', bulkCategoryItems, '', (value) => {
		vscode.postMessage({ command: 'changeCategorySelected', category: value, ids: Array.from(selectedNotes) });
	});

	// Group by select
	document.getElementById('groupBySelect')!.addEventListener('change', (e) => {
		groupBy = (e.target as HTMLSelectElement).value as NotesGroupBy;
		selectedNotes.clear();
		renderTable();
	});

	// Custom dropdown toggle
	document.querySelectorAll<HTMLElement>('.custom-dropdown-trigger[data-dropdown-target]').forEach(
		(trigger) => {
			trigger.addEventListener('click', (e) => {
				const targetId = (e.currentTarget as HTMLElement).dataset.dropdownTarget!;
				toggleDropdown(targetId);
			});
		}
	);

	// Close dropdowns on outside click
	document.addEventListener('mousedown', (e) => {
		if (!(e.target as HTMLElement).closest('.custom-dropdown')) {
			document.querySelectorAll('.custom-dropdown.open').forEach((d) =>
				d.classList.remove('open')
			);
		}
	});

	window.addEventListener('blur', () => {
		document.querySelectorAll('.custom-dropdown.open').forEach((d) =>
			d.classList.remove('open')
		);
	});

	// Delete selected
	document.getElementById('deleteSelectedBtn')!.addEventListener('click', () => {
		vscode.postMessage({ command: 'deleteSelected', ids: Array.from(selectedNotes) });
	});

	// Select all checkbox
	document.getElementById('selectAllCheckbox')!.addEventListener('change', (e) => {
		const checked = (e.target as HTMLInputElement).checked;
		if (checked) {
			getFilteredNotes().forEach((n) => selectedNotes.add(n.id));
		} else {
			selectedNotes.clear();
		}
		renderTable();
	});
}

// ── Click delegation ──────────────────────────────────────────────────────────

document.addEventListener('click', (event) => {
	const target = event.target as HTMLElement;

	const groupToggle = target.closest<HTMLElement>('.group-toggle[data-group-id]');
	if (groupToggle) {
		event.stopPropagation();
		const groupId = groupToggle.dataset.groupId!;
		const rows = document.querySelectorAll<HTMLElement>(`[data-group="${groupId}"]`);
		const toggleEl = document.getElementById(`toggle-${groupId}`)!;
		const isHidden = rows[0]?.style.display === 'none';
		rows.forEach((row) => (row.style.display = isHidden ? '' : 'none'));
		toggleEl.textContent = isHidden ? '▼' : '▶';
		return;
	}

	const deleteBtn = target.closest<HTMLElement>('.delete-note-btn[data-note-id]');
	if (deleteBtn) {
		event.stopPropagation();
		vscode.postMessage({ command: 'deleteNote', noteId: deleteBtn.dataset.noteId });
		return;
	}

	if (target.closest('.note-checkbox-col')) {
		event.stopPropagation();
		return;
	}

	const row = target.closest<HTMLElement>('.note-row[data-note-id]');
	if (row) {
		vscode.postMessage({ command: 'navigate', noteId: row.dataset.noteId });
	}
});

document.addEventListener('dblclick', (event) => {
	const row = (event.target as HTMLElement).closest<HTMLElement>('.note-row[data-note-id]');
	if (!row) return;
	event.preventDefault();
	vscode.postMessage({ command: 'openEditor', noteId: row.dataset.noteId });
});

// ── Message handler ───────────────────────────────────────────────────────────

window.addEventListener('message', (event: MessageEvent<ToWebviewMessage>) => {
	const msg = event.data;
	if (msg.command === 'notes-updated') {
		allNotes = msg.notes;
		totalCount = msg.totalCount;
		// Prune selection for deleted notes
		const ids = new Set(allNotes.map((n) => n.id));
		for (const id of Array.from(selectedNotes)) {
			if (!ids.has(id)) selectedNotes.delete(id);
		}
		renderTable();
	}
});

// ── Init ──────────────────────────────────────────────────────────────────────

setupToolbar();
renderTable();
