# Installation Guide

This guide covers the JavaScript/ucode version of LuCI Snort3. For the old Lua
module, see `legacy/lua-v3/docs/INSTALLATION.md`.

## 1. Requirements

| Component | Requirement |
| --- | --- |
| OpenWrt | 23.05 or newer; 24.10 LTS recommended |
| Package manager | `apk` on 25.12+; `opkg` on 24.10 and older |
| LuCI | JavaScript runtime (`luci-base`) |
| RPC backend | `rpcd-mod-ucode` |
| Snort | `snort3`, with `/etc/init.d/snort` and `/usr/bin/snort` |
| Rules updater | bundled `/usr/libexec/snort-web-rules-update` (no extra package needed) |
| French LuCI | optional `luci-i18n-base-fr` |
| Chinese LuCI | optional `luci-i18n-base-zh-cn` |

Install the dependencies first:

```sh
# OpenWrt 24.10 and older
opkg update
opkg install luci-base rpcd-mod-ucode snort3

# OpenWrt 25.12 and newer
apk update
apk add luci-base rpcd-mod-ucode snort3
```

Check that the Snort service exists:

```sh
ls -l /etc/init.d/snort /usr/bin/snort
```

The `snort3` package owns `/etc/config/snort`. Do not install a second copy of
that file; this application stores its settings in `/etc/config/snort-web` and
synchronises them to the snort3 file.

## 2. Build an APK (OpenWrt 25.12+)

The application and its translation packages are architecture-independent
(`LUCI_PKGARCH:=all`). A single build with an x86/64 SDK can therefore be
installed on other targets running the same OpenWrt release. The SDK and the
router must both use the `apk` package format.

### 2.1 GitHub Actions (recommended)

The repository contains `.github/workflows/build-apk.yml`.

1. Open the **Actions** tab.
2. Select **Build OpenWrt APK**.
3. Choose **Run workflow**. The default SDK is 25.12.6 x86/64.
4. Download the `luci-app-snort3-apk` workflow artifact.

The workflow builds:

- `luci-app-snort3-*.apk`
- `luci-i18n-snort3-fr-*.apk`
- `luci-i18n-snort3-zh-cn-*.apk`

### 2.2 Local SDK build

Use a Linux machine or a Linux container. The SDK is not a cross-compiler for
Windows.

```sh
SDK_VERSION=25.12.6
TARGET=x86/64
BASE="https://downloads.openwrt.org/releases/$SDK_VERSION/targets/$TARGET"

# Find the current SDK file name (the GCC version can change between releases).
SDK_FILE=$(wget -qO- "$BASE/" |
	grep -oE 'openwrt-sdk-[^"]+Linux-x86_64\.tar\.zst' |
	head -n1)

wget "$BASE/$SDK_FILE"
tar -I zstd -xf "$SDK_FILE"
cd openwrt-sdk-*
```

Add the base, LuCI and packages feeds, then place this repository in the LuCI
feed. The base feed supplies the OpenWrt core package sources (`ucode`, `rpcd`,
`libucode`, ...) that the SDK does not include on its own:

```sh
./scripts/feeds update base luci packages
mkdir -p feeds/luci/applications
cp -a /path/to/luci-app-snort3 feeds/luci/applications/

./scripts/feeds install -p luci luci-app-snort3 luci-base
```

Select the application and translation languages, then build the application
source directory. The translation packages are hidden and are selected through
`CONFIG_LUCI_LANG_*`, not through `CONFIG_PACKAGE_luci-i18n-*` directly.
Disable `CONFIG_ALL_NONSHARED` and the Lua LuCI bindings; otherwise the SDK
selects `liblucihttp-lua` and tries to compile it without Lua development
headers:

```sh
cat >> .config <<'EOF'
# CONFIG_ALL_NONSHARED is not set
# CONFIG_ALL_KMODS is not set
# CONFIG_PACKAGE_lua is not set
# CONFIG_PACKAGE_liblucihttp-lua is not set
# CONFIG_PACKAGE_luci-lib-base is not set
# CONFIG_PACKAGE_luci-lua-runtime is not set
CONFIG_PACKAGE_luci-app-snort3=y
CONFIG_LUCI_LANG_fr=y
CONFIG_LUCI_LANG_zh_Hans=y
EOF

make defconfig
make package/luci-app-snort3/compile V=s
```

The packages are written to:

```text
bin/packages/<arch>/luci/*.apk
```

Copy them to the router and install them as root:

```sh
apk add --allow-untrusted ./luci-app-snort3-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-zh-cn-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-fr-*.apk   # optional
```

`--allow-untrusted` is required for packages built locally without the OpenWrt
release signing key.

### 2.3 Build an IPK (OpenWrt 24.10 and older)

The same feed layout and package selection work with an opkg-based SDK:

```sh
make package/luci-app-snort3/compile V=s
```

The same `CONFIG_LUCI_LANG_*` switches select the translation packages, and the
output is written to `bin/packages/<arch>/luci/*.ipk`.

## 3. Direct installation (fallback)

The installer performs a complete installation without rebuilding firmware. It
must be run as root. APK/IPK packages are the supported path; use this only when
a package build is not possible.

### From a cloned repository

```sh
git clone https://github.com/xiaoxmiao/luci-app-snort3.git
cd luci-app-snort3
sh install.sh
```

### From the downloaded script

```sh
wget -O /tmp/install-snort3.sh \
  https://raw.githubusercontent.com/xiaoxmiao/luci-app-snort3/main/install.sh
sh /tmp/install-snort3.sh
```

The installer:

1. verifies root access and the Snort installation;
2. copies the JavaScript views and shared modules;
3. installs `luci.snort.uc`, the menu entry and the ACL file;
4. installs `/etc/config/snort-web` only when no application configuration
   exists; `/etc/config/snort` remains owned by snort3;
5. installs `/usr/libexec/snort-web-sync`, `/etc/init.d/snort-web` and the
   ucitrack trigger, enables the init script and performs the one-time import;
6. removes files installed by the old Lua module;
7. compiles `po/fr/snort.po` and `po/zh_Hans/snort.po` with `po2lmo` when
   available, otherwise copies `dist/lmo/snort.fr.lmo` and
   `dist/lmo/snort.zh-cn.lmo`;
8. runs the uci-defaults helper and restarts rpcd;
9. clears the LuCI menu and module caches.

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

## 4. How the configuration is stored

The canonical application configuration is:

```text
/etc/config/snort-web
```

The OpenWrt `snort3` init script, `snort-mgr` and `snort-rules` still read:

```text
/etc/config/snort
```

`/usr/libexec/snort-web-sync` copies the known `snort` and `nfq` options to the
snort3 file. It runs:

- at boot from `/etc/init.d/snort-web` (`START=98`, before snort's `START=99`);
- after **Save & Apply** through
  `/usr/share/ucitrack/luci-app-snort3.json`; the init script restarts Snort when
  it is running;
- before service start/restart and before a rules update from the rpcd backend.

The first run imports the existing `/etc/config/snort` values into
`/etc/config/snort-web` and sets:

```uci
config internal 'internal'
	option migrated '1'
```

This is a one-time migration. After it completes, edit settings in LuCI; direct
changes to `/etc/config/snort` are overwritten on the next apply or boot.

## 5. Manual installation

Use this method only when neither the package nor the installer can be used. All
commands are run as root from the repository.

```sh
# LuCI JavaScript assets
mkdir -p /www/luci-static/resources/view/snort
mkdir -p /www/luci-static/resources/snort
cp htdocs/luci-static/resources/view/snort/*.js \
   /www/luci-static/resources/view/snort/
cp htdocs/luci-static/resources/snort/*.js \
   /www/luci-static/resources/snort/

# rpcd backend, menu, ACL and ucitrack
mkdir -p /usr/share/rpcd/ucode /usr/share/luci/menu.d \
         /usr/share/rpcd/acl.d /usr/share/ucitrack
cp root/usr/share/rpcd/ucode/luci.snort.uc /usr/share/rpcd/ucode/
cp root/usr/share/luci/menu.d/luci-app-snort3.json /usr/share/luci/menu.d/
cp root/usr/share/rpcd/acl.d/luci-app-snort3.json /usr/share/rpcd/acl.d/
cp root/usr/share/ucitrack/luci-app-snort3.json /usr/share/ucitrack/

# Application configuration and synchronisation
mkdir -p /etc/config /usr/libexec /etc/init.d
[ -f /etc/config/snort-web ] || \
	cp root/etc/config/snort-web /etc/config/snort-web
cp root/usr/libexec/snort-web-sync /usr/libexec/
cp root/etc/init.d/snort-web /etc/init.d/
chmod 0755 /usr/libexec/snort-web-sync /etc/init.d/snort-web
/etc/init.d/snort-web enable
/usr/libexec/snort-web-sync --sync

# One-shot migration, sync and rules-link repair
cp root/etc/uci-defaults/80_luci-app-snort3 /etc/uci-defaults/
chmod 0755 /etc/uci-defaults/80_luci-app-snort3

# Remove the old Lua module if it is still present
rm -f /usr/lib/lua/luci/controller/snort.lua
rm -f /usr/lib/lua/luci/model/cbi/snort/config.lua
rm -f /usr/lib/lua/luci/view/snort/*.htm
rm -f /usr/lib/lua/luci/i18n/snort.*.po /usr/lib/lua/luci/i18n/snort.*.lmo

# Translations
mkdir -p /usr/lib/lua/luci/i18n
if command -v po2lmo >/dev/null 2>&1; then
	po2lmo po/fr/snort.po /usr/lib/lua/luci/i18n/snort.fr.lmo
	po2lmo po/zh_Hans/snort.po /usr/lib/lua/luci/i18n/snort.zh-cn.lmo
else
	cp dist/lmo/snort.fr.lmo dist/lmo/snort.zh-cn.lmo \
	   /usr/lib/lua/luci/i18n/
fi

# Refresh caches and rpcd
/etc/uci-defaults/80_luci-app-snort3 || true
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache
/etc/init.d/rpcd restart
```

## 6. Upgrading

### From the Lua version or the previous JavaScript version

The old versions wrote directly to `/etc/config/snort`. The installer and the
package post-install script import those values into `/etc/config/snort-web`
once. The existing `/etc/config/snort` is preserved and remains owned by
`snort3`.

After upgrading:

```sh
/usr/libexec/snort-web-sync --sync
uci show snort-web
uci show snort
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache
/etc/init.d/rpcd restart
```

If the old menu remains visible, log out and back in or restart uhttpd:

```sh
/etc/init.d/uhttpd restart
```

## 7. Verification

```sh
sh verify.sh
```

The script checks:

- all installed JavaScript, ucode, menu, ACL, ucitrack, configuration and
  translation files;
- the Snort init script, the sync helper and the Snort binary;
- the `/etc/config/snort-web` UCI configuration;
- registration of the `luci.snort` ubus object;
- a successful `luci.snort status` call;
- the presence of `rpcd-mod-ucode`.

You can also test the object and the synchronisation manually:

```sh
ubus list luci.snort
ubus call luci.snort status
ubus call luci.snort rules

/usr/libexec/snort-web-sync --sync
uci show snort-web
uci show snort
```

## 8. Uninstallation

For package installations, use the package manager:

```sh
apk del luci-app-snort3 luci-i18n-snort3-fr luci-i18n-snort3-zh-cn
# or, on 24.10 and older:
opkg remove luci-app-snort3 luci-i18n-snort3-fr luci-i18n-snort3-zh-cn
```

For a manual installation:

```sh
rm -f /www/luci-static/resources/view/snort/overview.js
rm -f /www/luci-static/resources/view/snort/config.js
rm -f /www/luci-static/resources/view/snort/alerts.js
rm -rf /www/luci-static/resources/snort
rm -f /usr/share/rpcd/ucode/luci.snort.uc
rm -f /usr/share/luci/menu.d/luci-app-snort3.json
rm -f /usr/share/rpcd/acl.d/luci-app-snort3.json
rm -f /usr/share/ucitrack/luci-app-snort3.json
rm -f /usr/libexec/snort-web-sync
rm -f /etc/init.d/snort-web
rm -f /etc/uci-defaults/80_luci-app-snort3
rm -f /usr/lib/lua/luci/i18n/snort.fr.lmo
rm -f /usr/lib/lua/luci/i18n/snort.zh-cn.lmo
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache
/etc/init.d/rpcd restart
```

`/etc/config/snort-web` is left in place so the settings can be reviewed or
reused. Remove it manually if you also want to discard the application
configuration:

```sh
rm -f /etc/config/snort-web
```

`/etc/config/snort` belongs to the `snort3` package and is intentionally not
removed.

## 9. Troubleshooting

| Symptom | Check |
| --- | --- |
| Menu entry missing | `/etc/config/snort-web` exists; LuCI caches cleared |
| `luci.snort` not registered | `rpcd-mod-ucode` installed; `luci.snort.uc` present; rpcd restarted |
| Permission denied | ACL file present; user is logged in as an administrator |
| Settings do not reach Snort | Run `/usr/libexec/snort-web-sync --sync`; compare `uci show snort-web` and `uci show snort`; inspect `logread -e snort-web-sync` |
| Rules update disabled | `/usr/libexec/snort-web-rules-update` exists and is executable |
| Rule download fails | network, DNS and `ca-certificates`; inspect `/tmp/snort_rules_update.log` |
| Service state shows an error | read the reason below the badge (it includes the last snort syslog lines); check `/etc/init.d/snort` and `/etc/snort/rules` |
| `cannot open ./local.lua` / DAQ `pcap` not found / procd crash loop | manual mode is enabled: set `snort-web.snort.manual=0`, commit and apply, or create `/etc/snort/local.lua` with `daq = { module_dirs = { '/usr/lib/daq/' } }` |
| No alerts | `/var/log/alert_fast.txt` exists and Snort logging is enabled |
| French texts missing | `snort.fr.lmo` installed; LuCI language set to French |
| Chinese texts missing | `snort.zh-cn.lmo` installed; LuCI language set to Simplified Chinese |
| Service control fails | `/etc/init.d/snort` exists and is executable |
| APK install fails | SDK and router both use apk; use `--allow-untrusted` for local packages |
