# 插件市场

这个目录承载 CodePane 语言插件市场的官方落地内容，分三部分：

- `plugins/`: 可打包的插件源目录，每个插件目录都必须包含 `plugin.json`
- `packages/`: 生成后的插件 zip 包，设置页安装市场插件时最终下载的就是这里的产物
- `catalog.json`: 插件市场目录文件，应用默认会从 GitHub 上的这个路径拉取

## 当前下载来源

应用默认会先请求：

`https://raw.githubusercontent.com/imsuperli/copilot-terminal/main/plugin-marketplace/catalog.json`

如果远端不可用，开发环境会回退到当前仓库里的本地 `plugin-marketplace/catalog.json`。

`catalog.json` 里的 `platforms[].downloadUrl` 现在支持相对路径：

- 远端读取时，相对路径会自动解析成相对于远端 `catalog.json` 的 URL
- 本地 fallback 读取时，相对路径会自动解析成相对于本地 `catalog.json` 的 `file://` 路径

因此，官方市场内容只需要把 zip 包放在 `plugin-marketplace/packages/`，并在 `catalog.json` 里写相对路径即可，同时兼容本地开发和远端发布。

## 是否需要自己准备插件

需要。

当前仓库已经补齐了插件市场基础设施和两个官方样例插件：

- `official.python-pyright`
- `official.java-jdtls`

这两个样例插件本身很轻，只提供插件清单和启动代理，不把大型语言服务器二进制直接打进应用包或仓库。用户仍然需要在机器上准备对应语言服务器，或者在插件设置里指定启动命令。

## 更新市场内容

1. 在 `plugin-marketplace/plugins/<plugin-id>/` 下准备插件目录
2. 运行 `npm run build:plugin-marketplace`
3. 提交生成后的 `plugin-marketplace/packages/*.zip` 和 `plugin-marketplace/catalog.json`
4. 推送到默认 catalog 对应的分支或仓库路径

如果要发布到非默认地址，可以在生成时设置：

```bash
PLUGIN_MARKETPLACE_BASE_URL=https://your-host/plugin-marketplace/packages/ npm run build:plugin-marketplace
```

应用运行时也可以通过 `CODE_PLUGIN_CATALOG_URL` 覆盖目录地址。
