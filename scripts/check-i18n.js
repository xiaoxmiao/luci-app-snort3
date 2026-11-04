#!/usr/bin/env node
'use strict';

/*
 * Keep the JavaScript UI and the translation catalogs in sync.
 *
 * The LuCI JavaScript runtime does not extract strings at build time, so all
 * user-visible labels must exist in po/*.po.  This script scans the views and
 * the menu definitions, reports missing/obsolete entries and can regenerate
 * the PO template.
 */

const fs = require('fs');
const path = require('path');
const { parsePo } = require('./po2lmo');

const ROOT = path.resolve(__dirname, '..');
const RESOURCE_DIR = path.join(ROOT, 'htdocs', 'luci-static', 'resources');
const MENU_DIR = path.join(ROOT, 'root', 'usr', 'share', 'luci', 'menu.d');
const PO_DIR = path.join(ROOT, 'po');
const POT_FILE = path.join(PO_DIR, 'templates', 'snort.pot');

function decodeJsString(value) {
	return value.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, function(match, escaped) {
		switch (escaped[0]) {
		case 'n': return '\n';
		case 'r': return '\r';
		case 't': return '\t';
		case 'b': return '\b';
		case 'f': return '\f';
		case 'v': return '\v';
		case '0': return '\0';
		case 'x': return String.fromCharCode(parseInt(escaped.slice(1), 16));
		case 'u': return String.fromCharCode(parseInt(escaped.slice(1), 16));
		default: return escaped;
		}
	});
}

function walk(dir, suffix, result) {
	for (const name of fs.readdirSync(dir)) {
		const file = path.join(dir, name);
		const info = fs.statSync(file);

		if (info.isDirectory())
			walk(file, suffix, result);
		else if (file.endsWith(suffix))
			result.push(file);
	}

	return result;
}

function extractFromFile(file) {
	const text = fs.readFileSync(file, 'utf8');
	const strings = [];
	const patterns = [
		/\b_\s*\(\s*'((?:[^'\\]|\\.)*)'/g,
		/\btranslate\s*\(\s*'((?:[^'\\]|\\.)*)'/g,
		/\btr\s*\(\s*'((?:[^'\\]|\\.)*)'/g
	];

	for (const pattern of patterns) {
		let match;

		while ((match = pattern.exec(text)) !== null)
			strings.push(decodeJsString(match[1]));
	}

	return strings;
}

function extractMenuStrings() {
	const strings = [];

	if (!fs.existsSync(MENU_DIR))
		return strings;

	for (const file of walk(MENU_DIR, '.json', [])) {
		let data;

		try {
			data = JSON.parse(fs.readFileSync(file, 'utf8'));
		}
		catch (err) {
			console.error('Unable to parse ' + path.relative(ROOT, file) + ': ' + err.message);
			continue;
		}

		for (const node of Object.values(data)) {
			if (node && typeof node.title === 'string')
				strings.push(node.title);
		}
	}

	return strings;
}

function collect() {
	const found = new Map();

	function add(value, file) {
		if (!value)
			return;

		if (!found.has(value))
			found.set(value, []);

		found.get(value).push(file);
	}

	for (const file of walk(RESOURCE_DIR, '.js', [])) {
		for (const string of extractFromFile(file))
			add(string, path.relative(ROOT, file));
	}

	for (const string of extractMenuStrings())
		add(string, 'menu.d');

	return found;
}

function readCatalog(lang) {
	const file = path.join(PO_DIR, lang, 'snort.po');

	if (!fs.existsSync(file))
		return new Map();

	const entries = parsePo(fs.readFileSync(file, 'utf8'));
	const catalog = new Map();

	for (const entry of entries) {
		if (entry.msgid)
			catalog.set(entry.msgid, entry.msgstr || '');
	}

	return catalog;
}

function quote(value) {
	return '"' + value
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\r')
		.replace(/\t/g, '\\t') + '"';
}

function writePot(strings) {
	const lines = [
		'# Snort3 LuCI translation template.',
		'# Run `npm run check:i18n -- --write-pot` after changing the UI.',
		'msgid ""',
		'msgstr ""',
		'"Project-Id-Version: luci-app-snort3\\n"',
		'"Report-Msgid-Bugs-To: https://github.com/dddavid51/luci-snort3-openwrt/issues\\n"',
		'"POT-Creation-Date: 2026-11-04 00:00+0000\\n"',
		'"PO-Revision-Date: YEAR-MO-DA HO:MI+ZONE\\n"',
		'"Last-Translator: FULL NAME <EMAIL@ADDRESS>\\n"',
		'"Language-Team: LANGUAGE <LL@li.org>\\n"',
		'"Language: \\n"',
		'"MIME-Version: 1.0\\n"',
		'"Content-Type: text/plain; charset=UTF-8\\n"',
		'"Content-Transfer-Encoding: 8bit\\n"',
		'"Plural-Forms: nplurals=2; plural=(n != 1);\\n"',
		''
	];

	for (const string of strings) {
		lines.push('msgid ' + quote(string));
		lines.push('msgstr ""');
		lines.push('');
	}

	fs.mkdirSync(path.dirname(POT_FILE), { recursive: true });
	fs.writeFileSync(POT_FILE, lines.join('\n'));
	console.log('Wrote ' + path.relative(ROOT, POT_FILE));
}

function main() {
	const args = process.argv.slice(2);
	const strict = args.includes('--strict');
	const writeTemplate = args.includes('--write-pot');
	const found = collect();
	const catalogs = {};

	for (const name of fs.existsSync(PO_DIR) ? fs.readdirSync(PO_DIR) : []) {
		if (name === 'templates')
			continue;

		const dir = path.join(PO_DIR, name);

		if (fs.statSync(dir).isDirectory())
			catalogs[name] = readCatalog(name);
	}

	if (writeTemplate) {
		const all = new Set([ ...found.keys() ]);

		for (const catalog of Object.values(catalogs)) {
			for (const key of catalog.keys())
				all.add(key);
		}

		writePot([ ...all ].sort(function(a, b) { return a.localeCompare(b, 'en'); }));
	}

	let failed = false;

	for (const [ lang, catalog ] of Object.entries(catalogs)) {
		const missing = [];
		const extra = [];

		for (const string of found.keys()) {
			if (!catalog.has(string))
				missing.push(string);
		}

		for (const string of catalog.keys()) {
			if (!found.has(string))
				extra.push(string);
		}

		console.log('[' + lang + '] ' + catalog.size + ' translated strings, ' +
			found.size + ' UI strings');

		if (missing.length > 0) {
			failed = true;
			console.log('  Missing translations:');

			for (const string of missing.sort())
				console.log('    - ' + JSON.stringify(string));
		}

		if (extra.length > 0) {
			console.log('  Strings no longer used by the UI:');

			for (const string of extra.sort())
				console.log('    - ' + JSON.stringify(string));

			if (strict)
				failed = true;
		}
	}

	if (failed)
		process.exit(1);
}

if (require.main === module)
	main();

module.exports = { collect, readCatalog, decodeJsString };
