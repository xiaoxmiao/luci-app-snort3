'use strict';

'require baseclass';

/*
 * Pure helpers shared by the Snort3 views.  Keep the implementation free of
 * LuCI API calls so it can be exercised by the Node test-suite.
 *
 * LuCI >= 26 loads every required module as a class file and rejects any
 * return value that is not a `baseclass` subclass (the browser reports
 * "factory yields invalid constructor"), so the helper object is exported
 * through `baseclass.extend()`.  Node keeps using the plain object below.
 */

var Util = {};

Util.translate = function(text) {
	return (typeof _ === 'function') ? _(text) : text;
};

Util.parseMeminfo = function(text) {
	var values = {};

	String(text || '').split(/\r?\n/).forEach(function(line) {
		var match = line.match(/^([A-Za-z_()]+):\s+(\d+)/);

		if (match)
			values[match[1]] = parseInt(match[2], 10);
	});

	var total = values.MemTotal || 0;
	var free = values.MemFree || 0;
	var available = (values.MemAvailable != null) ? values.MemAvailable : free;
	var used = Math.max(0, total - free);

	return {
		total: total,
		free: free,
		available: available,
		used: used,
		percent: total > 0 ? Math.floor(used * 100 / total) : 0
	};
};

Util.parseProcStatus = function(text) {
	var result = { name: '', rss: 0, threads: 0 };

	String(text || '').split(/\r?\n/).forEach(function(line) {
		var match = line.match(/^Name:\s+(.+)$/);

		if (match)
			result.name = match[1];

		match = line.match(/^VmRSS:\s+(\d+)\s+kB/);

		if (match)
			result.rss = parseInt(match[1], 10);

		match = line.match(/^Threads:\s+(\d+)/);

		if (match)
			result.threads = parseInt(match[1], 10);
	});

	return result;
};

Util.lastLines = function(text, count) {
	var lines = String(text || '').replace(/\r/g, '').split('\n');

	if (lines.length > 0 && lines[lines.length - 1] === '')
		lines.pop();

	if (!(count > 0))
		return [];

	return lines.slice(Math.max(0, lines.length - count));
};

Util.lastLinesReversed = function(text, count) {
	return Util.lastLines(text, count).reverse();
};

Util.joinLines = function(lines) {
	return Array.isArray(lines) ? lines.join('\n') : '';
};

Util.formatKb = function(kb) {
	kb = Number(kb) || 0;

	if (kb <= 0)
		return '0 MB';

	if (kb < 1024)
		return kb + ' kB';

	var mb = kb / 1024;

	return ((mb >= 100) ? Math.round(mb) : Math.round(mb * 10) / 10) + ' MB';
};

Util.formatDuration = function(seconds) {
	seconds = Math.max(0, Math.floor(Number(seconds) || 0));

	var days = Math.floor(seconds / 86400);
	seconds %= 86400;

	var hours = Math.floor(seconds / 3600);
	seconds %= 3600;

	var minutes = Math.floor(seconds / 60);
	seconds %= 60;

	if (days > 0)
		return days + 'd ' + hours + 'h';

	if (hours > 0)
		return hours + 'h ' + minutes + 'm';

	if (minutes > 0)
		return minutes + 'm ' + seconds + 's';

	return seconds + 's';
};

Util.toneForPercent = function(percent) {
	percent = Number(percent) || 0;

	if (percent > 80)
		return 'danger';

	if (percent > 60)
		return 'warning';

	return 'success';
};

Util.toneForState = function(running) {
	return running ? 'success' : 'danger';
};

/* Map the backend's three-state service status to a badge and an optional
 * explanation.  "stopped" is deliberately muted so it is visually distinct
 * from a real "error" condition. */
Util.serviceState = function(status) {
	var tr = Util.translate;
	var s = status || {};

	switch (s.service_state) {
	case 'running':
		return { text: tr('Running'), tone: 'success', hint: '' };

	case 'error': {
		var reason = Util.msg(s.service_code || 'unknown_error');

		if (s.service_message)
			reason += ' - ' + s.service_message;

		return { text: tr('Error'), tone: 'danger', hint: reason };
	}

	default:
		return {
			text: tr('Stopped'),
			tone: 'muted',
			hint: s.service_hint ? Util.msg(s.service_hint) : ''
		};
	}
};

/* Map the rules updater result to a badge. */
Util.updateState = function(update) {
	var tr = Util.translate;
	var u = update || {};

	switch (u.result) {
	case 'running':
		return { text: tr('Update in progress...'), tone: 'warning' };

	case 'finished':
		return { text: tr('Update completed!'), tone: 'success' };

	case 'failed':
		return {
			text: Util.msg(u.code || 'rules_update_failed', u.message || u.code),
			tone: 'danger'
		};

	default:
		return { text: tr('Idle'), tone: 'muted' };
	}
};

Util.msg = function(code, fallback) {
	var tr = Util.translate;

	switch (code) {
	case 'started':
		return tr('Snort started');

	case 'stopped':
		return tr('Snort stopped');

	case 'restarted':
		return tr('Snort restarted');

	case 'enabled':
		return tr('Auto-start enabled');

	case 'disabled':
		return tr('Auto-start disabled');

	case 'invalid_action':
		return tr('Invalid action');

	case 'init_missing':
		return tr('Snort init script not found');

	case 'action_failed':
		return tr('Service action failed');

	case 'service_disabled':
		return tr('Snort is disabled in Settings');

	case 'start_failed':
		return tr('Snort failed to start');

	case 'config_missing':
		return tr('Manual mode needs snort.lua and local.lua');

	case 'manual_fallback':
		return tr('Manual mode is unavailable; using the generated configuration instead (no action needed)');

	case 'daq_dir_missing':
		return tr('Manual mode needs daq.module_dirs in local.lua (for example /usr/lib/daq/)');

	case 'update_started':
		return tr('Update launched in background. Monitoring starts automatically.');

	case 'update_busy':
		return tr('Update already in progress...');

	case 'updater_missing':
		return tr('Rules updater not found');

	/* Rule download / extraction failures are reported with the detailed
	 * reason in the update log; the badge shows a short generic message. */
	case 'rules_update_failed':
	case 'download_failed':
	case 'extract_failed':
	case 'rules_empty':
	case 'rules_dir_failed':
	case 'invalid_path':
		return tr('Rules update failed');

	case 'rules_missing':
		return tr('No rules found');

	case 'update_failed':
		return tr('Unable to start the rules update');

	case 'link_created':
		return tr('Symbolic link created successfully');

	case 'link_created_backup':
		return tr('Old directory backed up. Symbolic link created successfully');

	case 'temp_missing':
		return tr('Directory does not exist:');

	case 'backup_failed':
		return tr('Unable to back up the old rules directory');

	case 'link_failed':
		return tr('Error creating symbolic link');

	case 'config_not_directory':
		return tr('Existing rules path is not a directory');

	case 'cleaned':
		return tr('Temporary files cleaned');

	case 'cleanup_failed':
		return tr('Unable to clean temporary files');

	case 'unknown_error':
		return tr('Unknown error');

	default:
		return fallback ? tr(fallback) : tr('Unknown error');
	}
};

if (typeof baseclass !== 'undefined')
	return baseclass.extend(Util);

module.exports = Util;
