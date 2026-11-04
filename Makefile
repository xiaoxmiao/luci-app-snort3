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
LUCI_DEPENDS:=+luci-base +rpcd-mod-ucode +snort3
LUCI_PKGARCH:=all

PKG_LICENSE:=GPL-2.0
PKG_MAINTAINER:=David Dzieciol <david.dzieciol51100@gmail.com>

# /etc/config/snort is provided by the snort3 package. Shipping it here as
# well would cause a file clash during firmware builds.

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
