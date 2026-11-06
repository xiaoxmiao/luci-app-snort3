# LuCI Snort3 for OpenWrt

Modern LuCI web interface for **Snort3 IDS/IPS** on OpenWrt. The application is
implemented as a **JavaScript LuCI frontend** backed by an **rpcd/ucode** service;
the pre-1.0 Lua/CGI code is archived in the `legacy-and-beta` git tag.

[English](#english) | [Français](#français) | [中文](#中文)

---

## English

### Overview

This module gives Snort3 a native place in LuCI:

- live service status, PID, memory use, uptime, interface, IDS/IPS mode and DAQ method;
- start, stop, restart, enable and disable controls;
- recent alerts and system log excerpts, refreshed every 5 seconds;
- optional persistent or in-memory rule storage, scheduled updates and boot-time top-up;
- complete UCI settings for service, logging, rules, OpenAppID and NFQ;
- English source strings with German, Spanish, French, Brazilian Portuguese,
  Russian and Simplified Chinese catalogs (six translation packages).

The browser never runs privileged commands. All service, file and log access is
performed by the rpcd/ucode backend through a small allow-listed RPC surface.

### Requirements

- OpenWrt **25.12 or newer** with the JavaScript LuCI runtime (`apk` packages only);
- `luci-base`;
- `rpcd-mod-ucode` (the `luci.snort` rpcd plugin);
- `snort3` with its init script at `/etc/init.d/snort` and `snort-mgr`;
- the bundled rules updater (no extra package is required);
- optional `luci-i18n-base-*` packages for the LuCI interface language.

```sh
apk update
apk add luci-base rpcd-mod-ucode snort3
```

### Installation (APK only)

Only APK packages are supported, on OpenWrt 25.12 and newer. There is no shell
installer, no IPK/opkg build path and no manual file-copy installation.

Build the packages with the included GitHub Actions workflow (`Build OpenWrt
APK`), or locally with an APK-enabled SDK (see
[docs/INSTALLATION.md](docs/INSTALLATION.md)). Then copy the `.apk` files to the
router and install them as root:

```sh
apk add --allow-untrusted ./luci-app-snort3-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-de-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-es-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-fr-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-pt-br-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-ru-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-zh-cn-*.apk
```

`--allow-untrusted` is required for locally built packages without the OpenWrt
release signing key. The application package is architecture-independent
(`LUCI_PKGARCH:=all`), so one x86/64 SDK build can be installed on any target
running the same OpenWrt release. Always match the SDK release to the router.
Hard-refresh the browser (Ctrl+F5) after upgrading.

### Access

Open LuCI and go to **Services → Snort IDS/IPS**.

- **Overview** — status cards, service controls, rules management, update log and
  recent alerts.
- **Settings** — service, logging, rules, advanced and NFQ options.
- **Alerts** — the 50 most recent alerts and the 20 most recent Snort syslog
  lines.

### Configuration

The LuCI application stores its settings in **`/etc/config/snort-web`**:

```uci
config snort 'snort'
	option enabled '0'
	option manual '0'
	option interface 'auto'
	option mode 'ids'
	option method 'pcap'
	option rules_persist '0'
	option rules_auto_update '0'
	option rules_update_interval 'weekly'

config nfq 'nfq'
	option queue_count '4'
	option queue_start '4'
	option chain_type 'input'

config internal 'internal'
	option migrated '0'
```

`enabled` is the master switch: **Save & Apply** starts or stops Snort to
match it. The application always uses the `snort-mgr` generated configuration
(`manual=0`): snort3's legacy manual mode passes `--tweaks local`, needs a
`local.lua` the package does not ship, and omits `daq.module_dirs`, so it
crash-loops on a fresh install. Manual mode and user Lua includes are no longer
offered. `interface` defaults to `auto`, which the sync helper resolves to the
WAN device, then the LAN bridge, then `eth0`, then the first non-loopback
device; the Settings page offers a LuCI device dropdown for a manual choice.
Boot-time start is controlled separately by **Enable at boot**.

The OpenWrt `snort3` package still reads `/etc/config/snort`, so the application
keeps both files in sync:

- `/usr/libexec/snort-web-sync` copies the known `snort` and `nfq` options from
  `snort-web` to `snort` and commits the result;
- `/etc/init.d/snort-web` runs at boot before `snort` (`START=98` versus `99`);
- `/usr/share/ucitrack/luci-app-snort3.json` triggers `/etc/init.d/snort-web
  reload` after **Save & Apply**; the reload starts, restarts or stops Snort to
  match the *Enable Snort* flag and records the outcome for the Overview page;
- the rpcd backend synchronises before service start/restart and before a rules
  update, because `snort-mgr` reads `/etc/config/snort`.

On first installation (or when upgrading from the old version that wrote
directly to `/etc/config/snort`), the helper imports the existing settings once
and sets `snort-web.internal.migrated=1`. After that, `snort-web` is the
canonical file. Edit it through LuCI; manual changes to `/etc/config/snort` are
overwritten on the next apply or boot.

### Rules management

The application ships a built-in updater at
`/usr/libexec/snort-web-rules-update`. The **Overview** page has an Oinkcode
field and two actions:

- **Update subscriber rules** downloads the registered snapshot using the
  saved Oinkcode. The code is stored in `snort-web.snort.oinkcode`.
- **Use community rules** forces the free community ruleset and replaces the
  previously installed rules. It keeps the saved Oinkcode for later use.

Every update replaces the whole rules directory atomically and prints each
installed `.rules` file with its size in the update log. A successful update
restarts Snort, because `snort-mgr` enumerates `*.rules` when rendering
`snort_conf.lua`.

**Storage** is controlled by `rules_persist` in Settings and is **off by
default**: rules live in `$temp_dir/rules` (tmpfs) with `/etc/snort/rules` as a
symlink, so they disappear on reboot. Turning the setting on stores them in
the real `/etc/snort/rules` directory instead. When persistence is off, an
`ifup` hotplug script downloads the rules once per boot; `--fallback` installs
the packaged `builtin_rules` (or a minimal ICMP rule) if there is no Internet,
so Snort never starts with an empty rules directory.

**Scheduling** is independent of storage: `rules_auto_update` plus
`rules_update_interval` (1 day / 1 week / 1 month) writes a crontab entry that
runs at 03:00. `/usr/libexec/snort-web-schedule` manages the entry and restarts
cron. OpenWrt has no standalone `cron` package - `crond` is part of the
essential busybox package - so the helper checks for `/etc/init.d/cron` at
runtime and logs a warning if it is missing.

The Overview page also shows a three-state service status (**running**,
**stopped** or **error**, with the reason), the installed rule files with their
source and last update time, and recent alerts formatted from `alert_json`.


### Project layout

```text
htdocs/luci-static/resources/view/snort/   LuCI JavaScript pages
htdocs/luci-static/resources/snort/        API, helpers and shared styles
root/usr/share/rpcd/ucode/luci.snort.uc    privileged rpcd backend
root/usr/share/luci/menu.d/                menu entries
root/usr/share/rpcd/acl.d/                 RPC/UCI permissions
root/etc/config/snort-web                  default application configuration
root/usr/libexec/snort-web-sync            snort-web -> snort synchronisation
root/etc/init.d/snort-web                  boot-time sync before snort
root/usr/share/ucitrack/                   Save & Apply restart trigger
root/etc/uci-defaults/                     migration, sync and scheduling
dist/lmo/snort.*.lmo                       six prebuilt catalogs
po/de, po/es, po/fr, po/pt_BR,            translation catalogs
po/ru, po/zh_Hans/
po/templates/snort.pot                     translation template
.github/workflows/build-apk.yml            APK build workflow
scripts/, tests/                           build helpers and unit tests
```

### APK build workflow

The workflow at `.github/workflows/build-apk.yml` can be run from the GitHub
**Actions** tab. It defaults to the OpenWrt 25.12.6 x86/64 SDK and produces:

- `luci-app-snort3-*.apk`
- `luci-i18n-snort3-de-*.apk`, `-es-*.apk`, `-fr-*.apk`
- `luci-i18n-snort3-pt-br-*.apk`, `-ru-*.apk`, `-zh-cn-*.apk`

Because the application and translation packages are architecture-independent,
the x86/64 SDK output can be installed on other targets running the same
OpenWrt release. The SDK version, target and package output are documented in
[docs/INSTALLATION.md](docs/INSTALLATION.md).

### Development

Node.js 18 or newer is recommended for the local checks.

```sh
npm test                 # pure JavaScript helper, package and LMO tests
npm run check:js         # syntax-check every JavaScript file
npm run check:i18n       # compare UI strings with every po/*/snort.po
npm run build:lmo        # regenerate both prebuilt catalogs
npm run check:ucode      # validate the rpcd plugin with ucode-lsp
npm run check            # JS + tests + i18n
```

Regenerate the translation template after changing a visible string:

```sh
node scripts/check-i18n.js --write-pot
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for implementation notes.

### Troubleshooting

- **The menu entry is missing** — check that `/etc/config/snort-web` exists, then
  clear `/tmp/luci-indexcache*` and `/tmp/luci-modulecache` and reload LuCI.
- **`luci.snort` is not registered** — install `rpcd-mod-ucode`, verify that
  `/usr/share/rpcd/ucode/luci.snort.uc` exists, and restart rpcd:
  `/etc/init.d/rpcd restart`.
- **Rules update is disabled** — check that
  `/usr/libexec/snort-web-rules-update` exists (it is run through `/bin/sh`, so
  no executable bit is required); the button is disabled when neither the
  bundled nor the `snort3` updater is available. The notification shows the
  reason, and `/tmp/snort_rules_update.log` contains the full output.
- **Start reports an error / Snort stays stopped** — enable *Enable Snort* in
  Settings first. The OpenWrt init script exits 0 without starting anything
  when `enabled=0`; this application verifies that a process actually appears
  and shows the reason (disabled, no rules, init script output or the syslog
  lines written by this start). See `logread | grep -i snort` and `snort-mgr check`.
- **The page still behaves like the previous release after upgrading** —
  `rpcd reload` does not re-fork ucode plugins, so run
  `/etc/init.d/rpcd restart`, clear `/tmp/luci-indexcache*` and
  `/tmp/luci-modulecache`, delete `/tmp/snort_service_action.*`, then hard-refresh
  the browser. Do not delete `/etc/config/snort-web` (it is a conffile holding
  your settings). Since 4.3.2 the postinst performs the rpcd restart itself.
  `ubus call luci.snort status` exposes `proc_comm` and `proc_scan` to show what
  the backend actually found in `/proc`.
- **Overview shows only N/A and the buttons do nothing** — a `backend_error`
  notification now names the failing RPC method; the same message is written to
  `/tmp/snort_backend_error.log`. Check `ubus call luci.snort status` and
  `logread | grep -i rpcd` if it persists.
- **Old `local.lua` / DAQ crash lines in `logread`** — those are historical
  syslog entries from before 4.3.0. `logread` keeps them for a long time, so
  check their timestamps and confirm with `ps | grep '[s]nort'`. A failed start
  only quotes lines written *after* the latest start marker.
- **Save & Apply does not start Snort** — the ucitrack trigger is registered by
  `/etc/init.d/ucitrack`; run `/etc/init.d/ucitrack restart` and check
  `/etc/init.d/snort-web enabled`. The package postinst does this on upgrade.
- **No Overview tab** — upgrade to 4.2.1 or later, or clear
  `/tmp/luci-indexcache*` and `/tmp/luci-modulecache/` after installing so the
  new menu entry is picked up.
- **Settings do not reach Snort** — run `/usr/libexec/snort-web-sync --sync`
  and check `uci show snort-web`, `uci show snort`, and
  `logread | grep -i snort-web`.
- **Translations do not appear** — check that the matching
  `luci-i18n-snort3-*` package is installed and
  `/usr/lib/lua/luci/i18n/snort.<lang>.lmo` exists, then log out and back in.
- **The service action fails** — check that `/etc/init.d/snort` exists and is
  executable, then inspect `logread | grep -i snort`.

On the router, verify the backend with `ubus list luci.snort` and `ubus call luci.snort status`.

### Legacy versions

The pre-1.0 Lua/CGI implementations and all 4.x beta history are archived in
the `legacy-and-beta` git tag. The `main` branch starts at version 1.0.0.

### License

GPL-2.0. See [LICENSE](LICENSE).

**Author:** David Dzieciol `<david.dzieciol51100@gmail.com>`

---

## Français

### Présentation

Cette application fournit une interface LuCI moderne pour **Snort3 IDS/IPS** sur
OpenWrt. Le frontend est écrit en **JavaScript LuCI** et repose sur un service
**rpcd/ucode**. L'implémentation Lua antérieure à 1.0 est archivée dans le tag
`legacy-and-beta`.

Fonctionnalités :

- état du service, PID, mémoire, disponibilité, interface, mode IDS/IPS et
  méthode DAQ en temps réel ;
- démarrage, arrêt, redémarrage, activation et désactivation au boot ;
- alertes récentes et extraits des journaux système, actualisés toutes les
  5 secondes ;
- mise à jour des règles avec journal de progression, réparation du lien
  symbolique et nettoyage des fichiers temporaires ;
- configuration UCI complète : service, journalisation, règles, OpenAppID et NFQ ;
- interface source en anglais et catalogues français et chinois simplifié complets.

Le navigateur n'exécute aucune commande privilégiée : le backend rpcd/ucode
contrôle les actions autorisées, les chemins et l'accès aux fichiers.

### Prérequis

- OpenWrt **25.12 ou ultérieur** avec LuCI JavaScript (paquets `apk` uniquement) ;
- `luci-base` ;
- `rpcd-mod-ucode` ;
- `snort3` et son script `/etc/init.d/snort` ;
- un programme de mise à jour des règles gratuites est fourni avec cette application ;
- facultatif : `luci-i18n-base-fr` ou `luci-i18n-base-zh-cn` pour l'interface
  LuCI standard en français ou en chinois simplifié.

```sh
apk update
apk add luci-base rpcd-mod-ucode snort3
```

### Installation (APK uniquement)

Seuls les paquets APK sont pris en charge, sur OpenWrt 25.12 et ultérieur.
Il n'existe ni installateur shell, ni paquets IPK/opkg, ni installation manuelle.

```sh
apk add --allow-untrusted ./luci-app-snort3-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-de-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-es-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-fr-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-pt-br-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-ru-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-zh-cn-*.apk
```

`--allow-untrusted` est nécessaire pour les paquets compilés localement. Le
paquet principal est indépendant de l'architecture (`LUCI_PKGARCH:=all`) : une
compilation avec un SDK x86/64 s'installe sur toute cible utilisant la même
version d'OpenWrt. Rechargez le navigateur (Ctrl+F5) après une mise à jour.


### Utilisation

Ouvrez **Services → Snort IDS/IPS** dans LuCI.

- **Vue d'ensemble** : état, contrôles du service, gestion des règles, journal de
  mise à jour et alertes récentes.
- **Paramètres** : options du service, journalisation, règles, avancé et NFQ.
- **Alertes** : 50 alertes récentes et 20 dernières lignes syslog Snort.

Les réglages de l'application sont stockés dans **`/etc/config/snort-web`**.
Le paquet `snort3` continuant de lire `/etc/config/snort`, le synchroniseur
`/usr/libexec/snort-web-sync` copie les options connues vers ce fichier :

- au démarrage, `/etc/init.d/snort-web` s'exécute avant `snort` (`START=98`) ;
- après **Enregistrer et appliquer**, le déclencheur ucitrack synchronise puis
  démarre, redémarre ou arrête Snort selon l'option *Activer Snort* ;
- le backend rpcd synchronise avant un démarrage/redémarrage et avant une mise
  à jour des règles, car `snort-mgr` lit `/etc/config/snort`.

Lors de la première installation, les réglages existants de `/etc/config/snort`
sont importés une fois (`snort-web.internal.migrated=1`). Ensuite, seul
`/etc/config/snort-web` fait foi. Le bouton **Mettre à jour les règles** lance
le programme fourni `/usr/libexec/snort-web-rules-update`, qui télécharge
gratuitement les règles communautaires Snort 3, et n'est désactivé que si aucun
programme de mise à jour n'est disponible. Le stockage persistant est optionnel (désactivé par défaut) ; sans lui, les règles
sont téléchargées à nouveau après chaque démarrage.

### Structure du projet

```text
htdocs/luci-static/resources/view/snort/   pages LuCI JavaScript
htdocs/luci-static/resources/snort/        API, utilitaires et styles
root/usr/share/rpcd/ucode/luci.snort.uc    backend rpcd privilégié
root/usr/share/luci/menu.d/                entrées de menu
root/usr/share/rpcd/acl.d/                 permissions RPC/UCI
root/etc/config/snort-web                  configuration par défaut de l'application
root/usr/libexec/snort-web-sync            synchronisation snort-web -> snort
root/etc/init.d/snort-web                  synchronisation avant le démarrage de snort
root/usr/share/ucitrack/                   déclencheur après Enregistrer et appliquer
root/etc/uci-defaults/                     migration, synchronisation et lien de règles
dist/lmo/snort.*.lmo                       six catalogues précompilés
po/de, po/es, po/fr, po/pt_BR,            catalogues de traduction
po/ru, po/zh_Hans/
po/templates/snort.pot                     modèle de traduction
.github/workflows/build-apk.yml            workflow de compilation APK
scripts/, tests/                           outils de build et tests
```

### Développement

```sh
npm test                 # tests JavaScript, paquet et LMO
npm run check:js         # vérification syntaxique JavaScript
npm run check:i18n       # couverture de tous les catalogues po/*/snort.po
npm run build:lmo        # régénère les six catalogues précompilés
npm run check:ucode      # validation du plugin avec ucode-lsp
npm run check            # JS + tests + i18n
```

Après modification d'un libellé :

```sh
node scripts/check-i18n.js --write-pot
```

Voir [CONTRIBUTING.md](CONTRIBUTING.md) pour les détails d'implémentation.

### Dépannage

- **Entrée de menu absente** : vérifiez `/etc/config/snort-web`, supprimez
  `/tmp/luci-indexcache*` et `/tmp/luci-modulecache`, puis rechargez LuCI.
- **`luci.snort` introuvable** : installez `rpcd-mod-ucode`, vérifiez
  `/usr/share/rpcd/ucode/luci.snort.uc`, puis redémarrez rpcd.
- **Les réglages n'atteignent pas Snort** : exécutez
  `/usr/libexec/snort-web-sync --sync`, puis consultez `uci show snort-web`,
  `uci show snort` et `logread | grep -i snort-web`.
- **Mise à jour des règles désactivée** : vérifiez que
  `/usr/libexec/snort-web-rules-update` est présent et exécutable.
- **Traduction absente** : vérifiez que le paquet `luci-i18n-snort3-*` correspondant
  est installé et que `/usr/lib/lua/luci/i18n/snort.<langue>.lmo` existe.
- **Action de service en échec** : vérifiez `/etc/init.d/snort` et consultez
  `logread | grep -i snort`.

Sur le routeur, vérifiez le backend avec `ubus list luci.snort` et
`ubus call luci.snort status`.

### Anciennes versions

Les implémentations Lua/CGI antérieures à 1.0 et tout l'historique beta 4.x sont
archivés dans le tag git `legacy-and-beta`. La branche `main` démarre à 1.0.0.

### Licence

GPL-2.0. Voir [LICENSE](LICENSE).

**Auteur :** David Dzieciol `<david.dzieciol51100@gmail.com>`

---

## 中文

### 简介

这是 OpenWrt **Snort3 IDS/IPS** 的现代化 LuCI 管理界面：前端使用 JavaScript，
后端使用 rpcd/ucode。它可以查看运行状态、控制服务、管理规则，并提供完整的
服务、日志、OpenAppID 和 NFQ 设置。界面提供英语源字符串，以及德语、西班牙语、法语、葡萄牙语（巴西）、俄语和
简体中文共六种翻译包。

### 兼容性

- OpenWrt **25.12 或更高版本**（仅支持 `apk` 软件包）；
- 需要 `luci-base`、`rpcd-mod-ucode` 和 `snort3`。

### 安装 APK（唯一方式）

仅支持 OpenWrt 25.12+ 的 `apk` 软件包，没有 shell 安装脚本、IPK/opkg 构建方式，
也不提供手动复制文件的安装方法。

先用 `apk add luci-base rpcd-mod-ucode snort3` 安装依赖，再从 GitHub Actions
的 **Build OpenWrt APK** 工作流下载产物（或用匹配版本的 SDK 本地构建），
复制到路由器后执行：

```sh
apk add --allow-untrusted ./luci-app-snort3-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-de-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-es-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-fr-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-pt-br-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-ru-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-zh-cn-*.apk
```

`--allow-untrusted` 用于本地构建的未签名包。主程序包与架构无关
（`LUCI_PKGARCH:=all`），x86/64 SDK 的产物可安装到同版本 OpenWrt 的其他目标。
升级后请强制刷新浏览器（Ctrl+F5）。


### 配置同步机制

LuCI 应用的设置保存在 **`/etc/config/snort-web`**，而 OpenWrt 的 `snort3`
仍然读取 `/etc/config/snort`。因此应用会自动同步：

- `/usr/libexec/snort-web-sync` 把已知的 `snort`、`nfq` 选项复制到
  `/etc/config/snort`；
- `/etc/init.d/snort-web` 在开机时先于 Snort 启动（`START=98`）；
- 点击 **保存并应用** 后，ucitrack 触发同步，并按「启用 Snort」开关自动启动、
  重启或停止服务；
- 后端在启动/重启服务和更新规则前也会先同步。

第一次安装或从旧版本升级时，会将现有 `/etc/config/snort` 的设置导入
`snort-web` 一次，并写入 `snort-web.internal.migrated=1`。之后请通过 LuCI
修改设置；直接修改 `/etc/config/snort` 会在下次应用或开机时被覆盖。默认使用 `snort-mgr` 生成的配置（`manual=0`），已移除手动模式与用户自定义 Lua
配置入口。`interface` 默认为 `auto`：同步脚本依次取 WAN 设备、LAN 网桥、`eth0`、
首个非 lo 设备；设置页提供 LuCI 标准设备下拉菜单供手动选择。规则下载后写入持久
目录 `/etc/snort/rules`，重启不会丢失，更新成功后自动重启 Snort 以重新渲染配置。
注意：`logread` 会长期保留升级前的 `daemon.err snort[...]` 崩溃日志，请按时间戳
判断是否为当前故障。可用 `ps | grep '[s]nort'` 确认进程是否在运行；启动失败详情
只引用本次启动之后新增的日志。若概览页全为 N/A，页面会显示后端错误提示，详细
原因也写在 `/tmp/snort_backend_error.log`。

### 使用

打开 LuCI，进入 **服务 → Snort IDS/IPS**：

- **概览**：服务状态（运行中 / 已停止 / 异常，异常会显示原因）、服务控制、
  规则管理、更新日志和最近告警；
- **设置**：服务、日志、规则、高级和 NFQ 选项；
- **告警**：最近 50 条告警和最近 20 条 Snort 系统日志。

规则更新功能已内置：概览页提供 Oinkcode 输入框和「更新订阅规则」「使用社区规则」
两个按钮（后者保留已保存的 Oinkcode，只切换来源）。规则是否持久化由设置页开关
控制，**默认关闭**（重启后丢失，开机联网后自动重新下载并可生成兜底规则）；打开后
规则保存在 `/etc/snort/rules`。定时更新开关可选 1 天 / 1 星期 / 1 个月，由 cron
在 03:00 执行。更新成功后会自动重启 Snort 以重新渲染配置。

### 构建与检查

```sh
npm test                 # JavaScript、软件包和 LMO 测试
npm run check:js         # JavaScript 语法检查
npm run check:i18n       # 检查所有 po/*/snort.po 的翻译覆盖率
npm run build:lmo        # 重新生成 dist/lmo 下的六个预编译语言包
npm run check:ucode      # 使用 ucode-lsp 检查后端
npm run check            # 全部检查
```

APK 构建步骤和本地 SDK 命令见
[docs/INSTALLATION.md](docs/INSTALLATION.md)。路由器端可用
`ubus list luci.snort` 和 `ubus call luci.snort status` 检查后端。

### 许可证

GPL-2.0。详见 [LICENSE](LICENSE)。

**作者：** David Dzieciol `<david.dzieciol51100@gmail.com>`
