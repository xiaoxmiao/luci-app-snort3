'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Util = require('../htdocs/luci-static/resources/snort/util.js');

test('parseMeminfo extracts totals and computes used memory', () => {
	const info = Util.parseMeminfo([
		'MemTotal:        1024000 kB',
		'MemFree:          200000 kB',
		'MemAvailable:     500000 kB',
		'Buffers:           10000 kB'
	].join('\n'));

	assert.deepEqual(info, {
		total: 1024000,
		free: 200000,
		available: 500000,
		used: 824000,
		percent: 80
	});
});

test('parseMeminfo falls back to MemFree when MemAvailable is missing', () => {
	const info = Util.parseMeminfo('MemTotal: 1000 kB\nMemFree: 250 kB\n');

	assert.equal(info.available, 250);
	assert.equal(info.used, 750);
	assert.equal(info.percent, 75);
});

test('parseMeminfo tolerates empty input', () => {
	assert.deepEqual(Util.parseMeminfo(''), {
		total: 0,
		free: 0,
		available: 0,
		used: 0,
		percent: 0
	});
});

test('parseProcStatus reads name, RSS and thread count', () => {
	const status = Util.parseProcStatus([
		'Name:\tsnort',
		'VmPeak:\t 123456 kB',
		'VmRSS:\t  45678 kB',
		'Threads:\t12'
	].join('\n'));

	assert.deepEqual(status, { name: 'snort', rss: 45678, threads: 12 });
});

test('lastLines keeps the newest lines in chronological order', () => {
	const text = 'one\ntwo\nthree\nfour\n';

	assert.deepEqual(Util.lastLines(text, 2), [ 'three', 'four' ]);
	assert.deepEqual(Util.lastLines(text, 0), []);
	assert.deepEqual(Util.lastLines('no newline', 5), [ 'no newline' ]);
});

test('lastLinesReversed returns the newest line first', () => {
	assert.deepEqual(Util.lastLinesReversed('one\ntwo\nthree', 2), [ 'three', 'two' ]);
});

test('joinLines joins arrays without adding a trailing newline', () => {
	assert.equal(Util.joinLines([ 'a', 'b' ]), 'a\nb');
	assert.equal(Util.joinLines(null), '');
});

test('formatKb formats router memory values', () => {
	assert.equal(Util.formatKb(0), '0 MB');
	assert.equal(Util.formatKb(512), '512 kB');
	assert.equal(Util.formatKb(1024), '1 MB');
	assert.equal(Util.formatKb(1536), '1.5 MB');
	assert.equal(Util.formatKb(1024 * 100), '100 MB');
});

test('formatDuration uses compact day/hour/minute units', () => {
	assert.equal(Util.formatDuration(0), '0s');
	assert.equal(Util.formatDuration(59), '59s');
	assert.equal(Util.formatDuration(60), '1m 0s');
	assert.equal(Util.formatDuration(3599), '59m 59s');
	assert.equal(Util.formatDuration(3600), '1h 0m');
	assert.equal(Util.formatDuration(90061), '1d 1h');
	assert.equal(Util.formatDuration(-5), '0s');
});

test('tone helpers map percentages and service state to CSS tones', () => {
	assert.equal(Util.toneForPercent(0), 'success');
	assert.equal(Util.toneForPercent(60), 'success');
	assert.equal(Util.toneForPercent(61), 'warning');
	assert.equal(Util.toneForPercent(81), 'danger');
	assert.equal(Util.toneForState(true), 'success');
	assert.equal(Util.toneForState(false), 'danger');
});

test('message codes resolve to English source strings', () => {
	assert.equal(Util.msg('started'), 'Snort started');
	assert.equal(Util.msg('update_busy'), 'Update already in progress...');
	assert.equal(Util.msg('temp_missing'), 'Directory does not exist:');
	assert.equal(Util.msg('not_a_code', 'Fallback text'), 'Fallback text');
	assert.equal(Util.msg('not_a_code'), 'Unknown error');
});

test('serviceState maps the backend three-state status to a badge', () => {
	assert.deepEqual(Util.serviceState({ service_state: 'running' }),
		{ text: 'Running', tone: 'success', hint: '' });
	assert.deepEqual(Util.serviceState({ service_state: 'stopped' }),
		{ text: 'Stopped', tone: 'muted', hint: '' });
	assert.deepEqual(Util.serviceState({}),
		{ text: 'Stopped', tone: 'muted', hint: '' });

	const initError = Util.serviceState({ service_state: 'error', service_code: 'init_missing' });
	assert.equal(initError.text, 'Error');
	assert.equal(initError.tone, 'danger');
	assert.equal(initError.hint, 'Snort init script not found');
	assert.equal(Util.serviceState({ service_state: 'error', service_code: 'rules_missing' }).hint,
		'No rules found');
});

test('updateState maps updater results to a badge', () => {
	assert.deepEqual(Util.updateState({ result: 'idle' }), { text: 'Idle', tone: 'muted' });
	assert.deepEqual(Util.updateState({ result: 'running' }),
		{ text: 'Update in progress...', tone: 'warning' });
	assert.deepEqual(Util.updateState({ result: 'finished' }),
		{ text: 'Update completed!', tone: 'success' });
	assert.deepEqual(Util.updateState({ result: 'failed', code: 'download_failed' }),
		{ text: 'Rules update failed', tone: 'danger' });
	assert.deepEqual(Util.updateState({ result: 'failed' }),
		{ text: 'Rules update failed', tone: 'danger' });
});

test('rule updater failure codes resolve to short messages', () => {
	for (const code of [ 'download_failed', 'extract_failed', 'rules_empty',
	                     'rules_dir_failed', 'invalid_path', 'rules_update_failed' ])
		assert.equal(Util.msg(code), 'Rules update failed');

	assert.equal(Util.msg('rules_missing'), 'No rules found');
	assert.equal(Util.msg('updater_missing'), 'Rules updater not found');
});

test('serviceState explains why a stopped service cannot start', () => {
	assert.deepEqual(
		Util.serviceState({ service_state: 'stopped', service_hint: 'service_disabled' }),
		{ text: 'Stopped', tone: 'muted', hint: 'Snort is disabled in Settings' });

	const error = Util.serviceState({
		service_state: 'error',
		service_code: 'start_failed',
		service_message: 'Validation failed, try snort-mgr check.'
	});

	assert.equal(error.text, 'Error');
	assert.equal(error.tone, 'danger');
	assert.match(error.hint, /Snort failed to start/);
	assert.match(error.hint, /snort-mgr check/);
});

test('new service failure codes have readable messages', () => {
	assert.equal(Util.msg('service_disabled'), 'Snort is disabled in Settings');
	assert.equal(Util.msg('start_failed'), 'Snort failed to start');
	assert.equal(Util.msg('backend_error'), 'Backend error');
});

test('the backend error hint stays visible', () => {
	assert.deepEqual(
		Util.serviceState({ service_state: 'stopped', service_hint: 'backend_error' }).text,
		'Stopped');
});

test('updateState never hides an unknown backend reason', () => {
	assert.equal(Util.updateState({
		result: 'failed', code: 'weird_backend_code', message: 'disk full'
	}).text, 'disk full');

	assert.equal(Util.updateState({
		result: 'failed', code: 'weird_backend_code'
	}).text, 'weird_backend_code');
});

test('translate uses the LuCI global _() when present', () => {
	const previous = global._;

	global._ = function(text) {
		return text === 'Running' ? 'En cours' : text;
	};

	try {
		assert.equal(Util.translate('Running'), 'En cours');
		assert.equal(Util.msg('started'), 'Snort started');
	}
	finally {
		if (previous === undefined)
			delete global._;
		else
			global._ = previous;
	}
});
