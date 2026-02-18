# Developer Tools

A productivity toolkit for Visual Studio Code developers. All features live in the **Developer Tools** sidebar — accessible from the Activity Bar.

## Features

- [UUID / GUID Generation](#uuid--guid-generation)
- [Password Generator](#password-generator)
- [Code Notes](#code-notes)
- [Session Tracker](#session-tracker)
- [Port Manager](#port-manager)
- [Code Complexity Analysis](#code-complexity-analysis)

---

### UUID / GUID Generation

Insert UUIDs and GUIDs at the cursor position from the Command Palette. Supports all four format variants.

| Command | Output example |
|---------|---------------|
| **Insert UUID** | `550e8400-e29b-41d4-a716-446655440000` |
| **Insert GUID (Uppercase)** | `550E8400-E29B-41D4-A716-446655440000` |
| **Insert UUID (Compact)** | `550e8400e29b41d4a716446655440000` |
| **Insert GUID (Compact, Uppercase)** | `550E8400E29B41D4A716446655440000` |

**Multiple cursors** — each cursor gets a unique identifier.
**Selection replacement** — selecting text across multiple lines replaces each line with one UUID/GUID.

---

### Password Generator

Generate cryptographically secure passwords in the sidebar. Uses Node.js `crypto` with rejection sampling to eliminate modulo bias.

**Options:**
- Length: 5–128 characters (default 14)
- Character sets: Uppercase, Lowercase, Numbers, Special (`!@#$%^&*`)
- Minimum counts for numbers and special characters
- Avoid ambiguous characters (`0`, `O`, `I`, `l`, `1`)

**Actions:** Copy to clipboard or insert directly into the active document.

**Usage:**
1. Click the Developer Tools icon in the Activity Bar
2. Expand **Password Generator**
3. Adjust options — the password regenerates automatically
4. Click **Copy** or **Insert**

---

### Code Notes

Attach persistent notes to specific lines in your code. Notes are stored in `.vscode/notes/notes.json` and track the code as you edit.

**Features:**
- **Four categories:** Note, ToDo, FixMe, Question — each with a distinct gutter icon
- **Inline Note Editor** — sidebar panel that shows notes for the current cursor line; auto-updates as you move the cursor
- **Notes Table** — searchable, filterable list of all notes across the workspace with a preview of each note's text
- **Line tracking** — notes shift automatically when lines are inserted or deleted above them
- **Content-hash detection** — notes are orphaned when their anchored line changes significantly, preventing stale references
- **Surrounding context** — fuzzy re-anchoring using neighboring lines to find a moved note's new location
- **File rename/delete tracking** — notes follow files when they are renamed or moved inside the workspace
- **Gutter decorations** — SVG icons in the editor gutter show which lines have notes; orphaned notes display with a distinct icon
- **Search & filter** — filter by category, status (active/orphaned), or free-text search
- **Grouping** — group the Notes Table by file, category, or status
- **Bulk operations** — multi-select notes for bulk delete or category change
- **Import/Export** — export notes to JSON and import them back

**Commands:**

| Command | Keyboard shortcut | Description |
|---------|------------------|-------------|
| Add Note | `Ctrl+Alt+N` / `Cmd+Alt+N` | Add a note to the current line |
| Edit Note | — | Edit notes on the current line |
| Delete Note | — | Delete notes from the current line |
| Show Notes Panel | `Ctrl+Alt+M` / `Cmd+Alt+M` | Focus the Notes Table in the sidebar |
| Export Notes | — | Export all notes to a JSON file |
| Import Notes | — | Import notes from a JSON file |

**Adding a note:**
1. Place your cursor on the target line
2. Press `Ctrl+Alt+N` (or right-click → *Add Note to Line*)
3. Type your note and pick a category in the Note Editor panel
4. Click **Add Note**

**Viewing notes:**
- **Gutter icons** — colored SVG icons appear on lines that have notes
- **Note Editor** — expands automatically when your cursor lands on a noted line; shows all notes for that line and lets you edit or delete them
- **Notes Table** — full searchable/filterable list in the Developer Tools sidebar; click a row to navigate to the line, double-click to open the Note Editor

**Storage:**
Notes are saved to `.vscode/notes/notes.json` in your workspace. This file can be committed to version control if you want notes to be shared with your team, or added to `.gitignore` to keep them private (see `developer-tools.notes.gitignore` setting).

---

### Session Tracker

Track how long you spend coding and which files you edit during a session. Must be enabled in settings first.

**Features:**
- Start, stop, and reset sessions from the sidebar or Command Palette
- Live timer showing elapsed session time
- File-level breakdown: edits, lines added/removed, estimated time
- Configurable idle timeout (inactive time is excluded from estimates)
- Session recovery — if VS Code closes unexpectedly, the previous session is recovered on next launch
- Session history with per-session Markdown or JSON export
- Auto-start on workspace open (optional)

**Enable Session Tracker:**
1. Open Settings (`Ctrl+,` / `Cmd+,`)
2. Search for `developer-tools.session.enabled`
3. Enable the toggle — the **Session Tracker** panel appears in the sidebar

**Commands:**

| Command | Description |
|---------|-------------|
| Start Session Tracking | Begin a new session |
| Stop Session Tracking | End and save the current session to history |
| Reset Session | Clear the current session data |
| Show Session Summary | Focus the Session Tracker sidebar panel |
| Show Session History | Focus the Session Tracker sidebar panel (history section) |
| Delete Session | Remove a session from history |
| Delete All Sessions | Clear all session history |

---

### Port Manager

View all listening TCP ports in your system, see the process behind each port, and kill processes without leaving VS Code. Must be enabled in settings first.

**Features:**
- Auto-refreshes the port list on a configurable interval
- Shows port number, PID, process name, and command
- Filter by port number or process name
- Two-step kill confirmation to prevent accidents
- Manual refresh button
- Toggle auto-refresh on/off

**Enable Port Manager:**
1. Open Settings (`Ctrl+,` / `Cmd+,`)
2. Search for `developer-tools.ports.enabled`
3. Enable the toggle — the **Port Manager** panel appears in the sidebar

**Commands:**

| Command | Description |
|---------|-------------|
| Refresh Port List | Force an immediate scan |
| Kill Process on Port | Pick a port from a list and kill its process |
| Show Port Manager | Focus the Port Manager sidebar panel |

> **Note:** The Port Manager uses `netstat` (Linux/macOS/Windows) or `lsof` (macOS/Linux) to scan ports. It may require elevated permissions to kill some processes.

---

### Code Complexity Analysis

Display inline complexity hints on function definitions. Supports TypeScript, JavaScript (including JSX/TSX), Python, Go, Java, C#, and Rust.

**Metrics:**
- **Cyclomatic Complexity (CC)** — counts independent control-flow paths
- **Cognitive Complexity (COG)** — measures how hard the code is to understand, weighting nested structures more heavily

**Severity levels:**

| Level | Default CC threshold | Hint color |
|-------|---------------------|-----------|
| Low | < 6 | Blue (info) |
| Moderate | >= 6 | Yellow (warning) |
| High | >= 11 | Red (error) |
| Very High | >= 21 | Red bold + background |

Hints appear inline after the function signature, e.g.:

```
async function processData(items) {   ⊘ CC:14 COG:18
```

**Commands:**

| Command | Description |
|---------|-------------|
| Toggle Complexity Hints | Enable or disable inline hints |
| Analyze File Complexity | Force re-analysis of the current file |
| Show Complexity Report | Print a sorted complexity report to the Output panel |

> **Note:** Analysis uses regex-based heuristics (not an AST), so accuracy may vary for unusual code patterns. Files over 10,000 lines are skipped for performance.

---

## Extension Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `developer-tools.notes.autoExport` | boolean | `false` | Auto-export notes to `.vscode/notes/` on every change |
| `developer-tools.notes.gitignore` | boolean | `false` | Automatically add `.vscode/notes/` to `.gitignore` |
| `developer-tools.session.enabled` | boolean | `false` | Show the Session Tracker panel in the sidebar |
| `developer-tools.session.autoStart` | boolean | `false` | Auto-start session tracking when a workspace opens |
| `developer-tools.session.idleTimeoutMinutes` | number | `5` | Minutes of inactivity before time stops counting |
| `developer-tools.ports.enabled` | boolean | `false` | Show the Port Manager panel in the sidebar |
| `developer-tools.ports.autoRefreshSeconds` | number | `10` | Port list auto-refresh interval (0 = disabled) |
| `developer-tools.ports.showEstablished` | boolean | `false` | Include ESTABLISHED connections (not just LISTEN) |
| `developer-tools.complexity.enabled` | boolean | `false` | Show inline complexity hints on functions |
| `developer-tools.complexity.minLevel` | enum | `"moderate"` | Minimum severity to display: `low`, `moderate`, `high`, `very-high` |
| `developer-tools.complexity.thresholds` | object | `{moderate:6, high:11, veryHigh:21}` | Cyclomatic complexity thresholds |
| `developer-tools.complexity.showCognitive` | boolean | `true` | Show cognitive complexity alongside cyclomatic |

---

## Custom Keyboard Shortcuts

The extension ships with two default keybindings for notes. You can add more via VS Code's keyboard shortcuts.

**Method 1: Keyboard Shortcuts UI**
1. Open Keyboard Shortcuts: `Ctrl+K Ctrl+S` (Windows/Linux) or `Cmd+K Cmd+S` (macOS)
2. Search for `Developer Tools`
3. Click **+** next to any command and press your key combination

**Method 2: keybindings.json**
1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run *Preferences: Open Keyboard Shortcuts (JSON)*
3. Add entries like:

```json
[
  { "key": "ctrl+shift+u",     "command": "developer-tools.insertUuid" },
  { "key": "ctrl+shift+alt+u", "command": "developer-tools.insertUuidCompact" },
  { "key": "ctrl+shift+g",     "command": "developer-tools.insertGuid" },
  { "key": "ctrl+shift+alt+g", "command": "developer-tools.insertGuidCompact" },
  { "key": "ctrl+alt+p",       "command": "developer-tools.generatePassword" },
  { "key": "ctrl+alt+c",       "command": "developer-tools.toggleComplexityHints" }
]
```

**All command IDs:**

| Command | ID |
|---------|----|
| Insert UUID | `developer-tools.insertUuid` |
| Insert UUID (Compact) | `developer-tools.insertUuidCompact` |
| Insert GUID (Uppercase) | `developer-tools.insertGuid` |
| Insert GUID (Compact, Uppercase) | `developer-tools.insertGuidCompact` |
| Generate Password | `developer-tools.generatePassword` |
| Add Note | `developer-tools.addNote` |
| Edit Note | `developer-tools.editNote` |
| Delete Note | `developer-tools.deleteNote` |
| Show Notes Panel | `developer-tools.showNotesPanel` |
| Export Notes | `developer-tools.exportNotes` |
| Import Notes | `developer-tools.importNotes` |
| Start Session Tracking | `developer-tools.startSession` |
| Stop Session Tracking | `developer-tools.stopSession` |
| Reset Session | `developer-tools.resetSession` |
| Show Session Summary | `developer-tools.showSessionSummary` |
| Show Session History | `developer-tools.showSessionHistory` |
| Delete Session | `developer-tools.deleteSession` |
| Delete All Sessions | `developer-tools.deleteAllSessions` |
| Refresh Port List | `developer-tools.refreshPorts` |
| Kill Process on Port | `developer-tools.killPort` |
| Show Port Manager | `developer-tools.showPortManager` |
| Toggle Complexity Hints | `developer-tools.toggleComplexityHints` |
| Analyze File Complexity | `developer-tools.analyzeFileComplexity` |
| Show Complexity Report | `developer-tools.showComplexityReport` |

---

## Requirements

No external dependencies required. This extension uses only Node.js built-in modules (`crypto`) and VS Code's built-in APIs.

---

**Enjoy!**
