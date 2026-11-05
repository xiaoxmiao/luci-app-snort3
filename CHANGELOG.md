# Changelog

All notable changes to the LuCI Snort3 Module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.1.1] - 2026-11-05

### Fixed
- LuCI 26.x (`luci.js` with the class-based module loader) refused to load
  `snort.style`, `snort.api` and `snort.util` with
  `TypeError: "<name>" factory yields invalid constructor` because the helper
  modules still returned plain objects/strings. All three modules now export a
  `baseclass` subclass via `'require baseclass'` + `baseclass.extend()`, which
  stays compatible with the classic loader of LuCI 24.10 and older.
- The stylesheet is exported as `snort.style.css`; `overview` and `alerts`
  render it with `E('style', {}, [ style.css ])`.
- The Node unit tests keep loading `snort/util.js` through `module.exports`.

## [4.1.0] - 2026-11-05

### Added
- Simplified Chinese (`zh_Hans` / `zh-cn`) translation catalog and prebuilt
  `dist/lmo/snort.zh-cn.lmo`.
- APK build workflow using an OpenWrt 25.12.x SDK, with configurable SDK
  version and target.
- `/usr/libexec/snort-web-sync` to synchronise application settings to the
  `/etc/config/snort` file read by `snort3`.
- `/etc/init.d/snort-web` boot-time sync (`START=98`) and a ucitrack trigger
  that applies settings and restarts Snort after **Save & Apply**.
- One-time migration of existing `/etc/config/snort` values into the new
  application configuration.

### Changed
- Application settings are now stored in `/etc/config/snort-web` instead of
  writing directly to the `snort3`-owned `/etc/config/snort`.
- The menu, ACL and rpcd backend use the `snort-web` UCI package; service and
  rules actions synchronise the runtime configuration first.
- The package declares `/etc/config/snort-web` as a conffile and enables the
  sync init script in its post-install script.
- Documentation now covers APK/IPK builds, the configuration synchronisation
  model, Simplified Chinese, and manual recovery steps.

### Fixed
- Settings no longer conflict with the `snort3` package's configuration file
  during firmware builds.

## [4.0.0] - 2026-11-04

### Added
- Complete JavaScript LuCI frontend: Overview, Settings and Alerts pages.
- `luci.snort` rpcd/ucode backend with `status`, `service`, `alerts`, `rules`,
  `rules_update`, `rules_fix` and `rules_cleanup` methods.
- UCI settings form covering service, logging, rules, OpenAppID and NFQ.
- Allow-listed service actions, path sanitization and an ACL limited to the
  Snort ubus object and the `snort` UCI package.
- Direct router installer that preserves `/etc/config/snort`, removes old Lua
  files, installs the prebuilt French catalog and refreshes rpcd.
- Standard `luci.mk` package definition and translation package support.
- Node test suite for pure helpers and the LMO compiler.
- `po2lmo` reimplementation, translation template and i18n consistency checker.
- Prebuilt `dist/lmo/snort.fr.lmo` for installations without `po2lmo`.
- Verification script for files, dependencies and the `luci.snort` ubus object.

### Changed
- Migrated the frontend from Lua CBI/templates to JavaScript views.
- Rules management is now integrated into the Overview page with update log,
  link repair and cleanup controls.
- Translations use the LuCI `snort` domain and are loaded from
  `/usr/lib/lua/luci/i18n/snort.fr.lmo`.
- The legacy Lua implementation, original installer and documentation moved to
  `legacy/lua-v3/`.

### Removed
- Lua controller, CBI model and template files from the installed package.
- The generated Lua-era installer and the old top-level project structure.

### Fixed
- Correct handling of broken rules symlinks, missing rules directories and
  concurrent rules updates.
- Alert and log reads are bounded and newest-first.
- Status detection handles multiple Snort PIDs and missing `/proc` entries.

## [3.6.0] - 2025-11-03

### Added
- Complete English translation for installation script
- Comprehensive installation script with detailed progress tracking
- Color-coded output for better readability
- Installation verification with component checking
- Detailed post-installation summary with file listings
- Component descriptions in installation output
- Error tracking and reporting
- Installation log file generation
- Support for OpenWrt version detection
- Modular source file structure for GitHub
- Complete documentation (Installation and Usage guides)
- README with bilingual support (English/French)
- GPL v2 License (compatible with OpenWrt/LuCI)
- Changelog file
- Author information (David Dzieciol)

### Changed
- Converted all echo messages from French to English
- Improved installation script structure with step tracking
- Enhanced error handling and verification
- Reorganized file structure for GitHub distribution
- Better separation of concerns (source files vs installation script)

### Improved
- Installation feedback with success/warning/error indicators
- Post-installation instructions clarity
- Troubleshooting information
- Access information presentation
- Component description accuracy

### Fixed
- Translation compilation warnings handling
- Directory creation verification
- File existence checks
- Cache clearing process
- Service restart reliability

## [3.5.0] - 2024

### Added
- Rules update monitoring with progress tracking
- Background rules update process
- Temporary file cleanup functionality
- Update status checking endpoint
- Lock file mechanism to prevent concurrent updates

### Changed
- Improved rules update workflow
- Better handling of temporary archives

### Fixed
- Rules update not completing properly
- Temporary files accumulation
- Concurrent update issues

## [3.4.0] - 2024

### Added
- Symbolic link management for rules
- Fix rules functionality
- Directory existence checking

### Changed
- Rules directory handling

### Fixed
- Rules not found after update
- Symbolic link creation errors

## [3.3.0] - 2024

### Added
- Real-time status dashboard with auto-refresh
- JSON API for status retrieval
- Memory usage monitoring
- Alert counting
- Recent alerts widget

### Changed
- Status page now updates every 5 seconds
- Improved UI responsiveness

### Fixed
- Status not updating in real-time
- Memory usage display issues

## [3.2.0] - 2024

### Added
- Full bilingual support (French/English)
- Translation files (.po format)
- Compiled translations (.lmo format)
- Translation compilation in installation script

### Changed
- All interface strings now translatable
- Language selection support

## [3.1.0] - 2024

### Added
- Alerts page with last 50 alerts
- System logs integration
- Log viewing functionality
- Refresh button for alerts

### Changed
- Alert display format
- Log filtering

### Fixed
- Empty alerts handling
- Log file permissions

## [3.0.0] - 2024

### Added
- Complete LuCI web interface
- Service control buttons (Start/Stop/Restart)
- Auto-start management (Enable/Disable at boot)
- Configuration interface with UCI integration
- Network interface selection
- Operating mode selection (IDS/IPS)
- DAQ method configuration
- Alert configuration options
- Home network configuration
- Performance tuning options
- Port configuration
- Directory management

### Changed
- Moved from command-line only to full web interface
- Configuration now via LuCI instead of editing files

## [2.0.0] - 2024

### Added
- UCI configuration support
- Init script for service management
- Basic configuration options

### Changed
- Configuration method from direct file editing to UCI

## [1.0.0] - 2024

### Added
- Initial release
- Basic Snort3 integration with OpenWrt
- Manual configuration support

---

## [0.5.0] - Early 2025 (Legacy CGI Version)

### Added
- Initial web interface as CGI script
- Basic service controls (start/stop/restart)
- Real-time status monitoring
- Alert viewing (last 20 alerts)
- System information display
- Rules update functionality
- Memory usage monitoring
- Auto-refresh capability

### Characteristics
- Lightweight CGI shell script
- French interface only
- Standalone (no LuCI integration)
- Basic functionality
- Manual configuration required

### Why It Was Created
- No existing web interface for Snort3 on OpenWrt
- Command-line management was too complex for most users
- Need for accessible security monitoring
- **Personal need**: Managing Snort3 on my own router
- **Learning experience**: Understanding CGI and OpenWrt development
- **Served as useful temporary solution** while developing full LuCI integration

### Limitations (Why LuCI Module Was Preferred)
- No proper LuCI integration
- Separate from OpenWrt's main interface
- No configuration interface
- French only
- Limited features
- Security concerns with basic CGI
- **Goal was always to have proper OpenWrt/LuCI integration**

### 📝 Project Origin Note

This project started as a **personal solution** to manage Snort3 on my own OpenWrt router, combined with a desire to **learn LuCI development**. The CGI version was quick and functional for personal use, but I wanted to do it properly with full LuCI integration.

It's shared with the community in case others find it useful, but was never intended as a long-term commercial project. Bug fixes may be provided, but extensive future development is not planned.

### Note
This version is kept in `legacy/v0-cgi-interface/` for historical reference.  
See v3.0+ for the full LuCI module (preferred solution).

---

## Version Numbering

- Major version (X.0.0): Breaking changes, major new features
- Minor version (0.X.0): New features, backwards compatible
- Patch version (0.0.X): Bug fixes, minor improvements

## Categories

- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security fixes or improvements

## Roadmap

### Under Consideration
- Multi-interface monitoring support
- Advanced filtering rules in the UI
- Alert email notifications
- Integration with external SIEM systems
- Scheduled rules updates
- Performance metrics dashboard
- Automated backup and restore

---

**Current Version:** 4.0.0  
**Release Date:** November 4, 2026  
**Status:** Stable
