# Seedance Studio - 开发指南

## 项目概述

Seedance Studio 是一个轻量级的 Web UI，用于通过 NewAPI 代理服务生成 Seedance 2.0 视频。

## 技能拆分说明

`generate-seedance-video` 技能已经拆分到独立仓库维护：

- `https://it-gitlab.xmfunny.com/zhongjinlin/generate-seedance-video.git`

从现在开始：

1. 本项目只维护 Seedance Studio 服务端与前端代码
2. 需要调用技能时，应优先使用独立仓库中的 `generate-seedance-video`
3. 不要在本项目中重新添加或复制一份 `skills/generate-seedance-video`
4. 如果技能逻辑需要修改，应在独立技能仓库中完成，再由调用方引用

## 技术栈

- **后端**: Node.js + Express
- **前端**: 原生 HTML/CSS/JavaScript（无框架）
- **依赖**: express, multer, cors, dotenv

## 项目结构

```
Seedance_Studio/
├── server.js                 # Express 服务器，API 代理
├── package.json              # 项目配置
├── .env                      # 环境变量（本地配置）
├── .env.example              # 环境变量示例
├── .gitignore                # Git 忽略文件
├── AGENTS.md                 # 本文档
├── seedance2.ps1             # PowerShell 测试脚本
├── public/                   # 前端静态文件
│   ├── index.html            # 主页面
│   ├── css/style.css         # 样式文件
│   ├── js/app.js             # 前端逻辑
│   ├── templates/prompts.json # 提示词模板库
│   └── uploads/              # 上传文件存储
└── DG/                       # 设计文档和原型
    ├── 布局逻辑.txt
    ├── seedance_studio_mockup.html
    └── seedance_studio_v2_viewfinder.html
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 配置环境变量

复制 `.env.example` 为 `.env`，或直接编辑 `.env`：

```env
NEWAPI_BASE_URL=https://your-api-domain.com
SEEDANCE_MODEL=doubao-seedance-2-0-260128
LLM_MODEL=deepseek-v4-pro
PORT=3001
```

### 启动服务

```bash
npm start
# 或
node server.js
```

访问 http://localhost:3001

## API 端点

### 1. 文件上传

```
POST /api/upload
Content-Type: multipart/form-data

Body: file (图片或视频文件，最大 50MB)

Response: { url, dataUrl, mime }
```

### 2. 创建视频生成任务

```
POST /api/generate
Content-Type: application/json

Body:
{
  "apiKey": "sk-xxx",
  "prompt": "视频描述",
  "duration": 5,
  "aspectRatio": "16:9",
  "resolution": "1080p",
  "imageUrl": "data:...", // 可选
  "videoUrl": "data:...", // 可选
  "apiUrl": "https://...", // 可选，覆盖默认地址
  "model": "doubao-seedance-2-0-260128" // 可选，覆盖默认模型
}

Response: { id, task_id, object, model, status, progress, created_at }
```

### 3. 轮询任务状态

```
GET /api/task/:taskId?apiKey=sk-xxx&apiUrl=https://...

Response: {
  code: "success",
  data: {
    task_id: "task_xxx",
    status: "IN_PROGRESS" | "SUCCESS" | "FAILED",
    progress: "50%",
    result_url: "https://..." // 成功时返回
  }
}
```

### 4. AI 提示词扩写

```
POST /api/expand-prompt
Content-Type: application/json

Body:
{
  "apiKey": "sk-xxx",
  "prompt": "简短描述",
  "style": "cinematic", // 可选
  "apiUrl": "https://...", // 可选
  "model": "deepseek-v4-pro" // 可选
}

Response: { expanded: "扩写后的提示词" }
```

### 5. 获取提示词模板

```
GET /api/templates

Response: [{ id, title, desc, category, style, duration, prompt, ... }]
```

## 前端配置

前端配置保存在浏览器 localStorage 中：

| Key | 说明 |
|-----|------|
| `seedance_api_key` | API Key |
| `seedance_api_url` | NewAPI 地址 |
| `seedance_model` | 视频生成模型 |
| `seedance_llm_model` | AI 扩写模型 |

点击顶部栏的 ⚙️ 按钮可打开配置界面。

## 响应状态说明

### 视频生成任务状态

| 状态 | 说明 |
|------|------|
| `IN_PROGRESS` / `PENDING` | 生成中 |
| `SUCCESS` / `completed` | 成功 |
| `FAILED` / `error` | 失败 |

### 进度格式

API 返回的进度可能是：
- 字符串: `"50%"`
- 数字: `50`

前端已做兼容处理。

## 开发注意事项

### 添加新的 API 端点

1. 在 `server.js` 中添加路由
2. 支持 `apiUrl` 和 `model` 参数覆盖默认配置
3. 在 `public/js/app.js` 中添加调用逻辑

### 修改样式

- 主色调: `--teal: #2F4A46`
- 强调色: `--accent: #C53A28`
- 背景色: `--bg: #EDEEEC`

### 提示词模板

模板文件位于 `public/templates/prompts.json`，格式：

```json
{
  "id": "unique-id",
  "title": "模板标题",
  "desc": "描述",
  "category": "cinematic|anime|ugc|ad|meme",
  "style": "风格名称",
  "duration": 15,
  "featured": true,
  "author": "作者",
  "prompt": "提示词内容"
}
```

## 常见问题

### Q: 报错 "No available channel for model xxx"

A: 检查模型名称是否正确，确认 API 服务支持该模型。

### Q: 报错 "Invalid token"

A: 检查 API Key 是否正确，是否过期。

### Q: 报错 "Unexpected token '<'"

A: API 返回了 HTML 而非 JSON，通常是请求被拦截或路由错误。

### Q: 进度显示不更新

A: 检查 API 返回的 progress 格式，前端已兼容字符串和数字格式。
