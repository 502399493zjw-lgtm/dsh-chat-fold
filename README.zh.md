# `@deepseek-ai/dsh-client-ui-execution-fold`

可选的 DSH Web 对话视图插件，已固定使用 stock DSH `0.1.0-rc.7` 验证。

安装后会新增独立的“折叠对话”标签，并保留内置“对话”标签。用户消息和最终回答保持展开；打开“执行过程”后，会按原始顺序完整显示 steering、运行时上下文、think/reasoning、工具/命令调用及其结果。上下文正文会直接展开，不再套一层需要再次点击的“上下文”折叠项。

## 安装

```bash
dsh plugin --profile web add /绝对路径/dsh-client-ui-execution-fold
```

重启 Web 进程并刷新浏览器后生效。以后发布到 npm 后，也可以把路径替换为包名。

## 卸载

```bash
dsh plugin --profile web remove @deepseek-ai/dsh-client-ui-execution-fold
```

重启 Web 进程并刷新浏览器后生效。内置“对话”视图在安装和卸载前后都会保留。
