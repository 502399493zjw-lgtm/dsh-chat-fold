# `@deepseek-ai/dsh-client-ui-execution-fold`

Optional DSH Web bundle for a safe, result-first conversation view. It is
verified against stock DSH `0.1.0-rc.7`.

After installation, the plugin adds a separate **Folded chat** tab and keeps
the built-in **Chat** tab intact. User messages and the final assistant answer
stay visible; tool/command steps, steering events, runtime context and
assistant think/reasoning are represented only by short labels inside an
`Execution process` disclosure. Internal policy and skill payloads are never
rendered as message text by the folded view.

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
