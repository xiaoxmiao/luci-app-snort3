'use strict';

'require view';
'require form';
'require uci';
'require network';

/* Populated by LuCI's own network.getDevices(), the same source used by the
 * interface and firewall pages.  Values are kernel device names (br-lan,
 * eth1, pppoe-wan) because snort-mgr writes them straight into daq.inputs;
 * labels add the UCI logical interface name (lan, wan) for readability. */
var deviceList = [];

function deviceLabel(dev) {
	var name = dev.getName();
	var logical = '';

	try {
		var net = dev.getNetwork && dev.getNetwork();
		if (net)
			logical = net.getName();
	}
	catch (e) {}

	return logical ? name + ' (' + logical + ')' : name;
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('snort-web'),
			uci.load('network'),
			network.getDevices().then(function(devices) {
				deviceList = devices || [];
			}).catch(function() {
				deviceList = [];
			})
		]);
	},

	render: function() {
		var m, s, o, i, dev, seen = { auto: true };

		m = new form.Map('snort-web', _('Snort IDS/IPS'),
			_('Snort is an open source intrusion detection and prevention system.'));

		s = m.section(form.TypedSection, 'snort', _('Service settings'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Enable Snort'),
			_('Save & Apply starts or stops Snort to match this setting'));
		o.default = '0';
		o.rmempty = false;

		o = s.option(form.ListValue, 'interface', _('Network interface'),
			_('Device to monitor. Automatic follows the WAN device, then the LAN bridge, then eth0.'));
		o.value('auto', _('Automatic (WAN, LAN, eth0)'));

		for (i = 0; i < deviceList.length; i++) {
			dev = deviceList[i].getName();
			if (!dev || seen[dev])
				continue;
			seen[dev] = true;
			o.value(dev, deviceLabel(deviceList[i]));
		}

		/* Fall back to UCI network sections when the device RPC is blocked. */
		if (deviceList.length === 0) {
			var nets = uci.sections('network', 'interface') || [];
			for (i = 0; i < nets.length; i++) {
				dev = nets[i].device || nets[i].ifname;
				if (typeof dev === 'string' && dev !== '' &&
				    dev.charAt(0) !== '@' && !seen[dev]) {
					seen[dev] = true;
					o.value(dev, dev + ' (' + nets[i]['.name'] + ')');
				}
			}
		}

		/* Never hide a saved value just because the device is currently gone. */
		var current = uci.get('snort-web', 'snort', 'interface');
		if (current && !seen[current])
			o.value(current, current + ' (' + _('currently unavailable') + ')');

		o.default = 'auto';
		o.rmempty = false;

		o = s.option(form.Value, 'home_net', _('Local network'),
			_('IP address range to protect'));
		o.placeholder = '192.168.1.0/24';
		o.default = '192.168.1.0/24';
		o.datatype = 'string';

		o = s.option(form.Value, 'external_net', _('External network'),
			_('External IP address range'));
		o.placeholder = 'any';
		o.default = 'any';
		o.datatype = 'string';

		o = s.option(form.ListValue, 'mode', _('Operating mode'),
			_('IDS = Detection only, IPS = Active prevention'));
		o.value('ids', _('IDS (Detection)'));
		o.value('ips', _('IPS (Prevention)'));
		o.default = 'ids';

		o = s.option(form.ListValue, 'method', _('DAQ method'),
			_('Packet acquisition method'));
		o.value('pcap', _('PCAP (Recommended)'));
		o.value('afpacket', 'AF_PACKET');
		o.value('nfq', _('NFQ (for IPS)'));
		o.default = 'pcap';

		o = s.option(form.Value, 'snaplen', _('Capture Length'),
			_('Maximum packet capture size'));
		o.placeholder = '1518';
		o.default = '1518';
		o.datatype = 'range(1518,65535)';

		s = m.section(form.TypedSection, 'snort', _('Logging configuration'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'logging', _('Enable logging'),
			_('Enable event logging'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Value, 'log_dir', _('Log directory'),
			_('Path where logs will be stored'));
		o.placeholder = '/var/log';
		o.default = '/var/log';
		o.datatype = 'directory';

		o = s.option(form.Value, 'config_dir', _('Configuration directory'),
			_('Snort configuration directory path'));
		o.placeholder = '/etc/snort';
		o.default = '/etc/snort';
		o.datatype = 'directory';

		o = s.option(form.Value, 'temp_dir', _('Temporary directory'),
			_('Directory for temporary files and downloaded rules'));
		o.placeholder = '/var/snort.d';
		o.default = '/var/snort.d';
		o.datatype = 'directory';

		s = m.section(form.TypedSection, 'snort', _('Rules management'),
			_('Rules are stored permanently in the configuration directory and survive reboots.'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Value, 'oinkcode', _('Oinkcode'),
			_('Access code to download official Snort rules (optional)'));
		o.password = true;
		o.placeholder = _('Enter your Oinkcode if you have one');

		o = s.option(form.ListValue, 'action', _('Rule action'),
			_('Default action for rules'));
		o.value('default', _('Default'));
		o.value('alert', _('Alert'));
		o.value('block', _('Block'));
		o.value('drop', _('Drop'));
		o.value('reject', _('Reject'));
		o.default = 'default';

		s = m.section(form.TypedSection, 'snort', _('Advanced'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'openappid', _('OpenAppID'),
			_('Enable application detection with the OpenAppID package'));
		o.default = '0';
		o.rmempty = false;

		s = m.section(form.TypedSection, 'nfq', _('NFQ settings'),
			_('Netfilter queue settings used when the DAQ method is NFQ.'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Value, 'queue_count', _('Queue count'),
			_('Number of NFQ queues, usually 2 to 8'));
		o.default = '4';
		o.datatype = 'range(1,16)';

		o = s.option(form.Value, 'queue_start', _('First queue number'));
		o.default = '4';
		o.datatype = 'range(1,32768)';

		o = s.option(form.Value, 'queue_maxlen', _('Maximum queue length'));
		o.default = '1024';
		o.datatype = 'range(1024,65536)';

		o = s.option(form.ListValue, 'fanout_type', _('Fanout type'),
			_('Kernel load balancing algorithm'));
		o.value('hash', 'hash');
		o.value('lb', 'lb');
		o.value('cpu', 'cpu');
		o.value('rollover', 'rollover');
		o.value('rnd', 'rnd');
		o.value('qm', 'qm');
		o.default = 'hash';

		o = s.option(form.Value, 'thread_count', _('Packet thread count'),
			_('Maximum number of packet threads, 0 uses the number of CPU cores'));
		o.default = '0';
		o.datatype = 'range(0,32)';

		o = s.option(form.ListValue, 'chain_type', _('Chain type'),
			_('nftables chain type used for IPS mode'));
		o.value('prerouting', 'prerouting');
		o.value('input', 'input');
		o.value('forward', 'forward');
		o.value('output', 'output');
		o.value('postrouting', 'postrouting');
		o.default = 'input';

		o = s.option(form.ListValue, 'chain_priority', _('Chain priority'));
		o.value('raw', 'raw');
		o.value('filter', 'filter');
		o.value('300', '300');
		o.default = 'filter';

		return m.render();
	}
});
