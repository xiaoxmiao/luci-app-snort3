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

Building from a full OpenWrt source tree instead of the SDK: this repository is
a single LuCI application, not a feed. Place it in
`feeds/luci/applications/luci-app-snort3` and run `./scripts/feeds update -i luci`
plus `./scripts/feeds install -p luci luci-app-snort3`, or clone it into
`package/luci-app-snort3`. See
[docs/INSTALLATION.md](docs/INSTALLATION.md#23-building-from-a-full-openwrt-buildroot).

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
npm run build:lmo        # regenerate the six prebuilt catalogs
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
  no executable bit is required); the button is disabled when the bundled
  updater is missing. The notification shows the reason, and
  `/tmp/snort_rules_update.log` contains the full output.
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
  your settings). The package postinst performs the rpcd restart itself.
  `ubus call luci.snort status` exposes `proc_comm` and `proc_scan` to show what
  the backend actually found in `/proc`.
- **Overview shows only N/A and the buttons do nothing** — a `backend_error`
  notification now names the failing RPC method; the same message is written to
  `/tmp/snort_backend_error.log`. Check `ubus call luci.snort status` and
  `logread | grep -i rpcd` if it persists.
- **Old `local.lua` / DAQ crash lines in `logread`** — those are historical
  syslog entries from the 4.x beta series (see the `legacy-and-beta` tag).
  `logread` keeps them for a long time, so check their timestamps and confirm
  with `ps | grep '[s]nort'`. A failed start only quotes lines written *after*
  the latest start marker.
- **Save & Apply does not start Snort** — the ucitrack trigger is registered by
  `/etc/init.d/ucitrack`; run `/etc/init.d/ucitrack restart` and check
  `/etc/init.d/snort-web enabled`. The package postinst does this on upgrade.
- **No Overview tab** — clear `/tmp/luci-indexcache*` and
  `/tmp/luci-modulecache/` after installing so the new menu entry is picked up.
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

**Original author:** David Dzieciol `<david.dzieciol51100@gmail.com>` (upstream project)

**Maintainer:** xiaoxmiao — <https://github.com/xiaoxmiao/luci-app-snort3>

---

## Français

### Présentation

Ce module donne à Snort3 une place native dans LuCI :

- état du service en temps réel, PID, mémoire, durée de fonctionnement,
  interface, mode IDS/IPS et méthode DAQ ;
- commandes de démarrage, arrêt, redémarrage, activation et désactivation ;
- alertes récentes et extraits des journaux système, actualisés toutes les
  5 secondes ;
- stockage des règles persistant ou en mémoire au choix, mises à jour
  planifiées et rechargement au démarrage ;
- paramètres UCI complets pour le service, la journalisation, les règles,
  OpenAppID et NFQ ;
- chaînes sources en anglais et six catalogues : allemand, espagnol, français,
  portugais brésilien, russe et chinois simplifié.

Le navigateur n'exécute jamais de commandes privilégiées. Tous les accès au
service, aux fichiers et aux journaux passent par le backend rpcd/ucode via une
petite surface RPC explicitement autorisée.

### Prérequis

- OpenWrt **25.12 ou ultérieur** avec le runtime LuCI JavaScript (paquets `apk`
  uniquement) ;
- `luci-base` ;
- `rpcd-mod-ucode` (le plugin rpcd `luci.snort`) ;
- `snort3` avec son script d'initialisation `/etc/init.d/snort` et `snort-mgr` ;
- le programme de mise à jour des règles fourni (aucun paquet supplémentaire
  n'est nécessaire) ;
- facultatif : les paquets `luci-i18n-base-*` pour la langue de l'interface.

```sh
apk update
apk add luci-base rpcd-mod-ucode snort3
```

### Installation (APK uniquement)

Seuls les paquets APK sont pris en charge, sur OpenWrt 25.12 et ultérieur. Il
n'existe ni installateur shell, ni compilation IPK/opkg, ni installation par
copie manuelle des fichiers.

Compilez les paquets avec le workflow GitHub Actions fourni (`Build OpenWrt
APK`), ou localement avec un SDK compatible APK (voir
[docs/INSTALLATION.md](docs/INSTALLATION.md)). Copiez ensuite les fichiers
`.apk` sur le routeur et installez-les en root :

```sh
apk add --allow-untrusted ./luci-app-snort3-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-de-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-es-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-fr-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-pt-br-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-ru-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-zh-cn-*.apk
```

`--allow-untrusted` est requis pour les paquets compilés localement sans la clé
de signature de la version OpenWrt. Le paquet principal est indépendant de
l'architecture (`LUCI_PKGARCH:=all`) : une compilation avec le SDK x86/64
s'installe sur toute cible utilisant la même version d'OpenWrt. Utilisez
toujours un SDK de la même version que le routeur. Après une mise à jour,
rechargez le navigateur (Ctrl+F5).

Pour compiler depuis un arbre source OpenWrt complet plutôt qu'avec le SDK : ce
dépôt est une application LuCI unique, pas un feed. Placez-le dans
`feeds/luci/applications/luci-app-snort3` et lancez `./scripts/feeds update -i luci`
puis `./scripts/feeds install -p luci luci-app-snort3`, ou clonez-le dans
`package/luci-app-snort3`. Voir
[docs/INSTALLATION.md](docs/INSTALLATION.md#23-building-from-a-full-openwrt-buildroot).

### Accès

Ouvrez LuCI et allez dans **Services → Snort IDS/IPS**.

- **Vue d'ensemble** — cartes d'état, contrôles du service, gestion des règles,
  journal des mises à jour et alertes récentes.
- **Paramètres** — options du service, de la journalisation, des règles,
  avancées et NFQ.
- **Alertes** — les 50 alertes les plus récentes et les 20 dernières lignes
  syslog de Snort.

### Configuration

L'application LuCI stocke ses réglages dans **`/etc/config/snort-web`** :

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

`enabled` est l'interrupteur principal : **Enregistrer et appliquer** démarre ou
arrête Snort selon sa valeur. L'application utilise toujours la configuration
générée par `snort-mgr` (`manual=0`) : le mode manuel hérité de snort3 passe
`--tweaks local`, nécessite un `local.lua` absent du paquet et omet
`daq.module_dirs`, ce qui provoque une boucle de crash dès la première
installation. Le mode manuel et les inclusions Lua personnalisées ne sont plus
proposés. `interface` vaut `auto` par défaut : l'utilitaire de synchronisation
résout d'abord le périphérique WAN, puis le pont LAN, puis `eth0`, puis le
premier périphérique non-loopback ; la page Paramètres propose une liste
déroulante des périphériques LuCI pour un choix manuel. Le démarrage au boot se
règle séparément avec **Activer au démarrage**.

Le paquet OpenWrt `snort3` lit toujours `/etc/config/snort` ; l'application
maintient donc les deux fichiers synchronisés :

- `/usr/libexec/snort-web-sync` copie les options `snort` et `nfq` connues de
  `snort-web` vers `snort` et valide le résultat ;
- `/etc/init.d/snort-web` s'exécute au boot avant `snort` (`START=98` contre
  `99`) ;
- `/usr/share/ucitrack/luci-app-snort3.json` déclenche
  `/etc/init.d/snort-web reload` après **Enregistrer et appliquer** ; le reload
  démarre, redémarre ou arrête Snort selon l'option *Activer Snort* et
  enregistre le résultat pour la page Vue d'ensemble ;
- le backend rpcd synchronise avant un démarrage/redémarrage du service et
  avant une mise à jour des règles, car `snort-mgr` lit `/etc/config/snort`.

À la première installation (ou lors d'une mise à jour depuis l'ancienne version
qui écrivait directement dans `/etc/config/snort`), l'utilitaire importe les
réglages existants une seule fois et positionne
`snort-web.internal.migrated=1`. Ensuite, `snort-web` fait foi. Modifiez-le via
LuCI ; les changements manuels de `/etc/config/snort` sont écrasés à la
prochaine application ou au prochain démarrage.

### Gestion des règles

L'application fournit un programme de mise à jour intégré,
`/usr/libexec/snort-web-rules-update`. La page **Vue d'ensemble** propose un
champ Oinkcode et deux actions :

- **Mettre à jour les règles abonnées** télécharge l'instantané enregistré avec
  l'Oinkcode sauvegardé. Celui-ci est stocké dans `snort-web.snort.oinkcode`.
- **Utiliser les règles communautaires** force le jeu de règles gratuit et
  remplace les règles installées, tout en conservant l'Oinkcode pour plus tard.

Chaque mise à jour remplace atomiquement tout le répertoire de règles et
affiche chaque fichier `.rules` installé avec sa taille dans le journal. Une
mise à jour réussie redémarre Snort, car `snort-mgr` énumère les `*.rules` lors
de la génération de `snort_conf.lua`.

**Stockage** : l'option `rules_persist` des Paramètres est **désactivée par
défaut**. Les règles résident alors dans `$temp_dir/rules` (tmpfs) et
`/etc/snort/rules` est un lien symbolique : elles disparaissent au redémarrage.
Activer l'option les stocke dans le vrai répertoire `/etc/snort/rules`.
Lorsque la persistance est désactivée, un script hotplug `ifup` télécharge les
règles une fois par démarrage ; `--fallback` installe les `builtin_rules` du
paquet (ou une règle ICMP minimale) en l'absence d'Internet, afin que Snort ne
démarre jamais avec un répertoire de règles vide.

**Planification**, indépendante du stockage : `rules_auto_update` et
`rules_update_interval` (1 jour / 1 semaine / 1 mois) écrivent une entrée
crontab exécutée à 03:00. `/usr/libexec/snort-web-schedule` gère cette entrée et
redémarre cron. OpenWrt n'a pas de paquet `cron` autonome — `crond` fait partie
du paquet essentiel busybox —, l'utilitaire vérifie donc `/etc/init.d/cron` à
l'exécution et journalise un avertissement s'il est absent.

La page Vue d'ensemble affiche aussi l'état du service en trois états
(**en cours d'exécution**, **arrêté** ou **erreur**, avec le motif), les fichiers
de règles installés avec leur source et leur date de mise à jour, et les
alertes récentes formatées depuis `alert_json`.

### Structure du projet

```text
htdocs/luci-static/resources/view/snort/   pages LuCI JavaScript
htdocs/luci-static/resources/snort/        API, utilitaires et styles partagés
root/usr/share/rpcd/ucode/luci.snort.uc    backend rpcd privilégié
root/usr/share/luci/menu.d/                entrées de menu
root/usr/share/rpcd/acl.d/                 permissions RPC/UCI
root/etc/config/snort-web                  configuration par défaut
root/usr/libexec/snort-web-sync            synchronisation snort-web -> snort
root/etc/init.d/snort-web                  synchronisation avant le démarrage
root/usr/share/ucitrack/                   déclencheur après Enregistrer/appliquer
root/etc/uci-defaults/                     migration, synchronisation, planification
dist/lmo/snort.*.lmo                       six catalogues précompilés
po/de, po/es, po/fr, po/pt_BR,            catalogues de traduction
po/ru, po/zh_Hans/
po/templates/snort.pot                     modèle de traduction
.github/workflows/build-apk.yml            workflow de compilation APK
scripts/, tests/                           outils de build et tests unitaires
```

### Workflow de compilation APK

Le workflow `.github/workflows/build-apk.yml` se lance depuis l'onglet GitHub
**Actions**. Il utilise par défaut le SDK OpenWrt 25.12.6 x86/64 et produit :

- `luci-app-snort3-*.apk`
- `luci-i18n-snort3-de-*.apk`, `-es-*.apk`, `-fr-*.apk`
- `luci-i18n-snort3-pt-br-*.apk`, `-ru-*.apk`, `-zh-cn-*.apk`

Les paquets étant indépendants de l'architecture, la sortie du SDK x86/64
s'installe sur les autres cibles utilisant la même version d'OpenWrt. La version
du SDK, la cible et les paquets produits sont documentés dans
[docs/INSTALLATION.md](docs/INSTALLATION.md).

### Développement

Node.js 18 ou ultérieur est recommandé pour les vérifications locales.

```sh
npm test                 # tests des helpers JavaScript, du paquet et des LMO
npm run check:js         # syntaxe de tous les fichiers JavaScript
npm run check:i18n       # compare les chaînes UI avec chaque po/*/snort.po
npm run build:lmo        # régénère les six catalogues précompilés
npm run check:ucode      # valide le plugin rpcd avec ucode-lsp
npm run check            # JS + tests + i18n
```

Après modification d'une chaîne visible, régénérez le modèle de traduction :

```sh
node scripts/check-i18n.js --write-pot
```

Voir [CONTRIBUTING.md](CONTRIBUTING.md) pour les notes d'implémentation.

### Dépannage

- **L'entrée de menu est absente** — vérifiez que `/etc/config/snort-web`
  existe, puis effacez `/tmp/luci-indexcache*` et `/tmp/luci-modulecache` et
  rechargez LuCI.
- **`luci.snort` n'est pas enregistré** — installez `rpcd-mod-ucode`, vérifiez
  la présence de `/usr/share/rpcd/ucode/luci.snort.uc`, puis redémarrez rpcd :
  `/etc/init.d/rpcd restart`.
- **La mise à jour des règles est désactivée** — vérifiez que
  `/usr/libexec/snort-web-rules-update` existe (il est lancé via `/bin/sh`,
  aucun bit exécutable n'est requis) ; le bouton est désactivé si le programme
  intégré est absent. La notification indique le motif et
  `/tmp/snort_rules_update.log` contient la sortie complète.
- **Le démarrage signale une erreur / Snort reste arrêté** — activez d'abord
  *Activer Snort* dans les Paramètres. Le script init d'OpenWrt sort avec 0 sans
  rien démarrer lorsque `enabled=0` ; l'application vérifie qu'un processus
  apparaît réellement et affiche le motif (désactivé, aucune règle, sortie du
  script init ou lignes syslog de ce démarrage). Consultez
  `logread | grep -i snort` et `snort-mgr check`.
- **La page se comporte encore comme la version précédente après une mise à
  jour** — `rpcd reload` ne relance pas les plugins ucode : exécutez
  `/etc/init.d/rpcd restart`, effacez `/tmp/luci-indexcache*` et
  `/tmp/luci-modulecache`, supprimez `/tmp/snort_service_action.*`, puis
  rechargez le navigateur. Ne supprimez pas `/etc/config/snort-web` (fichier de
  configuration contenant vos réglages). Le postinst du paquet effectue lui-même
  le redémarrage de rpcd. `ubus call luci.snort status` expose `proc_comm` et
  `proc_scan` pour voir ce que le backend a réellement trouvé dans `/proc`.
- **La vue d'ensemble n'affiche que des N/A et les boutons ne répondent pas** —
  une notification `backend_error` nomme la méthode RPC défaillante ; le même
  message est écrit dans `/tmp/snort_backend_error.log`. Vérifiez
  `ubus call luci.snort status` et `logread | grep -i rpcd` si le problème
  persiste.
- **Anciennes lignes de crash `local.lua` / DAQ dans `logread`** — ce sont des
  entrées syslog historiques de la série beta 4.x (voir le tag
  `legacy-and-beta`). `logread` les conserve longtemps : vérifiez leurs
  horodatages et confirmez avec `ps | grep '[s]nort'`. Un démarrage en échec ne
  cite que les lignes écrites *après* le dernier marqueur de démarrage.
- **Enregistrer et appliquer ne démarre pas Snort** — le déclencheur ucitrack
  est enregistré par `/etc/init.d/ucitrack` ; lancez
  `/etc/init.d/ucitrack restart` et vérifiez `/etc/init.d/snort-web enabled`.
  Le postinst du paquet le fait lors d'une mise à jour.
- **Pas d'onglet Vue d'ensemble** — effacez `/tmp/luci-indexcache*` et
  `/tmp/luci-modulecache/` après l'installation pour que la nouvelle entrée de
  menu soit prise en compte.
- **Les réglages n'atteignent pas Snort** — exécutez
  `/usr/libexec/snort-web-sync --sync`, puis consultez `uci show snort-web`,
  `uci show snort` et `logread | grep -i snort-web`.
- **Les traductions n'apparaissent pas** — vérifiez que le paquet
  `luci-i18n-snort3-*` correspondant est installé et que
  `/usr/lib/lua/luci/i18n/snort.<langue>.lmo` existe, puis reconnectez-vous.
- **L'action de service échoue** — vérifiez que `/etc/init.d/snort` existe et
  est exécutable, puis consultez `logread | grep -i snort`.

Sur le routeur, vérifiez le backend avec `ubus list luci.snort` et
`ubus call luci.snort status`.

### Anciennes versions

Les implémentations Lua/CGI antérieures à 1.0 et tout l'historique beta 4.x sont
archivés dans le tag git `legacy-and-beta`. La branche `main` démarre à la
version 1.0.0.

### Licence

GPL-2.0. Voir [LICENSE](LICENSE).

**Auteur original :** David Dzieciol `<david.dzieciol51100@gmail.com>` (projet amont)

**Mainteneur :** xiaoxmiao — <https://github.com/xiaoxmiao/luci-app-snort3>

---

## 中文

### 简介

本模块让 Snort3 原生集成到 LuCI：

- 实时服务状态、PID、内存占用、运行时间、接口、IDS/IPS 模式与 DAQ 方式；
- 启动、停止、重启、开机启用与禁用控制；
- 最近告警与系统日志摘录，每 5 秒自动刷新；
- 可选的持久化或内存规则存储、定时更新与开机补更新；
- 完整的服务、日志、规则、OpenAppID 与 NFQ 的 UCI 设置；
- 英语源字符串，另提供德语、西班牙语、法语、葡萄牙语（巴西）、俄语和
  简体中文六个翻译包。

浏览器从不执行特权命令。所有服务、文件与日志访问都由 rpcd/ucode 后端
通过一组白名单 RPC 接口完成。

### 运行环境

- OpenWrt **25.12 或更高版本**，使用 JavaScript LuCI 运行时（仅支持 `apk` 包）；
- `luci-base`；
- `rpcd-mod-ucode`（`luci.snort` rpcd 插件）；
- `snort3`，含 `/etc/init.d/snort` 与 `snort-mgr`；
- 内置的规则更新器（无需额外软件包）；
- 可选：`luci-i18n-base-*` 用于 LuCI 界面语言。

```sh
apk update
apk add luci-base rpcd-mod-ucode snort3
```

### 安装 APK（唯一方式）

仅支持 OpenWrt 25.12 及更高版本的 APK 包。没有 shell 安装脚本、IPK/opkg
构建方式，也不提供手动复制文件的安装方法。

用仓库自带的 GitHub Actions 工作流（`Build OpenWrt APK`）构建，或使用支持
APK 的 SDK 本地构建（见 [docs/INSTALLATION.md](docs/INSTALLATION.md)），
然后把 `.apk` 文件复制到路由器并以 root 安装：

```sh
apk add --allow-untrusted ./luci-app-snort3-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-de-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-es-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-fr-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-pt-br-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-ru-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-zh-cn-*.apk
```

本地构建的包没有 OpenWrt 发行版签名密钥，必须加 `--allow-untrusted`。主程序包
与架构无关（`LUCI_PKGARCH:=all`），因此 x86/64 SDK 的产物可安装到运行同一
OpenWrt 版本的其他目标平台。SDK 版本务必与路由器一致。升级后请强制刷新
浏览器（Ctrl+F5）。

如果不用 SDK，而是从完整的 OpenWrt 源码树构建：本仓库是单个 LuCI 应用，不是
feed。请放到 `feeds/luci/applications/luci-app-snort3` 并执行
`./scripts/feeds update -i luci` 与
`./scripts/feeds install -p luci luci-app-snort3`，或克隆到
`package/luci-app-snort3`。详见
[docs/INSTALLATION.md](docs/INSTALLATION.md#23-building-from-a-full-openwrt-buildroot)。

### 访问

打开 LuCI，进入 **服务 → Snort IDS/IPS**。

- **概览**：状态卡片、服务控制、规则管理、更新日志与最近告警。
- **设置**：服务、日志、规则、高级与 NFQ 选项。
- **告警**：最近 50 条告警与最近 20 条 Snort syslog 行。

### 配置

LuCI 应用的设置保存在 **`/etc/config/snort-web`**：

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

`enabled` 是总开关：**保存并应用** 会按它启动或停止 Snort。应用始终使用
`snort-mgr` 生成的配置（`manual=0`）：snort3 的旧手动模式会传
`--tweaks local`，需要官方包并未提供的 `local.lua`，且缺少
`daq.module_dirs`，首次安装就会陷入崩溃循环。手动模式与用户自定义 Lua
配置入口已移除。`interface` 默认为 `auto`：同步脚本依次解析 WAN 设备、
LAN 网桥、`eth0`、首个非 lo 设备；设置页提供 LuCI 标准设备下拉菜单供手动
选择。开机自启由 **开机启用** 单独控制。

OpenWrt 的 `snort3` 仍读取 `/etc/config/snort`，因此应用会保持两个文件同步：

- `/usr/libexec/snort-web-sync` 把已知的 `snort`、`nfq` 选项从
  `snort-web` 复制到 `snort` 并提交；
- `/etc/init.d/snort-web` 在开机时先于 `snort` 运行（`START=98` 对 `99`）；
- `/usr/share/ucitrack/luci-app-snort3.json` 在 **保存并应用** 后触发
  `/etc/init.d/snort-web reload`；reload 会按 *启用 Snort* 开关启动、重启或
  停止服务，并把结果记录下来供概览页展示；
- rpcd 后端在启动/重启服务与更新规则前也会先同步，因为 `snort-mgr` 读取
  `/etc/config/snort`。

首次安装（或从直接写 `/etc/config/snort` 的旧版本升级）时，同步助手会一次性
导入已有设置并写入 `snort-web.internal.migrated=1`。此后 `snort-web` 就是
唯一配置真源，请通过 LuCI 修改；直接改 `/etc/config/snort` 会在下次应用或
开机时被覆盖。

### 规则管理

应用内置更新器 `/usr/libexec/snort-web-rules-update`。**概览** 页提供 Oinkcode
输入框与两个操作：

- **更新订阅规则**：用已保存的 Oinkcode 下载注册版快照，代码存放在
  `snort-web.snort.oinkcode`。
- **使用社区规则**：强制使用免费社区规则集并替换已安装规则，同时保留
  Oinkcode 供以后使用。

每次更新都会原子替换整个规则目录，并在更新日志中逐个列出已安装的
`.rules` 文件及其大小。更新成功后会重启 Snort，因为 `snort-mgr` 在渲染
`snort_conf.lua` 时会枚举 `*.rules`。

**存储** 由设置页的 `rules_persist` 控制，**默认关闭**：规则位于
`$temp_dir/rules`（tmpfs），`/etc/snort/rules` 为软链，重启后丢失；打开开关后
规则保存在真实目录 `/etc/snort/rules`。关闭持久化时，`ifup` hotplug 脚本
每次开机下载一次规则；无网络时 `--fallback` 会安装官方包自带的
`builtin_rules`（或最小 ICMP 规则），保证 Snort 不会带着空规则目录启动。

**定时更新** 与存储相互独立：`rules_auto_update` 加上
`rules_update_interval`（1 天 / 1 星期 / 1 个月）写入 crontab，在 03:00 执行。
`/usr/libexec/snort-web-schedule` 负责维护条目并重启 cron。OpenWrt 没有独立的
`cron` 包（`crond` 属于基础 busybox 包），因此脚本会在运行时检查
`/etc/init.d/cron`，缺失时写一条 syslog 警告。

概览页还显示三态服务状态（**运行中** / **已停止** / **错误**，附原因）、
已安装规则文件及其来源与更新时间，以及由 `alert_json` 格式化的最近告警。

### 项目结构

```text
htdocs/luci-static/resources/view/snort/   LuCI JavaScript 页面
htdocs/luci-static/resources/snort/        API、工具函数与共享样式
root/usr/share/rpcd/ucode/luci.snort.uc    特权 rpcd 后端
root/usr/share/luci/menu.d/                 菜单项
root/usr/share/rpcd/acl.d/                  RPC/UCI 权限
root/etc/config/snort-web                  默认应用配置
root/usr/libexec/snort-web-sync            snort-web -> snort 同步
root/etc/init.d/snort-web                  开机时先于 snort 同步
root/usr/share/ucitrack/                   保存并应用后的重启触发器
root/etc/uci-defaults/                     迁移、同步与定时设置
dist/lmo/snort.*.lmo                       六个预编译语言包
po/de, po/es, po/fr, po/pt_BR,            翻译目录
po/ru, po/zh_Hans/
po/templates/snort.pot                     翻译模板
.github/workflows/build-apk.yml            APK 构建工作流
scripts/, tests/                           构建辅助脚本与单元测试
```

### APK 构建工作流

`.github/workflows/build-apk.yml` 可从 GitHub **Actions** 页手动运行，默认使用
OpenWrt 25.12.6 x86/64 SDK，产出：

- `luci-app-snort3-*.apk`
- `luci-i18n-snort3-de-*.apk`、`-es-*.apk`、`-fr-*.apk`
- `luci-i18n-snort3-pt-br-*.apk`、`-ru-*.apk`、`-zh-cn-*.apk`

主程序与翻译包都与架构无关，因此 x86/64 SDK 的产物可安装到运行同一
OpenWrt 版本的其他目标。SDK 版本、目标与产物说明见
[docs/INSTALLATION.md](docs/INSTALLATION.md)。

### 开发

本地检查建议使用 Node.js 18 或更高版本。

```sh
npm test                 # JavaScript 辅助函数、软件包与 LMO 测试
npm run check:js         # 检查所有 JavaScript 文件语法
npm run check:i18n       # 比对 UI 字符串与每个 po/*/snort.po
npm run build:lmo        # 重新生成六个预编译语言包
npm run check:ucode      # 用 ucode-lsp 校验 rpcd 插件
npm run check            # JS + 测试 + i18n
```

修改了界面可见字符串后，重新生成翻译模板：

```sh
node scripts/check-i18n.js --write-pot
```

实现说明见 [CONTRIBUTING.md](CONTRIBUTING.md)。

### 排障

- **菜单项缺失** — 确认 `/etc/config/snort-web` 存在，然后清除
  `/tmp/luci-indexcache*` 与 `/tmp/luci-modulecache` 并重新加载 LuCI。
- **`luci.snort` 未注册** — 安装 `rpcd-mod-ucode`，确认
  `/usr/share/rpcd/ucode/luci.snort.uc` 存在，再执行
  `/etc/init.d/rpcd restart`。
- **规则更新按钮不可用** — 确认 `/usr/libexec/snort-web-rules-update` 存在
  （通过 `/bin/sh` 调用，不需要可执行位）；内置更新器缺失时按钮会被禁用。
  通知会说明原因，`/tmp/snort_rules_update.log` 保存完整输出。
- **启动报错 / Snort 一直停止** — 先在设置页勾选 *启用 Snort*。`enabled=0`
  时 OpenWrt init 脚本会以 0 退出且什么都不做；本应用会确认进程真的出现，
  并给出原因（未启用、无规则、init 输出或本次启动的 syslog 行）。参见
  `logread | grep -i snort` 与 `snort-mgr check`。
- **升级后页面仍像旧版本** — `rpcd reload` 不会重新 fork ucode 插件，请执行
  `/etc/init.d/rpcd restart`，清除 `/tmp/luci-indexcache*` 与
  `/tmp/luci-modulecache`，删除 `/tmp/snort_service_action.*`，再强制刷新
  浏览器。不要删除 `/etc/config/snort-web`（它是保存设置的 conffile）。
  软件包的 postinst 会自动重启 rpcd。`ubus call luci.snort status` 暴露
  `proc_comm` 与 `proc_scan`，可查看后端在 `/proc` 里实际找到的进程。
- **概览全是 N/A、按钮无反应** — `backend_error` 通知会指出失败的 RPC
  方法，同样的信息写入 `/tmp/snort_backend_error.log`。若仍存在，检查
  `ubus call luci.snort status` 与 `logread | grep -i rpcd`。
- **`logread` 里有旧的 `local.lua` / DAQ 崩溃日志** — 这些是 4.x beta 系列的
  历史 syslog 记录（见 `legacy-and-beta` 标签）。`logread` 会长期保留，请按
  时间戳判断，并用 `ps | grep '[s]nort'` 确认。启动失败详情只引用最新启动
  标记*之后*写入的日志。
- **保存并应用没有启动 Snort** — ucitrack 触发器由 `/etc/init.d/ucitrack`
  注册；执行 `/etc/init.d/ucitrack restart` 并检查
  `/etc/init.d/snort-web enabled`。升级时软件包 postinst 会自动完成。
- **没有「概览」选项卡** — 安装后清除 `/tmp/luci-indexcache*` 与
  `/tmp/luci-modulecache/`，让新菜单项生效。
- **设置没有同步到 Snort** — 执行 `/usr/libexec/snort-web-sync --sync`，
  再检查 `uci show snort-web`、`uci show snort` 与
  `logread | grep -i snort-web`。
- **翻译不显示** — 确认对应的 `luci-i18n-snort3-*` 包已安装、
  `/usr/lib/lua/luci/i18n/snort.<语言>.lmo` 存在，然后退出并重新登录。
- **服务操作失败** — 确认 `/etc/init.d/snort` 存在且可执行，再查看
  `logread | grep -i snort`。

在路由器上可用 `ubus list luci.snort` 与 `ubus call luci.snort status`
验证后端。

### 旧版本

1.0 之前的 Lua/CGI 实现以及全部 4.x beta 历史都保存在
`legacy-and-beta` git 标签中。`main` 分支从 1.0.0 开始。

### 许可证

GPL-2.0。详见 [LICENSE](LICENSE)。

**原作者：** David Dzieciol `<david.dzieciol51100@gmail.com>`（上游项目）

**当前维护者：** xiaoxmiao — <https://github.com/xiaoxmiao/luci-app-snort3>
