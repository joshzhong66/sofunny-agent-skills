# HappyHorse 视频生成技能

通过 Seedance Studio 服务调用阿里 DashScope HappyHorse 全系列模型生成视频。

## 支持的模型

| 模型 ID | 能力 | 输入 |
|---------|------|------|
| `happyhorse-1.1-t2v` | 文生视频（推荐） | 文本 |
| `happyhorse-1.0-t2v` | 文生视频 | 文本 |
| `happyhorse-1.1-i2v` | 图生视频（推荐） | 图片+Prompt |
| `happyhorse-1.0-i2v` | 图生视频 | 图片+Prompt |
| `happyhorse-1.1-r2v` | 参考生视频（推荐） | 图片/视频+Prompt |
| `happyhorse-1.0-r2v` | 参考生视频 | 图片/视频+Prompt |
| `happyhorse-1.0-edit` | 视频编辑 | 视频+Prompt |

- 支持分辨率：720P、1080P
- 支持时长：3～15 秒

## 功能特性

- ✅ 支持文生视频、图生视频、参考生视频、视频编辑
- ✅ 通过 Seedance Studio 统一管理任务
- ✅ 服务器本地存储和 FTP 镜像
- ✅ 自动轮询任务状态
- ✅ 自动下载视频到本地项目
- ✅ 跨平台支持（Windows/macOS/Linux）
- ✅ 支持命令行参数和环境变量配置
- ✅ 交互式提示补全缺失参数
- ✅ 支持从历史记录恢复超时任务

## 快速开始

### 前置条件

- Node.js 18+ 
- 有效的中转平台 API Key
- Seedance Studio 服务运行中（默认 `http://10.20.3.69:3001`）

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

### 使用 PowerShell

```powershell
.\scripts\generate-video.ps1 -ApiKey "sk-xxx" -Prompt "你的提示词"
```

### 使用 Bash

```bash
./scripts/generate-video.sh --api-key "sk-xxx" --prompt "你的提示词"
```

### 环境变量方式

```bash
export HAPPYHORSE_API_KEY="sk-your-api-key"
export HAPPYHORSE_PROMPT="一匹欢乐的小马在海边奔跑"
export HAPPYHORSE_SERVICE_URL="http://10.20.3.69:3001"
export HAPPYHORSE_MODEL="happyhorse-1.1-t2v"

node scripts/generate-video.js
```

## 参数说明

| 参数 | 环境变量 | 必填 | 默认值 | 说明 |
|------|----------|------|--------|------|
| `--api-key` | `HAPPYHORSE_API_KEY` | ✅ | - | API 密钥 |
| `--prompt` | `HAPPYHORSE_PROMPT` | ✅ | - | 视频提示词 |
| `--service-url` | `HAPPYHORSE_SERVICE_URL` | ❌ | `http://10.20.3.69:3001` | Seedance Studio 地址 |
| `--api-url` | `HAPPYHORSE_API_URL` | ❌ | - | 上游 NewAPI 地址覆盖 |
| `--model` | `HAPPYHORSE_MODEL` | ❌ | `happyhorse-1.1-t2v` | 模型 ID |
| `--duration` | `HAPPYHORSE_DURATION` | ❌ | `5` | 视频时长（3-15秒） |
| `--size` | `HAPPYHORSE_SIZE` | ❌ | `1280*720` | 分辨率 |
| `--image-url` | `HAPPYHORSE_IMAGE_URL` | ❌ | - | 参考图片 URL（i2v/r2v） |
| `--video-url` | `HAPPYHORSE_VIDEO_URL` | ❌ | - | 参考视频 URL（r2v/edit） |
| `--download-dir` | `HAPPYHORSE_DOWNLOAD_DIR` | ❌ | `happyhorse-downloads` | 本地下载目录 |
| `--timeout-seconds` | `HAPPYHORSE_TIMEOUT_SECONDS` | ❌ | `600` | 超时时间（秒） |
| `--poll-interval-ms` | `HAPPYHORSE_POLL_INTERVAL_MS` | ❌ | `3000` | 轮询间隔（毫秒） |
| `--skip-project-download` | `HAPPYHORSE_SKIP_PROJECT_DOWNLOAD` | ❌ | `false` | 跳过本地下载 |
| `--list-models` | - | ❌ | - | 列出所有可用模型 |

## 列出可用模型

```bash
node scripts/generate-video.js --list-models
```

输出：

```
HappyHorse 视频生成模型列表：

模型 ID                    | 能力           | 输入要求
---------------------------|---------------|---------------------------
happyhorse-1.1-t2v        | 文生视频 1.1   | prompt
happyhorse-1.0-t2v        | 文生视频 1.0   | prompt
happyhorse-1.1-i2v        | 图生视频 1.1   | prompt, imageUrl
happyhorse-1.0-i2v        | 图生视频 1.0   | prompt, imageUrl
happyhorse-1.1-r2v        | 参考生视频 1.1 | prompt, imageUrl|videoUrl
happyhorse-1.0-r2v        | 参考生视频 1.0 | prompt, imageUrl|videoUrl
happyhorse-1.0-edit       | 视频编辑       | prompt, videoUrl
```

## 输出示例

成功时输出：

```json
{
  "taskId": "task_DUIYpBWZqECGPoSSIWMckhdCYwoAzbnH",
  "status": "SUCCESS",
  "downloadUrl": "http://10.20.3.69:3001/history/videos/2026-06-25_happyhorse_task_xxx.mp4",
  "localUrl": "http://10.20.3.69:3001/history/videos/2026-06-25_happyhorse_task_xxx.mp4",
  "ftpUrl": "ftp://10.20.3.69/seedance-studio/2026-06-25_happyhorse_task_xxx.mp4",
  "remoteUrl": "https://dashscope-a717.oss-accelerate.aliyuncs.com/xxx.mp4?...",
  "historyRecord": {...},
  "projectFile": "C:/Users/xxx/project/happyhorse-downloads/2026-06-25_happyhorse_task_xxx.mp4",
  "projectDownloadError": null
}
```

## 错误处理

| 错误信息 | 原因 | 解决方案 |
|----------|------|----------|
| `model_not_found` | 模型未配置 | 检查 NewAPI 是否配置了对应渠道 |
| `No available channel` | 无可用渠道 | 在 NewAPI 后台添加阿里通义千问渠道 |
| `requires --image-url` | 缺少图片参数 | 图生视频/参考生视频需要提供图片 URL |
| `requires --video-url` | 缺少视频参数 | 视频编辑/参考生视频需要提供视频 URL |
| `Invalid API key` | API Key 无效 | 检查 API Key 是否正确 |

## 架构说明

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  用户脚本        │────▶│  Seedance Studio │────▶│  NewAPI 中转平台 │
│  generate-video  │     │  10.20.3.69:3001 │     │  llm-api-proxy  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │                          │
                              ▼                          ▼
                        ┌──────────┐              ┌──────────────┐
                        │ 本地存储  │              │ DashScope    │
                        │ FTP 镜像  │              │ HappyHorse   │
                        └──────────┘              └──────────────┘
```

## NewAPI 中转平台配置

1. 创建渠道：类型选择 `阿里通义千问`
2. API 地址：`https://dashscope.aliyuncs.com`
3. 模型：添加所有需要的 HappyHorse 模型
4. 密钥：填入 DashScope API Key

## 许可证

MIT
