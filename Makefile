#
# LuCI Snort3 module
#
# This Makefile is intended to be used inside the LuCI feed:
#   feeds/luci/applications/luci-app-snort3/Makefile
#
# For direct installation on a router without rebuilding the firmware, use
# ./install.sh instead.
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for Snort3 IDS/IPS
LUCI_DESCRIPTION:=Web interface for status, service control, configuration, alerts and rules management of Snort3.
LUCI_DEPENDS:=+luci-base +rpcd-mod-ucode
# Snort3 is a runtime-only dependency. Keeping it in LUCI_DEPENDS makes the
# OpenWrt build system compile the whole Snort3 stack before this UI package,
# which is unnecessary when only the LuCI module is being built. EXTRA_DEPENDS
# still records the dependency in the package metadata.
LUCI_EXTRA_DEPENDS:=snort3$(if $(CONFIG_USE_APK), (>=0))
LUCI_PKGARCH:=all

PKG_VERSION:=4.2.0
PKG_RELEASE:=1
PKG_PO_VERSION:=$(PKG_VERSION)-r$(PKG_RELEASE)

PKG_LICENSE:=GPL-2.0
PKG_MAINTAINER:=David Dzieciol <david.dzieciol51100@gmail.com>

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
	[ -x /usr/libexec/snort-web-sync ] && /usr/libexec/snort-web-sync --sync
	chmod 0755 /usr/libexec/snort-web-rules-update 2>/dev/null
	rm -f /tmp/luci-indexcache.*
	rm -rf /tmp/luci-modulecache/
	/etc/init.d/rpcd reload 2>/dev/null
}
exit 0
endef

define Package/luci-app-snort3/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || /etc/init.d/snort-web disable
exit 0
endef

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
