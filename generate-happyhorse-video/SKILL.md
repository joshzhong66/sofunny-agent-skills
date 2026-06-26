---
name: generate-happyhorse-video
description: 通过 Seedance Studio 服务提交 HappyHorse 视频生成任务，支持文生视频(t2v)、图生视频(i2v)、参考生视频(r2v)和视频编辑(edit)。返回服务器可访问的下载链接、FTP 链接和历史记录。
---

# HappyHorse 视频生成技能

当视频生成必须统一经过 Seedance Studio 服务时，使用这个技能。支持 HappyHorse 全系列模型。

## 支持的模型

| 模型 ID | 能力 | 输入 | 说明 |
|---------|------|------|------|
| `happyhorse-1.1-t2v` | Text to Video | 文本 | 文生视频（1.1版本） |
| `happyhorse-1.0-t2v` | Text to Video | 文本 | 文生视频（1.0版本） |
| `happyhorse-1.1-i2v` | Image to Video | 图片+Prompt | 图生视频（1.1版本） |
| `happyhorse-1.0-i2v` | Image to Video | 图片+Prompt | 图生视频（1.0版本） |
| `happyhorse-1.1-r2v` | Reference to Video | 图片/视频+Prompt | 参考生视频（1.1版本） |
| `happyhorse-1.0-r2v` | Reference to Video | 图片/视频+Prompt | 参考生视频（1.0版本） |
| `happyhorse-1.0-edit` | Video Editing | 视频+Prompt | 视频编辑 |

## 使用流程

1. 先确认服务地址。除非用户或环境明确指定，否则默认使用 `http://10.20.3.69:3001`。
2. 在构造请求、判断任务状态、排查超时之前，先阅读 [references/api.md](references/api.md)。
3. 默认使用跨平台脚本 `scripts/generate-video.js` 完成提交与轮询。
4. 在 Windows PowerShell 下需要壳层包装时，使用 `scripts/generate-video.ps1`。
5. 在 macOS 或 Linux 下需要壳层包装时，使用 `scripts/generate-video.sh`。
6. 如果上游报模型不可用，先检查 NewAPI 主机是否真的挂载了可用的 HappyHorse 视频渠道。
7. 返回结果时优先给服务器本地下载链接。先取 `/api/task/:taskId` 的 `local_result_url`，没有再回退到 `/api/history/:taskId`。
8. 如果启用了 FTP 镜像，同时返回 FTP 链接，保证服务器本地副本与 FTP 副本一起交付。
9. 除非调用方明确关闭，脚本默认还会把视频下载一份到调用方当前项目的 `happyhorse-downloads/` 目录。
10. 参数解析顺序固定为：命令行参数优先，其次环境变量，最后只对缺失字段发起交互补问。

## 模型选择指南

- **文生视频**：使用 `happyhorse-1.1-t2v` 或 `happyhorse-1.0-t2v`，只需 `prompt`
- **图生视频**：使用 `happyhorse-1.1-i2v` 或 `happyhorse-1.0-i2v`，需要 `prompt` + `--image-url`
- **参考生视频**：使用 `happyhorse-1.1-r2v` 或 `happyhorse-1.0-r2v`，需要 `prompt` + `--image-url` 或 `--video-url`
- **视频编辑**：使用 `happyhorse-1.0-edit`，需要 `prompt` + `--video-url`

## 必填项

- `apiKey`
- `prompt`

## 可选项

- `serviceUrl`
- `apiUrl`
- `model`
- `duration`
- `size`
- `imageUrl`（i2v/r2v 必填）
- `videoUrl`（r2v/edit 必填）
- `downloadDir`
- `skipProjectDownload`
- `timeoutSeconds`
- `pollIntervalMs`

## 恢复规则

1. 出错或超时后，不要自动切换模型重试。
2. 如果上游已经扣费但客户端超时，先检查 `/api/task-debug/:taskId` 和 `/api/history/:taskId`，再判断任务是否失败。
3. 如果轮询已经成功但还没有 `local_result_url`，先短暂等待，再查询 `/api/history/:taskId`，因为服务端是异步落盘。
4. 如果同时拿到了服务器链接和上游链接，两个都可以返回，但服务器链接必须作为主交付地址。
5. 如果启用了 FTP 镜像，把 FTP 链接作为次级交付方式一起返回。
6. 如果上游返回 `model_not_found`、`No available channel` 或同类错误，优先按 NewAPI 渠道或模型配置问题排查。

## 说明

1. 除非用户明确要求直连上游，否则始终把这个技能指向 Seedance Studio 服务，而不是直接调用提供方接口。
2. 后续轮询优先使用 `task_id`，不要依赖泛化的 `id`。
3. 端点字段、响应结构和排障细节统一以 [references/api.md](references/api.md) 为准。
4. 默认行为会在调用方当前项目下的 `happyhorse-downloads/` 里额外保留一份本地文件。
5. 对 opencode 或其他代理客户端来说，上游 API Key 和主机本身必须已经具备可用的 HappyHorse 视频渠道，这个技能不会绕过上游权限限制。
6. 如果服务调用失败，不要自动回退成第二次直接 `POST /v1/video/generations` 测试，否则会造成重复计费。应优先使用 `/api/task-debug/:taskId`、`/api/history/:taskId` 或一次人工验证来排障。

## 使用示例

### 文生视频

```bash
node scripts/generate-video.js \
  --api-key "sk-xxx" \
  --prompt "一匹欢乐的小马在海边奔跑，电影感，黄昏光影"
```

### 图生视频

```bash
node scripts/generate-video.js \
  --api-key "sk-xxx" \
  --prompt "让图片中的小马跑起来" \
  --model "happyhorse-1.1-i2v" \
  --image-url "https://example.com/horse.jpg"
```

### 参考生视频

```bash
node scripts/generate-video.js \
  --api-key "sk-xxx" \
  --prompt "生成类似风格的视频" \
  --model "happyhorse-1.1-r2v" \
  --image-url "https://example.com/reference.jpg"
```

### 视频编辑

```bash
node scripts/generate-video.js \
  --api-key "sk-xxx" \
  --prompt "添加夕阳效果" \
  --model "happyhorse-1.0-edit" \
  --video-url "https://example.com/video.mp4"
```

### 列出可用模型

```bash
node scripts/generate-video.js --list-models
```

## 输出结果

成功时返回：

```json
{
  "taskId": "task_xxx",
  "status": "SUCCESS",
  "downloadUrl": "http://10.20.3.69:3001/history/videos/xxx.mp4",
  "localUrl": "http://10.20.3.69:3001/history/videos/xxx.mp4",
  "ftpUrl": "ftp://10.20.3.69/seedance-studio/xxx.mp4",
  "remoteUrl": "https://dashscope-a717.oss-accelerate.aliyuncs.com/xxx.mp4?...",
  "projectFile": "C:/Users/xxx/project/happyhorse-downloads/xxx.mp4"
}
```

结果优先级：
1. `localUrl` - Seedance Studio 服务器本地链接（优先）
2. `ftpUrl` - FTP 镜像链接
3. `remoteUrl` - 上游 DashScope 原始链接

## 架构

```
用户脚本 ──▶ Seedance Studio (10.20.3.69:3001) ──▶ NewAPI 中转平台 ──▶ DashScope
                    │
                    ├── 本地存储: /opt/seedance_studio/history/videos/
                    └── FTP 镜像: /data/ftp/seedance-studio/
```

## 错误处理

| 错误信息 | 原因 | 解决方案 |
|----------|------|----------|
| `model_not_found` | 模型未配置 | 检查 NewAPI 是否配置了对应渠道 |
| `No available channel` | 无可用渠道 | 在 NewAPI 后台添加阿里通义千问渠道 |
| `requires --image-url` | 缺少图片参数 | 图生视频/参考生视频需要提供图片 URL |
| `requires --video-url` | 缺少视频参数 | 视频编辑/参考生视频需要提供视频 URL |
