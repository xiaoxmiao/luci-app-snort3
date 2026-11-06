'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sfhHash, parsePo, compilePo, readLmo, lookup } = require('../scripts/po2lmo');

test('sfhHash matches LuCI hashes from a real catalog', () => {
	// Values taken from luci-i18n-base-fr installed on OpenWrt 24.10.
	assert.equal(sfhHash('Edit', Buffer.byteLength('Edit')), 931855);
	assert.equal(sfhHash('Settings', Buffer.byteLength('Settings')), 1624014104);
});

test('parsePo handles multiline strings and fuzzy flags', () => {
	const entries = parsePo([
		'msgid ""',
		'msgstr ""',
		'"Content-Type: text/plain; charset=UTF-8\\n"',
		'"Plural-Forms: nplurals=2; plural=n > 1;\\n"',
		'',
		'msgid "Hello"',
		'msgstr "Bonjour"',
		'',
		'#, fuzzy',
		'msgid "Ignored"',
		'msgstr "Ignore"',
		'',
		'msgid "Multi"',
		'" line"',
		'msgstr "Plusieurs"',
		'" lignes"'
	].join('\n'));

	assert.equal(entries.length, 3);
	assert.equal(entries[0].msgid, '');
	assert.equal(entries[1].msgstr, 'Bonjour');
	assert.equal(entries[2].msgid, 'Multi line');
	assert.equal(entries[2].msgstr, 'Plusieurs lignes');
});

test('compilePo writes a sorted, padded LuCI catalog', () => {
	const catalog = compilePo([
		'msgid ""',
		'msgstr ""',
		'"Content-Type: text/plain; charset=UTF-8\\n"',
		'"Plural-Forms: nplurals=2; plural=n > 1;\\n"',
		'',
		'msgid "Hello"',
		'msgstr "Bonjour"',
		'',
		'msgid "Same"',
		'msgstr "Same"',
		'',
		'msgid "Unused"',
		'msgstr ""'
	].join('\n'));

	const entries = readLmo(catalog);
	const indexOffset = catalog.readUInt32BE(catalog.length - 4);

	assert.equal(indexOffset % 4, 0);
	assert.equal(entries[0].key, 0);
	assert.equal(entries[0].val, 0);
	assert.equal(entries[0].value, 'nplurals=2; plural=n > 1;');
	assert.equal(lookup(catalog, 'Hello'), 'Bonjour');
	assert.equal(lookup(catalog, 'Same'), null);
	assert.equal(lookup(catalog, 'Unused'), null);

	for (let i = 1; i < entries.length; i++)
		assert.ok(entries[i - 1].key <= entries[i].key);

	for (const entry of entries)
		assert.equal(entry.offset % 4, 0);
});

test('compilePo decodes escaped newlines in messages', () => {
	const catalog = compilePo([
		'msgid "First\\nSecond"',
		'msgstr "Premier\\nDeuxième"'
	].join('\n'));

	assert.equal(lookup(catalog, 'First\nSecond'), 'Premier\nDeuxième');
});

test('the committed French catalog is up to date', () => {
	const root = path.join(__dirname, '..');
	const catalog = parsePo(fs.readFileSync(path.join(root, 'po/fr/snort.po'), 'utf8'));
	const compiled = fs.readFileSync(path.join(root, 'dist/lmo/snort.fr.lmo'));
	let translated = 0;

	for (const entry of catalog) {
		if (!entry.msgid || !entry.msgstr)
			continue;

		const value = lookup(compiled, entry.msgid);

		if (entry.msgstr === entry.msgid) {
			assert.ok(value === null || value === entry.msgid, entry.msgid);
		}
		else {
			assert.equal(value, entry.msgstr, entry.msgid);
			translated++;
		}
	}

	assert.ok(translated > 100);
});

test('the committed Simplified Chinese catalog is complete and compiled', () => {
	const root = path.join(__dirname, '..');
	const catalog = parsePo(fs.readFileSync(path.join(root, 'po/zh_Hans/snort.po'), 'utf8'));
	const compiled = fs.readFileSync(path.join(root, 'dist/lmo/snort.zh-cn.lmo'));
	let translated = 0;

	for (const entry of catalog) {
		if (!entry.msgid)
			continue;

		assert.ok(entry.msgstr, 'empty translation: ' + entry.msgid);

		if (entry.msgstr !== entry.msgid) {
			assert.equal(lookup(compiled, entry.msgid), entry.msgstr, entry.msgid);
			translated++;
		}
	}

	assert.ok(translated > 100);
	assert.equal(lookup(compiled, 'Settings'), '设置');
});

test('all six committed catalogs have a matching compiled LMO', () => {
	const root = path.join(__dirname, '..');
	const langs = [
		[ 'de', 'de' ], [ 'es', 'es' ], [ 'fr', 'fr' ],
		[ 'pt_BR', 'pt-br' ], [ 'ru', 'ru' ], [ 'zh_Hans', 'zh-cn' ]
	];

	for (const [ dir, lmo ] of langs) {
		const catalog = parsePo(fs.readFileSync(
			path.join(root, `po/${dir}/snort.po`), 'utf8'));
		const compiled = fs.readFileSync(
			path.join(root, `dist/lmo/snort.${lmo}.lmo`));
		let translated = 0;

		for (const entry of catalog) {
			if (!entry.msgid)
				continue;

			assert.ok(entry.msgstr, `${dir}: empty translation for ${entry.msgid}`);

			if (entry.msgstr !== entry.msgid) {
				assert.equal(lookup(compiled, entry.msgid), entry.msgstr,
					`${dir}: ${entry.msgid}`);
				translated++;
			}
		}

		assert.ok(translated > 100, `${dir}: only ${translated} translated entries`);
	}
});
