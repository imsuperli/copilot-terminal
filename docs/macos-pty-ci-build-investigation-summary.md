# macOS PTY GitHub Actions 打包异常排查总结

> 日期: 2026-03-27
> 状态: 排查中
> 适用范围: `node-pty` 在 macOS 安装包中的启动异常, 表现为 `posix_spawnp failed`

---

## 一、问题背景

当前项目在 macOS 上存在一类 PTY 启动异常:

```text
Failed to start pane <pane-id>: Error: posix_spawnp failed.
```

最初的观察中, 这个问题被怀疑与以下因素有关:

- `resources/entitlements.mac.plist` 中是否包含 `com.apple.security.device.pty`
- Apple Silicon 芯片型号差异
- macOS Sequoia 不同小版本的安全策略差异

但在继续核对现象后, 问题边界被重新收敛为:

- 同一项目代码, macOS 用户本地执行 `npm run dist` 打出来的安装包可以正常使用
- GitHub Actions 打出来的 macOS 安装包会触发 PTY 启动失败
- 因此, 当前更关键的变量不是“源码是否包含某一项 entitlement”, 而是“本地打包产物”和“CI 打包产物”之间的差异

这份文档用于记录目前已经确认的事实、已排除的方向、以及后续应优先验证的排查路径。

---

## 二、当前已确认事实

### 1. 当前仓库已经处于“修改后”状态

仓库中的 macOS entitlement 文件当前已经包含 PTY 相关配置:

- `resources/entitlements.mac.plist`
- `resources/entitlements.mac.inherit.plist`

两者都包含:

```xml
<key>com.apple.security.device.pty</key>
<true/>
```

这说明当前代码库不是“修改前版本”, 而是已经合入过 PTY entitlement 变更的版本。

### 2. 项目确实使用 `electron-builder` 构建 macOS 包

关键配置位于 `electron-builder.yml`:

- `mac.hardenedRuntime: true`
- `mac.entitlements: resources/entitlements.mac.plist`
- `mac.entitlementsInherit: resources/entitlements.mac.inherit.plist`
- `npmRebuild: true`
- `afterPack: ./scripts/after-pack.js`

这意味着:

- `electron-builder` 自身会处理原生依赖重建
- `electron-builder` 自身会处理 macOS 签名阶段
- 项目还额外插入了一段 `afterPack` 自定义逻辑

### 3. GitHub Actions 和本地打包流程并不完全相同

GitHub Actions 的 macOS workflow 比本地 `npm run dist` 多了一步:

```yaml
- name: Rebuild native modules
  run: npm rebuild node-pty --update-binary
```

而项目本身在 `electron-builder.yml` 中已经设置了:

```yaml
npmRebuild: true
```

也就是说, CI 当前对 `node-pty` 至少存在两次潜在处理:

1. workflow 显式执行 `npm rebuild node-pty --update-binary`
2. `electron-builder` 在打包过程中再次执行原生依赖 rebuild

这和本地开发者直接运行 `npm run dist` 明显不同。

### 4. 报错位置在 `node-pty` 的 macOS 启动链路内

项目创建 PTY 的入口在 `src/main/services/ProcessManager.ts`:

- `ProcessManager.createRealPty()` 调用 `pty.spawn(executable, args, options)`

而 `node-pty` 在 macOS 上的内部实现并不是直接起 shell, 而是先通过一个内部 helper 进程完成 PTY spawn:

- `node_modules/node-pty/lib/unixTerminal.js`
- `node_modules/node-pty/src/unix/pty.cc`

可以确认的调用链路如下:

1. 应用代码调用 `pty.spawn(...)`
2. `node-pty` 解析 helper 路径 `spawn-helper`
3. macOS 分支调用 `posix_spawn(...)`
4. 失败时抛出 `posix_spawnp failed`

因此, 当前异常更像是:

- `node-pty` 自带的 `spawn-helper`
- `pty.node`
- 或二者与最终打包产物之间的匹配关系

出现了问题。

---

## 三、目前不应再当作定论的说法

以下说法目前都不足以作为结论, 最多只能算历史假设:

### 1. “根因已经确定是缺少 `com.apple.security.device.pty`”

这个说法不能解释下面这个现象:

- 本地 `npm run dist` 打出来的包可以用
- GitHub Actions 打出来的包不可以用

如果根因完全由 entitlement 决定, 那么同一份源码不应该在两种打包方式之间表现不同。

### 2. “M3 / M4 / Secure Enclave / Sequoia 小版本差异是决定性原因”

这个方向也无法解释“本地包正常, CI 包异常”的现象。

芯片和系统差异可能影响某些边缘行为, 但它们不是当前最核心的解释变量。当前最直接的差异变量仍然是:

- 打包环境不同
- 原生模块处理路径不同
- 最终产物内部内容不同

### 3. “没有 Apple Developer ID 是当前唯一阻塞点”

目前不能这样下结论。

用户已明确反馈:

- 本地没有 Apple Developer ID
- 但其他 macOS 用户安装本地 `npm run dist` 产物后仍然可以正常使用

这说明“没有 Developer ID”本身不能单独解释当前问题。

它可能影响分发体验, 但不是此问题当前最优先的解释方向。

---

## 四、当前最可信的排查方向

### 方向 A: CI 额外执行的 `npm rebuild node-pty --update-binary` 改变了最终产物

这是当前优先级最高的怀疑点。

理由:

- 本地通常不会单独执行这一步
- CI 明确执行了这一步
- 项目本身又启用了 `electron-builder` 的 `npmRebuild: true`
- `node-pty` 是典型的原生模块, 且当前异常正好发生在它的 macOS native helper 启动链路

可能出现的具体问题包括:

- CI 中 `node-pty` 被替换成了不同来源的预编译文件
- CI 中 `node-pty` 生成了不同于本地的 `build/Release` 产物
- 运行时优先加载到了错误的原生文件
- `spawn-helper` 与 `pty.node` 的来源或架构不匹配

### 方向 B: CI 最终打进安装包的 `node-pty` 文件集合与本地不一致

`node-pty` 运行时的加载优先级为:

1. `build/Release`
2. `build/Debug`
3. `prebuilds/<platform>-<arch>`

这意味着如果 CI 机器上出现了某些额外的 `build/Release/*` 文件, 运行时就可能不再使用本地开发者预期的 `prebuilds/darwin-arm64/*`。

因此应重点比较:

- 本地产物中的 `pty.node`
- 本地产物中的 `spawn-helper`
- CI 产物中的 `pty.node`
- CI 产物中的 `spawn-helper`

尤其要比较:

- 文件来源
- 架构
- 权限
- hash
- 在 `.app` 内的实际落点

### 方向 C: CI runner 环境导致 `node-pty` 被重新构建成了不同形式

当前 workflow 使用 `macos-latest`。

如果 CI 环境中:

- Node 版本
- npm rebuild 行为
- 预编译下载结果
- Electron rebuild 阶段

与开发者本地机器不同, 就可能让 `node-pty` 最终选择了另一套文件。

这个方向仍然要回到“比较最终产物”来验证, 而不是停留在推测层面。

---

## 五、当前建议的排查顺序

### 第一步: 先去掉 CI 中那步额外的 `node-pty` rebuild

优先修改:

- `.github/workflows/release.yml`
- `.github/workflows/test-build.yml`

先移除:

```yaml
- name: Rebuild native modules
  run: npm rebuild node-pty --update-binary
```

理由:

- 这是 CI 与本地最明确、最直接的流程差异
- 项目本身已经启用了 `npmRebuild: true`
- 双重 rebuild 很可能让 `node-pty` 进入非预期状态

这是最低成本、最高信息量的一步验证。

### 第二步: 让 CI 输出 `node-pty` 关键文件信息

在 macOS workflow 中增加调试信息, 输出以下内容:

- `node_modules/node-pty/build/Release`
- `node_modules/node-pty/prebuilds/darwin-arm64`
- `file` 命令查看 `pty.node` 和 `spawn-helper` 的架构
- `shasum -a 256` 比较关键文件
- `ls -l` 查看权限位

目标不是立即修复, 而是确认:

- CI 到底打进去了哪些文件
- CI 是否生成了本地不存在的 `build/Release`
- CI 是否覆盖了本地会使用的 `prebuilds`

### 第三步: 与一份“可用的本地 macOS 产物”做二进制级别对比

如果能拿到一份用户本地 `npm run dist` 后确认可用的 `.app` 或 `.dmg`, 应重点比较:

- `Contents/Resources/app.asar.unpacked/node_modules/node-pty/...`
- `Contents/Resources/app.asar.unpacked/resources/bin/...`

要确认的不是“配置看起来像不像”, 而是“最终二进制文件是否完全一致”。

### 第四步: 再回头验证 entitlement / 签名是否只是次要因素

只有当上面几步排除后, 才应该重新把重点放回:

- entitlement 是否真正写入到最终 app
- `afterPack` 的 ad-hoc `codesign` 是否覆盖了 `electron-builder` 默认行为
- helper 文件是否有单独签名问题

目前不建议把这一步放在最前面。

---

## 六、当前阶段的临时结论

截至 2026-03-27, 更稳妥的结论如下:

1. 当前问题的核心不是“源码里有没有 `com.apple.security.device.pty`”。
2. 当前问题也不能简单归因为“M3/M4 芯片差异”或“必须有 Apple Developer ID”。
3. 现象最能说明的是: GitHub Actions 打出来的 macOS 产物, 与本地 `npm run dist` 打出来的 macOS 产物, 在 `node-pty` 原生模块层面很可能不一致。
4. 当前最值得优先验证的差异点是 CI workflow 中额外的:

```bash
npm rebuild node-pty --update-binary
```

---

## 七、后续执行建议

如果后续继续推进排查, 推荐按以下顺序执行:

1. 删除 workflow 中额外的 `npm rebuild node-pty --update-binary`
2. 重新跑一版 CI 构建, 让 macOS 用户验证
3. 如果问题仍在, 增加 CI 调试输出, 比较 `pty.node` / `spawn-helper`
4. 如果拿到一份可用的本地产物, 对本地与 CI 的 `.app` 内容做 diff
5. 只有在以上路径都不能解释问题时, 再重新检查 entitlement / 签名链路

---

## 八、备注

本结论基于当前仓库配置和已有现象整理而成, 不是最终 root cause 报告。

当前最大的约束是:

- 本地没有 macOS 构建环境
- 暂时无法直接对一份“可用的本地 macOS 产物”和一份“异常的 CI macOS 产物”做并排二进制比对

因此, 这份文档的目标不是给出最终修复结论, 而是确保后续排查围绕“真实差异点”展开, 避免继续被未证实的芯片/系统推测带偏。
