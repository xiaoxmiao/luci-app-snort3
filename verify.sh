#!/bin/sh
#
# Verify the installed LuCI Snort3 module.

set -u

failures=0
warnings=0

check_file() {
	if [ -f "$1" ]; then
		printf '  [OK]   %s\n' "$1"
	else
		printf '  [FAIL] %s\n' "$1"
		failures=$((failures + 1))
	fi
}

check_optional_file() {
	if [ -f "$1" ]; then
		printf '  [OK]   %s\n' "$1"
	else
		printf '  [WARN] %s is not installed\n' "$1"
		warnings=$((warnings + 1))
	fi
}

check_exec() {
	if [ -x "$1" ]; then
		printf '  [OK]   %s\n' "$1"
	else
		printf '  [FAIL] %s (not executable)\n' "$1"
		failures=$((failures + 1))
	fi
}

check_optional_exec() {
	if [ -x "$1" ]; then
		printf '  [OK]   %s\n' "$1"
	else
		printf '  [WARN] %s is not installed (rules updates will be disabled)\n' "$1"
		warnings=$((warnings + 1))
	fi
}

printf '%s\n' "LuCI Snort3 installation check"
printf '%s\n\n' "------------------------------"

printf '%s\n' "Files:"
check_file /www/luci-static/resources/view/snort/overview.js
check_file /www/luci-static/resources/view/snort/config.js
check_file /www/luci-static/resources/view/snort/alerts.js
check_file /www/luci-static/resources/snort/api.js
check_file /www/luci-static/resources/snort/util.js
check_file /www/luci-static/resources/snort/style.js
check_file /usr/share/rpcd/ucode/luci.snort.uc
check_file /usr/share/luci/menu.d/luci-app-snort3.json
check_file /usr/share/rpcd/acl.d/luci-app-snort3.json
check_file /usr/share/ucitrack/luci-app-snort3.json
check_file /etc/config/snort-web
check_file /etc/config/snort
check_optional_file /usr/lib/lua/luci/i18n/snort.fr.lmo
check_optional_file /usr/lib/lua/luci/i18n/snort.zh-cn.lmo

printf '\n%s\n' "Executables:"
check_exec /etc/init.d/snort
check_exec /etc/init.d/snort-web
check_exec /usr/libexec/snort-web-sync
check_exec /usr/libexec/snort-web-rules-update
check_exec /usr/bin/snort
check_optional_exec /usr/bin/snort-rules

printf '\n%s\n' "Configuration:"
if command -v uci >/dev/null 2>&1; then
	if uci -q get snort-web.snort.enabled >/dev/null 2>&1; then
		printf '  [OK]   /etc/config/snort-web is readable\n'
	else
		printf '  [FAIL] /etc/config/snort-web is missing or invalid\n'
		failures=$((failures + 1))
	fi
else
	printf '  [WARN] uci command not found\n'
	warnings=$((warnings + 1))
fi

printf '\n%s\n' "Legacy Lua files (should be absent):"
for file in \
	/usr/lib/lua/luci/controller/snort.lua \
	/usr/lib/lua/luci/model/cbi/snort/config.lua \
	/usr/lib/lua/luci/view/snort/status_page.htm
do
	if [ -e "$file" ]; then
		printf '  [WARN] %s still exists\n' "$file"
		warnings=$((warnings + 1))
	else
		printf '  [OK]   %s absent\n' "$file"
	fi
done

printf '\n%s\n' "rpcd / ubus:"
if command -v ubus >/dev/null 2>&1; then
	if ubus list luci.snort >/dev/null 2>&1; then
		printf '  [OK]   ubus object luci.snort is registered\n'
		ubus -v list luci.snort 2>/dev/null | sed 's/^/         /'

		if ubus call luci.snort status >/dev/null 2>&1; then
			printf '  [OK]   luci.snort status call succeeds\n'
		else
			printf '  [FAIL] luci.snort status call failed\n'
			failures=$((failures + 1))
		fi
	else
		printf '  [FAIL] ubus object luci.snort is not registered\n'
		failures=$((failures + 1))
	fi
else
	printf '  [WARN] ubus command not found\n'
	warnings=$((warnings + 1))
fi

printf '\n%s\n' "Dependencies:"
if command -v apk >/dev/null 2>&1; then
	if apk info -e rpcd-mod-ucode >/dev/null 2>&1; then
		printf '  [OK]   rpcd-mod-ucode is installed\n'
	else
		printf '  [WARN] rpcd-mod-ucode is not installed\n'
		warnings=$((warnings + 1))
	fi
elif command -v opkg >/dev/null 2>&1; then
	if opkg list-installed 2>/dev/null | grep -q '^rpcd-mod-ucode '; then
		printf '  [OK]   rpcd-mod-ucode is installed\n'
	else
		printf '  [WARN] rpcd-mod-ucode is not installed\n'
		warnings=$((warnings + 1))
	fi
else
	printf '  [WARN] neither apk nor opkg found\n'
	warnings=$((warnings + 1))
fi

printf '\nSummary: %d failure(s), %d warning(s)\n' "$failures" "$warnings"

if [ "$failures" -gt 0 ]; then
	printf '%s\n' "Try: /etc/init.d/rpcd restart && rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache"
	exit 1
fi

exit 0
