# Contributing

Contributions are welcome. This project targets the JavaScript LuCI runtime and
an rpcd/ucode backend; Lua code is kept only under `legacy/` for reference.

## Architecture

```text
Browser
  └─ LuCI JavaScript views
       └─ rpc.declare() ── ubus ── luci.snort
                                      └─ rpcd/ucode plugin
                                           ├─ UCI: /etc/config/snort
                                           ├─ init: /etc/init.d/snort
                                           ├─ logs: /var/log/alert_fast.txt
                                           └─ rules: /etc/snort/rules, /var/snort.d
```

- `htdocs/luci-static/resources/view/snort/` contains the three pages.
- `htdocs/luci-static/resources/snort/` contains the RPC wrappers, pure helpers
  and shared CSS.
- `root/usr/share/rpcd/ucode/luci.snort.uc` is the only place that performs
  privileged operations.
- `root/usr/share/rpcd/acl.d/luci-app-snort3.json` defines the ubus and UCI
  permissions.
- `po/fr/snort.po` is the translation source; `dist/lmo/snort.fr.lmo` is the
  prebuilt catalog used by the direct installer.

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

- Keep the plugin compatible with the ucode runtime shipped by OpenWrt 23.05 and
  24.10. Avoid newer syntax such as `??` and `?.` unless the minimum version is
  raised explicitly.
- Use `fs` and `popen` with fixed commands or argument arrays. Never interpolate
  untrusted values into a shell string.
- Validate paths with `safe_path()` before using them.
- Keep service actions allow-listed in `SERVICE_ACTIONS`.
- Return a stable `code` field that the JavaScript side can map to a translated
  message. Add the English string to `util.msg()` and to `po/fr/snort.po`.
- Run `npm run check:ucode` after changing the plugin.

## Translations

The UI uses the LuCI translation domain `snort`. The catalog is installed as
`/usr/lib/lua/luci/i18n/snort.fr.lmo`.

After adding or changing a visible string:

```sh
node scripts/check-i18n.js --write-pot
# edit po/fr/snort.po
npm run check:i18n
npm run build:lmo
npm test
```

`check-i18n` scans both the JavaScript files and the menu definitions. It fails
when a UI string is missing from the French catalog. `--strict` also fails on
obsolete translations.

The prebuilt `dist/lmo/snort.fr.lmo` must be regenerated together with the PO
file; `tests/po2lmo.test.js` verifies that the committed catalog is up to date.

## Testing checklist

Before submitting a change:

```sh
npm run check          # JavaScript syntax, unit tests and i18n coverage
npm run check:ucode    # ucode diagnostics
sh -n install.sh       # shell syntax
sh -n verify.sh
```

On a router, additionally run:

```sh
sh verify.sh
ubus call luci.snort status
```

## Commit and pull request guidelines

- Keep changes focused and describe the behavior being changed.
- Include the corresponding translation updates in the same commit.
- Mention any router-side manual step (cache clearing, rpcd restart) in the pull
  request description.
- Do not commit generated caches, `node_modules`, or firmware images.

## Legacy code

`legacy/lua-v3/` contains the previous Lua controller, CBI model, templates,
installer and original shell script. `legacy/v0-cgi-interface/` contains the
initial CGI prototype. These files are historical references and are not
installed by the current package. Do not add new features there.
