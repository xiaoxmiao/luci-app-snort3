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

/* The built-in updater ships with this application and downloads the free
 * community ruleset.  The snort3 package's own /usr/bin/snort-rules is used
 * as a fallback when the built-in script is missing (older installations). */
const RULES_UPDATER_BUILTIN = '/usr/libexec/snort-web-rules-update';
const RULES_UPDATER_LEGACY = '/usr/bin/snort-rules';

const UPDATE_LOCK = '/tmp/snort_rules_update.lock';
const UPDATE_LOG = '/tmp/snort_rules_update.log';
const UPDATE_STATUS = '/tmp/snort_rules_update.status';
const UPDATE_RC = '/tmp/snort_rules_update.rc';
const SERVICE_STATUS = '/tmp/snort_service_action.status';
const SERVICE_DETAIL = '/tmp/snort_service_action.detail';
const SERVICE_OUTPUT = '/tmp/snort_service_action.output';
const SERVICE_LOGTAIL = '/tmp/snort_service_action.logtail';

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
		manual: get('manual', '0'),
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

/* Prefer the built-in free-rule updater; fall back to the snort3 package's
 * script so existing installations keep working. */
function rules_updater() {
	/* The bundled script is a POSIX shell file.  Only readability is
	 * required: it is launched through /bin/sh, so a package that lost its
	 * executable bit (Windows checkouts, some apk installers) still works. */
	if (access(RULES_UPDATER_BUILTIN, 'r') == true)
		return RULES_UPDATER_BUILTIN;

	if (access(RULES_UPDATER_LEGACY, 'x') == true)
		return RULES_UPDATER_LEGACY;

	return null;
}

function updater_command(path) {
	return (path == RULES_UPDATER_BUILTIN)
		? '/bin/sh ' + shell_quote(path)
		: shell_quote(path);
}

function updater_process_alive() {
	const entries = lsdir('/proc');

	if (!entries)
		return false;

	for (let name in entries) {
		if (!match(name, /^[0-9]+$/))
			continue;

		const cmdline = read_text('/proc/' + name + '/cmdline');

		if (index(cmdline, 'snort-rules') != null ||
		    index(cmdline, 'snort-web-rules-update') != null)
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

	/* The updater writes its result to UPDATE_STATUS.  A stale "running"
	 * state without a lock means the process was killed before it could
	 * report back, which the UI should show as a failure, not a hang. */
	const status_lines = split(trim(read_text(UPDATE_STATUS) || ''), '\n');
	let result = trim(status_lines[0] || '') || 'idle';
	let code = trim(status_lines[1] || '') || '';

	if (result == 'ok')
		result = 'finished';
	else if (result == 'running' && !lock && !finished) {
		result = 'failed';
		code = 'rules_update_failed';
	}
	else if (result == 'running' && finished) {
		/* The legacy /usr/bin/snort-rules does not write a status file.
		 * Fall back to the exit code recorded by the background shell. */
		const rc_text = trim(read_text(UPDATE_RC) || '');

		if (rc_text != '' && rc_text != '0') {
			result = 'failed';
			code = 'rules_update_failed';
		}
		else {
			result = 'finished';
		}
	}
	else if (result == 'failed' && !code)
		code = 'rules_update_failed';
	else if (result == 'idle' && finished)
		result = 'finished';

	return {
		running: lock && !finished && !stale,
		lock,
		alive,
		stale,
		age,
		finished,
		log_lines,
		result,
		code
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
		updater_available: rules_updater() != null,
		updater: rules_updater(),
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

/* UCI values are strings, but tolerate booleans and numbers as well. */
function is_enabled(value) {
	const text = '' + or_default(value, '0');

	return text == '1' || text == 'true' || text == 'yes' || text == 'on';
}

/* snort-web-sync falls back to a generated configuration when manual mode is
 * selected but its config files are missing.  Diagnostics must describe what
 * the init script will actually do, so read the runtime copy of the snort3
 * settings instead of the LuCI setting. */
function runtime_manual() {
	let uci = null;

	try {
		uci = cursor();
	}
	catch (e) {
		return null;
	}

	if (!uci)
		return null;

	try {
		return first_value(uci.get_first('snort', 'snort', 'manual'), null);
	}
	catch (e) {
		return null;
	}
}

/* Manual mode is started by snort3 with "--tweaks local", and the stock
 * snort.lua ends with include(tweaks .. '.lua').  Both snort.lua AND local.lua
 * must exist, otherwise snort exits immediately and procd reports a crash
 * loop ("cannot open ./local.lua: No such file or directory"). */
function manual_config_ready(settings) {
	return access(path_join(settings.config_dir, 'snort.lua'), 'f') == true &&
		access(path_join(settings.config_dir, 'local.lua'), 'f') == true;
}

function needs_manual_config(settings) {
	const rt = runtime_manual();
	const manual = (rt == null) ? settings.manual : rt;

	return is_enabled(manual) && !manual_config_ready(settings);
}

/* Explain the two manual-mode traps that are invisible in the UI:
 *   - the sync helper fell back to the generated configuration;
 *   - manual mode skips the generated daq.module_dirs, so builds without a
 *     compiled-in DAQ search path fail with "Could not find requested DAQ
 *     module: pcap". */
function manual_hint(settings) {
	const rt = runtime_manual();
	const active = (rt == null) ? settings.manual : rt;

	if (!is_enabled(settings.manual))
		return '';

	if (!is_enabled(active))
		return 'manual_fallback';

	if (!manual_config_ready(settings))
		return 'config_missing';

	const main_lua = read_text(path_join(settings.config_dir, 'snort.lua'));
	const local_lua = read_text(path_join(settings.config_dir, 'local.lua'));

	if (!match(main_lua, /module_dirs/) && !match(local_lua, /module_dirs/))
		return 'daq_dir_missing';

	return '';
}

/* Run a command through the shell and keep its output so a failed service
 * action can be explained instead of being reported as a bare exit code.
 * Redirect to a regular file instead of using popen(): a daemon launched by
 * procd would inherit the pipe's write end and read('all') would never see
 * EOF, hanging the RPC call. */
function capture_output(command) {
	const rc = system(command + ' > ' + SERVICE_OUTPUT + ' 2>&1', 60000);
	const text = read_text(SERVICE_OUTPUT);
	let output = '';

	for (let line in split(text, '\n')) {
		const trimmed = trim(line);

		if (length(trimmed) == 0)
			continue;

		output += (length(output) ? ' | ' : '') + trimmed;
	}

	if (length(output) > 400)
		output = substr(output, 0, 400) + '...';

	return { rc, output };
}

/* procd sends the daemon's stderr to syslog, so a fatal Lua/DAQ error never
 * appears in the init script's stdout.  Surface the most recent snort lines so
 * the UI shows "cannot open ./local.lua" or "DAQ module: pcap" instead of a
 * generic "failed to start". */
function snort_log_tail() {
	system('logread 2>/dev/null | grep -i snort | tail -n 8 > ' +
		SERVICE_LOGTAIL + ' 2>/dev/null', 10000);

	const text = read_text(SERVICE_LOGTAIL);
	let output = '';

	for (let line in split(text, '\n')) {
		const trimmed = trim(line);

		if (length(trimmed) == 0)
			continue;

		output += (length(output) ? ' | ' : '') + trimmed;
	}

	if (length(output) > 400)
		output = substr(output, 0, 400) + '...';

	return output;
}

/* The snort3 procd init script exits 0 even when it declines to start the
 * daemon ([ "$enabled" = 0 ] && return), so translate the configuration into
 * an actionable reason whenever no process shows up. */
function service_problem(settings, output) {
	const rules_path = path_join(settings.config_dir, 'rules');
	const lua_path = path_join(settings.config_dir, 'snort.lua');

	if (!is_enabled(settings.enabled))
		return {
			code: 'service_disabled',
			message: 'Enable Snort in Settings first (snort-web.snort.enabled=0).'
		};

	if (needs_manual_config(settings))
		return {
			code: 'config_missing',
			message: 'Manual mode requires both ' + lua_path + ' and ' +
				path_join(settings.config_dir, 'local.lua') +
				'. Create them or turn off Manual mode.'
		};

	if (rule_file_count(rules_path) == 0)
		return {
			code: 'rules_missing',
			message: 'No .rules files in ' + rules_path +
				'. Run "Update rules" before starting Snort.'
		};

	const log = snort_log_tail();
	const detail = length(log) ? 'logread: ' + log : '';

	if (length(output) > 0)
		return { code: 'start_failed',
		         message: length(detail) ? output + ' | ' + detail : output };

	return {
		code: 'start_failed',
		message: 'The init script returned success but no snort process is running. ' +
			(length(detail) ? detail : 'Check "logread | grep snort" and "snort-mgr check".')
	};
}

function status_call() {
	const settings = get_settings();
	const pids = process_id_list();
	const memory = memory_info();
	const alert_file = path_join(settings.log_dir, ALERT_FILE_NAME);
	const uptime_text = trim(read_text('/proc/uptime'));
	const uptime_parts = split(uptime_text, ' ');
	const running = length(pids) > 0;
	const init_available = access(INIT_SCRIPT, 'x') == true;
	const rule_count = rule_file_count(path_join(settings.config_dir, 'rules'));
	const action_lines = split(trim(read_text(SERVICE_STATUS) || ''), '\n');
	const last_failed = trim(action_lines[0] || '') == 'failed';
	const manual_hint_code = manual_hint(settings);
	const active_manual = first_value(runtime_manual(), settings.manual);
	let service_state = running ? 'running' : 'stopped';
	let service_code = '';
	let service_hint = '';

	/* A failed service action is the most specific explanation and wins over
	 * the generic "no rules" check.  A user-initiated stop remains "stopped". */
	if (!init_available) {
		service_state = 'error';
		service_code = 'init_missing';
	}
	else if (!running && last_failed) {
		service_state = 'error';
		service_code = trim(action_lines[1] || '') || 'action_failed';
	}
	else if (!running && rule_count == 0) {
		service_state = 'error';
		service_code = 'rules_missing';
	}
	else if (!running && !is_enabled(settings.enabled)) {
		/* Not an error yet, but explain why pressing Start would do nothing. */
		service_hint = 'service_disabled';
	}
	else if (!running && length(manual_hint_code) > 0) {
		service_hint = manual_hint_code;
	}
	else if (!running && needs_manual_config(settings)) {
		service_hint = 'config_missing';
	}

	return {
		success: true,
		running,
		service_state,
		service_code,
		service_hint,
		service_message: last_failed ? trim(read_text(SERVICE_DETAIL) || '') : '',
		rules_available: rule_count > 0,
		rule_count,
		pid: running ? '' + pids[0] : '',
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
		config_mode: is_enabled(active_manual) ? 'manual' : 'generated',
		logging: settings.logging,
		action: settings.action,
		openappid: settings.openappid,
		autostart: length(glob('/etc/rc.d/S??snort')) > 0,
		init_available,
		updater_available: rules_updater() != null,
		updater: rules_updater(),
		config_dir: settings.config_dir,
		temp_dir: settings.temp_dir,
		log_dir: settings.log_dir,
		system_uptime: length(uptime_parts) > 0 ? int(uptime_parts[0]) : 0
	};
}

function record_service_action(ok, code, detail) {
	writefile(SERVICE_STATUS, (ok ? 'ok\n' : 'failed\n') + code + '\n');
	writefile(SERVICE_DETAIL, ok ? '' : (detail || ''));
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

			if (!access(INIT_SCRIPT, 'x')) {
				record_service_action(false, 'init_missing', 'Init script ' +
					INIT_SCRIPT + ' is missing. Install the snort3 package.');
				return { success: false, ok: false, code: 'init_missing',
				         message: 'Init script ' + INIT_SCRIPT + ' is missing.' };
			}

			/* The snort3 init script and rules updater read
			 * /etc/config/snort.  Push the application settings there
			 * before starting or restarting the service. */
			if (action == 'start' || action == 'restart' || action == 'enable') {
				if (!sync_runtime_config()) {
					record_service_action(false, 'action_failed',
						'/usr/libexec/snort-web-sync --sync failed.');
					return { success: false, ok: false, code: 'action_failed',
					         message: 'Unable to synchronise /etc/config/snort.' };
				}
			}

			if (action == 'start' || action == 'restart') {
				const settings = get_settings();

				/* procd's init script silently returns 0 when enabled=0. */
				if (!is_enabled(settings.enabled)) {
					const problem = service_problem(settings, '');

					record_service_action(false, problem.code, problem.message);
					return { success: false, ok: false, code: problem.code,
					         message: problem.message };
				}

				/* Capture stdout/stderr: "snort-mgr check" failures and
				 * validation errors are otherwise lost. */
				const run = capture_output(shell_quote(INIT_SCRIPT) + ' ' + action);

				/* procd starts asynchronously; give it a few seconds and
				 * verify a snort process actually appeared.  A restart needs
				 * an initial grace period so the old PID is not mistaken for
				 * the new instance. */
				if (action == 'restart')
					system('sleep 1', 3000);

				let alive = false;

				for (let i = 0; i < 6; i++) {
					if (length(process_id_list()) > 0) {
						alive = true;
						break;
					}

					system('sleep 1', 3000);
				}

				/* A crash-looping daemon shows a PID briefly.  Recheck after
				 * two seconds so a respawn is not reported as a success. */
				if (alive) {
					system('sleep 2', 4000);
					alive = length(process_id_list()) > 0;
				}

				if (run.rc != 0 || !alive) {
					const problem = service_problem(settings, run.output);

					record_service_action(false, problem.code, problem.message);
					return { success: false, ok: false, code: problem.code,
					         message: problem.message, exit_code: run.rc };
				}

				record_service_action(true, result_code, '');
				return { success: true, ok: true, code: result_code };
			}

			const rc = system([INIT_SCRIPT, action], 60000);
			const ok = rc == 0;

			record_service_action(ok, ok ? result_code : 'action_failed',
				ok ? '' : 'Init script ' + action + ' returned ' + rc + '.');

			return {
				success: ok,
				ok,
				code: ok ? result_code : 'action_failed',
				exit_code: rc,
				message: ok ? '' : 'Init script ' + action + ' returned ' + rc + '.'
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
			const updater = rules_updater();

			if (updater == null)
				return { success: false, ok: false, code: 'updater_missing',
				         path: RULES_UPDATER_BUILTIN,
				         message: 'Neither ' + RULES_UPDATER_BUILTIN +
				             ' nor ' + RULES_UPDATER_LEGACY +
				             ' is available. Reinstall this package or the snort3 package.' };

			/* Both updaters read the oinkcode and paths from the snort3
			 * configuration file. */
			if (!sync_runtime_config())
				return { success: false, ok: false, code: 'update_failed',
				         message: '/usr/libexec/snort-web-sync --sync failed; check /etc/config/snort-web.' };

			const settings = get_settings();
			const state = update_state();

			if (state.running)
				return { success: false, ok: false, code: 'update_busy',
				         message: 'A rules update is already running. See ' + UPDATE_LOG + '.' };

			if (state.lock)
				unlink(UPDATE_LOCK);

			unlink(UPDATE_RC);

			if (writefile(UPDATE_LOG, '') == null)
				return { success: false, ok: false, code: 'update_failed',
				         message: 'Unable to write ' + UPDATE_LOG + '.' };

			if (writefile(UPDATE_LOCK, 'running\n') == null)
				return { success: false, ok: false, code: 'update_failed',
				         message: 'Unable to write ' + UPDATE_LOCK + '.' };

			if (writefile(UPDATE_STATUS, 'running\n') == null)
				return { success: false, ok: false, code: 'update_failed',
				         message: 'Unable to write ' + UPDATE_STATUS + '.' };

			/* The outer subshell keeps the complete update chain in the
			 * background; a plain trailing "&" would only detach the last
			 * command and block this RPC call until the updater finished.
			 * Redirecting the subshell itself keeps its stdout pipe closed
			 * so the RPC returns immediately. */
			const command = '( ' + updater_command(updater) + ' > ' + UPDATE_LOG + ' 2>&1; ' +
				'echo $? > ' + UPDATE_RC + '; ' +
				'rm -f ' + shell_quote(settings.temp_dir) + '/*.tar.gz /tmp/snort*.tar.gz 2>/dev/null; ' +
				'rm -f ' + shell_quote(path_join(settings.temp_dir, 'rules')) + '/*.tar.gz 2>/dev/null; ' +
				'rm -f ' + UPDATE_LOCK + '; ' +
				'echo FINISHED >> ' + UPDATE_LOG + ' ) >/dev/null 2>&1 &';

			const rc = system(command);

			if (rc != 0) {
				unlink(UPDATE_LOCK);
				writefile(UPDATE_STATUS, 'failed\nrules_update_failed\n');
				return { success: false, ok: false, code: 'update_failed',
				         exit_code: rc,
				         message: 'Unable to launch the updater shell (exit ' + rc + ').' };
			}

			return { success: true, ok: true, code: 'update_started',
			         updater, log: UPDATE_LOG };
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
			const status_removed = unlink(UPDATE_STATUS) != null;

			return {
				success: true,
				ok: true,
				code: 'cleaned',
				removed,
				log_removed,
				lock_removed,
				status_removed
			};
		}
	}
};

return { 'luci.snort': methods };
