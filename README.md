# Sync Scroll (Revived) — Visual Studio Code Extension

A Visual Studio Code extension that synchronizes scrolling between split panels.

## What's New in 1.4.0

This is a maintained fork of [dqisme/vscode-sync-scroll](https://github.com/dqisme/vscode-sync-scroll), with major fixes:

- **Fixed scroll desynchronization** — The original extension had a persistent ~5 line offset between panels, reported since 2022. Root cause: VS Code's `revealRange` API adds internal padding. Fix: a post-scroll correction mechanism that measures and compensates the actual gap.
- **Fixed activation bug** — Sync sometimes required clicking multiple panels before starting. Now activates immediately.
- **Removed OFFSET mode** — This mode was non-functional and has been removed. Only **NORMAL** and **OFF** modes remain.
- **Code cleanup** — Removed dead code, unused calibration system, and diagnostic artifacts.

## Features

**Two sync modes**, selectable from the status bar or the Command Palette:

- **NORMAL** — Both panels scroll to the same line (synchronized)
- **OFF** — Panels scroll independently (default)

**Additional tools** available via right-click in the editor:

- **Jump to Next Panel Corresponding Position** — Quickly navigate to the same line in the other panel.
- **Copy to All Corresponding Places** — Replace text at the corresponding position in other panels with your current selection.

**Highlight** — When you place your cursor on one side, the corresponding line is highlighted on the other side.

## Getting Started

1. **Open a file in split view**: `Ctrl+\` (or `Cmd+\` on Mac) to split the current editor
2. **Activate Sync Scroll**: Click the **Sync Scroll** indicator in the bottom status bar and select **NORMAL**
3. **Alternatively**, open the Command Palette (`Ctrl+Shift+P`) and search for `Sync Scroll: Change Mode`
4. Scroll in either panel — the other follows automatically

> **Note:** The default mode is **OFF**. You need to select NORMAL after installing the extension and opening split panels.

![Sync scroll features](./feature.gif)

![Right click menu on the content of split panels](./screenshot-right-click-menu.png)

## Release Notes

### 1.4.0

Fixes:

- Fixed ~5 line scroll desynchronization in NORMAL mode. Root cause: VS Code's `revealRange(AtTop)` adds internal padding (~5 lines). Fix: post-scroll "settle" mechanism (100ms) that measures actual gap and corrects via compensated `revealRange`.
- Fixed sync activation bug requiring multiple panel clicks before sync starts. Root cause: `scrolledEditorsQueue` retained stale entries after settle correction, silently dropping subsequent user scroll events.

Changes:

- Removed OFFSET mode (unused, non-functional). Only NORMAL and OFF modes remain.
- Removed dead calibration system (calibrationOffset always measured 0, superseded by settle correction).
- General code cleanup: removed diagnostic logs, dead code, and unused branches.

### 1.3.1

Enhancement:

- Simplified the on/off and mode interaction into one menu with two modes: NORMAL and OFF.
- By default mode is OFF.

### 1.3.0

Add features:

- Add command to jump to corresponding position in the next panel
- Add command to copy selections to all corresponding positions.

Enhancement:

- Fix the issue of the output panel which shouldn't be involved in the scrolling sync.

### 1.2.0

Add features:

- Add corresponding line highlight feature.

Enhancement:

- Fix back and forth scroll issue in diff(selecting file to compare)/scm(viewing file changes) case.

### 1.1.1

Enhancement:

- Persist the toggle state and mode
- Fix back and forth scroll issue in diff(selecting file to compare)/scm(viewing file changes) case.

### 1.1.0

Add features:

- Now you can choose a sync mode when it turns on:
  - NORMAL - aligned by the top of the view range.

Enhancement:

- Get rid of the scrolling delay.
- Fix the issue that cannot toggle on/off when not focus on any editor.
  
### 1.0.0

Initial release of Sync Scroll with features:

* Can set all the split panels into scroll synchronized mode.

-----------------------------------------------------------------------------------------------------------

## How to Contribute

This extension is created by VSCode Extension Template (TypeScript) by [Yeoman](https://vscode.readthedocs.io/en/latest/extensions/yocode/).

Basically, you can work with this extension source code as a normal typescript project.

-----------------------------------------------------------------------------------------------------------
## Credits & Contributing

Fork of [dqisme/vscode-sync-scroll](https://github.com/dqisme/vscode-sync-scroll) — MIT License.
Original author: [DQ](https://github.com/dqisme). Maintained by [Rydelex](https://github.com/Rydelex).

Issues and pull requests welcome on the [GitHub repository](https://github.com/Rydelex/Scroll).
