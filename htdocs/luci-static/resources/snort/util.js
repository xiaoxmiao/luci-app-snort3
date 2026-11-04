'use strict';

/*
 * Pure helpers shared by the Snort3 views.  Keep this file free of LuCI
 * dependencies so it can be exercised by the Node test-suite.
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

	case 'update_started':
		return tr('Update launched in background. Monitoring starts automatically.');

	case 'update_busy':
		return tr('Update already in progress...');

	case 'updater_missing':
		return tr('Rules updater not found: /usr/bin/snort-rules');

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

if (typeof module !== 'undefined' && module.exports)
	module.exports = Util;

return Util;
