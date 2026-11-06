'use strict';

/*
 * LuCI Snort3 backend.
 *
 * This file is loaded by rpcd from /usr/share/rpcd/ucode/ and registers the
 * "luci.snort" ubus object.  All privileged operations (init script, log and
 * rule file access) stay on this side of the RPC boundary; the JavaScript
 * views only send allow-listed actions and display the returned data.
 */

import { access, glob, lstat, readfile, readlink, stat, unlink,
         writefile, popen, open, lsdir } from 'fs';
import { cursor } from 'uci';

const INIT_SCRIPT = '/etc/init.d/snort';
const SYNC_HELPER = '/usr/libexec/snort-web-sync';

/* Only the application's own updater is used.  The snort3 package's
 * /usr/bin/snort-rules would replace the persistent rules directory with a
 * tmpfs symlink and lose all downloaded rules on the next reboot. */
const RULES_UPDATER_BUILTIN = '/usr/libexec/snort-web-rules-update';

const UPDATE_LOCK = '/tmp/snort_rules_update.lock';
const UPDATE_LOG = '/tmp/snort_rules_update.log';
const UPDATE_STATUS = '/tmp/snort_rules_update.status';
const UPDATE_RC = '/tmp/snort_rules_update.rc';
const SERVICE_STATUS = '/tmp/snort_service_action.status';
const SERVICE_DETAIL = '/tmp/snort_service_action.detail';
const SERVICE_OUTPUT = '/tmp/snort_service_action.output';
const SERVICE_LOGALL = '/tmp/snort_service_action.logall';
const BACKEND_ERROR = '/tmp/snort_backend_error.log';
const SERVICE_PIDS = '/tmp/snort_proc_pids';

const CONFIG_NAME = 'snort-web';

const DEFAULT_CONFIG_DIR = '/etc/snort';
const DEFAULT_TEMP_DIR = '/var/snort.d';
const DEFAULT_LOG_DIR = '/var/log';
const ALERT_FILE_NAME = 'alert_json.txt';
const UPDATE_SOURCE = '/tmp/snort_rules_update.source';

const TAIL_BYTES = 64 * 1024;
const UPDATE_STALE_GRACE = 10 * 60;
const UPDATE_IDLE_AFTER = 5 * 60;

function safe_path(value, fallback) {
	if (type(value) != 'string' || length(value) == 0)
		return fallback;

	const path = '' + value;

	/* Older ucode builds throw on "\\x" escapes inside regex literals.  That
	 * single expression used to abort get_settings(), which made status,
	 * rules and alerts fail with a bare "Unknown error".  These paths come
	 * from our own UCI file, so an absolute-path and traversal check is
	 * sufficient and works on every ucode version. */
	if (substr(path, 0, 1) != '/' || match(path, /\.\./))
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
		rules_persist: get('rules_persist', '0'),
		rules_auto_update: get('rules_auto_update', '0'),
		rules_update_interval: get('rules_update_interval', 'weekly')
	};
}

/* One scan of /proc feeds both the running state and the diagnostic reply.
 * The executable is /usr/bin/snort but comm is "snort3" on many builds, and
 * procd's rc.common wrapper is also named "snort".  Plain string searches are
 * used instead of an anchored regex on comm: the anchored expression failed
 * on some ucode builds and reported a running daemon as stopped. */
function proc_scan() {
	const found = [];
	const entries = lsdir('/proc');

	if (!entries)
		return found;

	for (let name in entries) {
		if (!match(name, /^[0-9]+$/))
			continue;

		const comm = trim(read_text('/proc/' + name + '/comm'));
		const cmdline = read_text('/proc/' + name + '/cmdline');
		const daemon = index(cmdline, '/usr/bin/snort') != null;
		const wrapper = index(cmdline, 'rc.common') != null ||
		                index(cmdline, '/etc/init.d/snort') != null;
		const named = index(comm, 'snort') != null || index(comm, 'Snort') != null;

		if (!daemon && !named && index(cmdline, 'snort') == null)
			continue;

		push(found, { pid: +name, comm: comm, daemon: daemon,
		              wrapper: wrapper, named: named });

		if (length(found) >= 10)
			break;
	}

	return found;
}

/* Fall back to pidof when /proc cannot be enumerated from rpcd's context.
 * Both names are queried: the daemon's comm is snort3 on many builds while
 * older ones still use snort. */
function pidof_pids() {
	system('pidof snort3 snort > ' + SERVICE_PIDS + ' 2>/dev/null', 5000);

	const pids = [];

	for (let part in split(trim(read_text(SERVICE_PIDS)), ' ')) {
		const pid = int(trim(part));

		if (pid > 0)
			push(pids, pid);
	}

	return pids;
}

function process_id_list() {
	const pids = [];

	for (let p in proc_scan()) {
		if (p.wrapper)
			continue;

		if (p.daemon || p.named)
			push(pids, p.pid);
	}

	if (length(pids) == 0)
		return pidof_pids();

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

/* snort-mgr's template enables alert_json, which writes alert_json.txt plus
 * one N_alert_json.txt per packet thread.  The old alert_fast.txt is kept as
 * a compatibility fallback. */
function alert_files(settings) {
	const dir = settings.log_dir;
	const names = lsdir(dir);
	const files = [];

	if (!names)
		return files;

	for (let name in names) {
		if (name == ALERT_FILE_NAME || name == 'alert_fast.txt' ||
		    match(name, /^[0-9]+_alert_json\.txt$/))
			push(files, path_join(dir, name));
	}

	return files;
}

function read_alert_lines(files, limit, newest_first) {
	let lines = [];

	for (let file in files) {
		for (let line in read_tail_lines(file, limit, false))
			push(lines, line);
	}

	if (length(lines) > limit)
		lines = slice(lines, length(lines) - limit);

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

function count_alert_lines(files) {
	let total = 0;

	for (let file in files)
		total += count_lines(file);

	return total;
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

/* Only the bundled updater is supported: the snort3 package's own script
 * would replace the persistent rules directory with a tmpfs symlink. */
function rules_updater() {
	/* Launched through /bin/sh, so only readability is required. */
	return access(RULES_UPDATER_BUILTIN, 'r') == true
		? RULES_UPDATER_BUILTIN : null;
}

function updater_command(path) {
	return '/bin/sh ' + shell_quote(path);
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
	const status_info = lstat(UPDATE_STATUS);
	const lock = lock_info != null;
	const lock_age = lock_info ? (time() - or_default(lock_info.mtime, 0)) : 0;
	const status_age = status_info ? (time() - or_default(status_info.mtime, 0)) : 0;
	const rc_text = trim(read_text(UPDATE_RC) || '');
	let finished = false;

	for (let line in log_lines) {
		if (index('' + line, 'FINISHED') != null) {
			finished = true;
			break;
		}
	}

	/* The lock exists from the moment the RPC starts the background chain
	 * until that chain removes it.  It is authoritative: a stale status file,
	 * an old FINISHED line or a clock/mtime mismatch must never turn a live
	 * download into "completed". */
	const alive = updater_process_alive();
	const stale = lock && !alive && lock_age > UPDATE_STALE_GRACE;
	const running = (lock || alive) && !stale;

	const status_lines = split(trim(read_text(UPDATE_STATUS) || ''), '\n');
	let result = trim(status_lines[0] || '') || 'idle';
	let code = trim(status_lines[1] || '') || '';

	/* A live lock wins over the status file.  While a new updater is starting
	 * the file can still hold the previous run's "ok", which used to make the
	 * page say "Update completed!" during an active download. */
	if (running) {
		result = 'running';
		code = '';
	}
	else if (result == 'running' && !finished) {
		result = 'failed';
		code = 'rules_update_failed';
	}
	else if (result == 'failed') {
		if (!code)
			code = 'rules_update_failed';

		if (status_age > UPDATE_IDLE_AFTER)
			result = 'idle';
	}
	else if (result == 'ok' || result == 'finished' ||
	         (result == 'running' && finished) ||
	         (result == 'idle' && finished)) {
		if (rc_text != '' && rc_text != '0') {
			result = 'failed';
			code = 'rules_update_failed';
		}
		/* The result file is persistent; do not leave "Update completed!"
		 * on screen forever when no update was requested in this session. */
		else if (status_age > UPDATE_IDLE_AFTER)
			result = 'idle';
		else
			result = 'finished';
	}
	else {
		result = 'idle';
	}

	return {
		running,
		lock,
		alive,
		stale,
		age: lock_age,
		status_age,
		finished,
		result_raw: result,
		finished_at: finished && !running && status_info ? or_default(status_info.mtime, 0) : 0,
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

function rule_file_list(dir) {
	const names = lsdir(dir);
	const list = [];

	if (!names)
		return list;

	for (let name in names) {
		if (!match(name, /\.rules$/))
			continue;

		const info = stat(path_join(dir, name));

		if (!info || info.type != 'file')
			continue;

		push(list, {
			name: name,
			size: or_default(info.size, 0),
			mtime: or_default(info.mtime, 0)
		});
	}

	return list;
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

	const files = rule_file_list(config_rules);
	const source_marker = trim(read_text(path_join(config_rules, '.source')));
	const directory = stat(config_rules);
	const persisted = '' + settings.rules_persist == '1';
	const actual_persistent = config_info != null && config_info.type == 'directory';
	let updated = directory ? or_default(directory.mtime, 0) : 0;

	for (let f in files) {
		if (f.mtime > updated)
			updated = f.mtime;
	}

	return {
		success: true,
		ok: true,
		config_rules,
		temp_rules,
		config_exists: config_info != null,
		persistent: persisted,
		storage_actual: actual_persistent ? 'persistent' : 'temporary',
		storage_mismatch: persisted != actual_persistent,
		config_is_link: link,
		link_target: target,
		link_valid: link && target_exists,
		temp_exists: temp_info != null && temp_info.type == 'directory',
		config_rule_count: length(files),
		temp_rule_count: rule_file_count(temp_rules),
		rule_files: files,
		/* The marker lives inside the rules directory, so it is replaced
		 * together with the rules and always describes what is installed -
		 * not the Oinkcode that happens to be saved. */
		rules_source: source_marker || trim(read_text(UPDATE_SOURCE)) || 'community',
		rules_updated: updated,
		rules_persist: persisted,
		rules_auto_update: '' + settings.rules_auto_update == '1',
		rules_update_interval: settings.rules_update_interval,
		oinkcode: settings.oinkcode,
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

/* Older releases kept downloaded rules in tmpfs behind a symlink.  Replace
 * that symlink with a real directory and copy every rule still reachable, so
 * the rules survive the next reboot.  The "Update rules" button does the same
 * thing with a freshly downloaded archive. */
function migrate_rules(settings) {
	const config_rules = path_join(settings.config_dir, 'rules');
	const temp_rules = path_join(settings.temp_dir, 'rules');
	const info = lstat(config_rules);

	if (!info || info.type != 'link')
		return { ok: true, code: 'already_persistent', path: config_rules,
		         message: 'Rules are already stored persistently.' };

	const target = or_default(readlink(config_rules), '');
	const stage = config_rules + '.persist';
	const command = 'set -e; ' +
		'rm -rf ' + shell_quote(stage) + '; ' +
		'mkdir -p ' + shell_quote(stage) + '; ' +
		'for d in ' + shell_quote(target) + ' ' + shell_quote(temp_rules) + '; do ' +
		'  [ -d "$d" ] || continue; ' +
		'  for f in "$d"/*.rules; do ' +
		'    if [ -f "$f" ]; then cp -f "$f" ' + shell_quote(stage) + '/; fi; ' +
		'  done; ' +
		'done; ' +
		'rm -f ' + shell_quote(config_rules) + '; ' +
		'mv ' + shell_quote(stage) + ' ' + shell_quote(config_rules);

	if (system(command, 30000) != 0)
		return { ok: false, code: 'migrate_failed', path: config_rules,
		         message: 'Unable to migrate the rules directory.' };

	return { ok: true, code: 'rules_persisted', path: config_rules,
	         count: rule_file_count(config_rules),
	         message: 'Rules moved into the persistent directory.' };
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

/* The generated snort.lua is the only supported configuration.  Read the
 * runtime interface from /etc/config/snort because the application may store
 * "auto", which the sync helper resolves into a real kernel device name. */
function runtime_interface(fallback) {
	let uci = null;

	try {
		uci = cursor();
	}
	catch (e) {
		return fallback;
	}

	if (!uci)
		return fallback;

	try {
		return first_value(uci.get_first('snort', 'snort', 'interface'), fallback) || fallback;
	}
	catch (e) {
		return fallback;
	}
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

/* Mark the syslog position before a start/restart.  logread keeps entries from
 * previous runs for a long time, so a plain "tail -n 8" would keep reporting an
 * old "cannot open ./local.lua" as the reason for every later failure, long
 * after the configuration was fixed. */
function mark_service_log() {
	system('logger -t snort-web "snort-service-begin" 2>/dev/null || true', 5000);
}

/* procd sends the daemon's stderr to syslog, so a fatal Lua/DAQ error never
 * appears in the init script's stdout.  Only use lines written AFTER the last
 * marker and ignore snort-web / snort-web-sync notices: those are normal
 * informational messages, not the reason snort exited. */
function snort_log_tail() {
	system('logread 2>/dev/null > ' + SERVICE_LOGALL, 10000);

	const lines = split(read_text(SERVICE_LOGALL) || '', '\n');
	let start = 0;

	/* Restart actions repeat the marker; only the newest one matters. */
	for (let i = 0; i < length(lines); i++) {
		if (match(lines[i] || '', /snort-service-begin/))
			start = i + 1;
	}

	let output = '';

	for (let i = start; i < length(lines); i++) {
		const trimmed = trim(lines[i] || '') || '';

		if (length(trimmed) == 0)
			continue;

		if (!match(trimmed, /snort[0-9]*\[/) && !match(trimmed, /procd.*snort/))
			continue;

		output += (length(output) ? ' | ' : '') + trimmed;
	}

	/* Keep the newest lines rather than truncating from the front. */
	if (length(output) > 400)
		output = '...' + substr(output, length(output) - 397);

	return output;
}

/* The snort3 procd init script exits 0 even when it declines to start the
 * daemon ([ "$enabled" = 0 ] && return), so translate the configuration into
 * an actionable reason whenever no process shows up. */
function service_problem(settings, output) {
	const rules_path = path_join(settings.config_dir, 'rules');

	if (!is_enabled(settings.enabled))
		return {
			code: 'service_disabled',
			message: 'Enable Snort in Settings first (snort-web.snort.enabled=0).'
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
		message: 'The init script returned success but no snort process was found in /proc. ' +
			(length(detail) ? detail : 'Check "logread | grep snort" and "snort-mgr check".')
	};
}

function status_call() {
	const settings = get_settings();
	const pids = process_id_list();
	const memory = memory_info();
	const alert_paths = alert_files(settings);
	const uptime_text = trim(read_text('/proc/uptime'));
	const uptime_parts = split(uptime_text, ' ');
	const running = length(pids) > 0;
	const init_available = access(INIT_SCRIPT, 'x') == true;
	const rule_count = rule_file_count(path_join(settings.config_dir, 'rules'));
	const action_lines = split(trim(read_text(SERVICE_STATUS) || ''), '\n');
	const last_failed = trim(action_lines[0] || '') == 'failed';
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
		proc_comm: running ? trim(read_text('/proc/' + pids[0] + '/comm')) : '',
		proc_scan: proc_scan(),
		pid_count: length(pids),
		mem_kb: length(pids) > 0 ? process_rss_kb(pids[0]) : 0,
		mem_total: memory.total,
		mem_free: memory.free,
		mem_available: memory.available,
		mem_used: memory.used,
		mem_percent: memory.percent,
		alert_count: count_alert_lines(alert_paths),
		alert_files: alert_paths,
		interface: runtime_interface(settings.interface),
		mode: settings.mode,
		method: settings.method,
		enabled: settings.enabled,
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

			/* Only syslog lines from this attempt may be used as the failure
			 * reason.  Older local.lua/DAQ crashes are still in logread. */
			mark_service_log();

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
			const paths = alert_files(settings);
			const limit = clamp_int(arg_value(request.args, 'limit', 50), 50, 1, 200);
			const log_limit = clamp_int(arg_value(request.args, 'log_limit', 0), 0, 0, 100);

			return {
				success: true,
				alerts: read_alert_lines(paths, limit, true),
				logs: snort_logs(log_limit),
				alert_files: paths,
				alert_count: count_alert_lines(paths)
			};
		}
	},

	rules: {
		call: function() {
			return rules_state();
		}
	},

	rules_update: {
		args: { mode: '', oinkcode: '' },
		call: function(request) {
			const updater = rules_updater();

			if (updater == null)
				return { success: false, ok: false, code: 'updater_missing',
				         path: RULES_UPDATER_BUILTIN,
				         message: RULES_UPDATER_BUILTIN +
				             ' is missing. Reinstall luci-app-snort3.' };

			const mode = arg_value(request.args, 'mode', 'registered');
			const supplied = arg_value(request.args, 'oinkcode', null);

			if (mode != 'registered' && mode != 'community')
				return { success: false, ok: false, code: 'invalid_mode',
				         message: 'Unknown rules source.' };

			/* Save the Oinkcode, but keep it when the user switches to the
			 * free community source (the setting is never cleared here). */
			if (supplied != null && trim('' + supplied) != '') {
				const save_rc = system('uci -q set snort-web.snort.oinkcode=' +
					shell_quote('' + supplied) + ' && uci -q commit snort-web', 10000);

				if (save_rc != 0)
					return { success: false, ok: false, code: 'update_failed',
					         message: 'Unable to save the Oinkcode.' };
			}

			const settings = get_settings();

			if (mode == 'registered' && trim('' + settings.oinkcode) == '')
				return { success: false, ok: false, code: 'oinkcode_missing',
				         message: 'Enter an Oinkcode before downloading subscriber rules.' };

			/* The updater reads oinkcode and paths from the runtime
			 * snort3 configuration. */
			if (!sync_runtime_config())
				return { success: false, ok: false, code: 'update_failed',
				         message: '/usr/libexec/snort-web-sync --sync failed; check /etc/config/snort-web.' };

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

			const extra = (mode == 'community') ? ' --community' : '';
			/* The outer subshell keeps the complete update chain in the
			 * background; a plain trailing "&" would only detach the last
			 * command and block this RPC call until the updater finished. */
			const command = '( ' + updater_command(updater) + extra + ' > ' + UPDATE_LOG + ' 2>&1; ' +
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
			         updater, mode, log: UPDATE_LOG };
		}
	},

	rules_fix: {
		call: function() {
			return migrate_rules(get_settings());
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

/* rpcd turns an uncaught ucode exception into a bare "Unknown error" and
 * writes the stack trace to stderr, which procd does not forward to syslog.
 * Convert any such failure into a structured reply and leave a file on the
 * device so the failing method and its message can be read over SSH. */
function guard(name, handler) {
	return function(request) {
		try {
			return handler(request);
		}
		catch (e) {
			let message = '' + e;

			try {
				if (type(e) == 'object' && e.message != null)
					message = '' + e.message;
			}
			catch (ignored) {}

			writefile(BACKEND_ERROR, name + ': ' + message + '\n');

			return { success: false, ok: false, code: 'backend_error',
			         method: name, message: message, log: BACKEND_ERROR };
		}
	};
}

for (let name in methods)
	methods[name].call = guard(name, methods[name].call);

return { 'luci.snort': methods };
