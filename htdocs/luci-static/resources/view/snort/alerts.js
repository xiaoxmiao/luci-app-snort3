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

return view.extend({
	load: function() {
		return Promise.all([
			api.status(),
			api.alerts(50, 20)
		]);
	},

	refresh: function() {
		var self = this;

		return Promise.all([
			api.status(),
			api.alerts(50, 20)
		]).then(function(data) {
			self.update(data[1] || {}, data[0] || {});
		}).catch(function() {
			setText(self.nodes.summary, util.translate('Unavailable'));
		});
	},

	update: function(data, status) {
		var alerts = Array.isArray(data.alerts) ? data.alerts : [];
		var logs = Array.isArray(data.logs) ? data.logs : [];
		var service = util.serviceState(status);
		var inactive = status && status.service_state &&
			status.service_state !== 'running';
		var emptyClass = inactive ? 'snort3-empty snort3-empty-inactive' : 'snort3-empty';

		setText(this.nodes.count, data.alert_count != null ? data.alert_count : 0);
		this.nodes.count.className = 'snort3-badge ' +
			(inactive ? 'snort3-badge-warning' : 'snort3-badge-muted');
		var files = Array.isArray(data.alert_files) ? data.alert_files : [];
		setText(this.nodes.file, files.length ? files.join(', ') : '/var/log/alert_json.txt');
		setText(this.nodes.summary, inactive
			? util.translate('Service state') + ': ' + service.text
			: util.translate('Total alerts') + ': ' + (data.alert_count != null ? data.alert_count : 0));

		if (alerts.length === 0) {
			dom.content(this.nodes.alerts,
				E('div', { 'class': emptyClass }, inactive
					? util.translate('Snort is not running - alerts are not available')
					: util.translate('No alerts recorded')));
		}
		else {
			dom.content(this.nodes.alerts, alerts.map(function(line) {
				return E('div', { 'class': 'snort3-alert' }, util.formatAlert(line));
			}));
		}

		if (logs.length === 0) {
			dom.content(this.nodes.logs,
				E('div', { 'class': emptyClass }, inactive
					? util.translate('Snort is not running - no system logs are available')
					: util.translate('No logs')));
		}
		else {
			dom.content(this.nodes.logs, logs.map(function(line) {
				return E('div', { 'class': 'snort3-log-line' }, line);
			}));
		}
	},

	handleRefresh: function(ev) {
		var self = this;
		var button = ev.currentTarget;

		button.disabled = true;

		return this.refresh().then(function() {
			button.disabled = false;
		}).catch(function() {
			button.disabled = false;
		});
	},

	render: function(data) {
		this.nodes = {};

		this.nodes.summary = E('p', { 'class': 'snort3-subtitle' }, '');
		this.nodes.count = E('span', { 'class': 'snort3-badge snort3-badge-muted' }, '0');
		this.nodes.file = E('code', { 'class': 'snort3-code' }, '/var/log/alert_json.txt');
		this.nodes.alerts = E('div', { 'class': 'snort3-alert-list' });
		this.nodes.logs = E('div', { 'class': 'snort3-alert-list' });

		var alertsSection = E('div', { 'class': 'snort3-section' }, [
			E('div', { 'class': 'snort3-link-row' }, [
				E('h3', { 'style': 'margin:0' }, util.translate('Recent alerts (50 most recent)')),
				this.nodes.count,
				E('button', {
					'class': 'cbi-button cbi-button-reload',
					'click': L.bind(this.handleRefresh, this)
				}, util.translate('Refresh'))
			]),
			E('div', { 'class': 'snort3-toolbar-note', 'style': 'margin-bottom:.5rem' }, [
				util.translate('Alert file') + ': ',
				this.nodes.file
			]),
			this.nodes.alerts
		]);

		var logsSection = E('div', { 'class': 'snort3-section' }, [
			E('h3', {}, util.translate('Snort system logs (20 most recent)')),
			E('div', { 'class': 'snort3-toolbar-note', 'style': 'margin-bottom:.5rem' },
				util.translate('System logs come from logread, not from a file.')),
			this.nodes.logs
		]);

		var hintSection = E('div', { 'class': 'snort3-section snort3-hint' }, [
			E('h3', { 'style': 'margin:0' }, util.translate('Actions')),
			E('p', { 'style': 'margin:0' },
				util.translate('View detailed reports via SSH with the command:')),
			E('pre', {}, 'snort-mgr report -v (requires coreutils-sort package)'),
			E('strong', {}, util.translate('Log files:')),
			E('ul', { 'style': 'margin:0' }, [
				E('li', {}, [
					E('code', {}, '/var/log/alert_json.txt'),
					' - ' + util.translate('Detailed JSON alerts')
				]),
				E('li', {}, [
					E('code', {}, '/var/log/N_alert_json.txt'),
					' - ' + util.translate('Per-thread JSON alerts')
				])
			])
		]);

		var header = E('div', { 'class': 'snort3-header' }, [
			E('div', {}, [
				E('h2', {}, util.translate('Snort - Alerts and Logs')),
				this.nodes.summary
			]),
			E('span', { 'class': 'snort3-toolbar-note' }, util.translate('Auto-refresh every 5 seconds'))
		]);

		var page = E('div', { 'class': 'snort3-page' }, [
			E('style', {}, [ style.css ]),
			header,
			alertsSection,
			logsSection,
			hintSection
		]);

		this.update(data[1] || {}, data[0] || {});
		poll.add(L.bind(this.refresh, this), 5);

		return page;
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
