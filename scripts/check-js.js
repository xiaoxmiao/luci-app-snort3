#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set([ '.git', 'legacy', 'node_modules', 'dist' ]);

function walk(dir, files) {
	for (const name of fs.readdirSync(dir)) {
		if (SKIP.has(name))
			continue;

		const file = path.join(dir, name);

		if (fs.statSync(file).isDirectory())
			walk(file, files);
		else if (file.endsWith('.js'))
			files.push(file);
	}

	return files;
}

let failed = 0;

for (const file of walk(ROOT, [])) {
	try {
		execFileSync(process.execPath, [ '--check', file ], { stdio: 'pipe' });
		console.log('OK   ' + path.relative(ROOT, file));
	}
	catch (err) {
		failed++;
		console.error('FAIL ' + path.relative(ROOT, file));
		console.error(String(err.stderr || err.message).trim());
	}
}

if (failed > 0) {
	console.error('\n' + failed + ' JavaScript file(s) failed the syntax check.');
	process.exit(1);
}
