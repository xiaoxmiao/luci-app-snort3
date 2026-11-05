# Changelog

All notable changes to the LuCI Snort3 Module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.2.3] - 2026-11-05

### Fixed
- **Snort no longer crash-loops on a fresh install.** The router log showed
  `ERROR: local.lua:1 ... cannot open ./local.lua: No such file or directory`
  followed by `Could not find requested DAQ module: pcap` and
  `procd: Instance snort::instance1 ... crash loop`. Both come from the
  OpenWrt `snort3` init script's manual mode, which always runs
  `snort -c <config_dir>/snort.lua --tweaks local`: the stock `snort.lua` ends
  with `include(tweaks .. '.lua')`, but the package does not ship `local.lua`,
  and manual mode skips the generated `daq.module_dirs = { '/usr/lib/daq/' }`.
  `manual` now defaults to `0` (the `snort-mgr` generated configuration, which
  sets the DAQ directory and loads the downloaded rules), and `snort-web-sync`
  falls back to it whenever `snort.lua` **or** `local.lua` is missing. Users who
  want manual mode must provide both files; the previous default silently
  produced a crash loop.
- **Start failures now quote the real fatal error.** procd sends the daemon's
  stderr to syslog, not to the init script. The rpcd backend and the
  `snort-web` reload now append the last `logread | grep -i snort` lines to the
  failure detail, so the Overview badge shows the Lua/DAQ error instead of a
  generic *Snort failed to start*.
- The Overview explains a manual mode that was requested but not active
  (`manual_fallback`) and a manual `local.lua` that lacks `daq.module_dirs`
  (`daq_dir_missing`); the status payload also reports `config_mode`.
- On upgrade, `/etc/uci-defaults/80_luci-app-snort3` repairs an empty
  `/etc/snort/rules` directory left by the `snort3` package when rules were
  already downloaded into `/var/snort.d/rules`.

### Changed
- Settings now recommend leaving Manual mode off; translation catalogs, POT and
  both LMO files rebuilt (154 strings).

## [4.2.2] - 2026-11-05

### Fixed
- **Save & Apply now actually starts Snort.** `/etc/init.d/snort-web reload`
  only restarted an already running daemon, so ticking *Enable Snort* in
  Settings had no visible effect. The reload now starts, restarts or stops the
  service to match `snort-web.snort.enabled`, waits for procd and records the
  outcome (`ok/started`, `ok/stopped` or `failed/start_failed` with a detail
  message) so the Overview badge can explain a failure.
- Register the ucitrack `config.change` trigger on install/upgrade
  (`/etc/init.d/ucitrack reload`). Without it a fresh install needed a reboot
  before Save & Apply reached the init script.
- **Fresh installs no longer crash-loop on manual mode.** The default
  `manual=1` requires `config_dir/snort.lua`, which does not exist on a new
  install; the snort3 init script launched `snort -c <missing file>` and the
  daemon exited immediately. `snort-web-sync` now falls back to the
  `snort-mgr` generated configuration in `/etc/config/snort` when the Lua file
  is absent, restoring manual mode automatically once the file appears.
  Backend diagnostics read the runtime `manual` value so they no longer report
  *snort.lua not found* after the fallback.
- The first-run migration no longer overwrites settings already saved in LuCI:
  a value is imported from `/etc/config/snort` only when `snort-web` lacks that
  option.
- Remove the redundant *Back to Overview* buttons from Settings and Alerts; the
  Overview tab is always present in the tab bar.

### Changed
- Settings descriptions explain the Save & Apply behaviour and the manual mode
  fallback; POT, translation catalogs and both LMO files rebuilt (152 strings).

## [4.2.1] - 2026-11-05

### Fixed
- Add an explicit **Overview** child to the LuCI menu. The theme renders only
  child nodes as tabs, so Settings and Alerts previously had no way back to the
  dashboard. Both pages now also carry a *Back to Overview* link.
- **Start** and **Restart** no longer report success when Snort did not start.
  The OpenWrt init script returns 0 with `enabled=0`; the backend now captures
  its output, waits for a stable process and reports the real reason
  (`service_disabled`, `config_missing`, `rules_missing`, `start_failed`).
- A stopped service now shows *why* it cannot start (disabled or missing
  `snort.lua`) instead of a silent "Stopped" badge.
- Remove the generic "Unknown error" dead end: every failed RPC includes a
  human-readable `message`, notifications show backend messages / raw error
  codes / RPC exception text, and unknown update codes are never swallowed.
- Launch the bundled updater through `/bin/sh` so a lost executable bit cannot
  disable rule updates; record its exit code for the legacy fallback updater,
  which does not write a status file.
- Detach the background updater from the RPC's stdout so the call returns
  immediately.

### Changed
- Translation catalogs, POT and `dist/lmo/*.lmo` rebuilt (153 strings).

## [4.2.0] - 2026-11-05

### Added
- Bundled free-rule updater `/usr/libexec/snort-web-rules-update`. It downloads
  the Snort 3 community ruleset (or the free registered snapshot when an
  oinkcode is configured), normalises all `*.rules` files into
  `$temp_dir/rules` and maintains the `/etc/snort/rules` symlink. The
  `snort3` package's `/usr/bin/snort-rules` is kept as a fallback.
- Three-state service status on the Overview page (running / stopped / error)
  with a translated reason, and a four-state rules update badge (idle / in
  progress / completed / failed) with the failure code and detailed log.
- `/tmp/snort_rules_update.status` and `/tmp/snort_service_action.status`
  persist the latest results across polls; an updater killed before reporting
  is shown as failed instead of a permanent "in progress".
- `-t` testing mode in the updater that generates synthetic rules offline.

### Changed
- **Update rules** no longer depends on the optional `/usr/bin/snort-rules`,
  and the built-in updater always uses `$temp_dir/rules`, removing the
  mismatch with the `snort3` package's version-specific rules directory.
- The "Rules updater not found" message no longer hard-codes the legacy path;
  the RPC returns the missing path and the notification shows it.
- Translation catalogs and `dist/lmo/*.lmo` rebuilt (148 strings).
- Version bumped to 4.2.0.

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
