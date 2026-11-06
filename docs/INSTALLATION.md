# Installation Guide

This guide covers the JavaScript/ucode version of LuCI Snort3 (1.0.0 and newer).
The pre-1.0 Lua/CGI code and the whole 4.x beta history are archived in the
`legacy-and-beta` git tag.

## 1. Requirements

| Component | Requirement |
| --- | --- |
| OpenWrt | 25.12 or newer (APK packages only) |
| Package manager | `apk` |
| LuCI | JavaScript runtime (`luci-base`) |
| RPC backend | `rpcd-mod-ucode` |
| Snort | `snort3`, with `/etc/init.d/snort` and `/usr/bin/snort` |
| Rules updater | bundled `/usr/libexec/snort-web-rules-update` (no extra package needed) |
| LuCI translations | optional `luci-i18n-base-*` for de, es, fr, pt-br, ru, zh-cn |

Install the dependencies first:

```sh
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
- `luci-i18n-snort3-de-*.apk`, `-es-*.apk`, `-fr-*.apk`
- `luci-i18n-snort3-pt-br-*.apk`, `-ru-*.apk`, `-zh-cn-*.apk`

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
CONFIG_LUCI_LANG_de=y
CONFIG_LUCI_LANG_es=y
CONFIG_LUCI_LANG_fr=y
CONFIG_LUCI_LANG_pt_BR=y
CONFIG_LUCI_LANG_ru=y
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
apk add --allow-untrusted ./luci-i18n-snort3-de-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-es-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-fr-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-pt-br-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-ru-*.apk
apk add --allow-untrusted ./luci-i18n-snort3-zh-cn-*.apk
```

`--allow-untrusted` is required for packages built locally without the OpenWrt
release signing key.

### 2.3 Building from a full OpenWrt buildroot

This repository is **one LuCI application**, not an OpenWrt feed. Cloning it
into the buildroot root directory, into `feeds/` or into any other arbitrary
directory does not register the package: `make menuconfig` only indexes
`package/*/Makefile` and the symlinks created by `./scripts/feeds install`.
The LuCI feed must be checked out too, because the application `Makefile`
includes `luci.mk` from it.

Prepare the feeds once:

```sh
./scripts/feeds update -a
./scripts/feeds install -a          # or at least luci-base and rpcd-mod-ucode
```

Then choose one of the two supported placements.

**Option A - directly under `package/`** (recommended, and the layout used by
the CI workflow):

```sh
git clone https://github.com/xiaoxmiao/luci-app-snort3.git \
	package/luci-app-snort3
make menuconfig                     # LuCI -> 3. Applications -> luci-app-snort3
```

Packages in `package/` are indexed directly, so no `feeds install` is needed.
The Makefile resolves `feeds/luci/luci.mk` automatically; earlier builds
hard-coded `../../luci.mk` and therefore failed from this location. This is the
simplest way to add the application to an existing source tree.

**Option B - inside the LuCI feed**:

```sh
git clone https://github.com/xiaoxmiao/luci-app-snort3.git \
	feeds/luci/applications/luci-app-snort3
rm -rf feeds/luci/applications/luci-app-snort3/.git   # avoid a nested git repo
./scripts/feeds update -i luci      # rebuild the index only; do not reset the feed
./scripts/feeds install -p luci luci-app-snort3
make menuconfig
```

`-i` matters: a plain `./scripts/feeds update luci` refreshes the feed git
checkout. Removing the nested `.git` keeps the feed as a single repository.
`feeds install` creates the `package/feeds/luci/luci-app-snort3` symlink that
menuconfig actually reads.

Build with:

```sh
make package/luci-app-snort3/compile V=s
```

The entry is under **LuCI → 3. Applications**, not in a top-level Snort menu.
Translation packages are hidden and selected through `CONFIG_LUCI_LANG_*` as
shown in 2.2.

| Symptom | Cause / fix |
| --- | --- |
| No `luci-app-snort3` entry in menuconfig | Cloned outside `package/` or the LuCI feed; for the feed layout run `./scripts/feeds update -i luci` and `./scripts/feeds install -p luci luci-app-snort3` and check `ls -l package/feeds/luci/luci-app-snort3` |
| `luci.mk: No such file or directory` or `could not locate luci.mk` | LuCI feed not checked out: `./scripts/feeds update luci` |
| Entry greyed out / cannot be selected | Missing `luci-base` or `rpcd-mod-ucode`: `./scripts/feeds install luci-base rpcd-mod-ucode` |
| Built but the LuCI menu is missing | Clear `/tmp/luci-indexcache.*`, restart `rpcd` and `uhttpd` |

Check the registration with:

```sh
grep -n 'Package: luci-app-snort3' tmp/.packageinfo
grep -n 'CONFIG_PACKAGE_luci-app-snort3' .config
```


## 3. How the configuration is stored

The canonical application configuration is:

```text
/etc/config/snort-web
```

The OpenWrt `snort3` init script and `snort-mgr` still read:

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


## 4. Upgrading

### From a 4.x beta installation

The 4.x beta versions wrote directly to `/etc/config/snort`. The package
post-install script imports those values into `/etc/config/snort-web` once. The existing `/etc/config/snort` is preserved and remains owned by
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

## 5. Verification

```sh
ubus list luci.snort
ubus call luci.snort status
ubus call luci.snort rules

/usr/libexec/snort-web-sync --sync
uci show snort-web
uci show snort
```

On the router, check that `/etc/init.d/snort`, `/usr/bin/snort`,
`/usr/share/rpcd/ucode/luci.snort.uc` and the translation `.lmo` files exist,
and that `rpcd-mod-ucode` is installed. There is no verification script.

## 6. Uninstallation

```sh
apk del luci-app-snort3 \
  luci-i18n-snort3-de luci-i18n-snort3-es luci-i18n-snort3-fr \
  luci-i18n-snort3-pt-br luci-i18n-snort3-ru luci-i18n-snort3-zh-cn
```

`/etc/config/snort-web` is a conffile and is left in place so the settings can
be reviewed or reused. Remove it manually if you also want to discard the
application configuration:

```sh
rm -f /etc/config/snort-web
```

`/etc/config/snort` belongs to the `snort3` package and is intentionally not
removed.

## 7. Troubleshooting

| Symptom | Check |
| --- | --- |
| Menu entry missing | `/etc/config/snort-web` exists; LuCI caches cleared |
| `luci.snort` not registered | `rpcd-mod-ucode` installed; `luci.snort.uc` present; rpcd restarted |
| Permission denied | ACL file present; user is logged in as an administrator |
| Settings do not reach Snort | Run `/usr/libexec/snort-web-sync --sync`; compare `uci show snort-web` and `uci show snort`; inspect `logread -e snort-web-sync` |
| Rules update disabled | `/usr/libexec/snort-web-rules-update` exists and is executable |
| Rule download fails | network, DNS and `ca-certificates`; inspect `/tmp/snort_rules_update.log` |
| Service state shows an error | read the reason below the badge (only syslog lines from the current start are quoted, so old `local.lua` crashes are not reused); check `/etc/init.d/snort` and `/etc/snort/rules` |
| `cannot open ./local.lua` / DAQ `pcap` not found / procd crash loop | historical log lines from the 4.x beta series (see the `legacy-and-beta` tag). The generated configuration always sets `daq.module_dirs`; check the timestamps and `ps \| grep '[s]nort'` |
| Overview shows only N/A values | run `ubus call luci.snort status`; a structured `backend_error` reply names the failing method, also saved to `/tmp/snort_backend_error.log` |
| No alerts | `/var/log/alert_json.txt` (and `N_alert_json.txt`) exist and Snort logging is enabled |
| Translation missing | matching `luci-i18n-snort3-*` package installed; `snort.<lang>.lmo` present; LuCI language set accordingly |
| Service control fails | `/etc/init.d/snort` exists and is executable |
| APK install fails | SDK and router both use apk; use `--allow-untrusted` for local packages |
