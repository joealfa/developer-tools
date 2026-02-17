# Change Log

All notable changes to the "developer-tools" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.0.3] - 2026-02-17

### Changed
- **SVG Icons in Dropdowns** - Replaced emoji icons with Lucide SVG icons in Notes category and status filter dropdowns
- **SVG Gutter Icons** - Gutter decorations now use Lucide SVG icons instead of colored circles
- **Category Labels** - Updated category display names: TODO → ToDo, FIXME → FixMe

### Removed
- **Legacy Notes Panel** - Removed the unused `NotesPanel` webview (~900 lines), fully replaced by Note Editor + Notes Table since v1.0.1

### Fixed
- **Code Cleanup** - Deduplicated `escapeHtml()` and `getRelativePath()` utilities across webview providers and notes trackers
- **Unused Code** - Removed unused `clearDecorations()` method and unused command handler parameters
- **Category Label in Delete** - Delete note quick pick now shows proper category labels instead of uppercase keys

## [1.0.2] - 2026-01-28

### Added
- **Click-to-Navigate in Notes Table** - Single-click a note row to open the file and jump to the line where the note was created
- **Double-Click to Edit Note** - Double-click a note row to navigate to the line and open the Note Editor sidebar
- **Absolute Path Support** - Notes attached to files outside the workspace now navigate correctly

### Fixed
- **Note Editor not focusing** - The Note Editor sidebar now properly reveals and focuses when using "Add Note" from the context menu, even on first use
- **Note Editor form not hiding** - The add-note form now hides when focus returns to the code editor
- **Password generator security** - Replaced `Math.random()` with cryptographic RNG (`crypto.randomBytes`) for required character selection and position placement; eliminated modulo bias in character sampling using rejection sampling
- **Line tracker hash mismatch** - `NotesLineTracker` now uses the same MD5 hash as `NotesService` for content comparison, preventing notes from being incorrectly orphaned on edits
- **Crash on stale line numbers** - Added boundary checks in Note Editor and Notes Panel to prevent `lineAt` exceptions when lines are deleted while the editor is open
- **Folder rename path corruption** - Fixed `String.replace` to use prefix-anchored replacement, preventing path corruption when the folder name appears elsewhere in the path
- **XSS in password display** - Added HTML escaping for password rendering to prevent injection via special characters like `&`
- **Unused code cleanup** - Removed dead `updates` variable in `NotesService.updateFilePath` and unused `path` import in `NotesFileTracker`

## [1.0.1] - 2026-01-27

### Added
- **Activity Bar Integration** - Developer Tools now appears in the VS Code Activity Bar with a dedicated sidebar
- **Sidebar Password Generator** - Password generator now lives in the sidebar for quick access without opening a separate panel
- **Inline Note Editor** - Edit notes directly in the sidebar when clicking on lines with notes
- **Collapsible Note Editor View** - Note editor view starts collapsed and expands when editing notes

### Changed
- **UI Layout Overhaul** - Consolidated all tools into a single Activity Bar container
- **Notes Table** - Redesigned notes table with cleaner row-based layout instead of traditional table format
- **Password Generator Panel** - Migrated from a separate webview panel to an embedded sidebar view
- **Code Architecture** - Refactored webview providers for better modularity and maintainability

### Fixed
- Fixed invalid `auxiliaryBar` contribution point that caused schema validation warnings

## [1.0.0] - 2026-01-20

### Added
- First stable release
- [Available on VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=joealfa.developer-utilities)

## [0.0.2]

### Added
- **Code Notes Feature**:
  - Add persistent notes to specific lines in code files
  - Categories: Note, TODO, FIXME, Question with color-coded icons
  - Automatic line tracking when code is edited
  - File rename/delete tracking
  - Orphaned note detection and re-anchoring
  - Bottom panel with searchable notes table
  - Import/Export functionality
  - Gutter decorations for lines with notes

## [0.0.1]

### Added
- Initial release
- UUID/GUID generation (standard and compact formats)
- Multiple cursor and selection support
- Password generator with customizable options