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

	assert.deepEqual(Object.keys(sections.snort.options).sort(),
		snortOptions[1].split(/\s+/).sort());
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

	assert.deepEqual(acl['luci-app-snort3'].read.uci, [ 'snort-web' ]);
	assert.deepEqual(acl['luci-app-snort3'].write.uci, [ 'snort-web' ]);
	assert.deepEqual(ucitrack, { config: 'snort-web', init: 'snort-web' });
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
