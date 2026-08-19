# `@deepseek-ai/dsh-client-ui-execution-fold`

可选的 DSH Web 对话视图插件，已固定使用 stock DSH `0.1.0-rc.7` 验证。

安装后会新增独立的“折叠对话”标签，并保留内置“对话”标签。用户消息和最终回答保持展开；工具调用、命令、重试、压缩、steering、运行时上下文以及 think/reasoning 只会以简短标签归入“执行过程”。折叠视图不会把审批策略、技能清单等内部载荷当成消息正文展示。

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
