# Developer Tools - VS Code Extension

A productivity toolkit for developers: UUID/GUID generation, secure password generation, persistent code notes, session tracking, port management, and inline code complexity analysis.

## Features

### UUID / GUID Generation
- **Insert UUID** — lowercase UUID with hyphens (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)
- **Insert GUID (Uppercase)** — uppercase GUID with hyphens
- **Insert UUID (Compact)** — UUID without hyphens
- **Insert GUID (Compact, Uppercase)** — uppercase GUID without hyphens
- Multiple cursors — each cursor receives a unique UUID/GUID
- Selection replacement — replaces each selected line with one UUID/GUID

### Password Generator
- Sidebar webview with live preview
- Configurable length (5–128), character sets (upper, lower, numbers, special)
- Minimum number/special character requirements
- Avoid ambiguous characters option (0, O, l, 1, I, etc.)
- Cryptographically secure RNG using `crypto.randomBytes` with rejection sampling (no modulo bias)
- Copy to clipboard or insert directly into the active document

### Code Notes
- Attach persistent notes to specific lines in any file
- Four categories: Note, ToDo, FixMe, Question — each with a distinct gutter SVG icon
- Inline Note Editor sidebar: auto-follows the cursor, shows notes for the current line
- Notes Table sidebar: searchable, filterable, grouped list of all workspace notes with text preview
- Line tracking: notes shift when lines are inserted/deleted
- Content-hash detection: notes are orphaned when their anchored line content changes
- Fuzzy re-anchoring via surrounding context (lines before/after)
- File rename and delete tracking
- Gutter decorations (SVG icons) with priority ordering: orphaned > fixme > todo > question > note
- Bulk operations: multi-select for delete or category change
- Import/Export to `.vscode/notes/notes.json`
- Auto-export and `.gitignore` integration (configurable)

### Session Tracker *(disabled by default)*
- Track coding time per workspace session
- File-level breakdown: edits, lines added/removed, estimated time
- Idle timeout (inactive periods excluded from estimates)
- Session history with per-session Markdown/JSON export
- Crash recovery: restores unsaved sessions on next launch
- Auto-start on workspace open (configurable)

### Port Manager *(disabled by default)*
- Scan all listening TCP ports using `netstat`/`lsof`
- Shows port number, PID, process name, and command
- Filter by port or process name
- Kill processes with two-step confirmation
- Auto-refresh on configurable interval

### Code Complexity Analysis *(disabled by default)*
- Inline hints on function definitions showing Cyclomatic (CC) and Cognitive (COG) complexity
- Four severity levels: low / moderate / high / very-high with color-coded decorations
- Supported languages: TypeScript, JavaScript, TSX, JSX, Python, Go, Java, C#, Rust
- Regex-based heuristic analysis (no AST dependency); files >10k lines are skipped
- Configurable thresholds and minimum display level
- Complexity Report output channel (sorted by CC descending)

---

## Project Structure

```
src/
├── extension.ts              # Activation, wires all modules together
├── extensionState.ts         # Shared singleton state (cursor tracker, providers, services)
├── commands/
│   └── index.ts              # All 24 command handlers
├── generators/
│   ├── index.ts
│   ├── uuid.ts               # UUID/GUID generation (crypto.randomUUID)
│   └── password.ts           # Password generation (crypto.randomBytes, rejection sampling)
├── notes/
│   ├── types.ts              # Note interfaces, CATEGORY_CONFIG, STATUS_CONFIG, constants
│   ├── notesRepository.ts    # File-based storage (.vscode/notes/notes.json), debounced save
│   ├── notesService.ts       # CRUD, event emitter, singleton, MD5 hashing
│   ├── notesLineTracker.ts   # Adjusts line numbers on document edits, orphaning detection
│   ├── notesFileTracker.ts   # Handles file renames and deletions
│   ├── notesCursorTracker.ts # Auto-show/hide Note Editor based on cursor position
│   ├── notesDecorations.ts   # SVG gutter icons via TextEditorDecorationType
│   ├── notesWorkspaceTracker.ts  # Multi-workspace folder add/remove handling
│   ├── notesExportService.ts     # JSON import/export, .gitignore integration
│   └── index.ts              # Barrel exports
├── session/
│   ├── types.ts              # SessionSnapshot, SessionEvent, FileSessionSummary interfaces
│   ├── sessionRepository.ts  # Stores sessions in .vscode/sessions/
│   ├── sessionService.ts     # Start/stop/reset, idle timeout, crash recovery, Markdown export
│   ├── sessionTracker.ts     # Listens to document changes, records edit events
│   └── index.ts
├── ports/
│   ├── types.ts              # PortInfo interface
│   ├── portScanner.ts        # Platform-aware netstat/lsof parsing
│   ├── portService.ts        # Scan, auto-refresh, kill process, event emitter
│   └── index.ts
├── complexity/
│   ├── types.ts              # ComplexityResult, ComplexityLevel, DEFAULT_THRESHOLDS
│   ├── complexityAnalyzer.ts # Regex-based CC + cognitive complexity per language
│   ├── complexityService.ts  # Cache, debounce (500ms), document lifecycle listeners
│   ├── complexityDecorations.ts  # Inline hints via TextEditorDecorationType
│   └── index.ts
├── webviews/
│   ├── icons.ts                  # Lucide SVG icon strings
│   ├── passwordGeneratorProvider.ts  # Password Generator sidebar
│   ├── notesTableProvider.ts     # Notes Table sidebar (search, filter, group, bulk ops)
│   ├── noteEditorProvider.ts     # Note Editor secondary sidebar (cursor-driven)
│   ├── sessionTrackerProvider.ts # Session Tracker sidebar
│   ├── portManagerProvider.ts    # Port Manager sidebar
│   └── index.ts
├── utils/
│   ├── editor.ts             # insertTextAtCursor, insertTextIntoEditor, escapeHtml, getRelativePath
│   └── index.ts
└── test/
    └── extension.test.ts     # ~38 tests covering UUID, password, notes, commands, config
```

**Storage locations:**
| Data | Path |
|------|------|
| Notes | `.vscode/notes/notes.json` |
| Notes backup | `.vscode/notes/notes-backup.json` |
| Active session | `.vscode/sessions/current.json` |
| Session history | `.vscode/sessions/history/*.json` |

---

## Setup

1. Install recommended extensions (`.vscode/extensions.json`):
   - `amodio.tsl-problem-matcher`
   - `ms-vscode.extension-test-runner`
   - `dbaeumer.vscode-eslint`

2. Install dependencies:
   ```bash
   npm install
   ```

---

## Development

### Run the extension

Press `F5` to open a new VS Code window with the extension loaded.

Try these commands via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):
- `Developer Tools: Insert UUID`
- `Developer Tools: Generate Password`
- `Developer Tools: Add Note to Line`
- `Developer Tools: Toggle Complexity Hints`

Set breakpoints in `src/extension.ts` to debug. Reload the extension window with `Ctrl+R` / `Cmd+R` after code changes.

### Build

```bash
npm run compile        # Type-check + lint + bundle (development)
npm run watch          # Watch mode (esbuild + tsc in parallel)
npm run package        # Production bundle
npm run lint           # ESLint only
npm run check-types    # tsc --noEmit only
```

### Test

```bash
npm test               # Compile, bundle, lint, then run tests in VS Code
```

Or use the VS Code Test Explorer:
1. Install [Extension Test Runner](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner)
2. Run the `watch` task via **Tasks: Run Task**
3. Open the Testing view and click **Run Tests** or press `Ctrl/Cmd+; A`

Test files live in `src/test/` and must match `**.test.ts`.

---

## Go Further

- [Bundle your extension](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)
- [Publish your extension](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration)
- Browse the full VS Code API: `node_modules/@types/vscode/index.d.ts`

## License

MIT
