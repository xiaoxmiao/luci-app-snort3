'use strict';

'require baseclass';

/*
 * LuCI >= 26 requires class module exports, see snort/util.js for details.
 * Views render the stylesheet with E('style', {}, [ style.css ]).
 */
return baseclass.extend({
	css: [
	'.snort3-page { display: flex; flex-direction: column; gap: 1rem; }',
	'.snort3-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }',
	'.snort3-header h2 { margin: 0 0 .25rem 0; }',
	'.snort3-subtitle { margin: 0; opacity: .72; }',
	'.snort3-header-status { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }',
	'.snort3-badge { display: inline-block; padding: .15rem .6rem; border-radius: 999px; font-size: .85em; font-weight: 700; line-height: 1.6; }',
	'.snort3-badge-success { background: rgba(40, 167, 69, .16); color: #1e7e34; }',
	'.snort3-badge-warning { background: rgba(255, 152, 0, .18); color: #a05a00; }',
	'.snort3-badge-danger { background: rgba(220, 53, 69, .15); color: #b02a37; }',
	'.snort3-badge-muted { background: rgba(127, 127, 127, .14); }',
	'.snort3-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }',
	'.snort3-card { border: 1px solid rgba(127, 127, 127, .25); border-radius: .5rem; padding: 1rem; background: rgba(127, 127, 127, .045); min-width: 0; }',
	'.snort3-card h3 { margin: 0 0 .75rem 0; font-size: 1rem; }',
	'.snort3-row { display: grid; grid-template-columns: minmax(8rem, 45%) 1fr; gap: .5rem; padding: .2rem 0; align-items: baseline; }',
	'.snort3-label { opacity: .72; }',
	'.snort3-value { overflow-wrap: anywhere; }',
	'.snort3-muted { opacity: .7; }',
	'.snort3-actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }',
	'.snort3-mem-bar { height: .45rem; background: rgba(127, 127, 127, .18); border-radius: 999px; overflow: hidden; margin-top: .4rem; }',
	'.snort3-mem-bar > span { display: block; height: 100%; width: 0; background: #28a745; transition: width .3s ease; }',
	'.snort3-rule-path { margin: .25rem 0 .75rem 0; overflow-wrap: anywhere; }',
	'.snort3-rule-detail { margin-top: .5rem; }',
	'.snort3-rule-source { display: flex; flex-direction: column; gap: .3rem; margin-top: .75rem; }',
	'.snort3-oink { max-width: 24rem; }',
	'.snort3-rule-meta { font-size: .85em; opacity: .78; margin-bottom: .4rem; }',
	'.snort3-file-list { display: flex; flex-direction: column; gap: .25rem; max-height: 10rem; overflow: auto; }',
	'.snort3-file { display: flex; justify-content: space-between; gap: .75rem; padding: .25rem .45rem; border-radius: .25rem; background: rgba(127, 127, 127, .08); font-size: .85em; }',
	'.snort3-file code { overflow-wrap: anywhere; }',
	'.snort3-file-size { white-space: nowrap; opacity: .7; }',
	'.snort3-log { margin: .5rem 0 0 0; padding: .6rem; max-height: 12rem; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: .85em; background: rgba(127, 127, 127, .09); border-radius: .35rem; }',
	'.snort3-alert-list { display: flex; flex-direction: column; gap: .4rem; max-height: 32rem; overflow: auto; }',
	'.snort3-alert { padding: .45rem .6rem; border-left: 3px solid #dc3545; background: rgba(220, 53, 69, .07); border-radius: .25rem; font-family: monospace; font-size: .85em; white-space: pre-wrap; overflow-wrap: anywhere; }',
	'.snort3-log-line { padding: .35rem .5rem; border-left: 3px solid #0d6efd; background: rgba(13, 110, 253, .06); border-radius: .25rem; font-family: monospace; font-size: .82em; white-space: pre-wrap; overflow-wrap: anywhere; }',
	'.snort3-empty { padding: .75rem; border-radius: .35rem; background: rgba(40, 167, 69, .1); color: #1e7e34; font-weight: 600; }',
	'.snort3-link-row { display: flex; justify-content: space-between; align-items: center; gap: .75rem; flex-wrap: wrap; margin-bottom: .5rem; }',
	'.snort3-section { border: 1px solid rgba(127, 127, 127, .25); border-radius: .5rem; padding: 1rem; }',
	'.snort3-section > h3 { margin: 0 0 .75rem 0; }',
	'.snort3-toolbar-note { font-size: .85em; opacity: .7; }',
	'.snort3-code { font-family: monospace; overflow-wrap: anywhere; }',
	'.snort3-hint { display: flex; flex-direction: column; gap: .5rem; }',
	'.snort3-hint pre { margin: 0; padding: .6rem; background: rgba(127, 127, 127, .09); border-radius: .35rem; overflow: auto; }'
	].join('\n')
});
