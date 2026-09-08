# Change Log

All notable changes to the "Sync Scroll (Revived)" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

Entries are a historical record and are not rewritten after the fact. For the current state of the extension, see [README.md](./README.md), which is authoritative where the two disagree.

### [1.4.0]

First release of the maintained fork.

Fixed:
- Scroll desynchronization in NORMAL mode. The panels previously settled about 5 lines apart. They now line up in normal use, and the extension re-checks alignment once scrolling stops. That second pass does not cover every case; the residual situations are listed under Known Limitations in the README.
- Activation. Sync now takes effect as soon as a mode is selected, instead of requiring clicks across several panels first.

Removed:
- OFFSET mode. It was non-functional. NORMAL and OFF remain.
- The unused calibration system and the diagnostic logging added during investigation.

Changed:
- Renamed to Sync Scroll (Revived), version bumped to 1.4.0, and the repository repointed to this fork.
- General code cleanup.

Known limitations carried by this release are documented in the README rather than here.

### [1.3.2]

Inherited from the original extension, and undocumented there at the time.

- Add a Toggle Sync Scroll command, switching sync off or back on without going through the mode picker.

### [1.3.1]

- Simplified the on/off and mode interaction into one menu with three modes: NORMAL, OFFSET and OFF.
- By default mode is OFF.

### [1.3.0]

- Add command to jump to corresponding position in the next panel
- Add command to copy selections to all corresponding positions.
- Fix the issue of the output panel which shouldn't be involved in the scrolling sync.

### [1.2.0]

- Add corresponding line highlight feature.
- Fix offset issue when switching from OFFSET to NORMAL mode.

### [1.1.1]

- Persist the toggle state and mode
- Fix back and forth scroll issue in diff(selecting file to compare)/scm(viewing file changes) case.

### [1.1.0]

- Add sync mode to choose different ways to scroll.
- Get rid of the scrolling delay.
- Fix the issue that cannot toggle on/off when not focus on any editor.

### [1.0.0]

- Initial release of Sync Scroll
