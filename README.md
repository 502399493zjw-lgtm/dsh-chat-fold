# `@deepseek-ai/dsh-client-ui-execution-fold`

Optional DSH Web bundle for a safe, result-first conversation view. It is
verified against stock DSH `0.1.0-rc.7`.

After installation, the plugin adds a separate **Folded chat** tab and keeps
the built-in **Chat** tab intact. User messages and the final assistant answer
stay visible. The current execution process opens automatically while a turn
is running and folds when that turn finishes. Opening it again restores the
complete ordered flow in the same full-width reading style as Chat: steering
events, full runtime context, assistant reasoning, tool/command calls, and
their results. Context bodies open directly instead of adding a second nested
disclosure.

## Install

```bash
dsh plugin --profile web add /absolute/path/to/dsh-client-ui-execution-fold
```

Restart the Web process after installing the package, then reload the browser.
The package can later be published and installed by its npm name instead.

## Remove

```bash
dsh plugin --profile web remove @deepseek-ai/dsh-client-ui-execution-fold
```

Restart the Web process and reload the browser. The built-in Chat view remains
available before and after removal.
