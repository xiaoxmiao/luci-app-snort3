# Installation Guide

This guide covers the JavaScript/ucode version of LuCI Snort3. For the old Lua
module, see `legacy/lua-v3/docs/INSTALLATION.md`.

## 1. Requirements

| Component | Requirement |
| --- | --- |
| OpenWrt | 23.05 or newer; 24.10 LTS recommended |
| LuCI | JavaScript runtime (`luci-base`) |
| RPC backend | `rpcd-mod-ucode` |
| Snort | `snort3`, with `/etc/init.d/snort` and `/usr/bin/snort` |
| Rules updater | optional `/usr/bin/snort-rules` |
| French LuCI | optional `luci-i18n-base-fr` |

Install the packages first:

```sh
opkg update
opkg install luci-base rpcd-mod-ucode snort3
```

Check that the Snort service exists:

```sh
ls -l /etc/init.d/snort /usr/bin/snort
```

## 2. Direct installation

The installer performs a complete installation without rebuilding firmware. It
must be run as root.

### From a cloned repository

```sh
git clone https://github.com/dddavid51/luci-snort3-openwrt.git
cd luci-snort3-openwrt
sh install.sh
```

### From the downloaded script

```sh
wget -O /tmp/install-snort3.sh \
  https://raw.githubusercontent.com/dddavid51/luci-snort3-openwrt/main/install.sh
sh /tmp/install-snort3.sh
```

The installer:

1. verifies root access and the Snort installation;
2. copies the JavaScript views and shared modules;
3. installs `luci.snort.uc`, the menu entry and the ACL file;
4. installs the default `/etc/config/snort` only when no config exists;
5. removes files installed by the old Lua module;
6. compiles `po/fr/snort.po` with `po2lmo` when available, otherwise copies
   `dist/lmo/snort.fr.lmo`;
7. runs the uci-defaults helper and restarts rpcd;
8. clears the LuCI menu and module caches.

### After installation

1. Log out of LuCI and log in again.
2. Hard-refresh the browser if the old menu is cached.
3. Open **Services → Snort IDS/IPS**.
4. Open **Settings** and configure the interface and operating mode.
5. Review the rules path and update log on the **Overview** page.

Run the verification script:

```sh
sh verify.sh
```

## 3. OpenWrt package build

The repository is a standard LuCI application:

```text
feeds/luci/applications/luci-app-snort3/
├── Makefile
├── htdocs/
├── root/
└── po/
```

Place the directory in your LuCI feed, then:

```sh
make menuconfig
# LuCI -> Applications -> luci-app-snort3
# LuCI -> Translations -> luci-i18n-snort3-fr (optional)
make package/luci-app-snort3/compile V=s
```

For a full firmware build, select the package before running `make`. `luci.mk`
installs the contents of `root/`, the JavaScript assets from `htdocs/`, and
creates a translation package from `po/fr/snort.po`.

## 4. Manual installation

Use this method only when the installer cannot be used. All commands are run as
root.

```sh
# LuCI JavaScript assets
mkdir -p /www/luci-static/resources/view/snort
mkdir -p /www/luci-static/resources/snort
cp htdocs/luci-static/resources/view/snort/*.js \
   /www/luci-static/resources/view/snort/
cp htdocs/luci-static/resources/snort/*.js \
   /www/luci-static/resources/snort/

# rpcd backend, menu and ACL
mkdir -p /usr/share/rpcd/ucode /usr/share/luci/menu.d /usr/share/rpcd/acl.d
cp root/usr/share/rpcd/ucode/luci.snort.uc /usr/share/rpcd/ucode/
cp root/usr/share/luci/menu.d/luci-app-snort3.json /usr/share/luci/menu.d/
cp root/usr/share/rpcd/acl.d/luci-app-snort3.json /usr/share/rpcd/acl.d/

# Fallback configuration (snort3 normally provides /etc/config/snort)
[ -f /etc/config/snort ] || cp dist/config/snort /etc/config/snort

# One-shot helper for an existing rules symlink
cp root/etc/uci-defaults/80_luci-app-snort3 /etc/uci-defaults/
chmod 0755 /etc/uci-defaults/80_luci-app-snort3

# Remove the old Lua module if it is still present
rm -f /usr/lib/lua/luci/controller/snort.lua
rm -f /usr/lib/lua/luci/model/cbi/snort/config.lua
rm -f /usr/lib/lua/luci/view/snort/*.htm
rm -f /usr/lib/lua/luci/i18n/snort.*.po /usr/lib/lua/luci/i18n/snort.*.lmo

# Translation
mkdir -p /usr/lib/lua/luci/i18n
if command -v po2lmo >/dev/null 2>&1; then
	po2lmo po/fr/snort.po /usr/lib/lua/luci/i18n/snort.fr.lmo
else
	cp dist/lmo/snort.fr.lmo /usr/lib/lua/luci/i18n/
fi

# Refresh caches and rpcd
/etc/uci-defaults/80_luci-app-snort3 || true
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache
/etc/init.d/rpcd restart
```

## 5. Upgrading from the Lua version

The JavaScript installer and package use the same UCI file and the same
translation domain (`snort`). An existing `/etc/config/snort` is preserved.

After upgrading:

```sh
rm -f /usr/lib/lua/luci/controller/snort.lua
rm -f /usr/lib/lua/luci/model/cbi/snort/config.lua
rm -rf /usr/lib/lua/luci/view/snort
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache
/etc/init.d/rpcd restart
```

If the old menu remains visible, log out and back in or restart uhttpd:

```sh
/etc/init.d/uhttpd restart
```

## 6. Verification

```sh
sh verify.sh
```

The script checks:

- all installed JavaScript, ucode, menu, ACL, configuration and translation files;
- the Snort init script and binary;
- registration of the `luci.snort` ubus object;
- a successful `luci.snort status` call;
- the presence of `rpcd-mod-ucode`.

You can also test the object manually:

```sh
ubus list luci.snort
ubus call luci.snort status
ubus call luci.snort rules
```

## 7. Uninstallation

```sh
rm -f /www/luci-static/resources/view/snort/overview.js
rm -f /www/luci-static/resources/view/snort/config.js
rm -f /www/luci-static/resources/view/snort/alerts.js
rm -rf /www/luci-static/resources/snort
rm -f /usr/share/rpcd/ucode/luci.snort.uc
rm -f /usr/share/luci/menu.d/luci-app-snort3.json
rm -f /usr/share/rpcd/acl.d/luci-app-snort3.json
rm -f /etc/uci-defaults/80_luci-app-snort3
rm -f /usr/lib/lua/luci/i18n/snort.fr.lmo
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache
/etc/init.d/rpcd restart
```

`/etc/config/snort` is intentionally left in place. Remove it manually only if
you also want to discard the Snort configuration:

```sh
rm -f /etc/config/snort
```

## 8. Troubleshooting

| Symptom | Check |
| --- | --- |
| Menu entry missing | `/etc/config/snort` exists; LuCI caches cleared |
| `luci.snort` not registered | `rpcd-mod-ucode` installed; `luci.snort.uc` present; rpcd restarted |
| Permission denied | ACL file present; user is logged in as an administrator |
| Rules update disabled | `/usr/bin/snort-rules` exists and is executable |
| No alerts | `/var/log/alert_fast.txt` exists and Snort logging is enabled |
| French texts missing | `snort.fr.lmo` installed; LuCI language set to French |
| Service control fails | `/etc/init.d/snort` exists and is executable |
