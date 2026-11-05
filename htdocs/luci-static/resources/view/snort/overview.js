'use strict';

'require view';
'require dom';
'require poll';
'require ui';
'require snort.api as api';
'require snort.util as util';
'require snort.style as style';

function setText(node, text) {
	if (node)
		node.textContent = (text == null) ? '' : String(text);
}

function setBadge(node, text, tone) {
	if (!node)
		return;

	node.textContent = text;
	node.className = 'snort3-badge snort3-badge-' + (tone || 'muted');
}

function row(label, value) {
	return E('div', { 'class': 'snort3-row' }, [
		E('span', { 'class': 'snort3-label' }, label),
		E('span', { 'class': 'snort3-value' }, value)
	]);
}

function card(title, children) {
	return E('div', { 'class': 'snort3-card' }, [
		E('h3', {}, title),
		E('div', {}, children)
	]);
}

/* Never swallow an error: prefer the backend's explanation, then the raw
 * error code, and only fall back to "Unknown error" when there is nothing. */
function notification(code, result, extra) {
	var res = (result && typeof result === 'object') ? result : {};
	var reason = res.message || res.error || code ||
		(result != null && typeof result !== 'object' ? String(result) : '');
	var text = util.msg(code, reason);

	/* If we still ended up at the generic message, attach the raw reply so a
	 * broken backend never turns into an unexplainable "Unknown error". */
	if (text === util.translate('Unknown error')) {
		var dump;

		try {
			dump = JSON.stringify(result);
		}
		catch (e) {
			dump = String(result);
		}

		text += ' - ' + (dump && dump !== '{}' && dump !== 'undefined'
			? dump.substring(0, 200) : 'no error code in RPC reply');
	}

	if (res.path)
		text += ' ' + res.path;

	if (res.log && code === 'update_started')
		text += ' ' + res.log;

	if (extra)
		text += ' ' + extra;

	var failed = res.ok === false || res.success === false;
	ui.addNotification(null, E('p', {}, text), failed ? 'danger' : 'info');
}

function rpcError(err) {
	var text = util.translate('RPC request failed');

	if (err && err.message)
		text += ': ' + err.message;

	ui.addNotification(null, E('p', {}, text), 'danger');
}

return view.extend({
	load: function() {
		return Promise.all([
			api.status(),
			api.rules(),
			api.alerts(5, 0)
		]);
	},

	refresh: function() {
		var self = this;

		return Promise.all([
			api.status(),
			api.rules(),
			api.alerts(5, 0)
		]).then(function(data) {
			self.updateStatus(data[0] || {});
			self.updateRules(data[1] || {});
			self.updateAlerts(data[2] || {});
		}).catch(function() {
			setBadge(self.nodes.serviceBadge, util.translate('Unavailable'), 'danger');
			setBadge(self.nodes.stateBadge, util.translate('Unavailable'), 'danger');
			setText(self.nodes.stateNote, util.translate('RPC request failed'));

			if (self.nodes.stateNote)
				self.nodes.stateNote.style.display = '';
		});
	},

	refreshRules: function() {
		var self = this;

		return api.rules().then(function(rules) {
			self.updateRules(rules || {});
		}).catch(function() {
			setBadge(self.nodes.rulesBadge, util.translate('Unavailable'), 'danger');
		});
	},

	updateStatus: function(status) {
		var running = !!status.running;
		var state = util.serviceState(status);

		setBadge(this.nodes.serviceBadge, state.text, state.tone);
		setBadge(this.nodes.stateBadge, state.text, state.tone);

		var note = this.nodes.stateNote;

		if (note) {
			note.textContent = state.hint || '';

			if (state.hint && (status.service_hint === 'service_disabled' ||
			                   status.service_hint === 'config_missing' ||
			                   status.service_hint === 'manual_fallback' ||
			                   status.service_hint === 'daq_dir_missing')) {
				note.appendChild(document.createTextNode(' '));
				note.appendChild(E('a', {
					'href': L.url('admin/services/snort/settings')
				}, util.translate('Settings')));
			}

			note.style.display = state.hint ? '' : 'none';
		}

		setText(this.nodes.pid, status.pid || 'N/A');
		setText(this.nodes.autostart, status.autostart ? util.translate('Enabled') : util.translate('Disabled'));
		setText(this.nodes.uptime, status.system_uptime ? util.formatDuration(status.system_uptime) : 'N/A');
		setText(this.nodes.alertCount, status.alert_count != null ? status.alert_count : 0);

		setText(this.nodes.snortMem, running ? util.formatKb(status.mem_kb) : 'N/A');

		var total = Number(status.mem_total) || 0;
		var used = Number(status.mem_used) || 0;
		var percent = Number(status.mem_percent) || 0;

		setText(this.nodes.systemMem,
			util.formatKb(used) + ' / ' + util.formatKb(total) + ' (' + percent + '%)');

		if (this.nodes.memBar) {
			this.nodes.memBar.style.width = Math.max(0, Math.min(100, percent)) + '%';
			this.nodes.memBar.style.background =
				percent > 80 ? '#dc3545' : (percent > 60 ? '#ff9800' : '#28a745');
		}

		setText(this.nodes.interface, status.interface || 'N/A');
		setText(this.nodes.mode, status.mode ? String(status.mode).toUpperCase() : 'N/A');
		setText(this.nodes.method, status.method ? String(status.method).toUpperCase() : 'N/A');
	},

	updateRules: function(rules) {
		var stateText;
		var stateTone;

		if (rules.config_is_link && rules.link_valid) {
			stateText = util.translate('Active symbolic link');
			stateTone = 'success';
		}
		else if (rules.config_is_link) {
			stateText = util.translate('Broken symbolic link');
			stateTone = 'danger';
		}
		else if (rules.temp_exists) {
			stateText = util.translate('Rules are in') + ' ' + (rules.temp_rules || '');
			stateTone = 'warning';
		}
		else if (rules.config_exists) {
			stateText = util.translate('Configuration rules path is a directory');
			stateTone = 'warning';
		}
		else {
			stateText = util.translate('No rules directory found');
			stateTone = 'danger';
		}

		setBadge(this.nodes.rulesBadge, stateText, stateTone);

		var pathText = rules.config_rules || '/etc/snort/rules';

		if (rules.config_is_link && rules.link_target)
			pathText += ' -> ' + rules.link_target;

		setText(this.nodes.rulesPath, pathText);
		setText(this.nodes.ruleCounts,
			util.translate('Rule files:') + ' ' + (rules.config_rule_count || 0) +
			' / ' + util.translate('Temporary rules:') + ' ' + (rules.temp_rule_count || 0));

		var update = rules.update || {};
		var upd = util.updateState(update);

		setBadge(this.nodes.updateBadge, upd.text, upd.tone);

		var logLines = Array.isArray(update.log_lines) ? update.log_lines : [];
		setText(this.nodes.updateLog, logLines.length ? util.joinLines(logLines) : util.translate('No update log yet.'));

		if (this.nodes.updateButton)
			this.nodes.updateButton.disabled =
				rules.updater_available === false || update.running === true;
	},

	updateAlerts: function(alerts) {
		var lines = Array.isArray(alerts.alerts) ? alerts.alerts : [];

		if (alerts.alert_count != null)
			setText(this.nodes.alertCount, alerts.alert_count);

		if (lines.length === 0) {
			dom.content(this.nodes.recentAlerts,
				E('div', { 'class': 'snort3-empty' }, util.translate('No recent alerts - Your network is secure')));
			return;
		}

		dom.content(this.nodes.recentAlerts, lines.map(function(line) {
			return E('div', { 'class': 'snort3-alert' }, line);
		}));
	},

	handleService: function(action, ev) {
		var self = this;
		var button = ev.currentTarget;
		var original = button.textContent;

		button.disabled = true;
		button.textContent = util.translate('In progress...');

		return api.service(action).then(function(result) {
			result = result || {};
			notification(result.code, result);
			return self.refresh();
		}).catch(rpcError).then(function() {
			button.disabled = false;
			button.textContent = original;
		});
	},

	handleRulesUpdate: function(ev) {
		var self = this;
		var button = ev.currentTarget;
		var started = false;

		button.disabled = true;

		return api.rulesUpdate().then(function(result) {
			result = result || {};
			notification(result.code, result);
			started = result.ok === true;
			return self.refreshRules();
		}).catch(rpcError).then(function() {
			if (!started)
				button.disabled = false;
		});
	},

	handleRulesFix: function(ev) {
		var self = this;
		var button = ev.currentTarget;

		if (typeof confirm === 'function' &&
		    !confirm(util.translate('Create a symbolic link from /var/snort.d/rules to /etc/snort/rules?')))
			return Promise.resolve();

		button.disabled = true;

		return api.rulesFix().then(function(result) {
			result = result || {};
			notification(result.code, result,
				result.code === 'temp_missing' ? (result.path || '') : '');
			return self.refreshRules();
		}).catch(rpcError).then(function() {
			button.disabled = false;
		});
	},

	handleRulesCleanup: function(ev) {
		var self = this;
		var button = ev.currentTarget;

		button.disabled = true;

		return api.rulesCleanup().then(function(result) {
			result = result || {};
			notification(result.code, result);
			return self.refreshRules();
		}).catch(rpcError).then(function() {
			button.disabled = false;
		});
	},

	render: function(data) {
		var status = data[0] || {};
		var rules = data[1] || {};
		var alerts = data[2] || {};

		this.nodes = {};

		this.nodes.serviceBadge = E('span', { 'class': 'snort3-badge snort3-badge-muted' }, util.translate('Loading...'));
		this.nodes.stateBadge = E('span', { 'class': 'snort3-badge snort3-badge-muted' }, util.translate('Loading...'));
		this.nodes.stateNote = E('span', { 'class': 'snort3-muted', 'style': 'display:none' });
		this.nodes.alertCount = E('span', {}, '0');
		this.nodes.pid = E('span', {}, 'N/A');
		this.nodes.autostart = E('span', {}, 'N/A');
		this.nodes.uptime = E('span', {}, 'N/A');
		this.nodes.snortMem = E('span', {}, 'N/A');
		this.nodes.systemMem = E('span', {}, 'N/A');
		this.nodes.memBar = E('span', {});
		this.nodes.interface = E('span', {}, 'N/A');
		this.nodes.mode = E('span', {}, 'N/A');
		this.nodes.method = E('span', {}, 'N/A');
		this.nodes.rulesBadge = E('span', { 'class': 'snort3-badge snort3-badge-muted' }, util.translate('Loading...'));
		this.nodes.rulesPath = E('code', {}, '...');
		this.nodes.ruleCounts = E('div', { 'class': 'snort3-toolbar-note' }, '');
		this.nodes.updateBadge = E('span', { 'class': 'snort3-badge snort3-badge-muted' }, util.translate('Loading...'));
		this.nodes.updateLog = E('pre', { 'class': 'snort3-log' }, '');
		this.nodes.recentAlerts = E('div', { 'class': 'snort3-alert-list' });

		var serviceSection = E('div', { 'class': 'snort3-section' }, [
			E('h3', {}, util.translate('Service control')),
			E('div', { 'class': 'snort3-row' }, [
				E('span', { 'class': 'snort3-label' }, util.translate('Service state')),
				E('span', { 'class': 'snort3-value' }, [
					this.nodes.stateBadge, ' ', this.nodes.stateNote
				])
			]),
			E('div', { 'class': 'snort3-actions' }, [
				E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': L.bind(this.handleService, this, 'start')
				}, util.translate('Start')),
				E('button', {
					'class': 'cbi-button cbi-button-reset',
					'click': L.bind(this.handleService, this, 'stop')
				}, util.translate('Stop')),
				E('button', {
					'class': 'cbi-button cbi-button-reload',
					'click': L.bind(this.handleService, this, 'restart')
				}, util.translate('Restart')),
				E('button', {
					'class': 'cbi-button cbi-button-save',
					'click': L.bind(this.handleService, this, 'enable')
				}, util.translate('Enable at boot')),
				E('button', {
					'class': 'cbi-button cbi-button-remove',
					'click': L.bind(this.handleService, this, 'disable')
				}, util.translate('Disable at boot'))
			])
		]);

		this.nodes.updateButton = E('button', {
			'class': 'cbi-button cbi-button-apply',
			'click': L.bind(this.handleRulesUpdate, this)
		}, util.translate('Update rules'));

		var rulesSection = E('div', { 'class': 'snort3-section' }, [
			E('h3', {}, util.translate('Rules management')),
			E('div', { 'class': 'snort3-link-row' }, [
				this.nodes.rulesBadge
			]),
			E('div', { 'class': 'snort3-rule-path' }, this.nodes.rulesPath),
			this.nodes.ruleCounts,
			E('div', { 'class': 'snort3-actions', 'style': 'margin-top:.75rem' }, [
				this.nodes.updateButton,
				E('button', {
					'class': 'cbi-button cbi-button-reload',
					'click': L.bind(this.handleRulesFix, this)
				}, util.translate('Create symbolic link')),
				E('button', {
					'class': 'cbi-button cbi-button-reset',
					'click': L.bind(this.handleRulesCleanup, this)
				}, util.translate('Cleanup temporary files'))
			]),
			E('div', { 'class': 'snort3-row', 'style': 'margin-top:.9rem' }, [
				E('span', { 'class': 'snort3-label' }, util.translate('Update status')),
				E('span', { 'class': 'snort3-value' }, this.nodes.updateBadge)
			]),
			this.nodes.updateLog
		]);

		var alertsSection = E('div', { 'class': 'snort3-section' }, [
			E('div', { 'class': 'snort3-link-row' }, [
				E('h3', { 'style': 'margin:0' }, util.translate('Recent alerts')),
				E('a', {
					'class': 'cbi-button cbi-button-neutral',
					'href': L.url('admin/services/snort/alerts')
				}, util.translate('View all alerts'))
			]),
			this.nodes.recentAlerts,
			E('div', { 'class': 'snort3-toolbar-note', 'style': 'margin-top:.5rem' },
				util.translate('Auto-refresh every 5 seconds'))
		]);

		var header = E('div', { 'class': 'snort3-header' }, [
			E('div', {}, [
				E('h2', {}, util.translate('Snort IDS/IPS')),
				E('p', { 'class': 'snort3-subtitle' },
					util.translate('Real-time status, service control and rules management.'))
			]),
			E('div', { 'class': 'snort3-header-status' }, [
				this.nodes.serviceBadge,
				E('span', { 'class': 'snort3-toolbar-note' },
					[ util.translate('Auto-start') + ': ', this.nodes.autostart ])
			])
		]);

		var stats = E('div', { 'class': 'snort3-grid' }, [
			card(util.translate('Service'), [
				row(util.translate('PID'), this.nodes.pid),
				row(util.translate('System uptime'), this.nodes.uptime)
			]),
			card(util.translate('Alerts'), [
				row(util.translate('Total alerts'), this.nodes.alertCount),
				E('div', { 'style': 'margin-top:.5rem' },
					E('a', { 'href': L.url('admin/services/snort/alerts') }, util.translate('View all alerts')))
			]),
			card(util.translate('Memory'), [
				row(util.translate('Snort memory'), this.nodes.snortMem),
				row(util.translate('System memory'), this.nodes.systemMem),
				E('div', { 'class': 'snort3-mem-bar' }, [ this.nodes.memBar ])
			]),
			card(util.translate('Interface'), [
				row(util.translate('Interface'), this.nodes.interface),
				row(util.translate('Mode'), this.nodes.mode),
				row(util.translate('DAQ method'), this.nodes.method)
			])
		]);

		var page = E('div', { 'class': 'snort3-page' }, [
			E('style', {}, [ style.css ]),
			header,
			stats,
			serviceSection,
			rulesSection,
			alertsSection
		]);

		this.updateStatus(status);
		this.updateRules(rules);
		this.updateAlerts(alerts);

		poll.add(L.bind(this.refresh, this), 5);

		return page;
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
