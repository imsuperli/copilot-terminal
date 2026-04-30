# 修改所有 commit 的作者和邮箱的步骤和命令

本文档用于将当前仓库的所有历史提交作者信息统一改为：

- 用户名：`lchpersonal`
- 邮箱：`326018662@qq.com`

同时移除提交信息中的 `Co-Authored-By: Claude ... <noreply@anthropic.com>`，避免 GitHub Contributors 中继续显示 `Claude Code`。

## 适用场景

- 需要统一整个仓库的历史作者身份
- 需要让 GitHub 将提交尽量归属到 `lchpersonal`
- 需要清理历史提交中的 `Claude Code` 协作者标记

## 重要提醒

1. 这是**重写 Git 历史**操作，所有 commit hash 都会改变。
2. 如果仓库已经被其他人拉取，重写后他们需要重新同步历史，不能直接普通 `git pull`。
3. 请先确认 `326018662@qq.com` 已添加并验证到 GitHub 账号 `lchpersonal`，否则 GitHub 不一定会正确识别贡献归属。
4. GitHub 的 Contributors 统计通常不会立即刷新，可能需要等待一段时间。

## 当前仓库的远端情况

当前仓库已配置两个远端：

- `github` -> `git@github.com:lchpersonal/synapse.git`
- `origin` -> 公司 Git 远端

当前本地分支是 `master`，GitHub 远端对应分支是 `main`。

## 操作步骤

### 1. 检查工作区是否干净

```powershell
git status --short
```

如果有未提交改动，先暂存：

```powershell
git stash push -u -m "pre-rewrite"
```

### 2. 先做完整备份

建议先创建一个 bundle 备份文件：

```powershell
git bundle create ..\synapse-pre-rewrite.bundle --all
```

这一步很重要，万一改写后不满意，还可以恢复。

### 3. 配置后续新提交的默认身份

这一步只影响**之后的新提交**，不会自动修改历史提交：

```powershell
git config user.name "lchpersonal"
git config user.email "326018662@qq.com"
```

可选检查：

```powershell
git config --get user.name
git config --get user.email
```

### 4. 检查 `git filter-repo` 是否可用

```powershell
git filter-repo -h
```

如果提示没有该命令，则安装：

```powershell
py -m pip install git-filter-repo
```

### 5. 重写全部历史作者和提交者，并移除 Claude 协作者标记

在 PowerShell 中执行以下命令：

```powershell
$callback = @'
commit.author_name = b"lchpersonal"
commit.author_email = b"326018662@qq.com"
commit.committer_name = b"lchpersonal"
commit.committer_email = b"326018662@qq.com"

import re
commit.message = re.sub(
    rb'(?mi)^Co-Authored-By:\s*Claude .*<noreply@anthropic\.com>\r?\n?',
    b'',
    commit.message
)
commit.message = re.sub(rb'(\r?\n){3,}', b'\n\n', commit.message).rstrip(b'\r\n') + b'\n'
'@

git filter-repo --force --commit-callback $callback
```

说明：

- 这段脚本会把所有提交的 `author` 和 `committer` 统一改成目标身份。
- 这段脚本只删除 `Claude` 对应的 `Co-Authored-By` 行，不会误删普通正文。
- `--force` 是因为当前仓库不是全新克隆仓库，`git filter-repo` 默认会拒绝直接改写。

### 6. 校验改写结果

检查最近提交的作者和提交者：

```powershell
git log --all --format="%h | %an <%ae> | %cn <%ce>" | Select-Object -First 20
```

检查贡献者汇总：

```powershell
git shortlog -sne --all
```

检查历史提交中是否还残留 Claude 协作者标记：

```powershell
git log --all --format=%B | Select-String -Pattern "Co-Authored-By|anthropic"
```

如果最后这条命令没有输出，说明相关标记已清理干净。

### 7. 强制推送到远端

先推送到 GitHub：

```powershell
git push --force-with-lease github master:main
```

如果公司远端也要同步相同历史，再执行：

```powershell
git push --force-with-lease origin master
```

如果你还需要同步标签：

```powershell
git push --force --tags github
git push --force --tags origin
```

### 8. 如果之前做过 `stash`，最后恢复本地改动

```powershell
git stash list
git stash pop
```

## 其他协作者如何重新同步

如果其他人之前已经拉取过这个仓库，重写历史后建议他们：

```powershell
git fetch --all
git checkout master
git reset --hard github/main
```

如果他们使用的是公司远端同步后的分支，则把最后一条改成对应远端分支即可。

## 常用校验命令汇总

```powershell
git status --short
git remote -v
git branch -vv
git log --all --format="%h | %an <%ae> | %cn <%ce>" | Select-Object -First 20
git shortlog -sne --all
git log --all --format=%B | Select-String -Pattern "Co-Authored-By|anthropic"
```

## 回滚思路

如果改写后发现有问题，可以基于前面生成的 bundle 备份恢复，或者直接重新克隆原仓库后再操作。

如果只是本地还未推送，也可以直接回到改写前的引用或重新从备份恢复。

## 推荐执行顺序

建议按下面顺序执行：

1. 检查 `git status`
2. `git stash` 未提交改动
3. `git bundle` 做备份
4. 设置新的 `user.name` / `user.email`
5. 安装并检查 `git filter-repo`
6. 执行历史重写
7. 本地校验结果
8. 强推到 `github`
9. 视情况再同步到 `origin`

