# 项目配置功能（copilot.json）

## 功能概述

Synapse 支持在项目根目录放置 `copilot.json` 配置文件，用于定义项目相关的快捷链接。这些链接会显示在主界面的窗口卡片中，点击可以快速跳转到：

- 代码仓库
- 构建流水线
- 项目文档
- 监控面板
- 日志系统
- 其他自定义链接

## 配置文件格式

### 文件名

`copilot.json`（放置在项目根目录）

### 完整示例

```json
{
  "version": "1.0",
  "links": [
    {
      "name": "code",
      "url": "https://github.com/username/repo"
    },
    {
      "name": "ipipeline",
      "url": "https://pipeline.example.com/project/123"
    },
    {
      "name": "docs",
      "url": "https://docs.example.com"
    },
    {
      "name": "monitor",
      "url": "https://jmx.example.com/dashboard"
    },
    {
      "name": "apm",
      "url": "https://apm.example.com/dashboard"
    },
    {
      "name": "logs",
      "url": "https://logs.example.com/search"
    }
  ]
}
```

## 字段说明

### 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `version` | string | 是 | 配置文件版本，当前为 "1.0" |
| `links` | array | 是 | 链接列表 |

### links 数组元素

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 显示名称（必须全局唯一） |
| `url` | string | 是 | 跳转地址（必须以 http:// 或 https:// 开头） |

**注意**：
- `name` 字段必须在配置文件中全局唯一，用作链接的标识符
- 鼠标悬停在链接按钮上时，会显示 `name` 的值

## 使用方法

1. **创建配置文件**
   - 在项目根目录创建 `copilot.json` 文件
   - 参考 `copilot.json.example` 模板填写内容

2. **添加终端窗口**
   - 在 Synapse 中添加该项目目录的终端窗口
   - 应用会自动扫描并读取 `copilot.json`

3. **查看和使用链接**
   - 在主界面的窗口卡片中，会显示配置的链接按钮
   - 点击链接按钮即可在默认浏览器中打开对应的 URL
   - 鼠标悬停在按钮上可以查看链接名称

## 注意事项

1. **文件位置**：`copilot.json` 必须放在项目根目录（即终端窗口的工作目录）

2. **URL 格式**：所有 URL 必须以 `http://` 或 `https://` 开头

3. **链接数量**：建议不超过 6 个链接，以保持界面简洁

4. **名称长度**：链接名称建议控制在 6 个字符以内，避免显示不全

5. **名称唯一性**：每个链接的 `name` 必须唯一，不能重复

6. **文件编码**：使用 UTF-8 编码保存文件

7. **JSON 格式**：确保 JSON 格式正确，可以使用在线工具验证

## 常见问题

### Q: 修改 copilot.json 后需要重启应用吗？

A: 需要重新添加终端窗口或重启应用才能加载新的配置。

### Q: 如果 copilot.json 格式错误会怎样？

A: 应用会忽略该配置文件，不会显示链接，但不影响终端的正常使用。控制台会输出警告信息。

### Q: 可以添加本地文件路径吗？

A: 目前只支持 HTTP/HTTPS URL，不支持本地文件路径。

### Q: 如果有重复的 name 会怎样？

A: 配置文件会被视为无效，不会加载任何链接。请确保每个 name 都是唯一的。

## 示例场景

### 场景 1：Spring Boot 微服务项目

```json
{
  "version": "1.0",
  "links": [
    {
      "name": "code",
      "url": "https://gitlab.company.com/microservices/user-service"
    },
    {
      "name": "ipipeline",
      "url": "https://jenkins.company.com/job/user-service"
    },
    {
      "name": "docs",
      "url": "https://api.company.com/user-service/swagger-ui.html"
    },
    {
      "name": "monitor",
      "url": "https://grafana.company.com/d/user-service"
    },
    {
      "name": "logs",
      "url": "https://kibana.company.com/app/discover?query=user-service"
    }
  ]
}
```

### 场景 2：前端项目

```json
{
  "version": "1.0",
  "links": [
    {
      "name": "code",
      "url": "https://github.com/company/admin-dashboard"
    },
    {
      "name": "ipipeline",
      "url": "https://vercel.com/company/admin-dashboard"
    },
    {
      "name": "docs",
      "url": "https://storybook.company.com/admin-dashboard"
    },
    {
      "name": "monitor",
      "url": "https://sentry.io/company/admin-dashboard"
    }
  ]
}
```

### 场景 3：简单项目

```json
{
  "version": "1.0",
  "links": [
    {
      "name": "code",
      "url": "https://github.com/username/project"
    },
    {
      "name": "docs",
      "url": "https://docs.project.com"
    }
  ]
}
```

## 最佳实践

1. **保持简洁**：只添加最常用的链接，避免信息过载
2. **命名清晰**：使用简短、易懂的名称（如"code"、"docs"、"监控"）
3. **统一风格**：在团队内统一链接的命名规范
4. **版本控制**：将 `copilot.json` 提交到代码仓库，方便团队共享
