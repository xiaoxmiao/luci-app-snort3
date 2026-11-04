#!/usr/bin/env node
'use strict';

/*
 * Compile a gettext .po catalog into the LuCI .lmo format.
 *
 * This is a small, dependency-free reimplementation of LuCI's po2lmo tool.
 * It is used to ship a prebuilt French catalog with direct installations,
 * where the po2lmo helper is not necessarily available on the router.
 */

const fs = require('fs');
const path = require('path');

function sfhGet16(data, offset) {
	return data[offset] | (data[offset + 1] << 8);
}

function sfhHash(data, init) {
	const bytes = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
	const len = bytes.length;

	if (len <= 0)
		return 0;

	let hash = (init === undefined ? len : init) >>> 0;
	let offset = 0;
	let remaining = len >> 2;
	let tmp;

	while (remaining--) {
		hash = (hash + sfhGet16(bytes, offset)) >>> 0;
		tmp = ((sfhGet16(bytes, offset + 2) << 11) ^ hash) >>> 0;
		hash = ((hash << 16) ^ tmp) >>> 0;
		offset += 4;
		hash = (hash + (hash >>> 11)) >>> 0;
	}

	switch (len & 3) {
	case 3:
		hash = (hash + sfhGet16(bytes, offset)) >>> 0;
		hash = (hash ^ (hash << 16)) >>> 0;
		hash = (hash ^ ((bytes[offset + 2] << 24 >> 24) << 18)) >>> 0;
		hash = (hash + (hash >>> 11)) >>> 0;
		break;

	case 2:
		hash = (hash + sfhGet16(bytes, offset)) >>> 0;
		hash = (hash ^ (hash << 11)) >>> 0;
		hash = (hash + (hash >>> 17)) >>> 0;
		break;

	case 1:
		hash = (hash + (bytes[offset] << 24 >> 24)) >>> 0;
		hash = (hash ^ (hash << 10)) >>> 0;
		hash = (hash + (hash >>> 1)) >>> 0;
		break;
	}

	hash = (hash ^ (hash << 3)) >>> 0;
	hash = (hash + (hash >>> 5)) >>> 0;
	hash = (hash ^ (hash << 4)) >>> 0;
	hash = (hash + (hash >>> 17)) >>> 0;
	hash = (hash ^ (hash << 25)) >>> 0;
	hash = (hash + (hash >>> 6)) >>> 0;

	return hash >>> 0;
}

function decodePoString(value) {
	let out = '';

	for (let i = 0; i < value.length; i++) {
		const ch = value[i];

		if (ch !== '\\') {
			out += ch;
			continue;
		}

		if (++i >= value.length) {
			out += '\\';
			break;
		}

		switch (value[i]) {
		case 'n': out += '\n'; break;
		case 'r': out += '\r'; break;
		case 't': out += '\t'; break;
		case '"': out += '"'; break;
		case '\\': out += '\\'; break;
		default: out += value[i]; break;
		}
	}

	return out;
}

function parsePo(text) {
	const entries = [];
	let current = null;
	let field = null;
	let pluralIndex = null;
	let fuzzy = false;

	function finish() {
		if (!current)
			return;

		if (!fuzzy)
			entries.push(current);

		current = null;
		field = null;
		pluralIndex = null;
		fuzzy = false;
	}

	function ensureEntry() {
		if (!current)
			current = { msgctxt: null, msgid: null, msgidPlural: null, msgstr: null, msgstrPlural: [] };

		return current;
	}

	const lines = String(text).replace(/\r\n?/g, '\n').split('\n');

	for (const line of lines) {
		if (line.trim() === '') {
			finish();
			continue;
		}

		if (line.startsWith('#')) {
			if (/^#,\s*.*\bfuzzy\b/.test(line))
				fuzzy = true;

			continue;
		}

		let match = line.match(/^(msgctxt|msgid_plural|msgid|msgstr(?:\[(\d+)\])?)\s+"((?:[^"\\]|\\.)*)"\s*$/);

		if (match) {
			const entry = ensureEntry();

			switch (match[1]) {
			case 'msgctxt':
				entry.msgctxt = decodePoString(match[3]);
				field = 'msgctxt';
				pluralIndex = null;
				break;

			case 'msgid':
				entry.msgid = decodePoString(match[3]);
				field = 'msgid';
				pluralIndex = null;
				break;

			case 'msgid_plural':
				entry.msgidPlural = decodePoString(match[3]);
				field = 'msgidPlural';
				pluralIndex = null;
				break;

			default:
				if (match[2] != null) {
					pluralIndex = parseInt(match[2], 10);
					entry.msgstrPlural[pluralIndex] = decodePoString(match[3]);
					field = 'msgstrPlural';
				}
				else {
					entry.msgstr = decodePoString(match[3]);
					field = 'msgstr';
					pluralIndex = null;
				}
				break;
			}

			continue;
		}

		match = line.match(/^"((?:[^"\\]|\\.)*)"\s*$/);

		if (match && current && field) {
			const value = decodePoString(match[1]);

			if (field === 'msgstrPlural')
				current.msgstrPlural[pluralIndex] = (current.msgstrPlural[pluralIndex] || '') + value;
			else
				current[field] = (current[field] || '') + value;
		}
	}

	finish();

	return entries;
}

function compilePo(text) {
	const entries = parsePo(text);
	const records = [];
	const chunks = [];
	let offset = 0;

	function addRecord(key, value, keyId, valId) {
		const data = Buffer.from(value, 'utf8');
		const padding = (4 - (data.length % 4)) % 4;

		records.push({
			keyId: keyId === undefined ? sfhHash(key, Buffer.byteLength(key)) : keyId,
			valId: valId === undefined ? 1 : valId,
			offset,
			length: data.length
		});

		chunks.push(data);

		if (padding > 0)
			chunks.push(Buffer.alloc(padding));

		offset += data.length + padding;
	}

	for (const entry of entries) {
		if (entry.msgid == null)
			continue;

		if (entry.msgid === '') {
			const match = (entry.msgstr || '').match(/^Plural-Forms:\s*(.*)$/m);

			if (match)
				addRecord('', match[1].replace(/\s+$/, ''), 0, 0);

			continue;
		}

		const values = entry.msgstrPlural.length > 0 ? entry.msgstrPlural : [ entry.msgstr ];

		for (let i = 0; i < values.length; i++) {
			const value = values[i];

			if (!value)
				continue;

			let key = entry.msgid;

			if (entry.msgctxt != null)
				key = entry.msgctxt + '\u0001' + key;

			if (entry.msgidPlural != null)
				key += '\u0002' + i;

			if (sfhHash(key, Buffer.byteLength(key)) === sfhHash(value, Buffer.byteLength(value)))
				continue;

			addRecord(key, value, undefined, values.length);
		}
	}

	records.sort(function(a, b) {
		return (a.keyId >>> 0) - (b.keyId >>> 0);
	});

	const index = Buffer.alloc(records.length * 16);

	records.forEach(function(record, i) {
		index.writeUInt32BE(record.keyId >>> 0, i * 16);
		index.writeUInt32BE(record.valId >>> 0, i * 16 + 4);
		index.writeUInt32BE(record.offset >>> 0, i * 16 + 8);
		index.writeUInt32BE(record.length >>> 0, i * 16 + 12);
	});

	const trailer = Buffer.alloc(4);
	trailer.writeUInt32BE(offset >>> 0, 0);

	return Buffer.concat(chunks.concat([ index, trailer ]));
}

function readLmo(buffer) {
	if (buffer.length < 4)
		return [];

	const indexOffset = buffer.readUInt32BE(buffer.length - 4);

	if (indexOffset > buffer.length - 4 || (buffer.length - 4 - indexOffset) % 16 !== 0)
		return [];

	const entries = [];

	for (let offset = indexOffset; offset < buffer.length - 4; offset += 16) {
		const entry = {
			key: buffer.readUInt32BE(offset),
			val: buffer.readUInt32BE(offset + 4),
			offset: buffer.readUInt32BE(offset + 8),
			length: buffer.readUInt32BE(offset + 12)
		};

		if (entry.offset + entry.length <= buffer.length)
			entry.value = buffer.toString('utf8', entry.offset, entry.offset + entry.length);

		entries.push(entry);
	}

	return entries;
}

function lookup(buffer, key) {
	const hash = sfhHash(key, Buffer.byteLength(key));
	const entries = readLmo(buffer);

	for (const entry of entries) {
		if (entry.key === hash)
			return entry.value;
	}

	return null;
}

function compileFile(input, output) {
	const catalog = compilePo(fs.readFileSync(input, 'utf8'));

	fs.mkdirSync(path.dirname(output), { recursive: true });
	fs.writeFileSync(output, catalog);

	return catalog;
}

if (require.main === module) {
	const args = process.argv.slice(2);

	if (args.length !== 2) {
		console.error('Usage: node scripts/po2lmo.js input.po output.lmo');
		process.exit(1);
	}

	try {
		const data = compileFile(args[0], args[1]);
		console.log('Wrote ' + args[1] + ' (' + data.length + ' bytes)');
	}
	catch (err) {
		console.error('po2lmo: ' + err.message);
		process.exit(1);
	}
}

module.exports = {
	sfhHash,
	parsePo,
	compilePo,
	readLmo,
	lookup,
	compileFile
};
