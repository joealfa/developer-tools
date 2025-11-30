# Developer Tools - VS Code Extension

A collection of productivity tools for developers including UUID/GUID generation, password generation, and code notes management.

## Features

### UUID/GUID Generation
- **Insert UUID** - Generate lowercase UUID with hyphens (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)
- **Insert GUID (Uppercase)** - Generate uppercase GUID with hyphens
- **Insert UUID (Compact)** - Generate UUID without hyphens
- **Insert GUID (Compact, Uppercase)** - Generate uppercase GUID without hyphens
- Supports multiple cursors - each cursor gets a unique UUID
- Selection replacement - replace selected text with generated UUIDs

### Password Generator
- Interactive webview panel with customizable options
- Configure length, character sets (uppercase, lowercase, numbers, special)
- Set minimum requirements for numbers and special characters
- Option to avoid ambiguous characters (0, O, l, 1, I, etc.)
- Copy to clipboard with one click

### Notes on Code
- Add notes to specific lines in any text file
- Notes persist across sessions and track line changes
- Categories: Note, TODO, FIXME, Question
- Status tracking: Open, In Progress, Resolved
- Side panel for editing notes with rich formatting
- Bottom panel table view with search, filter, and grouping
- Auto-show/hide panel based on cursor position
- File rename handling - notes follow renamed files
- Export/Import notes as JSON
- Storage: Workspace state with automatic file fallback

## Project Structure

```
src/
├── extension.ts          # Main extension entry point
├── extensionState.ts     # Shared state management
├── commands/
│   └── index.ts          # Command handlers
├── generators/
│   ├── index.ts
│   ├── password.ts       # Password generation logic
│   └── uuid.ts           # UUID/GUID generation logic
├── notes/
│   ├── types.ts          # Note interfaces and constants
│   ├── notesRepository.ts    # Storage layer
│   ├── notesService.ts       # Business logic
│   ├── notesLineTracker.ts   # Track line number changes
│   ├── notesFileTracker.ts   # Track file renames
│   ├── notesCursorTracker.ts # Auto-show/hide panel
│   ├── notesDecorations.ts   # Editor decorations
│   ├── notesWorkspaceTracker.ts  # Multi-workspace support
│   ├── notesExportService.ts     # Import/export
│   └── index.ts
├── utils/
│   ├── editor.ts         # Editor utilities
│   └── index.ts
├── webviews/
│   ├── icons.ts          # Lucide SVG icons
│   ├── passwordGenerator.ts  # Password generator webview
│   ├── notesPanel.ts         # Notes side panel
│   ├── notesTableProvider.ts # Notes bottom panel
│   └── index.ts
└── test/
    └── extension.test.ts # Test suite
```

## Setup

1. Install the recommended extensions:
   - `amodio.tsl-problem-matcher` - TypeScript problem matcher
   - `ms-vscode.extension-test-runner` - Test runner
   - `dbaeumer.vscode-eslint` - ESLint integration

2. Run `npm install` to install dependencies

## Development

### Get up and running

* Press `F5` to open a new window with your extension loaded
* Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and type:
  - `Developer Tools: Insert UUID`
  - `Developer Tools: Generate Password`
  - `Developer Tools: Add Note to Line`
* Set breakpoints in your code inside `src/extension.ts` to debug

### Make changes

* Relaunch the extension from the debug toolbar after code changes
* Or reload (`Ctrl+R` or `Cmd+R`) the VS Code window to load changes

### Build

```bash
npm run compile          # Build once
npm run watch            # Watch mode
npm run lint             # Run ESLint
npm run check-types      # TypeScript type checking
```

## Run Tests

```bash
npm test                 # Run all tests
```

Or use the VS Code Test Explorer:
1. Install the [Extension Test Runner](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner)
2. Run the "watch" task via **Tasks: Run Task**
3. Open the Testing view and click "Run Tests" or use `Ctrl/Cmd + ; A`

Test files are in `src/test/` and must match the pattern `**.test.ts`.

## Explore the API

Open `node_modules/@types/vscode/index.d.ts` to explore the full VS Code API.

## Go Further

* [Bundle your extension](https://code.visualstudio.com/api/working-with-extensions/bundling-extension) to reduce size and improve startup time
* [Publish your extension](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) on the VS Code Marketplace
* Set up [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration) for automated builds

## License

MIT
