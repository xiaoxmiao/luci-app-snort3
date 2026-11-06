'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(relative) {
	return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function parseUci(text) {
	const sections = {};
	let current = null;

	for (const line of text.split(/\r?\n/)) {
		let match = line.match(/^\s*config\s+(\S+)\s+'([^']+)'/);

		if (match) {
			current = { type: match[1], name: match[2], options: {} };
			sections[match[2]] = current;
			continue;
		}

		match = line.match(/^\s*option\s+(\S+)\s+'([^']*)'/);

		if (match && current)
			current.options[match[1]] = match[2];
	}

	return sections;
}

test('the default snort-web configuration matches the sync helper', () => {
	const sections = parseUci(read('root/etc/config/snort-web'));
	const helper = read('root/usr/libexec/snort-web-sync');
	const snortOptions = helper.match(/^SNORT_OPTIONS="([^"]+)"/m);
	const nfqOptions = helper.match(/^NFQ_OPTIONS="([^"]+)"/m);

	assert.ok(snortOptions, 'SNORT_OPTIONS is defined');
	assert.ok(nfqOptions, 'NFQ_OPTIONS is defined');

	/* manual is forced to 0 and interface is resolved from "auto" by the
	 * helper instead of being copied verbatim, so both stay in the UCI file
	 * but not in SNORT_OPTIONS. */
	/* manual/interface are handled specially and rule storage/scheduling
	 * options belong to the application only; none are copied verbatim. */
	assert.deepEqual(Object.keys(sections.snort.options).sort(),
		snortOptions[1].split(/\s+/).concat([
			'manual', 'interface', 'rules_persist',
			'rules_auto_update', 'rules_update_interval'
		]).sort());
	assert.deepEqual(Object.keys(sections.nfq.options).sort(),
		nfqOptions[1].split(/\s+/).sort());
	assert.equal(sections.internal.options.migrated, '0');
});

test('menu, ACL and ucitrack all target the snort-web configuration', () => {
	const menu = JSON.parse(read('root/usr/share/luci/menu.d/luci-app-snort3.json'));
	const acl = JSON.parse(read('root/usr/share/rpcd/acl.d/luci-app-snort3.json'));
	const ucitrack = JSON.parse(read('root/usr/share/ucitrack/luci-app-snort3.json'));

	for (const entry of Object.values(menu))
		assert.deepEqual(entry.depends.uci, { 'snort-web': true });

	assert.deepEqual(acl['luci-app-snort3'].read.uci, [ 'snort-web', 'network' ]);
	assert.deepEqual(acl['luci-app-snort3'].write.uci, [ 'snort-web' ]);
	assert.deepEqual(ucitrack, { config: 'snort-web', init: 'snort-web' });
});

test('legacy manual mode and user Lua includes are removed', () => {
	const config = parseUci(read('root/etc/config/snort-web'));
	const view = read('htdocs/luci-static/resources/view/snort/config.js');
	const helper = read('root/usr/libexec/snort-web-sync');
	const backend = read('root/usr/share/rpcd/ucode/luci.snort.uc');

	assert.equal(config.snort.options.manual, '0');
	assert.equal(config.snort.options.interface, 'auto');
	assert.equal(config.snort.options.include, undefined);
	assert.doesNotMatch(view, /form\.Flag, 'manual'/);
	assert.doesNotMatch(view, /User configuration include|NFQ rules include/);
	assert.doesNotMatch(view, /local\.lua/);
	assert.doesNotMatch(backend, /RULES_UPDATER_LEGACY|runtime_manual|needs_manual_config/);
	assert.match(helper, /manual=0/);
	assert.doesNotMatch(helper, /apply_manual_fallback/);
});

test('upgrades clear legacy settings and migrate rules to persistent storage', () => {
	const defaults = read('root/etc/uci-defaults/80_luci-app-snort3');

	assert.match(defaults, /uci -q set snort-web\.snort\.manual=0/);
	assert.match(defaults, /uci -q delete snort-web\.snort\.include/);
	assert.match(defaults, /uci -q delete snort-web\.nfq\.include/);
	assert.match(defaults, /copy_rules_from/);
	assert.match(defaults, /migrated rules into persistent/);
});

test('read-only RPC failures are reported instead of aborting the method', () => {
	const backend = read('root/usr/share/rpcd/ucode/luci.snort.uc');

	assert.match(backend, /function guard\(name, handler\)/);
	assert.match(backend, /BACKEND_ERROR/);
	assert.doesNotMatch(backend, /match\(path, \/\[\\x00-\\x1f\]\/\)/);
});

test('the updater supports both storage modes, community source and boot fallback', () => {
	const updater = read('root/usr/libexec/snort-web-rules-update');
	const sync = read('root/usr/libexec/snort-web-sync');

	assert.match(updater, /rules_persist/);
	assert.match(updater, /rules_target="\$conf_dir\/rules"/);
	assert.match(updater, /rules_target="\$temp_dir\/rules"/);
	assert.match(updater, /--community/);
	assert.match(updater, /--fallback/);
	assert.match(updater, /fallback_rules\(\)/);
	assert.match(updater, /ln -s "\$rules_target"/);
	assert.match(updater, /\/etc\/init\.d\/snort restart/);
	assert.match(sync, /resolve_interface\(\)/);
	assert.match(sync, /network\.\$net\.device/);
	assert.match(sync, /\/sys\/class\/net\/eth0/);
});

test('the overview exposes subscriber/community buttons and the settings expose scheduling', () => {
	const view = read('htdocs/luci-static/resources/view/snort/config.js');
	const overview = read('htdocs/luci-static/resources/view/snort/overview.js');
	const api = read('htdocs/luci-static/resources/snort/api.js');
	const backend = read('root/usr/share/rpcd/ucode/luci.snort.uc');

	assert.match(api, /params: \[ 'mode', 'oinkcode' \]/);
	assert.match(overview, /Update subscriber rules/);
	assert.match(overview, /Use community rules/);
	assert.match(overview, /Oinkcode \(subscriber rules\)/);
	assert.doesNotMatch(view, /form\.Value, 'oinkcode'/);
	assert.match(view, /rules_persist/);
	assert.match(view, /rules_auto_update/);
	assert.match(view, /rules_update_interval/);
	assert.match(backend, /args: \{ mode: '', oinkcode: '' \}/);
	assert.match(backend, /mode == 'community'\) \? ' --community'/);
});

test('scheduled updates and boot top-up are wired up', () => {
	const schedule = read('root/usr/libexec/snort-web-schedule');
	const hotplug = read('root/etc/hotplug.d/iface/80-snort-rules');
	const init = read('root/etc/init.d/snort-web');

	assert.match(schedule, /0 3 \* \* \*/);
	assert.match(schedule, /\/etc\/init\.d\/cron/);
	assert.match(schedule, /snort-web-rules-update/);
	assert.match(hotplug, /ACTION.*ifup/);
	assert.match(hotplug, /--fallback/);
	assert.match(hotplug, /snort_rules_boot_done/);
	assert.match(init, /snort-web-schedule/);
});

test('alerts are read from the alert_json family of files', () => {
	const backend = read('root/usr/share/rpcd/ucode/luci.snort.uc');
	const overview = read('htdocs/luci-static/resources/view/snort/overview.js');

	assert.match(backend, /ALERT_FILE_NAME = 'alert_json\.txt'/);
	assert.match(backend, /\^\[0-9\]\+_alert_json/);
	assert.match(backend, /function read_alert_lines/);
	assert.match(backend, /count_alert_lines/);
	assert.match(read('htdocs/luci-static/resources/snort/util.js'), /Util\.formatAlert = function/);
	assert.match(overview, /util\.formatAlert\(line\)/);
	assert.match(read('htdocs/luci-static/resources/view/snort/alerts.js'), /util\.formatAlert\(line\)/);
	assert.match(read('htdocs/luci-static/resources/view/snort/alerts.js'), /data\.alert_files/);
	assert.doesNotMatch(read('htdocs/luci-static/resources/view/snort/alerts.js'), /alert_fast\.txt/);
});

test('the settings page uses a LuCI network device dropdown', () => {
	const view = read('htdocs/luci-static/resources/view/snort/config.js');

	assert.match(view, /'require network'/);
	assert.match(view, /network\.getDevices\(\)/);
	assert.match(view, /o\.value\('auto'/);
	assert.doesNotMatch(view, /form\.Value, 'interface'/);
});

test('running snort3 processes are detected and wrappers excluded', () => {
	const backend = read('root/usr/share/rpcd/ucode/luci.snort.uc');
	const init = read('root/etc/init.d/snort-web');
	const updater = read('root/usr/libexec/snort-web-rules-update');

	assert.match(backend, /named = index\(comm, 'snort'\)/);
	assert.match(backend, /\/usr\/bin\/snort/);
	assert.match(backend, /rc\.common/);
	assert.match(backend, /proc_comm/);
	assert.match(backend, /function proc_scan\(\)/);
	assert.match(backend, /function pidof_pids\(\)/);
	assert.match(backend, /pidof snort3 snort/);
	assert.match(backend, /if \(length\(pids\) == 0\)\s+return pidof_pids\(\)/);
	assert.match(backend, /proc_scan: proc_scan\(\)/);
	assert.match(backend, /const daemon = index\(cmdline/);
	assert.match(backend, /const wrapper = index\(cmdline/);
	assert.match(backend, /daemon: daemon/);
	assert.match(backend, /wrapper: wrapper/);
	assert.doesNotMatch(backend, /trim\(comm\) == 'snort'/);
	assert.match(init, /snort_running\(\)/);
	assert.match(init, /pidof snort3/);
	assert.match(updater, /pidof snort3/);
});

test('postinst restarts rpcd so a replaced ucode plugin is reloaded', () => {
	const makefile = read('Makefile');

	assert.match(makefile, /\/etc\/init\.d\/rpcd restart/);
	assert.doesNotMatch(makefile, /^\t\/etc\/init\.d\/rpcd reload/m);
});

test('storage badge follows the setting and the source follows installed rules', () => {
	const backend = read('root/usr/share/rpcd/ucode/luci.snort.uc');
	const updater = read('root/usr/libexec/snort-web-rules-update');
	const overview = read('htdocs/luci-static/resources/view/snort/overview.js');

	assert.match(backend, /persistent: persisted/);
	assert.match(backend, /storage_mismatch/);
	assert.match(backend, /path_join\(config_rules, '\.source'\)/);
	assert.match(updater, /\/\.source/);
	assert.match(overview, /Storage layout will change on the next update/);
	assert.match(overview, /Temporary rules/);
});

test('a live update overrides the stale status file but FINISHED ends it', () => {
	const backend = read('root/usr/share/rpcd/ucode/luci.snort.uc');

	assert.match(backend, /const running = lock && !stale/);
	assert.match(backend, /const recent_lines = read_tail_lines\(UPDATE_LOG, 200, false\)/);
	assert.match(backend, /if \(running\) \{\s+result = 'running'/);
	assert.match(backend, /status_age > UPDATE_IDLE_AFTER/);
	assert.match(backend, /result_raw/);
});

test('uci-defaults aligns the on-disk layout with rules_persist', () => {
	const defaults = read('root/etc/uci-defaults/80_luci-app-snort3');

	assert.match(defaults, /switched rules to temporary storage/);
	assert.match(defaults, /ln -s "\$tmp_rules" "\$rules"/);
	assert.match(defaults, /persist=0/);
});

test('a finished update is never reported as running', () => {
	const backend = read('root/usr/share/rpcd/ucode/luci.snort.uc');

	assert.match(backend, /const running = lock && !stale/);
	assert.match(backend, /const recent_lines = read_tail_lines\(UPDATE_LOG, 200, false\)/);
	assert.match(backend, /if \(running\) \{\s+result = 'running'/);
});

test('the overview has two rule buttons and no cleanup control', () => {
	const overview = read('htdocs/luci-static/resources/view/snort/overview.js');
	const api = read('htdocs/luci-static/resources/snort/api.js');

	assert.match(overview, /Update subscriber rules/);
	assert.match(overview, /Use community rules/);
	assert.match(overview, /communityButton = E\('button', \{\s*'class': 'cbi-button cbi-button-reset'/);
	assert.doesNotMatch(overview, /Cleanup temporary files|handleRulesCleanup/);
	assert.doesNotMatch(api, /rulesCleanup|rules_cleanup/);
});

test('a fresh install keeps both rule buttons enabled', () => {
	const backend = read('root/usr/share/rpcd/ucode/luci.snort.uc');

	/* No lock and no log: a stray /proc match must not start a "running" state. */
	assert.match(backend, /const running = lock && !stale/);
	assert.match(backend, /slice\(recent_lines/);
	assert.match(backend, /const lock = lock_info != null/);
});

test('uci-defaults defines its rule paths and postinst replays the migration', () => {
	const defaults = read('root/etc/uci-defaults/80_luci-app-snort3');
	const makefile = read('Makefile');

	assert.match(defaults, /rules="\$conf_dir\/rules"/);
	assert.match(defaults, /tmp_rules="\$temp_dir\/rules"/);
	assert.match(defaults, /ln -s "\$tmp_rules" "\$rules"/);
	assert.match(makefile, /\/bin\/sh \/etc\/uci-defaults\/80_luci-app-snort3/);
});

test('subscriber snapshots install only the top-level rules directory', () => {
	const updater = read('root/usr/libexec/snort-web-rules-update');

	assert.match(updater, /if \[ -d "\$work_dir\/rules" \]; then/);
	assert.match(updater, /! -path '\*\/so_rules\/\*'/);
	assert.match(updater, /for f in "\$rules_src"\/\*\.rules/);
	assert.match(updater, /grep -viE 'soid\|so:eval'/);
	assert.match(updater, /Skipped \$stubs_total shared-object rule stubs/);
	assert.doesNotMatch(updater, /find "\$work_dir" -type f -name '\*\.rules' \\\n\t\t\t-exec cp/);
});

test('a rejected rule update re-enables both buttons with a localised hint', () => {
	const overview = read('htdocs/luci-static/resources/view/snort/overview.js');
	const util = read('htdocs/luci-static/resources/snort/util.js');

	assert.match(overview, /self\.nodes\.subscriberButton\.disabled = false/);
	assert.match(overview, /self\.nodes\.communityButton\.disabled = false/);
	assert.match(util, /case 'oinkcode_missing'/);
});

test('empty alert views report a stopped service instead of a secure network', () => {
	const overview = read('htdocs/luci-static/resources/view/snort/overview.js');
	const alertsView = read('htdocs/luci-static/resources/view/snort/alerts.js');
	const style = read('htdocs/luci-static/resources/snort/style.js');

	assert.match(overview, /updateAlerts: function\(alerts, status\)/);
	assert.match(overview, /snort3-empty-inactive/);
	assert.match(alertsView, /api\.status\(\)/);
	assert.match(alertsView, /update: function\(data, status\)/);
	assert.match(alertsView, /Snort is not running - alerts are not available/);
	assert.match(alertsView, /Snort is not running - no system logs are available/);
	assert.match(style, /snort3-empty-inactive/);
});

test('menu parent uses firstchild so the active tab is highlighted', () => {
	const menu = JSON.parse(read('root/usr/share/luci/menu.d/luci-app-snort3.json'));
	const parent = menu['admin/services/snort'].action;

	assert.equal(parent.type, 'firstchild');
	assert.equal(parent.preferred, 'overview');
	assert.equal(menu['admin/services/snort/overview'].action.path, 'snort/overview');
});

test('update status expires and a live lock always wins', () => {
	const backend = read('root/usr/share/rpcd/ucode/luci.snort.uc');

	assert.match(backend, /UPDATE_IDLE_AFTER/);
	assert.match(backend, /if \(running\) \{\s+result = 'running'/);
	assert.match(backend, /status_age > UPDATE_IDLE_AFTER/);
	assert.match(backend, /finished_at/);
});

test('rule details expose file names, source and update time', () => {
	const backend = read('root/usr/share/rpcd/ucode/luci.snort.uc');
	const updater = read('root/usr/libexec/snort-web-rules-update');
	const view = read('htdocs/luci-static/resources/view/snort/overview.js');

	assert.match(backend, /function rule_file_list/);
	assert.match(backend, /rule_files: files/);
	assert.match(backend, /rules_source/);
	assert.match(backend, /rules_updated/);
	assert.match(updater, /rule: \$\(basename/);
	assert.match(view, /snort3-file-list/);
	assert.match(view, /rules_source === 'registered'/);
});

test('failed starts only quote syslog lines from the current attempt', () => {
	const backend = read('root/usr/share/rpcd/ucode/luci.snort.uc');
	const init = read('root/etc/init.d/snort-web');

	assert.match(backend, /function mark_service_log\(\)/);
	assert.match(backend, /function snort_log_tail\(\)/);
	assert.match(backend, /SERVICE_LOGALL/);
	assert.match(init, /recent_snort_errors\(\)/);
	assert.match(init, /No new snort daemon errors/);

	for (const text of [ backend, init ]) {
		assert.ok(text.includes('snort-service-begin'), 'marker is written before starting');
		assert.ok(text.includes('procd.*snort'), 'daemon and procd lines are kept');
		assert.doesNotMatch(text, /logread 2>\/dev\/null \| grep -i snort \| tail -n 8/,
			'old unbounded logread tail is gone');
	}
});

test('the settings view and backend use the application configuration', () => {
	const view = read('htdocs/luci-static/resources/view/snort/config.js');
	const backend = read('root/usr/share/rpcd/ucode/luci.snort.uc');
	const init = read('root/etc/init.d/snort-web');

	assert.match(view, /uci\.load\('snort-web'\)/);
	assert.match(view, /new form\.Map\('snort-web'/);
	assert.match(backend, /const CONFIG_NAME = 'snort-web'/);
	assert.match(backend, /const SYNC_HELPER = '\/usr\/libexec\/snort-web-sync'/);
	assert.match(backend, /SYNC_HELPER, '--sync'/);
	assert.match(init, /START=98/);
	assert.match(init, /snort-web-sync/);
});
