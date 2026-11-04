#!/bin/sh
#
# Direct installer for the LuCI Snort3 module.
#
# Run this script as root from a cloned repository:
#   sh install.sh
#
# Or download and run it standalone; it will fetch the repository archive:
#   wget -O /tmp/install-snort3.sh https://raw.githubusercontent.com/dddavid51/luci-snort3-openwrt/main/install.sh
#   sh /tmp/install-snort3.sh

set -eu

REPO_ARCHIVE="https://github.com/dddavid51/luci-snort3-openwrt/archive/refs/heads/main.tar.gz"
LUCI_I18N_DIR="/usr/lib/lua/luci/i18n"
TMP_DIR=""
SRC_DIR=""

say() {
	printf '%s\n' "$*"
}

warn() {
	printf 'WARNING: %s\n' "$*" >&2
}

die() {
	printf 'ERROR: %s\n' "$*" >&2
	exit 1
}

cleanup() {
	if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
		rm -rf "$TMP_DIR"
	fi
}

trap cleanup EXIT INT TERM

[ "$(id -u)" -eq 0 ] || die "This installer must be run as root."

if ! command -v snort >/dev/null 2>&1; then
	if command -v apk >/dev/null 2>&1; then
		die "Snort3 is not installed. Run: apk update && apk add snort3"
	fi

	die "Snort3 is not installed. Run: opkg update && opkg install snort3"
fi

SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" 2>/dev/null && pwd) || SCRIPT_DIR="."

if [ -d "$SCRIPT_DIR/htdocs/luci-static/resources/snort" ] && [ -d "$SCRIPT_DIR/root" ]; then
	SRC_DIR="$SCRIPT_DIR"
else
	TMP_DIR="${TMPDIR:-/tmp}/luci-app-snort3.$$"
	mkdir -p "$TMP_DIR" || die "Unable to create $TMP_DIR"

	say "Downloading LuCI Snort3 sources..."
	if command -v wget >/dev/null 2>&1; then
		wget -qO "$TMP_DIR/source.tar.gz" "$REPO_ARCHIVE" || die "Download failed."
	elif command -v curl >/dev/null 2>&1; then
		curl -fsSL -o "$TMP_DIR/source.tar.gz" "$REPO_ARCHIVE" || die "Download failed."
	else
		die "Neither wget nor curl is available."
	fi

	tar -xzf "$TMP_DIR/source.tar.gz" -C "$TMP_DIR" || die "Unable to extract the archive."

	for directory in "$TMP_DIR"/*; do
		if [ -d "$directory" ] && [ -d "$directory/root" ]; then
			SRC_DIR="$directory"
			break
		fi
	done

	[ -n "$SRC_DIR" ] || die "The downloaded archive has an unexpected layout."
fi

say "Installing LuCI Snort3 module from: $SRC_DIR"

# LuCI JavaScript resources
mkdir -p /www/luci-static/resources/view/snort
mkdir -p /www/luci-static/resources/snort
cp -f "$SRC_DIR/htdocs/luci-static/resources/snort/"*.js /www/luci-static/resources/snort/
cp -f "$SRC_DIR/htdocs/luci-static/resources/view/snort/"*.js /www/luci-static/resources/view/snort/

# rpcd backend
mkdir -p /usr/share/rpcd/ucode
cp -f "$SRC_DIR/root/usr/share/rpcd/ucode/luci.snort.uc" /usr/share/rpcd/ucode/luci.snort.uc
chmod 0644 /usr/share/rpcd/ucode/luci.snort.uc

# LuCI menu and ACL
mkdir -p /usr/share/luci/menu.d /usr/share/rpcd/acl.d
cp -f "$SRC_DIR/root/usr/share/luci/menu.d/luci-app-snort3.json" /usr/share/luci/menu.d/luci-app-snort3.json
cp -f "$SRC_DIR/root/usr/share/rpcd/acl.d/luci-app-snort3.json" /usr/share/rpcd/acl.d/luci-app-snort3.json
chmod 0644 /usr/share/luci/menu.d/luci-app-snort3.json
chmod 0644 /usr/share/rpcd/acl.d/luci-app-snort3.json

# UCI defaults, only executed now and on the next boot
mkdir -p /etc/uci-defaults
cp -f "$SRC_DIR/root/etc/uci-defaults/80_luci-app-snort3" /etc/uci-defaults/80_luci-app-snort3
chmod 0755 /etc/uci-defaults/80_luci-app-snort3

# Keep an existing user configuration intact
if [ ! -f /etc/config/snort ]; then
	cp -f "$SRC_DIR/dist/config/snort" /etc/config/snort
	chmod 0644 /etc/config/snort
	say "Installed default /etc/config/snort."
else
	say "Keeping existing /etc/config/snort."
fi

# Remove files installed by the old Lua-based module
rm -f /usr/lib/lua/luci/controller/snort.lua
rm -f /usr/lib/lua/luci/model/cbi/snort/config.lua
rm -f /usr/lib/lua/luci/view/snort/status.htm
rm -f /usr/lib/lua/luci/view/snort/status_page.htm
rm -f /usr/lib/lua/luci/view/snort/control.htm
rm -f /usr/lib/lua/luci/view/snort/alerts.htm
rm -f /usr/lib/lua/luci/view/snort/recent_alerts.htm
rm -f /usr/lib/lua/luci/i18n/snort.fr.po /usr/lib/lua/luci/i18n/snort.fr.lmo
rm -f /usr/lib/lua/luci/i18n/snort.en.po /usr/lib/lua/luci/i18n/snort.en.lmo
rmdir /usr/lib/lua/luci/view/snort 2>/dev/null || true
rmdir /usr/lib/lua/luci/model/cbi/snort 2>/dev/null || true

# Translations: prefer the system po2lmo, fall back to the prebuilt catalog
mkdir -p "$LUCI_I18N_DIR"
install_lmo() {
	lang="$1"
	po="$SRC_DIR/po/$lang/snort.po"
	prebuilt="$SRC_DIR/dist/lmo/snort.$lang.lmo"
	target="$LUCI_I18N_DIR/snort.$lang.lmo"

	if command -v po2lmo >/dev/null 2>&1 && [ -f "$po" ]; then
		if po2lmo "$po" "$target" 2>/dev/null; then
			say "Compiled $lang translation."
			return 0
		fi
	fi

	if [ -f "$prebuilt" ]; then
		cp -f "$prebuilt" "$target"
		say "Installed prebuilt $lang translation."
		return 0
	fi

	warn "No $lang translation catalog could be installed."
}

install_lmo fr

# Apply defaults immediately so a fresh install is usable without a reboot
/etc/uci-defaults/80_luci-app-snort3 || true

# Drop LuCI and rpcd caches
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache 2>/dev/null || true

if [ -x /etc/init.d/rpcd ]; then
	/etc/init.d/rpcd restart >/dev/null 2>&1 || warn "Unable to restart rpcd; reboot may be required."
fi

if command -v ubus >/dev/null 2>&1; then
	if ubus list luci.snort >/dev/null 2>&1; then
		say "The luci.snort RPC object is available."
	else
		warn "The luci.snort RPC object is not available yet. Install rpcd-mod-ucode and reboot if needed."
	fi
fi

say ""
say "Installation completed."
say "Open LuCI and go to: Services -> Snort IDS/IPS"
say "If the menu entry is not visible, log out and log in again."
