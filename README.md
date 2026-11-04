# LuCI Snort3 for OpenWrt

Modern LuCI web interface for **Snort3 IDS/IPS** on OpenWrt. The application is
implemented as a **JavaScript LuCI frontend** backed by an **rpcd/ucode** service;
the old Lua implementation is preserved under `legacy/` for reference.

[English](#english) | [Français](#français) | [中文](#中文)

---

## English

### Overview

This module gives Snort3 a native place in LuCI:

- live service status, PID, memory use, uptime, interface, IDS/IPS mode and DAQ method;
- start, stop, restart, enable and disable controls;
- recent alerts and system log excerpts, refreshed every 5 seconds;
- rules update with progress log, symbolic-link repair and temporary-file cleanup;
- complete UCI settings for service, logging, rules, OpenAppID and NFQ;
- English source strings with complete French and Simplified Chinese catalogs.

The browser never runs privileged commands. All service, file and log access is
performed by the rpcd/ucode backend through a small allow-listed RPC surface.

### Requirements

- OpenWrt **23.05 or newer** (24.10 LTS recommended) with the JavaScript LuCI runtime;
- `luci-base`;
- `rpcd-mod-ucode` (the `luci.snort` rpcd plugin);
- `snort3` and its init script at `/etc/init.d/snort`;
- optional: an executable rules updater at `/usr/bin/snort-rules`;
- optional: `luci-i18n-base-fr` or `luci-i18n-base-zh-cn` for the standard
  LuCI interface in French or Simplified Chinese.

```sh
# OpenWrt 24.10 and older (opkg)
opkg update
opkg install luci-base rpcd-mod-ucode snort3

# OpenWrt 25.12 and newer (apk)
apk update
apk add luci-base rpcd-mod-ucode snort3
```

### Installation

#### OpenWrt 25.12+ — install an APK

OpenWrt 25.12 and newer use the `apk` package manager. Build the packages with
the included GitHub Actions workflow, or locally with an APK-enabled SDK (see
[docs/INSTALLATION.md](docs/INSTALLATION.md)).

```sh
# Copy the packages to the router, then install them as root.
apk add --allow-untrusted ./luci-app-snort3-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-zh-cn-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-fr-*.apk   # optional
```

The `luci-app-snort3` package is architecture-independent (`LUCI_PKGARCH:=all`)
when built with the standard `luci.mk`. Build it once with an x86/64 SDK and
install it on any router running the same OpenWrt release. Use an SDK matching
the router release; the package manager version (apk versus opkg) must match.

#### OpenWrt 24.10 and older — build an IPK

Copy this directory to `feeds/luci/applications/luci-app-snort3`, enable
`luci-app-snort3`, `luci-i18n-snort3-fr` and/or `luci-i18n-snort3-zh-cn` in
`menuconfig`, then build normally:

```sh
make package/luci-app-snort3/compile V=s
```

`luci.mk` installs the files under `root/`, the views under `htdocs/`, and
creates the translation packages from `po/`.

#### GitHub Actions

The `Build OpenWrt APK` workflow downloads an official SDK, builds the
application and both translation packages, and uploads the `.apk` files as a
workflow artifact. It can be started manually with a different SDK version or
target. See [.github/workflows/build-apk.yml](.github/workflows/build-apk.yml).

#### Direct installation (fallback)

The installer remains available for systems without a package build, but APK or
IPK packages are the supported installation path. It installs the JavaScript
views, ucode backend, sync helper, init script, ucitrack definition, menu/ACL,
default `/etc/config/snort-web` and both prebuilt catalogs.

```sh
# From a downloaded/cloned repository
sh install.sh

# Or download and run the installer directly
wget -O /tmp/install-snort3.sh \
  https://raw.githubusercontent.com/xiaoxmiao/luci-app-snort3/main/install.sh
sh /tmp/install-snort3.sh
```

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
	option manual '1'
	option interface 'br-lan'
	option mode 'ids'
	option method 'pcap'

config nfq 'nfq'
	option queue_count '4'
	option queue_start '4'
	option chain_type 'input'

config internal 'internal'
	option migrated '0'
```

The OpenWrt `snort3` package still reads `/etc/config/snort`, so the application
keeps both files in sync:

- `/usr/libexec/snort-web-sync` copies the known `snort` and `nfq` options from
  `snort-web` to `snort` and commits the result;
- `/etc/init.d/snort-web` runs at boot before `snort` (`START=98` versus `99`);
- `/usr/share/ucitrack/luci-app-snort3.json` triggers the same init script after
  **Save & Apply**; if Snort is running it is restarted with the new settings;
- the rpcd backend synchronises before service start/restart and before a rules
  update, because `/usr/bin/snort-rules` reads `/etc/config/snort`.

On first installation (or when upgrading from the old version that wrote
directly to `/etc/config/snort`), the helper imports the existing settings once
and sets `snort-web.internal.migrated=1`. After that, `snort-web` is the
canonical file. Edit it through LuCI; manual changes to `/etc/config/snort` are
overwritten on the next apply or boot.

### Rules management

The Overview page reads `/etc/snort/rules` and the temporary rules directory
(`/var/snort.d/rules` by default). It can:

- launch `/usr/bin/snort-rules` in the background and display its update log;
- replace a real rules directory with a symbolic link after making a backup;
- repair a broken symbolic link;
- remove downloaded `.tar.gz` archives and update lock/log files.

Only start, stop, restart, enable and disable are accepted as service actions,
and configured paths are restricted to clean absolute paths by the backend.

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
root/etc/uci-defaults/                     migration, sync and rules-link repair
dist/lmo/snort.fr.lmo                      prebuilt French catalog
dist/lmo/snort.zh-cn.lmo                   prebuilt Simplified Chinese catalog
po/fr/snort.po                             French catalog
po/zh_Hans/snort.po                        Simplified Chinese catalog
po/templates/snort.pot                     translation template
legacy/lua-v3/                             previous Lua implementation
legacy/v0-cgi-interface/                   original CGI prototype
```

### APK build workflow

The workflow at `.github/workflows/build-apk.yml` can be run from the GitHub
**Actions** tab. It defaults to the OpenWrt 25.12.6 x86/64 SDK and produces:

- `luci-app-snort3-*.apk`
- `luci-i18n-snort3-fr-*.apk`
- `luci-i18n-snort3-zh-cn-*.apk`

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
- **Rules update is disabled** — install or create `/usr/bin/snort-rules`; the
  button is disabled when the updater is absent.
- **Settings do not reach Snort** — run `/usr/libexec/snort-web-sync --sync`
  and check `uci show snort-web`, `uci show snort`, and
  `logread | grep -i snort-web`.
- **French or Chinese texts do not appear** — check
  `/usr/lib/lua/luci/i18n/snort.fr.lmo` or `snort.zh-cn.lmo`, log out and back
  in, and make sure the LuCI language is French or Chinese.
- **The service action fails** — check that `/etc/init.d/snort` exists and is
  executable, then inspect `logread | grep -i snort`.

Run `sh verify.sh` on the router for a file, dependency and ubus check.

### Legacy versions

The Lua CBI/controller implementation and its original installer are kept in
`legacy/lua-v3/`; the first CGI prototype is in `legacy/v0-cgi-interface/`.
They are not installed by the current package.

### License

GPL-2.0. See [LICENSE](LICENSE).

**Author:** David Dzieciol `<david.dzieciol51100@gmail.com>`

---

## Français

### Présentation

Cette application fournit une interface LuCI moderne pour **Snort3 IDS/IPS** sur
OpenWrt. Le frontend est écrit en **JavaScript LuCI** et repose sur un service
**rpcd/ucode**. L'ancienne implémentation Lua est conservée dans `legacy/`.

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

- OpenWrt **23.05 ou ultérieur** (24.10 LTS recommandé) avec LuCI JavaScript ;
- `luci-base` ;
- `rpcd-mod-ucode` ;
- `snort3` et son script `/etc/init.d/snort` ;
- facultatif : `/usr/bin/snort-rules` pour la mise à jour des règles ;
- facultatif : `luci-i18n-base-fr` ou `luci-i18n-base-zh-cn` pour l'interface
  LuCI standard en français ou en chinois simplifié.

```sh
# OpenWrt 24.10 et antérieur (opkg)
opkg update
opkg install luci-base rpcd-mod-ucode snort3

# OpenWrt 25.12 et ultérieur (apk)
apk update
apk add luci-base rpcd-mod-ucode snort3
```

### Installation

#### OpenWrt 25.12+ — paquets APK

```sh
apk add --allow-untrusted ./luci-app-snort3-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-zh-cn-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-fr-*.apk   # facultatif
```

Le workflow **Build OpenWrt APK** construit les paquets avec un SDK officiel. Le
paquet principal est indépendant de l'architecture (`LUCI_PKGARCH:=all`) et peut
être installé sur une autre cible fonctionnant avec la même version d'OpenWrt.

#### OpenWrt 24.10 et antérieur — paquets IPK

Copiez ce répertoire dans `feeds/luci/applications/luci-app-snort3`, activez
`luci-app-snort3`, `luci-i18n-snort3-fr` et/ou `luci-i18n-snort3-zh-cn` dans
`menuconfig`, puis compilez normalement :

```sh
make package/luci-app-snort3/compile V=s
```

#### Installation directe (secours)

```sh
# Depuis un dépôt cloné
sh install.sh

# Ou téléchargement direct
wget -O /tmp/install-snort3.sh \
  https://raw.githubusercontent.com/xiaoxmiao/luci-app-snort3/main/install.sh
sh /tmp/install-snort3.sh
```

Le script installe les vues JavaScript, le backend ucode, le synchroniseur, le
script d'initialisation, le fichier ucitrack, le menu, les ACL, la configuration
`/etc/config/snort-web` et les deux catalogues précompilés.

Voir [docs/INSTALLATION.md](docs/INSTALLATION.md) pour la compilation APK locale
et l'installation manuelle.

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
  redémarre Snort s'il est en cours d'exécution ;
- le backend rpcd synchronise avant un démarrage/redémarrage et avant une mise
  à jour des règles, car `/usr/bin/snort-rules` lit `/etc/config/snort`.

Lors de la première installation, les réglages existants de `/etc/config/snort`
sont importés une fois (`snort-web.internal.migrated=1`). Ensuite, seul
`/etc/config/snort-web` fait foi. Le bouton de mise à jour des règles est
désactivé si `/usr/bin/snort-rules` est absent. La réparation du lien symbolique
crée une sauvegarde de l'ancien répertoire avant de le remplacer.

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
dist/lmo/snort.fr.lmo                      catalogue français précompilé
dist/lmo/snort.zh-cn.lmo                   catalogue chinois simplifié précompilé
po/fr/snort.po                             catalogue français
po/zh_Hans/snort.po                        catalogue chinois simplifié
po/templates/snort.pot                     modèle de traduction
legacy/lua-v3/                             ancienne implémentation Lua
legacy/v0-cgi-interface/                   prototype CGI d'origine
```

### Développement

```sh
npm test                 # tests JavaScript, paquet et LMO
npm run check:js         # vérification syntaxique JavaScript
npm run check:i18n       # couverture de tous les catalogues po/*/snort.po
npm run build:lmo        # régénère les deux catalogues précompilés
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
- **Mise à jour des règles désactivée** : installez `/usr/bin/snort-rules`.
- **Traduction française ou chinoise absente** : vérifiez
  `/usr/lib/lua/luci/i18n/snort.fr.lmo` ou `snort.zh-cn.lmo`, reconnectez-vous
  à LuCI et choisissez la langue.
- **Action de service en échec** : vérifiez `/etc/init.d/snort` et consultez
  `logread | grep -i snort`.

Exécutez `sh verify.sh` sur le routeur pour contrôler les fichiers, dépendances
et l'objet ubus.

### Anciennes versions

L'implémentation Lua et son installateur sont conservés dans `legacy/lua-v3/`.
Le prototype CGI initial se trouve dans `legacy/v0-cgi-interface/`. Ces fichiers
ne sont pas installés par le paquet actuel.

### Licence

GPL-2.0. Voir [LICENSE](LICENSE).

**Auteur :** David Dzieciol `<david.dzieciol51100@gmail.com>`

---

## 中文

### 简介

这是 OpenWrt **Snort3 IDS/IPS** 的现代化 LuCI 管理界面：前端使用 JavaScript，
后端使用 rpcd/ucode。它可以查看运行状态、控制服务、管理规则，并提供完整的
服务、日志、OpenAppID 和 NFQ 设置。界面包含英文源字符串、法语和简体中文
翻译。

### 兼容性

- OpenWrt **23.05 或更高版本**；推荐 24.10 LTS；
- OpenWrt **25.12 或更高版本** 使用 `.apk` 软件包；
- OpenWrt **24.10 及更早版本** 使用 `.ipk` 软件包；
- 需要 `luci-base`、`rpcd-mod-ucode` 和 `snort3`。

### 安装 APK（OpenWrt 25.12+）

从 GitHub Actions 的 **Build OpenWrt APK** 工作流下载构建产物，或者使用
与路由器版本匹配的 OpenWrt SDK 本地构建，然后把文件复制到路由器：

```sh
apk add --allow-untrusted ./luci-app-snort3-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-zh-cn-*.apk
```

主程序包使用 `LUCI_PKGARCH:=all`，与 CPU 架构无关；翻译包同样是纯数据包。
请确保 SDK 的 OpenWrt 版本与路由器一致。

### 配置同步机制

LuCI 应用的设置保存在 **`/etc/config/snort-web`**，而 OpenWrt 的 `snort3`
仍然读取 `/etc/config/snort`。因此应用会自动同步：

- `/usr/libexec/snort-web-sync` 把已知的 `snort`、`nfq` 选项复制到
  `/etc/config/snort`；
- `/etc/init.d/snort-web` 在开机时先于 Snort 启动（`START=98`）；
- 点击 **保存并应用** 后，ucitrack 触发同步；如果 Snort 正在运行，会自动重启；
- 后端在启动/重启服务和更新规则前也会先同步。

第一次安装或从旧版本升级时，会将现有 `/etc/config/snort` 的设置导入
`snort-web` 一次，并写入 `snort-web.internal.migrated=1`。之后请通过 LuCI
修改设置；直接修改 `/etc/config/snort` 会在下次应用或开机时被覆盖。

### 使用

打开 LuCI，进入 **服务 → Snort IDS/IPS**：

- **概览**：运行状态、服务控制、规则管理、更新日志和最近告警；
- **设置**：服务、日志、规则、高级和 NFQ 选项；
- **告警**：最近 50 条告警和最近 20 条 Snort 系统日志。

### 构建与检查

```sh
npm test                 # JavaScript、软件包和 LMO 测试
npm run check:js         # JavaScript 语法检查
npm run check:i18n       # 检查所有 po/*/snort.po 的翻译覆盖率
npm run build:lmo        # 重新生成 dist/lmo 下的两个预编译语言包
npm run check:ucode      # 使用 ucode-lsp 检查后端
npm run check            # 全部检查
```

APK 构建步骤和本地 SDK 命令见
[docs/INSTALLATION.md](docs/INSTALLATION.md)。路由器端可运行
`sh verify.sh` 检查文件、依赖和 ubus 对象。

### 许可证

GPL-2.0。详见 [LICENSE](LICENSE)。

**作者：** David Dzieciol `<david.dzieciol51100@gmail.com>`
