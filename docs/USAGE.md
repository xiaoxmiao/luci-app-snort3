# Usage Guide

The module adds three tabs under **Services → Snort IDS/IPS**: **Overview**,
**Settings** and **Alerts**. The Overview tab is available from the tab bar on
every page, so the dashboard is always reachable.

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
| Stopped | No Snort process. A normal, user-initiated stop is shown in muted grey. When Snort is disabled, an explanation is shown next to the badge (with a link to Settings). |
| Error | Snort cannot work: the init script is missing, the rules directory has no `.rules` files, or the last service action failed. The reason (for example *Snort init script not found*) and, when available, the captured init script output are shown next to the badge. |

An RPC failure is shown as **Unavailable** with the text *RPC request failed*
followed by the underlying error message.

**Start** and **Restart** no longer trust the init script's exit code: the
OpenWrt `snort3` init script returns 0 when `snort.snort.enabled` is 0, without
starting anything. The backend now captures the script output, waits for a
stable Snort process (up to about eight seconds) and reports a concrete reason
if the process never appears: *Snort is disabled in Settings*, *No rules found*,
the init script's own error text, or the
most recent `logread | grep -i snort` lines (procd sends the daemon's fatal
Lua/DAQ errors to syslog, not to the init script's stdout).

### Service control

- **Start** — `/etc/init.d/snort start`
- **Stop** — `/etc/init.d/snort stop`
- **Restart** — `/etc/init.d/snort restart`
- **Enable at boot** — `/etc/init.d/snort enable`
- **Disable at boot** — `/etc/init.d/snort disable`

The buttons are disabled while the request is running. Results are shown as LuCI
notifications and the dashboard is refreshed immediately afterwards.

### Rules management

The rules card shows the current storage mode, the rule source, the last
update time and every installed `.rules` file with its size.

**Overview** has an Oinkcode field and two actions: **Update subscriber rules**
(uses the saved Oinkcode) and **Use community rules** (forces the free
community ruleset, replaces the installed rules but keeps the Oinkcode).

`rules_persist` in Settings is off by default: rules are in tmpfs and an
`ifup` hotplug script downloads them once per boot, with a minimal fallback
ruleset when there is no Internet. Turn it on to keep them in the real
`/etc/snort/rules` directory. `rules_auto_update` plus a 1 day / 1 week / 1
month interval schedules cron updates at 03:00, independently of storage.


### Recent alerts

The five most recent lines of the fast alert file are displayed. Use **View all
alerts** for the full page.

## Settings

Settings are stored in `/etc/config/snort-web`. **Save & Apply** writes the
configuration, synchronises it to `/etc/config/snort` (the file read by the
`snort3` init script and rules updater) and then brings the service in line with
the **Enable Snort** flag: with the flag set Snort is started (or restarted if
already running), with it cleared Snort is stopped. If no process appears, the
Overview page shows a *Snort failed to start* reason.

Boot-time start is a separate setting: use **Enable at boot** on the Overview
page to create the `/etc/rc.d/S??snort` link.

### Service settings

| Option | Description |
| --- | --- |
| Enable Snort | Save & Apply starts or stops Snort accordingly; boot start is the separate *Enable at boot* button |
| Configuration mode | Always the `snort-mgr` generated configuration (`manual=0`). Legacy manual mode and user Lua includes were removed in 4.3.0 |
| Network interface | LuCI device dropdown. Default `auto` resolves to the WAN device, then the LAN bridge, then `eth0`, then the first non-loopback device |
| Local network | Protected network in CIDR notation |
| External network | External network definition, usually `any` |
| Operating mode | `ids` for detection only, `ips` for prevention |
| DAQ method | `pcap`, `afpacket` or `nfq` |
| Capture Length | Snapshot length, at least 1518 bytes |

### Logging configuration

| Option | Description |
| --- | --- |
| Enable logging | Enables event logging |
| Log directory | Directory containing `alert_json.txt` and `N_alert_json.txt` |
| Configuration directory | Snort configuration directory, usually `/etc/snort` |
| Temporary directory | Downloaded rules and temporary files, usually `/var/snort.d` |

### Rules settings

| Option | Description |
| --- | --- |
| Rule source / persistence / scheduling | Chosen on the Overview page and in Settings |
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

- `/var/log/alert_json.txt` plus `N_alert_json.txt` — JSON alerts;
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
| `/usr/libexec/snort-web-rules-update` | Bundled updater (the only one used) |
| `/tmp/snort_rules_update.status` | Last rules update result (`running`/`ok`/`failed` plus an error code) |
| `/tmp/snort_service_action.status` | Last service action result |
| `/var/log/alert_json.txt` | JSON alerts (one object per line) |
| `/var/log/<other>` | Syslog is read through `/sbin/logread` |
| `/etc/snort/rules` | Persistent rules directory |
| `/var/snort.d/` | Transient download/extract area and generated `snort_conf.lua` |
| `/tmp/snort_rules_update.log` | Rules update log |
| `/tmp/snort_rules_update.lock` | Rules update lock |

## Security notes

- The JavaScript views do not execute shell commands; all privileged work happens
  in the rpcd/ucode backend.
- Service actions are allow-listed.
- Configured paths must be absolute and are rejected if they contain `..` or
  control characters.
- The ACL file grants only the seven `luci.snort` methods, UCI access to
  `snort-web`/`network`, and `luci-rpc getNetworkDevices` for the device list. The synchronisation helper runs as root outside the
  browser session.
- Rule updates run in the background as root because the updater needs to write
  to `/etc/snort` and `/var/snort.d`. Only the bundled updater is used, so no
  the storage mode is chosen explicitly by the `rules_persist` setting.

## Troubleshooting

| Problem | Action |
| --- | --- |
| Dashboard shows **Unavailable** | Check `ubus list luci.snort` and restart rpcd |
| No alerts | Check `logging` in UCI, the log directory and file permissions |
| Rules update stays at **In progress** | Inspect `/tmp/snort_rules_update.log` and remove a stale lock if necessary |
| Update badge shows **Failed** | Inspect `/tmp/snort_rules_update.log`; check DNS, HTTPS certificates (`ca-certificates`) and free space |
| **Save & Apply** does not start Snort | Check `/etc/init.d/snort-web enabled` and run `/etc/init.d/ucitrack restart` to register the config trigger (the package postinst does this on upgrade) |
| Service state shows **Error** | Read the reason next to the badge; fix the init script or install rules, then press **Start** |
| **Start** reports an error and nothing runs | Enable *Enable Snort* in Settings, then use one of the rule buttons; the reason next to the badge only includes snort syslog lines written by the latest start. Run `snort-mgr check` and `logread \| grep snort` for details |
| Old `local.lua` / DAQ crash lines in `logread` | Historical syslog entries from releases before 4.3.0. Check their timestamps and confirm with `ps \| grep '[s]nort'`. The generated configuration always sets `daq.module_dirs` |
| Overview shows only N/A values | Look for the *Backend error* notification; the failing method and message are also in `/tmp/snort_backend_error.log` |
| A rule update shows an error | The notification contains the backend reason and log path; inspect `/tmp/snort_rules_update.log` and `/tmp/snort_rules_update.status` |
| No rules found | Use **Use community rules** or **Update subscriber rules** on the Overview page |
| Boot-time top-up never runs | Check `rules_persist=0`, that an interface fires `ifup`, and `/tmp/snort_rules_boot_done` |
| Wrong interface displayed | Update the interface in Settings and apply |
| Settings not applied | Run `/usr/libexec/snort-web-sync --sync` and compare `uci show snort-web` with `uci show snort` |
| French UI not translated | Install the French catalog and set the LuCI language to French |
| Chinese UI not translated | Install the `zh-cn` catalog and set the LuCI language to Simplified Chinese |
