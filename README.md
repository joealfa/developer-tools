# Developer Tools

A collection of useful development utilities for Visual Studio Code.

## Features

All tools are accessible from the **Developer Tools** icon in the Activity Bar (sidebar).

### UUID/GUID Generation

Insert UUIDs or GUIDs at your cursor position with a single command. Perfect for generating unique identifiers in your code, configuration files, or documentation.

**Available Commands:**

- **Insert UUID** - Generates a lowercase UUID with hyphens (e.g., `550e8400-e29b-41d4-a716-446655440000`)
- **Insert GUID (Uppercase)** - Generates an uppercase GUID with hyphens (e.g., `550E8400-E29B-41D4-A716-446655440000`)
- **Insert UUID (Compact)** - Generates a lowercase UUID without hyphens (e.g., `550e8400e29b41d4a716446655440000`)
- **Insert GUID (Compact, Uppercase)** - Generates an uppercase GUID without hyphens (e.g., `550E8400E29B41D4A716446655440000`)

**Multiple Cursor Support:**

All UUID/GUID commands support multiple cursors - each cursor will receive a unique UUID/GUID, making it easy to generate multiple identifiers at once.

**Selection Replacement:**

When you select text spanning multiple lines and run a UUID/GUID command, it will replace the selection with one UUID/GUID per line.

### Password Generator

Generate secure, customizable passwords directly in VS Code's sidebar.

**Command:** `Developer Tools: Generate Password`

**Features:**

- **Configurable length** (5-128 characters)
- **Character set options:**
  - Uppercase letters (A-Z)
  - Lowercase letters (a-z)
  - Numbers (0-9)
  - Special characters (!@#$%^&*)
- **Minimum requirements** for numbers and special characters
- **Avoid ambiguous characters** option (excludes 0, O, I, l, 1, etc.)
- **Copy to clipboard** or **Insert directly** into your document
- **Auto-regenerate** when options change

**Usage:**

1. Click the Developer Tools icon in the Activity Bar
2. Expand the "Password Generator" section
3. Configure your password requirements
4. Click "Copy" or "Insert to Document"

### Code Notes

Add persistent notes to specific lines in your code files. Notes are stored per-workspace and automatically track line changes as you edit your code.

**Features:**

- **Line-attached notes** - Add notes to any line in your code files (.ts, .js, .tsx, .jsx, .cs, etc.)
- **Categories** - Organize notes as Note, TODO, FIXME, or Question with color-coded icons
- **Inline Note Editor** - Edit notes directly in the sidebar when clicking on lines with notes
- **Line tracking** - Notes automatically move when you insert or delete lines above them
- **Orphaned note detection** - Notes are marked as "orphaned" when their original line content changes
- **File rename tracking** - Notes follow files when renamed or moved within the workspace
- **Notes Table** - View all notes across your project in a searchable, filterable list
- **Search & filter** - Filter notes by category, status, or search text
- **Grouping** - Group notes by file, category, or status
- **Bulk operations** - Delete all orphaned notes or clear all notes at once
- **Import/Export** - Export notes to JSON and import them back
- **Gutter decorations** - Visual indicators in the editor gutter showing which lines have notes

**Available Commands:**

| Command               | Keyboard Shortcut | Description                              |
|-----------------------|-------------------|------------------------------------------|
| Add Note              | `Ctrl+Alt+N`      | Add a note to the current line           |
| Edit Note             | -                 | Edit notes on the current line           |
| Delete Note           | -                 | Delete notes from the current line       |
| Show Notes Panel      | `Ctrl+Alt+M`      | Show the notes list in sidebar           |
| Export Notes          | -                 | Export all notes to a JSON file          |
| Import Notes          | -                 | Import notes from a JSON file            |
| Manage Notes Storage  | -                 | View storage stats and migrate storage   |

**Usage:**

1. Place your cursor on the line where you want to add a note
2. Press `Ctrl+Alt+N` or run "Developer Tools: Add Note" from the Command Palette
3. Enter your note text and select a category in the Note Editor panel
4. Click "Add Note" to save

**Viewing Notes:**

- **Note Editor**: Expand "Note Editor" in the Developer Tools sidebar to edit notes for the current line
- **Notes Table**: Expand "Notes" in the Developer Tools sidebar to see all notes with filtering and grouping
- **Gutter Icons**: Look for colored icons in the editor gutter indicating lines with notes

**Storage:**

Notes are stored in VS Code's workspace state. If storage reaches 95% capacity, you'll be prompted to migrate to file-based storage (`.vscode/notes.json`), which supports larger datasets and can be version-controlled.

## Usage

1. Click the **Developer Tools** icon in the Activity Bar to access all tools
2. For commands, open the Command Palette (`Ctrl+Shift+P` on Windows/Linux, `Cmd+Shift+P` on macOS)
3. Type "Developer Tools" to see all available commands
4. Select the desired command

## Custom Keyboard Shortcuts

This extension includes default keyboard shortcuts for notes functionality. You can configure additional keybindings that don't conflict with your existing setup.

### How to Add Keyboard Shortcuts

**Method 1: Using the Keyboard Shortcuts UI**

1. Open Keyboard Shortcuts: `Ctrl+K Ctrl+S` (Windows/Linux) or `Cmd+K Cmd+S` (macOS)
2. Search for "Developer Tools"
3. Click the **+** icon next to the command you want to bind
4. Press your desired key combination
5. Press `Enter` to confirm

**Method 2: Using keybindings.json**

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type "Preferences: Open Keyboard Shortcuts (JSON)"
3. Add your keybindings to the array:

```json
[
  {
    "key": "ctrl+shift+u",
    "command": "developer-tools.insertUuid"
  },
  {
    "key": "ctrl+shift+alt+u",
    "command": "developer-tools.insertUuidCompact"
  },
  {
    "key": "ctrl+shift+g",
    "command": "developer-tools.insertGuid"
  },
  {
    "key": "ctrl+shift+alt+g",
    "command": "developer-tools.insertGuidCompact"
  },
  {
    "key": "ctrl+alt+p",
    "command": "developer-tools.generatePassword"
  }
]
```

### Available Command IDs

| Command                          | ID                                   |
|----------------------------------|--------------------------------------|
| Insert UUID                      | `developer-tools.insertUuid`         |
| Insert UUID (Compact)            | `developer-tools.insertUuidCompact`  |
| Insert GUID (Uppercase)          | `developer-tools.insertGuid`         |
| Insert GUID (Compact, Uppercase) | `developer-tools.insertGuidCompact`  |
| Generate Password                | `developer-tools.generatePassword`   |
| Add Note                         | `developer-tools.addNote`            |
| Edit Note                        | `developer-tools.editNote`           |
| Delete Note                      | `developer-tools.deleteNote`         |
| Show Notes Panel                 | `developer-tools.showNotesPanel`     |
| Export Notes                     | `developer-tools.exportNotes`        |
| Import Notes                     | `developer-tools.importNotes`        |
| Manage Notes Storage             | `developer-tools.manageNotesStorage` |

## Requirements

No external dependencies required. This extension uses Node.js built-in `crypto` module for UUID and password generation.

## Extension Settings

This extension contributes the following settings:

- `developer-tools.notes.autoExport`: Automatically export notes to `.vscode/notes.json` when changes are made (default: `false`)

## Release Notes

### 1.0.1
- Activity Bar integration with consolidated Developer Tools sidebar
- Password Generator moved to sidebar for quick access
- Inline Note Editor for editing notes directly in sidebar
- Redesigned Notes Table with cleaner row-based layout
- Code architecture improvements

### 1.0.0
- First stable release
- [Developer Tools on VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=joealfa.developer-utilities)

### 0.0.2
- Code Notes feature with line tracking, categories, and import/export

### 0.0.1
- Initial release with UUID/GUID generation and Password Generator

---

**Enjoy!**
