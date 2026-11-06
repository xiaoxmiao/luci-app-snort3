# Contributing

Contributions are welcome. This project targets the JavaScript LuCI runtime and
an rpcd/ucode backend; the pre-1.0 Lua/CGI code is archived in the
`legacy-and-beta` git tag.

## Architecture

```text
Browser
  └─ LuCI JavaScript views
       └─ rpc.declare() ── ubus ── luci.snort
                                      └─ rpcd/ucode plugin
                                           ├─ UCI: /etc/config/snort-web
                                           ├─ sync: /usr/libexec/snort-web-sync
                                           ├─ init: /etc/init.d/snort
                                           ├─ logs: /var/log/alert_json.txt (system: logread)
                                           └─ rules: /etc/snort/rules, /var/snort.d
```

- `htdocs/luci-static/resources/view/snort/` contains the three pages.
- `htdocs/luci-static/resources/snort/` contains the RPC wrappers, pure helpers
  and shared CSS.
- `root/usr/share/rpcd/ucode/luci.snort.uc` is the only place that performs
  privileged operations.
- `root/usr/share/rpcd/acl.d/luci-app-snort3.json` defines the ubus and UCI
  permissions. The browser can only access `/etc/config/snort-web`; the
  synchronisation helper writes `/etc/config/snort` as root.
- `root/usr/libexec/snort-web-sync`, `/etc/init.d/snort-web` and the ucitrack
  JSON keep the runtime `/etc/config/snort` in sync with the application.
- `po/fr/snort.po` and `po/zh_Hans/snort.po` are the translation sources;
  `dist/lmo/snort.fr.lmo` and `dist/lmo/snort.zh-cn.lmo` are the prebuilt
  catalogs used by the direct installer.

## Development setup

Node.js 18 or newer is sufficient for the local checks. No npm dependencies are
required.

```sh
npm test
npm run check:js
npm run check:i18n
npm run build:lmo
```

The ucode syntax and type check uses `ucode-lsp` through `npx`:

```sh
npm run check:ucode
```

The first run downloads the checker. The command should report no errors for
`luci.snort.uc`.

## JavaScript guidelines

- Follow the existing LuCI module style: tabs for indentation, single quotes,
  `var` for browser-compatible helpers, and `return` at the end of a module.
- Keep `util.js` free of LuCI dependencies so it remains testable under Node.
- Add a test in `tests/` for new pure helper behavior.
- Do not access privileged files or execute commands from a view. Add an rpcd
  method and an ACL entry instead.
- Use `util.translate()` or `_()` for user-visible strings. Technical values such
  as `AF_PACKET`, `hash` or `prerouting` may remain untranslated.
- Do not override `handleSave`/`handleSaveApply` in `config.js`; the form map must
  be able to save UCI changes. Overview and Alerts intentionally set them to
  `null` to hide the footer buttons.

## ucode guidelines

- Keep the plugin compatible with the ucode runtime shipped by OpenWrt 25.12+.
  Avoid newer syntax such as `??` and `?.` unless the minimum version is raised
  explicitly.
- Use `fs` and `popen` with fixed commands or argument arrays. Never interpolate
  untrusted values into a shell string.
- Validate paths with `safe_path()` before using them.
- Keep service actions allow-listed in `SERVICE_ACTIONS`.
- Return a stable `code` field that the JavaScript side can map to a translated
  message. Add the English string to `util.msg()` and to both catalogs.
- Run `npm run check:ucode` after changing the plugin.

## Configuration synchronisation

The LuCI form writes `/etc/config/snort-web`. The OpenWrt `snort3` package still
reads `/etc/config/snort`, so every change must be pushed there by
`/usr/libexec/snort-web-sync`. When adding or renaming an option:

1. add it to `root/etc/config/snort-web`;
2. add it to `SNORT_OPTIONS` or `NFQ_OPTIONS` in `snort-web-sync`;
3. add it to the form in `config.js`;
4. add it to both catalogs if the label is user-visible.

`tests/package.test.js` checks that the default configuration and the sync
helper option lists stay identical.

## Translations

The UI uses the LuCI translation domain `snort`. Catalogs are installed as
`/usr/lib/lua/luci/i18n/snort.fr.lmo` and `snort.zh-cn.lmo` (the `zh_Hans`
source directory is mapped to the standard `zh-cn` language code by `luci.mk`).

After adding or changing a visible string:

```sh
node scripts/check-i18n.js --write-pot
# edit po/fr/snort.po and po/zh_Hans/snort.po
npm run check:i18n
npm run build:lmo
npm test
```

`check-i18n` scans both the JavaScript files and the menu definitions. It fails
when a UI string is missing from any catalog. `--strict` also fails on obsolete
translations.

Both prebuilt catalogs must be regenerated together with the PO files;
`tests/po2lmo.test.js` verifies that the committed catalogs are up to date.

## Testing checklist

Before submitting a change:

```sh
npm run check          # JavaScript syntax, unit tests and i18n coverage
npm run check:ucode    # ucode diagnostics
sh -n root/usr/libexec/snort-web-sync
sh -n root/etc/init.d/snort-web
sh -n root/etc/uci-defaults/80_luci-app-snort3
```

On a router, additionally run:

```sh
ubus list luci.snort
ubus call luci.snort status
```

## Commit and pull request guidelines

- Keep changes focused and describe the behavior being changed.
- Include the corresponding translation updates in the same commit.
- Mention any router-side manual step (cache clearing, rpcd restart) in the pull
  request description.
- Do not commit generated caches, `node_modules`, or firmware images.

## Legacy code

The pre-1.0 Lua controller, CBI model, templates and the original CGI
prototype were removed from this branch. They remain available in the
`legacy-and-beta` git tag together with the complete 4.x beta history.
