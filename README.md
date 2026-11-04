# LuCI Snort3 for OpenWrt

Modern LuCI web interface for **Snort3 IDS/IPS** on OpenWrt. The application is
implemented as a **JavaScript LuCI frontend** backed by an **rpcd/ucode** service;
the old Lua implementation is preserved under `legacy/` for reference.

[English](#english) | [Français](#français)

---

## English

### Overview

This module gives Snort3 a native place in LuCI:

- live service status, PID, memory use, uptime, interface, IDS/IPS mode and DAQ method;
- start, stop, restart, enable and disable controls;
- recent alerts and system log excerpts, refreshed every 5 seconds;
- rules update with progress log, symbolic-link repair and temporary-file cleanup;
- complete UCI settings for service, logging, rules, OpenAppID and NFQ;
- English source strings and a complete French catalog.

The browser never runs privileged commands. All service, file and log access is
performed by the rpcd/ucode backend through a small allow-listed RPC surface.

### Requirements

- OpenWrt **23.05 or newer** (24.10 LTS recommended) with the JavaScript LuCI runtime;
- `luci-base`;
- `rpcd-mod-ucode` (the `luci.snort` rpcd plugin);
- `snort3` and its init script at `/etc/init.d/snort`;
- optional: an executable rules updater at `/usr/bin/snort-rules`;
- optional: `luci-i18n-base-fr` if you also want the standard LuCI interface in French.

```sh
opkg update
opkg install luci-base rpcd-mod-ucode snort3
```

### Installation

#### Direct installation on a router

The installer copies the JavaScript views, the ucode RPC plugin, the menu/ACL
definitions, the default UCI file and the prebuilt French catalog. It keeps an
existing `/etc/config/snort`, removes old Lua module files, and reloads rpcd.

```sh
# From a downloaded/cloned repository
sh install.sh

# Or download and run the installer directly
wget -O /tmp/install-snort3.sh \
  https://raw.githubusercontent.com/dddavid51/luci-snort3-openwrt/main/install.sh
sh /tmp/install-snort3.sh
```

The installer can compile `po/fr/snort.po` with the system `po2lmo`, otherwise it
installs `dist/lmo/snort.fr.lmo`.

#### OpenWrt package build

Copy this directory to `feeds/luci/applications/luci-app-snort3`, enable
`luci-app-snort3` (and optionally `luci-i18n-snort3-fr`) in `menuconfig`, then
build the package normally. `luci.mk` installs the files under `root/`, the views
under `htdocs/`, and creates the translation package from `po/fr/snort.po`.

#### Manual installation

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for the file list and manual
steps.

### Access

Open LuCI and go to **Services → Snort IDS/IPS**.

- **Overview** — status cards, service controls, rules management, update log and
  recent alerts.
- **Settings** — service, logging, rules, advanced and NFQ options.
- **Alerts** — the 50 most recent alerts and the 20 most recent Snort syslog
  lines.

### Configuration

Settings are stored in `/etc/config/snort` and read by the OpenWrt Snort3 init
script. The main sections are:

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
```

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
root/etc/uci-defaults/                     one-shot rules-link repair
dist/config/snort                          default UCI template for direct installs
dist/lmo/snort.fr.lmo                      prebuilt catalog for direct installs
po/fr/snort.po                             French catalog
po/templates/snort.pot                     translation template
legacy/lua-v3/                             previous Lua implementation
legacy/v0-cgi-interface/                   original CGI prototype
```

### Development

Node.js 18 or newer is recommended for the local checks.

```sh
npm test                 # pure JavaScript helper and LMO tests
npm run check:js         # syntax-check every JavaScript file
npm run check:i18n       # compare UI strings with po/fr/snort.po
npm run build:lmo        # regenerate dist/lmo/snort.fr.lmo
npm run check:ucode      # validate the rpcd plugin with ucode-lsp
npm run check            # JS + tests + i18n
```

Regenerate the translation template after changing a visible string:

```sh
node scripts/check-i18n.js --write-pot
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for implementation notes.

### Troubleshooting

- **The menu entry is missing** — check that `/etc/config/snort` exists, then
  clear `/tmp/luci-indexcache*` and `/tmp/luci-modulecache` and reload LuCI.
- **`luci.snort` is not registered** — install `rpcd-mod-ucode`, verify that
  `/usr/share/rpcd/ucode/luci.snort.uc` exists, and restart rpcd:
  `/etc/init.d/rpcd restart`.
- **Rules update is disabled** — install or create `/usr/bin/snort-rules`; the
  button is disabled when the updater is absent.
- **French texts do not appear** — check
  `/usr/lib/lua/luci/i18n/snort.fr.lmo`, log out and back in, and make sure the
  LuCI language is French.
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
- interface source en anglais et catalogue français complet.

Le navigateur n'exécute aucune commande privilégiée : le backend rpcd/ucode
contrôle les actions autorisées, les chemins et l'accès aux fichiers.

### Prérequis

- OpenWrt **23.05 ou ultérieur** (24.10 LTS recommandé) avec LuCI JavaScript ;
- `luci-base` ;
- `rpcd-mod-ucode` ;
- `snort3` et son script `/etc/init.d/snort` ;
- facultatif : `/usr/bin/snort-rules` pour la mise à jour des règles ;
- facultatif : `luci-i18n-base-fr` pour l'interface LuCI standard en français.

```sh
opkg update
opkg install luci-base rpcd-mod-ucode snort3
```

### Installation

#### Installation directe sur le routeur

```sh
# Depuis un dépôt cloné
sh install.sh

# Ou téléchargement direct
wget -O /tmp/install-snort3.sh \
  https://raw.githubusercontent.com/dddavid51/luci-snort3-openwrt/main/install.sh
sh /tmp/install-snort3.sh
```

Le script installe les vues JavaScript, le plugin rpcd ucode, le menu, les ACL,
la configuration UCI par défaut et le catalogue français précompilé. Il conserve
un `/etc/config/snort` existant et supprime les anciens fichiers Lua.

#### Compilation du paquet OpenWrt

Copiez ce répertoire dans `feeds/luci/applications/luci-app-snort3`, activez
`luci-app-snort3` (et éventuellement `luci-i18n-snort3-fr`) dans `menuconfig`,
puis compilez normalement. Les fichiers de `root/` et `htdocs/` sont installés par
`luci.mk`, et le paquet de traduction est généré depuis `po/fr/snort.po`.

#### Installation manuelle

Voir [docs/INSTALLATION.md](docs/INSTALLATION.md).

### Utilisation

Ouvrez **Services → Snort IDS/IPS** dans LuCI.

- **Vue d'ensemble** : état, contrôles du service, gestion des règles, journal de
  mise à jour et alertes récentes.
- **Paramètres** : options du service, journalisation, règles, avancé et NFQ.
- **Alertes** : 50 alertes récentes et 20 dernières lignes syslog Snort.

Les réglages sont stockés dans `/etc/config/snort`. Le bouton de mise à jour des
règles est désactivé si `/usr/bin/snort-rules` est absent. La réparation du lien
symbolique crée une sauvegarde de l'ancien répertoire avant de le remplacer.

### Structure du projet

```text
htdocs/luci-static/resources/view/snort/   pages LuCI JavaScript
htdocs/luci-static/resources/snort/        API, utilitaires et styles
root/usr/share/rpcd/ucode/luci.snort.uc    backend rpcd privilégié
root/usr/share/luci/menu.d/                entrées de menu
root/usr/share/rpcd/acl.d/                 permissions RPC/UCI
root/etc/uci-defaults/                     réparation ponctuelle du lien de règles
dist/config/snort                          modèle UCI par défaut pour l'installation directe
dist/lmo/snort.fr.lmo                      catalogue précompilé
po/fr/snort.po                             catalogue français
po/templates/snort.pot                     modèle de traduction
legacy/lua-v3/                             ancienne implémentation Lua
legacy/v0-cgi-interface/                   prototype CGI d'origine
```

### Développement

```sh
npm test                 # tests JavaScript et LMO
npm run check:js         # vérification syntaxique JavaScript
npm run check:i18n       # couverture des chaînes françaises
npm run build:lmo        # régénère dist/lmo/snort.fr.lmo
npm run check:ucode      # validation du plugin avec ucode-lsp
npm run check            # JS + tests + i18n
```

Après modification d'un libellé :

```sh
node scripts/check-i18n.js --write-pot
```

Voir [CONTRIBUTING.md](CONTRIBUTING.md) pour les détails d'implémentation.

### Dépannage

- **Entrée de menu absente** : vérifiez `/etc/config/snort`, supprimez
  `/tmp/luci-indexcache*` et `/tmp/luci-modulecache`, puis rechargez LuCI.
- **`luci.snort` introuvable** : installez `rpcd-mod-ucode`, vérifiez
  `/usr/share/rpcd/ucode/luci.snort.uc`, puis redémarrez rpcd.
- **Mise à jour des règles désactivée** : installez `/usr/bin/snort-rules`.
- **Traduction française absente** : vérifiez
  `/usr/lib/lua/luci/i18n/snort.fr.lmo`, reconnectez-vous à LuCI et choisissez
  le français.
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
