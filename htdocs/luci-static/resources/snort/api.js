'use strict';

'require rpc';
'require baseclass';

var callStatus = rpc.declare({
	object: 'luci.snort',
	method: 'status',
	expect: {}
});

var callService = rpc.declare({
	object: 'luci.snort',
	method: 'service',
	params: [ 'action' ],
	expect: {}
});

var callAlerts = rpc.declare({
	object: 'luci.snort',
	method: 'alerts',
	params: [ 'limit', 'log_limit' ],
	expect: {}
});

var callRules = rpc.declare({
	object: 'luci.snort',
	method: 'rules',
	expect: {}
});

var callRulesUpdate = rpc.declare({
	object: 'luci.snort',
	method: 'rules_update',
	params: [ 'mode', 'oinkcode' ],
	expect: {}
});

var callRulesFix = rpc.declare({
	object: 'luci.snort',
	method: 'rules_fix',
	expect: {}
});

/*
 * LuCI >= 26 requires class module exports, see snort/util.js for details.
 */
return baseclass.extend({
	status: callStatus,
	service: callService,
	alerts: callAlerts,
	rules: callRules,
	rulesUpdate: callRulesUpdate,
	rulesFix: callRulesFix
});
