# Change Log

All notable changes to the "developer-tools" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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