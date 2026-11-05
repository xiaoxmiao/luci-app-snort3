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
	assert.deepEqual(Object.keys(sections.snort.options).sort(),
		snortOptions[1].split(/\s+/).concat([ 'manual', 'interface' ]).sort());
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

test('rules are persistent and a restart reloads the generated config', () => {
	const updater = read('root/usr/libexec/snort-web-rules-update');
	const sync = read('root/usr/libexec/snort-web-sync');

	assert.match(updater, /rules_target="\$conf_dir\/rules"/);
	assert.match(updater, /new_rules="\$conf_dir\/\.rules-new\.\$\$"/);
	assert.doesNotMatch(updater, /ln -s/);
	assert.match(updater, /\/etc\/init\.d\/snort restart/);
	assert.match(sync, /resolve_interface\(\)/);
	assert.match(sync, /network\.\$net\.device/);
	assert.match(sync, /\/sys\/class\/net\/eth0/);
});

test('the settings page uses a LuCI network device dropdown', () => {
	const view = read('htdocs/luci-static/resources/view/snort/config.js');

	assert.match(view, /'require network'/);
	assert.match(view, /network\.getDevices\(\)/);
	assert.match(view, /o\.value\('auto'/);
	assert.doesNotMatch(view, /form\.Value, 'interface'/);
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
