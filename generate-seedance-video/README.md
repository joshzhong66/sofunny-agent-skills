# generate-seedance-video

`generate-seedance-video` 是一个独立维护的 Seedance 视频生成技能仓库，用于通过 `Seedance Studio` 服务统一提交视频任务、轮询结果、恢复超时任务，并返回服务器可访问的下载链接与 FTP 镜像链接。

## 仓库说明

这个仓库只维护技能本身，不负责承载 Web 服务。实际的视频生成服务由 `Seedance Studio` 项目提供。

当前默认服务地址：

- `http://10.20.3.69:3001`

适用场景：

- 需要通过技能统一调用 Seedance 视频生成
- 需要避免客户端直接调用上游 `NewAPI`
- 需要轮询长任务并恢复“前端超时、后台已成功”的情况
- 需要同时获得服务器本地链接、FTP 链接和调用方本地副本

## 目录结构

```text
generate-seedance-video/
├── SKILL.md
├── README.md
├── agents/
│   └── openai.yaml
├── references/
│   └── api.md
└── scripts/
    ├── generate-video.js
    ├── generate-video.ps1
    └── generate-video.sh
```

## 技能能力

- 通过 `Seedance Studio` 服务提交视频生成任务
- 轮询任务状态并返回最终结果
- 优先返回服务器本地下载链接
- 同时返回 FTP 镜像地址
- 支持把结果再下载到调用方当前项目的 `seedance-downloads/`
- 支持交互式补问缺失参数
- 支持环境变量注入常用参数

## 参数解析顺序

脚本按以下顺序解析参数：

1. 命令行参数
2. 环境变量
3. 交互式补问缺失字段
4. 非敏感可选项使用默认值

交互式补问只会在真实终端环境下触发。

## 支持的环境变量

- `SEEDANCE_STUDIO_API_KEY`
- `SEEDANCE_STUDIO_PROMPT`
- `SEEDANCE_STUDIO_SERVICE_URL`
- `SEEDANCE_STUDIO_API_URL`
- `SEEDANCE_STUDIO_MODEL`
- `SEEDANCE_STUDIO_DURATION`
- `SEEDANCE_STUDIO_ASPECT_RATIO`
- `SEEDANCE_STUDIO_RESOLUTION`
- `SEEDANCE_STUDIO_IMAGE_URL`
- `SEEDANCE_STUDIO_VIDEO_URL`
- `SEEDANCE_STUDIO_DOWNLOAD_DIR`
- `SEEDANCE_STUDIO_TIMEOUT_SECONDS`
- `SEEDANCE_STUDIO_POLL_INTERVAL_MS`
- `SEEDANCE_STUDIO_SKIP_PROJECT_DOWNLOAD`

## 使用方式

### 方式一：全参数调用

```bash
node scripts/generate-video.js \
  --api-key "sk-xxx" \
  --prompt "15秒电影感教室纯爱短片" \
  --service-url "http://10.20.3.69:3001" \
  --api-url "https://your-newapi-host" \
  --model "ep-20260618182255-cxtc2"
```

### 方式二：环境变量 + 自动补问

```bash
export SEEDANCE_STUDIO_API_KEY="sk-xxx"
export SEEDANCE_STUDIO_API_URL="https://your-newapi-host"
export SEEDANCE_STUDIO_MODEL="ep-20260618182255-cxtc2"

node scripts/generate-video.js
```

如果缺少 `prompt`、`duration`、`resolution` 等字段，脚本会只补问缺失项。

### 方式三：Windows PowerShell

```powershell
.\scripts\generate-video.ps1
```

也可以显式传参：

```powershell
.\scripts\generate-video.ps1 `
  -ApiKey "sk-xxx" `
  -Prompt "15秒电影感教室纯爱短片" `
  -ApiUrl "https://your-newapi-host" `
  -Model "ep-20260618182255-cxtc2"
```

### 方式四：macOS 或 Linux

```bash
./scripts/generate-video.sh --prompt "15秒电影感教室纯爱短片"
```

## 返回结果

成功后，脚本会输出 JSON，重点字段包括：

- `taskId`
- `status`
- `downloadUrl`
- `localUrl`
- `ftpUrl`
- `remoteUrl`
- `projectFile`

返回地址优先级：

1. `localUrl`
2. `ftpUrl`
3. `remoteUrl`

## 依赖关系

这个技能依赖外部 `Seedance Studio` 服务端项目：

- 服务项目：`seedance_studio`
- 默认接口地址：`http://10.20.3.69:3001`

如果你维护的是服务端项目，请确保：

- `/api/generate` 可提交任务
- `/api/task/:taskId` 可轮询任务
- `/api/history/:taskId` 可恢复落盘结果
- FTP 镜像目录权限正常

## 排障建议

### 1. 提示模型不可用

优先检查上游 `NewAPI` 是否真的挂载了对应视频渠道，而不是先怀疑技能本身。

### 2. 前端显示超时但后台有消费

不要立即重复提交。先检查：

- `/api/task/:taskId`
- `/api/task-debug/:taskId`
- `/api/history/:taskId`

### 3. 为什么会看到 TOS 链接

上游生成平台会把视频先存到其对象存储并返回 `remoteUrl`。技能会再通过服务端把视频下载到本地历史目录和 FTP 目录。

### 4. 为什么不能自动回退成直连上游

因为自动补一次直接 `POST /v1/video/generations` 会造成重复计费，所以这里明确禁止这种自动回退。

## 关联项目

这个技能默认配合以下项目使用：

- `Seedance Studio`：提供视频生成服务能力

如果你在 `Seedance Studio` 主项目中看到关联说明，应优先调用这个独立技能仓库，而不是再维护一份重复的 `skills/generate-seedance-video` 副本。
