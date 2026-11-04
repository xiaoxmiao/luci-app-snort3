'use strict';

/*
 * LuCI Snort3 backend.
 *
 * This file is loaded by rpcd from /usr/share/rpcd/ucode/ and registers the
 * "luci.snort" ubus object.  All privileged operations (init script, log and
 * rule file access) stay on this side of the RPC boundary; the JavaScript
 * views only send allow-listed actions and display the returned data.
 */

import { access, glob, lstat, readfile, readlink, stat, unlink, symlink,
         rename, writefile, popen, open, lsdir } from 'fs';
import { cursor } from 'uci';

const INIT_SCRIPT = '/etc/init.d/snort';
const SYNC_HELPER = '/usr/libexec/snort-web-sync';
const RULES_UPDATER = '/usr/bin/snort-rules';
const UPDATE_LOCK = '/tmp/snort_rules_update.lock';
const UPDATE_LOG = '/tmp/snort_rules_update.log';

const CONFIG_NAME = 'snort-web';

const DEFAULT_CONFIG_DIR = '/etc/snort';
const DEFAULT_TEMP_DIR = '/var/snort.d';
const DEFAULT_LOG_DIR = '/var/log';
const ALERT_FILE_NAME = 'alert_fast.txt';

const TAIL_BYTES = 64 * 1024;
const UPDATE_STALE_GRACE = 10 * 60;

function safe_path(value, fallback) {
	if (type(value) != 'string' || length(value) == 0)
		return fallback;

	const path = '' + value;

	if (substr(path, 0, 1) != '/' || match(path, /\.\./) || match(path, /[\x00-\x1f]/))
		return fallback;

	return path;
}

function path_join(dir, name) {
	const base = '' + dir;

	if (substr(base, length(base) - 1) == '/')
		return base + name;

	return base + '/' + name;
}

function read_text(path) {
	const data = readfile(path);

	return (data == null) ? '' : '' + data;
}

function or_default(value, fallback) {
	return value == null ? fallback : value;
}

function shell_quote(value) {
	return "'" + replace('' + value, /'/g, "'\\''") + "'";
}

function arg_value(args, name, fallback) {
	return (args != null && args[name] != null) ? args[name] : fallback;
}

function first_value(value, fallback) {
	if (type(value) == 'array')
		return length(value) > 0 ? value[0] : fallback;

	return (value == null || value == '') ? fallback : value;
}

function sync_runtime_config() {
	if (!access(SYNC_HELPER, 'x'))
		return true;

	return system([ SYNC_HELPER, '--sync' ], 30000) == 0;
}

function get_settings() {
	let uci = null;

	try {
		uci = cursor();
	}
	catch (e) {
		uci = null;
	}

	function get(name, fallback) {
		if (!uci)
			return fallback;

		try {
			return first_value(uci.get_first(CONFIG_NAME, 'snort', name), fallback);
		}
		catch (e) {
			return fallback;
		}
	}

	return {
		enabled: get('enabled', '0'),
		manual: get('manual', '1'),
		interface: get('interface', ''),
		home_net: get('home_net', '192.168.1.0/24'),
		external_net: get('external_net', 'any'),
		mode: get('mode', 'ids'),
		method: get('method', 'pcap'),
		snaplen: get('snaplen', '1518'),
		logging: get('logging', '1'),
		log_dir: safe_path(get('log_dir', DEFAULT_LOG_DIR), DEFAULT_LOG_DIR),
		config_dir: safe_path(get('config_dir', DEFAULT_CONFIG_DIR), DEFAULT_CONFIG_DIR),
		temp_dir: safe_path(get('temp_dir', DEFAULT_TEMP_DIR), DEFAULT_TEMP_DIR),
		oinkcode: get('oinkcode', ''),
		action: get('action', 'default'),
		openappid: get('openappid', '0'),
		include: get('include', '')
	};
}

function process_id_list() {
	const pids = [];
	const entries = lsdir('/proc');

	if (!entries)
		return pids;

	for (let name in entries) {
		if (!match(name, /^[0-9]+$/))
			continue;

		const comm = read_text('/proc/' + name + '/comm');

		if (trim(comm) == 'snort')
			push(pids, +name);
	}

	return pids;
}

function process_rss_kb(pid) {
	const status = read_text('/proc/' + pid + '/status');

	for (let line in split(status, '\n')) {
		const m = match(line, /^VmRSS:\s+([0-9]+)\s+kB/);

		if (m)
			return int(m[1]);
	}

	return 0;
}

function memory_info() {
	const text = read_text('/proc/meminfo');
	const values = {};

	for (let line in split(text, '\n')) {
		const m = match(line, /^([A-Za-z_()]+):\s+([0-9]+)/);

		if (m)
			values[m[1]] = int(m[2]);
	}

	const total = or_default(values.MemTotal, 0);
	const free = or_default(values.MemFree, 0);
	const available = or_default(values.MemAvailable, free);
	const used = total > free ? total - free : 0;

	return {
		total,
		free,
		available,
		used,
		percent: total > 0 ? int((used * 100) / total) : 0
	};
}

function read_tail_lines(path, max_lines, newest_first) {
	const info = stat(path);

	if (!info || info.type != 'file' || info.size <= 0 || max_lines <= 0)
		return [];

	const handle = open(path, 'r');

	if (!handle)
		return [];

	const size = info.size;
	const read_size = size < TAIL_BYTES ? size : TAIL_BYTES;
	let text = null;

	if (handle.seek(-read_size, 2))
		text = handle.read(read_size);

	handle.close();

	if (text == null)
		return [];

	let lines = split('' + text, '\n');

	if (length(lines) > 0 && lines[length(lines) - 1] == '')
		pop(lines);

	/* Drop the first, possibly partial line when we only read the file tail. */
	if (read_size < size && length(lines) > 0)
		shift(lines);

	if (length(lines) > max_lines)
		lines = slice(lines, length(lines) - max_lines);

	if (newest_first)
		reverse(lines);

	return lines;
}

function count_lines(path) {
	if (!access(path, 'f'))
		return 0;

	const proc = popen('wc -l < ' + shell_quote(path), 'r');

	if (proc) {
		const output = proc.read('all');
		const rc = proc.close();

		if (rc == 0) {
			const text = (output == null) ? '' : '' + output;
			const count = int(trim(text));

			if (count >= 0)
				return count;
		}
	}

	/* Fallback for systems without wc. */
	const handle = open(path, 'r');

	if (!handle)
		return 0;

	let count = 0;
	let last = '';

	while (true) {
		const chunk = handle.read(65536);

		if (chunk == null || length(chunk) == 0)
			break;

		const data = '' + chunk;

		count += length(split(data, '\n')) - 1;
		last = data;
	}

	handle.close();

	if (length(last) > 0 && substr(last, length(last) - 1) != '\n')
		count++;

	return count;
}

function snort_logs(limit) {
	let logs = [];

	if (limit <= 0 || !access('/sbin/logread', 'x'))
		return logs;

	const proc = popen('/sbin/logread', 'r');

	if (!proc)
		return logs;

	const output = proc.read('all');
	const text = (output == null) ? '' : '' + output;
	proc.close();

	for (let line in split(text, '\n')) {
		if (length(trim(line)) == 0)
			continue;

		if (match(line, /snort/i))
			push(logs, line);
	}

	if (length(logs) > limit)
		logs = slice(logs, length(logs) - limit);

	reverse(logs);

	return logs;
}

function updater_process_alive() {
	const entries = lsdir('/proc');

	if (!entries)
		return false;

	for (let name in entries) {
		if (!match(name, /^[0-9]+$/))
			continue;

		if (index(read_text('/proc/' + name + '/cmdline'), 'snort-rules') != null)
			return true;
	}

	return false;
}

function update_state() {
	const log_lines = read_tail_lines(UPDATE_LOG, 20, false);
	const lock_info = lstat(UPDATE_LOCK);
	const lock = lock_info != null;
	const age = lock_info ? (time() - or_default(lock_info.mtime, 0)) : 0;
	let finished = false;

	for (let line in log_lines) {
		if (index('' + line, 'FINISHED') != null) {
			finished = true;
			break;
		}
	}

	/* A lock left behind by a crashed or killed updater must not block all
	 * future updates forever.  Keep a short grace period for the fork/exec
	 * window, then rely on the actual updater process being visible. */
	const alive = lock && !finished ? updater_process_alive() : false;
	const stale = lock && !finished && !alive && age > UPDATE_STALE_GRACE;

	return {
		running: lock && !finished && !stale,
		lock,
		alive,
		stale,
		age,
		finished,
		log_lines
	};
}

function rule_file_count(dir) {
	const names = lsdir(dir);

	if (!names)
		return 0;

	let count = 0;

	for (let name in names) {
		if (!match(name, /\.rules$/))
			continue;

		const info = stat(path_join(dir, name));

		if (info && info.type == 'file')
			count++;
	}

	return count;
}

function rules_state() {
	const settings = get_settings();
	const config_rules = path_join(settings.config_dir, 'rules');
	const temp_rules = path_join(settings.temp_dir, 'rules');
	const config_info = lstat(config_rules);
	const temp_info = stat(temp_rules);
	let link = false;
	let target = '';
	let target_exists = false;

	if (config_info && config_info.type == 'link') {
		link = true;
		target = or_default(readlink(config_rules), '');

		const resolved = stat(config_rules);

		target_exists = resolved != null && resolved.type == 'directory';
	}

	return {
		success: true,
		ok: true,
		config_rules,
		temp_rules,
		config_exists: config_info != null,
		config_is_link: link,
		link_target: target,
		link_valid: link && target_exists,
		temp_exists: temp_info != null && temp_info.type == 'directory',
		config_rule_count: rule_file_count(config_rules),
		temp_rule_count: rule_file_count(temp_rules),
		updater_available: access(RULES_UPDATER, 'x') == true,
		update: update_state()
	};
}

function remove_tarballs(dir, only_snort_prefix) {
	const names = lsdir(dir);

	if (!names)
		return 0;

	let removed = 0;

	for (let name in names) {
		const matches = only_snort_prefix
			? match(name, /^snort.*\.tar\.gz$/)
			: match(name, /\.tar\.gz$/);

		if (matches && unlink(path_join(dir, name)) != null)
			removed++;
	}

	return removed;
}

function ensure_link(settings) {
	const config_rules = path_join(settings.config_dir, 'rules');
	const temp_rules = path_join(settings.temp_dir, 'rules');
	const temp_info = stat(temp_rules);
	const config_info = lstat(config_rules);

	if (!temp_info || temp_info.type != 'directory')
		return { ok: false, code: 'temp_missing', path: temp_rules };

	let backup = '';

	if (config_info) {
		if (config_info.type == 'link') {
			if (!unlink(config_rules))
				return { ok: false, code: 'link_failed', path: config_rules };
		}
		else if (config_info.type == 'directory') {
			backup = config_rules + '.backup';

			if (lstat(backup) != null) {
				backup = config_rules + '.backup.' + time();
			}

			if (!rename(config_rules, backup))
				return { ok: false, code: 'backup_failed', path: config_rules };
		}
		else {
			return { ok: false, code: 'config_not_directory', path: config_rules };
		}
	}

	if (!symlink(temp_rules, config_rules))
		return { ok: false, code: 'link_failed', path: config_rules };

	return {
		ok: true,
		code: backup != '' ? 'link_created_backup' : 'link_created',
		target: temp_rules,
		backup
	};
}

function clamp_int(value, fallback, min, max) {
	const number = int(or_default(value, fallback));

	if (number < min)
		return min;

	if (number > max)
		return max;

	return number;
}

function status_call() {
	const settings = get_settings();
	const pids = process_id_list();
	const memory = memory_info();
	const alert_file = path_join(settings.log_dir, ALERT_FILE_NAME);
	const uptime_text = trim(read_text('/proc/uptime'));
	const uptime_parts = split(uptime_text, ' ');

	return {
		success: true,
		running: length(pids) > 0,
		pid: length(pids) > 0 ? '' + pids[0] : '',
		pid_count: length(pids),
		mem_kb: length(pids) > 0 ? process_rss_kb(pids[0]) : 0,
		mem_total: memory.total,
		mem_free: memory.free,
		mem_available: memory.available,
		mem_used: memory.used,
		mem_percent: memory.percent,
		alert_count: count_lines(alert_file),
		alert_file,
		interface: settings.interface,
		mode: settings.mode,
		method: settings.method,
		enabled: settings.enabled,
		manual: settings.manual,
		logging: settings.logging,
		action: settings.action,
		openappid: settings.openappid,
		autostart: length(glob('/etc/rc.d/S??snort')) > 0,
		init_available: access(INIT_SCRIPT, 'x') == true,
		updater_available: access(RULES_UPDATER, 'x') == true,
		config_dir: settings.config_dir,
		temp_dir: settings.temp_dir,
		log_dir: settings.log_dir,
		system_uptime: length(uptime_parts) > 0 ? int(uptime_parts[0]) : 0
	};
}

const SERVICE_ACTIONS = {
	start: 'started',
	stop: 'stopped',
	restart: 'restarted',
	enable: 'enabled',
	disable: 'disabled'
};

const methods = {
	status: {
		call: function() {
			return status_call();
		}
	},

	service: {
		args: { action: '' },
		call: function(request) {
			const action = arg_value(request.args, 'action', '');
			const result_code = (type(action) == 'string')
				? SERVICE_ACTIONS[action]
				: null;

			if (result_code == null)
				return { success: false, ok: false, code: 'invalid_action' };

			if (!access(INIT_SCRIPT, 'x'))
				return { success: false, ok: false, code: 'init_missing' };

			/* The snort3 init script and rules updater read
			 * /etc/config/snort.  Push the application settings there
			 * before starting or restarting the service. */
			if (action == 'start' || action == 'restart' || action == 'enable') {
				if (!sync_runtime_config())
					return { success: false, ok: false, code: 'action_failed' };
			}

			const rc = system([INIT_SCRIPT, action], 60000);
			const ok = rc == 0;

			return {
				success: ok,
				ok,
				code: ok ? result_code : 'action_failed',
				exit_code: rc
			};
		}
	},

	alerts: {
		args: { limit: 0, log_limit: 0 },
		call: function(request) {
			const settings = get_settings();
			const alert_file = path_join(settings.log_dir, ALERT_FILE_NAME);
			const limit = clamp_int(arg_value(request.args, 'limit', 50), 50, 1, 200);
			const log_limit = clamp_int(arg_value(request.args, 'log_limit', 0), 0, 0, 100);

			return {
				success: true,
				alerts: read_tail_lines(alert_file, limit, true),
				logs: snort_logs(log_limit),
				alert_file,
				alert_count: count_lines(alert_file)
			};
		}
	},

	rules: {
		call: function() {
			return rules_state();
		}
	},

	rules_update: {
		call: function() {
			if (!access(RULES_UPDATER, 'x'))
				return { success: false, ok: false, code: 'updater_missing', path: RULES_UPDATER };

			/* snort-rules reads the oinkcode and paths from the snort3
			 * configuration file. */
			if (!sync_runtime_config())
				return { success: false, ok: false, code: 'update_failed' };

			const settings = get_settings();
			const state = update_state();

			if (state.running)
				return { success: false, ok: false, code: 'update_busy' };

			if (state.lock)
				unlink(UPDATE_LOCK);

			if (writefile(UPDATE_LOG, '') == null)
				return { success: false, ok: false, code: 'update_failed' };

			if (writefile(UPDATE_LOCK, 'running\n') == null)
				return { success: false, ok: false, code: 'update_failed' };

			/* The outer subshell keeps the complete update chain in the
			 * background; a plain trailing "&" would only detach the last
			 * command and block this RPC call until the updater finished. */
			const command = '( ' + RULES_UPDATER + ' > ' + UPDATE_LOG + ' 2>&1; ' +
				'rm -f ' + shell_quote(settings.temp_dir) + '/*.tar.gz /tmp/snort*.tar.gz 2>/dev/null; ' +
				'rm -f ' + shell_quote(path_join(settings.temp_dir, 'rules')) + '/*.tar.gz 2>/dev/null; ' +
				'rm -f ' + UPDATE_LOCK + '; ' +
				'echo FINISHED >> ' + UPDATE_LOG + ' ) &';

			const rc = system(command);

			if (rc != 0) {
				unlink(UPDATE_LOCK);
				return { success: false, ok: false, code: 'update_failed', exit_code: rc };
			}

			return { success: true, ok: true, code: 'update_started' };
		}
	},

	rules_fix: {
		call: function() {
			return ensure_link(get_settings());
		}
	},

	rules_cleanup: {
		call: function() {
			const settings = get_settings();
			const state = update_state();

			if (state.running)
				return { success: false, ok: false, code: 'update_busy' };

			const dirs = [
				settings.temp_dir,
				path_join(settings.temp_dir, 'rules'),
				DEFAULT_TEMP_DIR,
				path_join(DEFAULT_TEMP_DIR, 'rules')
			];
			const seen = {};
			let removed = 0;

			for (let dir in dirs) {
				if (seen[dir])
					continue;

				seen[dir] = true;
				removed += remove_tarballs(dir, false);
			}

			removed += remove_tarballs('/tmp', true);

			const log_removed = unlink(UPDATE_LOG) != null;
			const lock_removed = unlink(UPDATE_LOCK) != null;

			return {
				success: true,
				ok: true,
				code: 'cleaned',
				removed,
				log_removed,
				lock_removed
			};
		}
	}
};

return { 'luci.snort': methods };
