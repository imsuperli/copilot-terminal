# 插件市场

这个目录承载 CodePane 语言插件市场的官方落地内容，分三部分：

- `plugins/`: 可打包的插件源目录，每个插件目录都必须包含 `plugin.json`
- `packages/`: 本地执行构建后生成的轻量 zip 产物，默认不提交仓库
- `catalog.json`: 插件市场目录文件，应用默认会从官方下载域名拉取

发布级、自带依赖的完整插件包会输出到：

- `release/plugin-marketplace/packages/`
- `release/plugin-marketplace/catalog.json`

## 当前下载来源

应用默认会先请求：

`https://plugin.notta.top/catalog.json`

`catalog.json` 里的 `platforms[].downloadUrl` 现在支持相对路径：

- 远端读取时，相对路径会自动解析成相对于远端 `catalog.json` 的 URL

应用运行时只依赖远端目录；真正对外发布时，建议使用 `release/plugin-marketplace/` 下生成的完整产物。

## 是否需要自己准备插件

现在的官方插件准备方式是：

- `official.python-pyright`
- `official.java-jdtls`

这两个插件源码目录仍然保持轻量，方便本地开发；发布脚本会自动下载并打包：

- Python: 官方 `pyright` npm 包
- Java: 官方 Eclipse JDTLS 发行包

Java 插件目标是支持 Java 8 及以上项目，但运行 JDTLS 本身仍需要本地 `Java 21+ runtime`。用户需要在插件设置中把 `java.home` 指向本机的 Java 21+ 安装目录，或通过 `JAVA_HOME` / `PATH` 提供。

## 更新市场内容

1. 在 `plugin-marketplace/plugins/<plugin-id>/` 下准备插件目录
2. 本地调试插件包时，运行 `npm run build:plugin-marketplace`
3. 生成可发布的完整插件包时，运行 `npm run build:plugin-marketplace:release`
4. 上传 `release/plugin-marketplace/packages/*.zip` 和 `release/plugin-marketplace/catalog.json`

说明：`npm run build:plugin-marketplace` 会在 `plugin-marketplace/packages/` 生成本地调试用 zip，这些文件默认被忽略，不再提交到仓库。

如果要让发布产物直接写入线上下载地址，可以在生成时设置：

```bash
PLUGIN_MARKETPLACE_BASE_URL=https://your-host/plugin-marketplace/packages/ npm run build:plugin-marketplace:release
```

应用运行时也可以通过 `CODE_PLUGIN_CATALOG_URL` 覆盖目录地址。
