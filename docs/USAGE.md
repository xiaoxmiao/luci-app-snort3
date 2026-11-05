# Usage Guide

The module adds three pages under **Services → Snort IDS/IPS**.

## Overview

The Overview page is the operational dashboard. Status cards are refreshed every
five seconds.

### Status cards

| Card | Information |
| --- | --- |
| Service | Running/stopped badge, PID and system uptime |
| Alerts | Total number of lines in the fast alert file |
| Memory | Snort RSS and system memory usage with a progress bar |
| Interface | Monitored interface, IDS/IPS mode and DAQ method |

The auto-start badge in the header shows whether an `/etc/rc.d/S??snort` link
exists.

The **Service state** row in the service section and the header badge show one
of three states, refreshed every five seconds:

| State | Meaning |
| --- | --- |
| Running | A Snort process is present; the PID is shown in the Service card. |
| Stopped | No Snort process. A normal, user-initiated stop is shown in muted grey. |
| Error | Snort cannot work: the init script is missing, the rules directory has no `.rules` files, or the last service action failed. The reason (for example *Snort init script not found*) is shown next to the badge. |

An RPC failure is shown as **Unavailable** with the text *RPC request failed*.

### Service control

- **Start** — `/etc/init.d/snort start`
- **Stop** — `/etc/init.d/snort stop`
- **Restart** — `/etc/init.d/snort restart`
- **Enable at boot** — `/etc/init.d/snort enable`
- **Disable at boot** — `/etc/init.d/snort disable`

The buttons are disabled while the request is running. Results are shown as LuCI
notifications and the dashboard is refreshed immediately afterwards.

### Rules management

The rules card reports whether `/etc/snort/rules` is a valid symbolic link, a
broken link, a real directory, or missing. It also displays the rule file counts
for the configured directory and the temporary rules directory.

- **Update rules** starts the bundled updater
  `/usr/libexec/snort-web-rules-update` in the background. It downloads the
  **free Snort 3 community ruleset**; when an oinkcode is configured in
  Settings it uses the free registered snapshot instead. Every `*.rules` file
  is copied into `/var/snort.d/rules` (or the configured temporary directory)
  and `/etc/snort/rules` is pointed there, so the rules status and the link
  repair actions always agree. If the snort3 package's own
  `/usr/bin/snort-rules` is installed and the bundled script is missing, it is
  used as a fallback. The update log is shown below the buttons and polled
  with the rest of the page; the button is disabled while an update runs.
  **Restart Snort afterwards** so the new rules are loaded.
- **Create symbolic link** points `/etc/snort/rules` to
  `/var/snort.d/rules`. If the current rules path is a real directory, it is
  renamed to `rules.backup` first. A confirmation dialog is shown.
- **Cleanup temporary files** removes downloaded `.tar.gz` archives, the update
  log, the lock and the result file. It refuses to run while an update is in
  progress.

The update badge shows four states:

| State | Meaning |
| --- | --- |
| Idle | No update has run since the last cleanup or reboot. |
| In progress | The updater is downloading and installing rules. |
| Completed | The rules were installed successfully. |
| Failed | The updater reported an error (download, extraction, empty archive or link creation). The exact reason is in the update log below. |

The update state uses `/tmp/snort_rules_update.lock`,
`/tmp/snort_rules_update.log` and `/tmp/snort_rules_update.status`; the last
service action is recorded in `/tmp/snort_service_action.status`. A test run
without network access is available on the command line with
`/usr/libexec/snort-web-rules-update -t`.

### Recent alerts

The five most recent lines of the fast alert file are displayed. Use **View all
alerts** for the full page.

## Settings

Settings are stored in `/etc/config/snort-web`. Use **Save & Apply** to write
the configuration, synchronise it to `/etc/config/snort` (the file read by the
`snort3` init script and rules updater) and restart Snort when it is running.

### Service settings

| Option | Description |
| --- | --- |
| Enable Snort | Enables the service at boot |
| Manual mode | Uses a manually maintained `snort.lua` |
| Network interface | Interface to monitor, for example `br-lan` or `eth0` |
| Local network | Protected network in CIDR notation |
| External network | External network definition, usually `any` |
| Operating mode | `ids` for detection only, `ips` for prevention |
| DAQ method | `pcap`, `afpacket` or `nfq` |
| Capture Length | Snapshot length, at least 1518 bytes |

### Logging configuration

| Option | Description |
| --- | --- |
| Enable logging | Enables event logging |
| Log directory | Directory containing `alert_fast.txt` |
| Configuration directory | Snort configuration directory, usually `/etc/snort` |
| Temporary directory | Downloaded rules and temporary files, usually `/var/snort.d` |

### Rules settings

| Option | Description |
| --- | --- |
| Oinkcode | Optional access code for official rule downloads |
| Rule action | Default action: default, alert, block, drop or reject |

Rules updates, link repair and cleanup are performed from the Overview page
because they need progress and result feedback.

### Advanced

| Option | Description |
| --- | --- |
| OpenAppID | Enables application detection when the OpenAppID package is installed |
| User configuration include | Optional file appended to the generated `snort.lua` |

### NFQ settings

These options are used when the DAQ method is `nfq`:

| Option | Description |
| --- | --- |
| Queue count | Number of Netfilter queues (1–16) |
| First queue number | First queue ID (1–32768) |
| Maximum queue length | Maximum queue length (1024–65536) |
| Fanout type | Kernel load-balancing algorithm |
| Packet thread count | Maximum packet threads; `0` uses the CPU core count |
| Chain type | nftables chain type: prerouting, input, forward, output or postrouting |
| Chain priority | `raw`, `filter` or priority `300` |
| NFQ rules include | Optional file with additional queue-chain rules |

## Alerts

The Alerts page shows:

- the 50 most recent lines from the fast alert file (newest first);
- the 20 most recent Snort-related lines from `logread` (newest first);
- the configured alert file path and the total number of alert lines.

The page refreshes automatically every five seconds. Use **Refresh** for an
immediate update.

For more detailed reports over SSH:

```sh
snort-mgr report -v
```

This command requires the `coreutils-sort` package. The main log files are:

- `/var/log/alert_fast.txt` — fast one-line alerts;
- `/var/log/*alert_json.txt` — detailed JSON alerts.

## RPC API

The frontend uses the `luci.snort` ubus object. The same methods can be called
manually for diagnostics:

```sh
ubus call luci.snort status
ubus call luci.snort alerts '{"limit":50,"log_limit":20}'
ubus call luci.snort rules
ubus call luci.snort service '{"action":"restart"}'
ubus call luci.snort rules_update
ubus call luci.snort rules_fix
ubus call luci.snort rules_cleanup
```

Allowed service actions are `start`, `stop`, `restart`, `enable` and `disable`.
The backend rejects other actions and sanitizes configured paths to absolute
paths without `..` components or control characters.

## Files read by the interface

| Path | Purpose |
| --- | --- |
| `/etc/config/snort-web` | Application UCI settings |
| `/etc/config/snort` | Runtime settings consumed by `snort3` (synchronised) |
| `/usr/libexec/snort-web-sync` | Settings synchronisation helper |
| `/etc/init.d/snort-web` | Boot-time sync before Snort starts |
| `/etc/init.d/snort` | Service control |
| `/usr/libexec/snort-web-rules-update` | Bundled free-rule updater |
| `/usr/bin/snort-rules` | Optional fallback updater from the `snort3` package |
| `/tmp/snort_rules_update.status` | Last rules update result (`running`/`ok`/`failed` plus an error code) |
| `/tmp/snort_service_action.status` | Last service action result |
| `/var/log/alert_fast.txt` | Fast alerts |
| `/var/log/<other>` | Syslog is read through `/sbin/logread` |
| `/etc/snort/rules` | Rules path, usually a symbolic link |
| `/var/snort.d/rules` | Temporary downloaded rules |
| `/tmp/snort_rules_update.log` | Rules update log |
| `/tmp/snort_rules_update.lock` | Rules update lock |

## Security notes

- The JavaScript views do not execute shell commands; all privileged work happens
  in the rpcd/ucode backend.
- Service actions are allow-listed.
- Configured paths must be absolute and are rejected if they contain `..` or
  control characters.
- The ACL file grants only the seven `luci.snort` methods and UCI access to the
  `snort-web` package. The synchronisation helper runs as root outside the
  browser session.
- Rule updates run in the background as root because the updater needs to write
  to `/etc/snort` and `/var/snort.d`. Review `/usr/bin/snort-rules` before
  installing a third-party updater.

## Troubleshooting

| Problem | Action |
| --- | --- |
| Dashboard shows **Unavailable** | Check `ubus list luci.snort` and restart rpcd |
| No alerts | Check `logging` in UCI, the log directory and file permissions |
| Rules update stays at **In progress** | Inspect `/tmp/snort_rules_update.log` and remove a stale lock if necessary |
| Update badge shows **Failed** | Inspect `/tmp/snort_rules_update.log`; check DNS, HTTPS certificates (`ca-certificates`) and free space |
| Service state shows **Error** | Read the reason next to the badge; fix the init script or install rules, then press **Start** |
| No rules found | Run **Update rules**, then **Restart**; do not point a working link at an empty directory |
| Symbolic link repair fails | Check that `/var/snort.d/rules` exists and `/etc/snort` is writable |
| Wrong interface displayed | Update the interface in Settings and apply |
| Settings not applied | Run `/usr/libexec/snort-web-sync --sync` and compare `uci show snort-web` with `uci show snort` |
| French UI not translated | Install the French catalog and set the LuCI language to French |
| Chinese UI not translated | Install the `zh-cn` catalog and set the LuCI language to Simplified Chinese |
