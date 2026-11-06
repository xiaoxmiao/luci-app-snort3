#
# LuCI Snort3 module
#
# This repository is ONE application of the LuCI feed, not a standalone feed.
# It works from either of these locations in an OpenWrt buildroot / SDK:
#   feeds/luci/applications/luci-app-snort3/Makefile
#   package/luci-app-snort3/Makefile
# The LuCI feed itself must be present (./scripts/feeds update luci).
#
# Install the built .apk packages on the router; there is no shell installer.
#

include $(TOPDIR)/rules.mk

# luci.mk derives LUCI_NAME from the directory name. Pin it so that a checkout
# renamed at clone time still produces luci-app-snort3 and the matching
# luci-i18n-snort3-* translation packages.
LUCI_NAME:=luci-app-snort3
LUCI_URL:=https://github.com/xiaoxmiao/luci-app-snort3
LUCI_MAINTAINER:=xiaoxmiao <https://github.com/xiaoxmiao/luci-app-snort3>

LUCI_TITLE:=LuCI support for Snort3 IDS/IPS
LUCI_DESCRIPTION:=Web interface for status, service control, configuration, alerts and rules management of Snort3.
# Scheduled rule updates use busybox crond (/etc/init.d/cron).  OpenWrt has no
# standalone "cron" package - the applet belongs to the essential busybox
# package - so nothing is added to LUCI_DEPENDS.  snort-web-schedule detects
# its absence at runtime and logs a warning instead of breaking the install.
LUCI_DEPENDS:=+luci-base +rpcd-mod-ucode
# Snort3 is a runtime-only dependency. Keeping it in LUCI_DEPENDS makes the
# OpenWrt build system compile the whole Snort3 stack before this UI package,
# which is unnecessary when only the LuCI module is being built. EXTRA_DEPENDS
# still records the dependency in the package metadata.
LUCI_EXTRA_DEPENDS:=snort3$(if $(CONFIG_USE_APK), (>=0))
LUCI_PKGARCH:=all

PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_PO_VERSION:=$(PKG_VERSION)-r$(PKG_RELEASE)

PKG_LICENSE:=GPL-2.0
PKG_MAINTAINER:=xiaoxmiao <https://github.com/xiaoxmiao/luci-app-snort3>

# /etc/config/snort is provided by the snort3 package. Shipping it here as
# well would cause a file clash during firmware builds. The application stores
# its settings in /etc/config/snort-web and synchronises them to snort3 through
# /usr/libexec/snort-web-sync.

define Package/luci-app-snort3/conffiles
/etc/config/snort-web
endef

define Package/luci-app-snort3/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	[ -x /etc/init.d/snort-web ] && /etc/init.d/snort-web enable
	# Apply the rules storage layout on upgrade too: /etc/uci-defaults is only
	# replayed by the boot script on the next reboot.
	[ -f /etc/uci-defaults/80_luci-app-snort3 ] && /bin/sh /etc/uci-defaults/80_luci-app-snort3
	[ -x /usr/libexec/snort-web-sync ] && /usr/libexec/snort-web-sync --sync
	chmod 0755 /usr/libexec/snort-web-rules-update 2>/dev/null
	if [ -x /etc/init.d/ucitrack ]; then
		/etc/init.d/ucitrack reload >/dev/null 2>&1 || /etc/init.d/ucitrack restart >/dev/null 2>&1
	fi
	rm -f /tmp/luci-indexcache.*
	rm -rf /tmp/luci-modulecache/
	[ -f /usr/libexec/snort-web-schedule ] && /bin/sh /usr/libexec/snort-web-schedule
	# rpcd reload only sends a signal; it does not re-fork the long-lived
	# ucode plugin processes.  A restart is required after replacing the plugin.
	/etc/init.d/rpcd restart 2>/dev/null
}
exit 0
endef

define Package/luci-app-snort3/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || /etc/init.d/snort-web disable
exit 0
endef

# Resolve luci.mk explicitly.  The historical "include ../../luci.mk" only
# resolves when this Makefile sits in feeds/luci/applications/<app>/; a clone
# dropped into package/ then failed the include and silently vanished from
# menuconfig.  luci.mk only relies on $(CURDIR), $(TOPDIR) and $(INCLUDE_DIR),
# so including it from the feed root works from any checkout location.
LUCI_MK := $(firstword $(wildcard ../../luci.mk $(TOPDIR)/feeds/luci/luci.mk $(TOPDIR)/package/feeds/luci/luci.mk))

# Do not use $(error) here: OpenWrt evaluates this Makefile with DUMP=1 while
# building its package index, and a fatal error there makes the package vanish
# from menuconfig without any visible message. A warning plus a best-effort
# path keeps that scan alive.
ifeq ($(LUCI_MK),)
$(warning luci-app-snort3: could not locate luci.mk. Run ./scripts/feeds update luci and ./scripts/feeds install luci-base, then place this repository in package/luci-app-snort3 or feeds/luci/applications/luci-app-snort3.)
LUCI_MK := $(TOPDIR)/feeds/luci/luci.mk
endif

include $(LUCI_MK)

# BuildPackage and the language packages are emitted by luci.mk.
