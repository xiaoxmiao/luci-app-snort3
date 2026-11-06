# Changelog

All notable changes to the LuCI Snort3 Module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **The package is now discoverable in a full OpenWrt buildroot.** `Makefile`
  no longer hard-codes `include ../../luci.mk`: it resolves `luci.mk` from the
  LuCI feed root when the checkout sits in `package/`, and warns with
  actionable instructions when the feed is missing instead of aborting the
  `DUMP=1` index scan (which made the package vanish from `make menuconfig`).
  `LUCI_NAME`, `LUCI_URL` and `LUCI_MAINTAINER` are pinned so a renamed clone
  still produces `luci-app-snort3` and the six `luci-i18n-snort3-*`
  translation packages.

### Added
- `docs/INSTALLATION.md` section 2.3 documents both supported placements in a
  full buildroot (`package/...` as the recommended layout, or
  `feeds/luci/applications/...` with `feeds update -i` plus `feeds install -p
  luci`) and a troubleshooting table for menuconfig. README carries the same
  note in English, French and Chinese.
- The APK workflow now builds from `package/luci-app-snort3`, the same layout a
  user gets after cloning into a source tree, and asserts that `make defconfig`
  keeps `CONFIG_PACKAGE_luci-app-snort3=y` in `.config`. This catches any
  regression that would hide the package from menuconfig.

## [1.0.0] - 2026-11-06

This is the first release of the `main` line. The complete 4.x beta history and
the pre-1.0 Lua/CGI implementations are preserved in the `legacy-and-beta` git
tag; the `master` branch is frozen at 4.4.5.

### Changed
- **Version baseline reset to 1.0.0.** `Makefile` and `package.json` now carry
  `1.0.0`; the APK filename changes accordingly.
- **APK is the only installation method.** Removed `install.sh`, `verify.sh`,
  `PROJECT_STRUCTURE.txt`, the entire `legacy/` tree and all archived APK
  builds. README (English, French, Chinese), `docs/INSTALLATION.md` and
  `CONTRIBUTING.md` no longer mention the shell installer, manual file-copy
  installation, IPK/opkg builds or OpenWrt 24.10 and older. Minimum supported
  release is OpenWrt 25.12+ with `apk`.
- **Six translation packages.** Added German (`de`), Spanish (`es`), Russian
  (`ru`) and Brazilian Portuguese (`pt_BR`) catalogs alongside the existing
  French and Simplified Chinese ones. Each contains all 165 UI strings; English
  remains the source language and is therefore not packaged separately.
  `build:lmo` produces six `.lmo` files and the GitHub Actions workflow enables
  and verifies all six `CONFIG_LUCI_LANG_*` switches.
- **README is now a true trilingual document.** English, French and Chinese
  share the same twelve sections; the outdated single "Mettre a jour les
  regles" / "update rules" wording and the contradictory claim that rules are
  always persistent were removed, along with beta-era version numbers. Credit
  is explicit in all three languages: David Dzieciol is the original upstream
  author, xiaoxmiao is the maintainer, and `PKG_MAINTAINER` follows. The GPL
  copyright line in `LICENSE` is unchanged.

## [4.4.5] - 2026-11-06

### Fixed
- **An empty alert list no longer claims the network is secure while Snort is
  stopped.** Both the Overview recent-alerts box and the Alerts page rendered
  the green `snort3-empty` state ("No recent alerts - Your network is secure" /
  "No alerts recorded") whenever the alert files were empty, even with no
  daemon running and no system logs. The Overview now passes its existing
  `status` reply into the alert renderer, and the Alerts page fetches `status`
  alongside `alerts`. When `service_state` is not `running`, both show an amber
  warning ("Snort is not running - alerts are not available" / "no system logs
  are available"), the Alerts summary shows the actual service state and its
  count badge turns amber. The green "secure" message is only used while the
  daemon is actually inspecting traffic.

## [4.4.4] - 2026-11-06

### Fixed
- **Both rule buttons could stay disabled after an update, even with an empty
  Oinkcode field.** `update_state()` still let a `/proc` match (plus a non-empty
  log) set `running`, and `FINISHED` was looked for in only the last 20 log
  lines - busybox wget progress and one line per rule file easily pushed it out
  of that window. The lock is now the *only* running signal (created before the
  background chain, removed as its last step); the process scan only expires a
  dead updater's lock, and `FINISHED` is scanned over 200 lines while the UI
  still shows 20. A rejected request such as `oinkcode_missing` now re-enables
  both buttons and shows a translated hint. The community button never needed
  an Oinkcode - it was disabled solely by the bogus `running` state.
- **Subscriber rules made Snort restart every few dozen seconds.** The updater
  flat-copied every `*.rules` from the unpacked snapshot, including
  `so_rules/` and `preproc_rules/` SO-rule stubs that need matching `.so`
  objects. Mixed into the top-level `rules/` directory they were all loaded by
  `snort-mgr`'s `include *.rules`, so snort exited and procd respawned it; the
  community archive has a single rules file and was unaffected. Only the
  snapshot's top-level `rules/` directory is installed now (the community
  archive's single directory is still found automatically), and rule lines
  carrying `soid:` / `so:eval` are stripped while all text rules are kept.

## [4.4.3] - 2026-11-06

### Fixed
- **Fresh installs no longer lose the rule buttons or claim an update is
  running.** `update_state()` computed
  `!finished && (lock || alive) && !stale`; a reset device has no lock, no
  update log and no `FINISHED` marker, so any `/proc` entry whose command line
  merely mentions the updater (the `ifup` hotplug wrapper chain, for example)
  made `running` true forever and disabled both rule buttons. The lock created
  by `rules_update` is authoritative again; `alive` only counts as a fallback
  when the log proves an actual download is in progress (the boot-time top-up
  has no lock). `FINISHED` still ends a run.
- **The rules storage layout is now actually migrated.** The 4.4.1 rewrite
  removed the definitions of `rules` / `tmp_rules` from
  `/etc/uci-defaults/80_luci-app-snort3` while the migration block still used
  them. Empty strings made every `[ -d ... ]` test fail silently, so the stock
  `/etc/snort/rules` real directory survived and the page reported *Storage
  layout will change on the next update* with zero rule files. The paths are
  defined again and the postinst replays the uci-defaults script on upgrade,
  instead of waiting for the next reboot.

## [4.4.2] - 2026-11-06

### Fixed
- **Update status no longer stays on "Update in progress..." after the update
  finished.** The background chain appends `FINISHED` as its last action and
  the RPC truncates the log before each run, so that marker reliably belongs
  to the current run. But `update_state()` computed
  `running = (lock || alive) && !stale`, ignoring it: any `/proc` entry whose
  command line still mentioned `snort-rules` / `snort-web-rules-update` kept
  the badge stuck at "running" even after all rule files were installed and
  Snort was restarted. `FINISHED` now wins: `!finished && (lock || alive) &&
  !stale`.

### Changed
- Removed the **Cleanup temporary files** button (and its unused frontend RPC
  declaration) from the Overview page. Temporary download directories are
  already removed by the updater's exit trap and the background chain.
- **Use community rules** now uses the same `cbi-button-reset` styling as the
  removed cleanup button, signalling that it replaces the installed rules.

## [4.4.1] - 2026-11-06

### Fixed
- **Storage badge now follows the setting.** It reported "persistent" based on
  the on-disk directory type, so a 4.3.x real directory kept claiming the rules
  were persistent even with `rules_persist=0`. `rules` now returns
  `persistent` from the setting plus `storage_actual` / `storage_mismatch`, and
  uci-defaults converts a leftover real directory into a tmpfs symlink (with a
  backup) when persistence is off.
- **"Update completed!" during a live download.** A stale status file, an old
  `FINISHED` line or an mtime/clock mismatch could make `running` false while
  the lock was still present. The lock (or a live updater process) is now
  authoritative; `status` also exposes `result_raw` for diagnosis.
- **Rule source described what was installed, not what was requested.** It was
  inferred from the saved Oinkcode, so choosing "Update subscriber rules"
  immediately labelled the still-installed community rules as subscriber
  rules. The updater now writes a `.source` marker inside the rules directory
  that is atomically replaced together with the rules.
- **Alerts page still mentioned `/var/log/alert_fast.txt`.** The backend now
  returns `alert_files`, but the view fell back to that hardcoded path when
  `alert_file` was missing. It now lists the real JSON files, formats JSON
  alerts with the shared `Util.formatAlert()`, and states that system logs come
  from `logread`, not from a file. The obsolete "Fast alerts" entry is gone.

## [4.4.0] - 2026-11-06

### Fixed
- **Alerts now actually appear.** The generated `snort.lua` enables
  `alert_json`, which writes `alert_json.txt` plus one `N_alert_json.txt` per
  packet thread. The backend still looked for the obsolete `alert_fast.txt`,
  so the alert count was always zero. It now reads all of those files, keeps
  `alert_fast.txt` as a compatibility fallback, and the view formats JSON
  alerts into timestamp / action / message / source -> destination / sid.

### Changed
- **Rule source is chosen on the Overview page.** The single *Update rules*
  button is replaced with an Oinkcode field, **Update subscriber rules** and
  **Use community rules**. The latter forces the free community ruleset and
  replaces the previously installed rules, while the saved Oinkcode is kept
  for later use. The Oinkcode field was removed from Settings.
- **Rule persistence is a setting, defaulting to off.** When off, rules live
  in tmpfs with the usual symlink; when on, they stay in `/etc/snort/rules`.
  The updater supports both layouts, `--community` and `--fallback`.
- **Scheduled updates.** Settings gained *Automatic rule updates* with an
  interval of 1 day / 1 week / 1 month. `snort-web-schedule` writes the
  crontab entry and restarts cron. OpenWrt has no standalone `cron` package
  (crond is part of the essential busybox package), so the helper detects its
  absence at runtime and logs a warning instead of adding a broken dependency.
- **Boot-time top-up.** With persistence off, an `ifup` hotplug script runs
  once per boot (`/tmp` marker) to download rules. `--fallback` installs the
  packaged `builtin_rules` (or a minimal ICMP rule) when the device has no
  Internet, so Snort can still start with a non-empty rules directory.
- Translations, docs, tests and version updated.

## [4.3.4] - 2026-11-06

### Fixed
- **Tab menu.** The parent `admin/services/snort` entry was declared as a
  `view`, so visiting it rendered the Overview without any child tab being
  marked active. It now uses LuCI's standard
  `firstchild` / `preferred: overview` action (the same pattern as
  `admin/status` and `admin/network`).
- **Update status was wrong in two ways.** The result file in `/tmp` is
  persistent, so a previous success kept showing *Update completed!* forever
  even when no update had been requested. And while a new download was
  starting, that stale `ok` could win over the live lock, so the page claimed
  the update had finished while it was still running. A live lock now always
  forces `running`, and a completed/failed result returns to `idle` after five
  minutes. `status` also exposes `finished_at` and `status_age`.

### Added
- **Concrete rule information.** `rules` now returns `rule_files` (name, size,
  mtime), `rules_source` (community or registered) and `rules_updated`; the
  Overview lists every installed `.rules` file with its size, the source and
  the last update time. The updater log also prints each installed file name
  and byte count instead of only a total.

## [4.3.3] - 2026-11-06

### Fixed
- **A running `snort3` daemon is now reliably detected.** The device confirmed
  a live process (`{snort3} /usr/bin/snort -q -c /var/snort.d/snort_conf.lua`)
  while 4.3.1 reported `running: false`, so the anchored regex
  `/^snort[0-9]*$/` was not the reliable check it appeared to be on that ucode
  build. Detection now uses plain string searches on `/proc/<pid>/comm` and
  `cmdline` (no regex on comm), with `rc.common` wrappers still excluded.
- **`pidof snort3 snort` fallback.** If rpcd cannot enumerate `/proc` at all,
  the backend falls back to `pidof` for both process names. `proc_scan()` and
  `process_id_list()` now share a single scan, so the diagnostic output and the
  running state can never disagree. `proc_scan` also reports `daemon`,
  `wrapper` and `named` flags per process.

## [4.3.2] - 2026-11-06

### Fixed
- **Upgrading now really reloads the backend.** OpenWrt's `rpcd.init`
  implements `reload_service()` as `procd_send_signal rpcd`, which does not
  re-fork the long-lived ucode plugin processes. The postinst script used
  `rpcd reload`, so after installing a new APK the file on disk was updated
  but rpcd kept executing the previous `luci.snort.uc`. It now uses
  `rpcd restart` (as `install.sh` always did).

### Added
- **`proc_scan` diagnostic in `status`.** Lists up to ten snort-related
  processes found in `/proc` with `pid`, `comm`, and `daemon`/`wrapper`
  flags, so a `running: false` result can be distinguished between "no
  daemon exists" and "daemon present but not recognised" without SSH access.
- Process matching is now any comm containing `snort` (case-insensitive) or
  a `/usr/bin/snort` command line, while still excluding the `rc.common`
  init-script wrapper.

## [4.3.1] - 2026-11-06

### Fixed
- **Running Snort is now detected correctly.** On many builds the daemon is
  `/usr/bin/snort` but `/proc/<pid>/comm` is `snort3` (busybox `ps` shows
  `{snort3} /usr/bin/snort -q -c /var/snort.d/snort_conf.lua`). The backend
  only accepted a comm value of exactly `snort`, so the Overview page kept
  reporting *Snort failed to start / no snort process is running* with
  `PID N/A` even while the daemon was running and `/etc/init.d/snort status`
  said `running`. `process_id_list()` now accepts any `snort<digits>` comm or
  a `/usr/bin/snort` command line, while explicitly excluding procd's
  `rc.common` init-script wrapper (which is also named `snort`).
- **Automatic restarts after Save & Apply and rule updates work again.** Both
  used `pidof snort`, which never matches `snort3`; the `snort-web` init
  script now uses a `snort_running()` helper and the rules updater checks
  both names.
- Syslog filtering accepts both `snort[pid]` and `snort3[pid]` tags, and
  `status` exposes the detected `proc_comm` for future diagnostics.

## [4.3.0] - 2026-11-06

### Fixed
- **Overview page no longer shows empty N/A values and dead buttons.** An
  uncaught ucode exception in `get_settings()` made `status`, `rules` and
  `alerts` fail with `Command failed: Unknown error`. The `\x00-\x1f` regex
  escape in `safe_path()` was the cause on older ucode builds; it has been
  replaced with a version-independent absolute-path check. Every RPC method is
  now wrapped so a thrown exception returns `backend_error` with the method
  name and message (also saved to `/tmp/snort_backend_error.log`), and the
  Overview page shows it as a notification.

### Changed
- **Rules are persistent.** Downloaded rules are installed into the real
  `/etc/snort/rules` directory instead of a symlink into tmpfs, so they
  survive reboots and `snort3` package upgrades. Upgrades migrate rules out
  of an existing symlink; the Overview "Migrate" action does the same on
  demand. A successful update restarts Snort because `snort-mgr` enumerates
  `*.rules` at render time.
- **Only the generated configuration is supported.** Manual mode (`manual=1`,
  snort3's legacy `--tweaks local` path that requires an absent `local.lua`)
  and both user Lua include fields were removed. `/etc/config/snort` is always
  written with `manual=0`.
- **Only the bundled rules updater is used.** The fallback to the snort3
  package's `/usr/bin/snort-rules` was removed because that script replaces
  `/etc/snort/rules` with a tmpfs symlink.
- **Network interface is a LuCI device dropdown.** It lists devices from
  `network.getDevices()` with their logical interface names as labels. The
  default `auto` resolves at sync time to the WAN device, then the LAN bridge,
  then `eth0`, then the first non-loopback device.
- Translations, documentation and tests updated.

## [4.2.4] - 2026-11-05

### Fixed
- **Upgrades no longer look like they still fail with `local.lua`.** Devices
  coming from 4.2.2/4.2.3 kept `snort-web.snort.manual=1`, so every Save &
  Apply copied it into `/etc/config/snort`, immediately reverted it, and logged
  `manual mode is not ready (snort.lua/local.lua missing ...)` again. That
  notice describes an automatic fallback, not an error, but it appeared on
  every sync and named both files even when only `local.lua` was missing. The
  uci-defaults hook now normalises the stale setting to `manual=0` once, the
  sync helper computes the effective value instead of flip-flopping it, and
  the notice names the exact missing file and states that no action is needed.
- **Start failures no longer quote old syslog lines.** `logread` retains the
  `cannot open ./local.lua` / `DAQ module: pcap` crashes from before the fix
  for a long time. Both the rpcd backend and the `snort-web` reload now write a
  `snort-service-begin` marker before starting and only use daemon/procd lines
  written after it; informational `snort-web-sync` notices are filtered out.
  If no new error exists, the detail says so instead of blaming a previous run.
- `config_missing` and `manual_fallback` hints are now worded as explanations
  of the generated configuration rather than missing-file errors.

### Changed
- Translation catalogs, POT and both LMO files rebuilt (154 strings).

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
