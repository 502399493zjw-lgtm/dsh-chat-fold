# `dsh-chat-fold`

Optional DSH Web bundle that adds per-turn execution folding to the stock Chat
view. It is pinned to stock DSH `0.1.0-rc.8`.

After installation, the plugin wraps the existing **Chat** entry in place
instead of registering another tab. The same rc.8 Chat component still owns
history paging, scrolling, file opening, pending steering, and `Deep diving...`; the plugin
only groups each turn's execution rows behind `Execution process · N steps`.
Running work opens automatically and folds when the turn finishes. Expanding
the group renders the registered native Context, Think, Tool, command, Goal,
and Workflow surfaces with their normal inner disclosure defaults. User
messages, final assistant answers, and the native turn tail remain outside the
group.

![Execution folding in the native Chat view](docs/assets/execution-fold.gif)

The GIF is an editorially retimed recording from stock DSH `0.1.0-rc.8`: it
shows a running turn staying open, the turn folding automatically on
completion, and a manual reopen with native inner disclosures still closed.

This is deliberately a short-term, rc.8-specific integration. rc.8 does not
expose a supported interceptor for a registered Chat entry, so the plugin
temporarily replaces that entry's component and inject function while leaving
its id, tab, store, child-slot ownership, and native `renderSlot` binding
untouched. If the wrapper itself fails, it renders the captured stock Chat
component with the untouched native props.

## Install

```bash
dsh plugin --profile web add dsh-chat-fold@0.1.0-rc.8
```

Restart the Web process after installing the package, then reload the browser.
To follow later prereleases instead, install `dsh-chat-fold@next`.

This plugin depends on rc.8's internal Chat registration shape. Re-run the
tarball smoke and interaction tests before upgrading DSH; compatibility with a
later DSH release must not be inferred from the package name or npm tag.

## Remove

```bash
dsh plugin --profile web remove dsh-chat-fold
```

Restart the Web process and reload the browser. Removing the plugin restores
the original Chat entry.

## Development

```bash
pnpm install
pnpm test
pnpm run check
pnpm run build
pnpm run verify:package
pnpm pack
```

`verify:package` checks the built package boundary. A release claim additionally
requires installing the packed tarball into an isolated stock DSH `0.1.0-rc.8`
profile and exercising the wrapped Chat entry.

## License

MIT
