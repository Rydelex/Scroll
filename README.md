# Sync Scroll (Revived)

Maintained fork of [Sync Scroll](https://github.com/dqisme/vscode-sync-scroll) that fixes the scroll desynchronization bug reported since 2022.

If you used the original Sync Scroll extension and noticed the panels were always off by a few lines, this fork fixes that.

## What's New in 1.4.0

- **Scroll desync fixed** - The original extension had a ~5 line offset between panels. This was caused by VS Code's `revealRange` API adding internal padding. The fix uses a post-scroll correction mechanism (100ms settle) that measures the actual gap and compensates automatically.
- **Activation bug fixed** - Sync now starts immediately. No more clicking on multiple panels before it works.
- **OFFSET mode removed** - This mode was broken and has been removed. Only NORMAL and OFF remain.
- **Code cleanup** - Removed dead code, unused calibration system, and diagnostic logs.

## How to Use

**Activate sync scrolling (pick one):**
- Click **Sync Scroll: OFF** in the bottom status bar, then select **NORMAL**
- Or open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search `Sync Scroll: Change Mode`

**Modes:**
- **NORMAL** - Both panels scroll to the same line
- **OFF** - Panels scroll independently (default)

**Right-click commands (when split panels are open):**
- **Jump to Next Panel Corresponding Position** - Moves your cursor to the same line in the other panel
- **Copy to All Corresponding Places** - Select text in one panel, right-click, and it replaces the text at the same position in the other panel(s)

## Getting Started

1. Open a file in split view: `Ctrl+\` (or `Cmd+\` on Mac)
2. Click **Sync Scroll: OFF** in the bottom status bar
3. Select **NORMAL** from the menu
4. Scroll in either panel. The other follows automatically.

> The default mode is **OFF**. To activate sync scrolling, either click the status bar indicator and select NORMAL, or open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for `Sync Scroll: Change Mode`.

![Sync scroll features](./feature.gif)

![Right click menu on the content of split panels](./screenshot-right-click-menu.png)

## Known Limitations

- Fast scrolling can drift by 1 line. It corrects automatically when you stop scrolling (within 100ms). This is a limitation of VS Code's `revealRange` API, not specific to this extension.

## Release Notes

### 1.4.0

Fixes:
- Fixed ~5 line scroll desynchronization in NORMAL mode.
- Fixed sync activation bug requiring multiple panel clicks before sync starts.

Changes:
- Removed OFFSET mode (non-functional).
- Removed dead calibration system.
- General code cleanup.

### Previous versions

See the [original extension](https://github.com/dqisme/vscode-sync-scroll) for release notes prior to 1.4.0.

## Credits & Contributing

Fork of [dqisme/vscode-sync-scroll](https://github.com/dqisme/vscode-sync-scroll) - MIT License.
Original author: [DQ](https://github.com/dqisme). Maintained by [Rydelex](https://github.com/Rydelex).

Issues and pull requests welcome on the [GitHub repository](https://github.com/Rydelex/Scroll).