# Seedance Studio

Seedance Studio 是一个用于承载 Seedance 视频生成能力的服务端项目，提供 Web 页面、任务代理、历史留存、FTP 镜像和稳定下载链接。

本仓库现在只负责服务端与前端应用本身，不再内置独立维护的 `generate-seedance-video` 技能源码。技能已经拆分到单独仓库维护。

## 项目定位

这个项目负责：

- 提供 `http://localhost:3001` 或部署后的 Web 页面
- 代理调用上游 `NewAPI` 视频生成接口
- 轮询任务状态
- 把成功视频保存到服务器本地 `history/videos/`
- 把成功视频镜像到 FTP 目录
- 提供稳定的服务器本地下载链接和历史记录接口

这个项目不再负责：

- 在仓库内继续维护 `generate-seedance-video` 技能副本

## 关联技能仓库

独立技能仓库：

- `generate-seedance-video`
- Git 地址：`https://it-gitlab.xmfunny.com/zhongjinlin/generate-seedance-video.git`

如果你在 `Codex`、`opencode` 或其他代理环境中调用 Seedance 视频生成，请优先使用这个独立技能仓库，而不是在本项目中复制一份 `skills/generate-seedance-video`。

## 项目结构

```text
Seedance_Studio/
├── server.js
├── package.json
├── .env
├── .env.example
├── AGENTS.md
├── public/
├── history/
│   ├── videos/
│   └── records.json
└── DG/
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

创建 `.env`：

```env
NEWAPI_BASE_URL=https://your-newapi-host
SEEDANCE_MODEL=doubao-seedance-2-0-260128
LLM_MODEL=deepseek-v4-pro
PORT=3001
FTP_MIRROR_DIR=/data/ftp/seedance-studio
FTP_PUBLIC_BASE_URL=ftp://10.20.3.69/seedance-studio
```

### 3. 启动服务

```bash
npm start
```

启动后访问：

- `http://localhost:3001`

## 核心接口

### `POST /api/generate`

提交一个视频生成任务。

### `GET /api/task/:taskId`

轮询任务状态。

成功时可能返回：

- `local_result_url`
- `ftp_result_url`
- `result_url`

### `GET /api/history`

读取最近的历史记录。

### `GET /api/history/:taskId`

按任务编号读取单条历史记录。

### `GET /api/task-debug/:taskId`

读取上游原始返回，用于排障。

## 持久化与镜像逻辑

任务成功后，服务端会依次执行：

1. 从上游结果地址下载视频到 `history/videos/`
2. 把元数据写入 `history/records.json`
3. 如果配置了 `FTP_MIRROR_DIR`，再复制一份到 FTP 目录

因此你会同时看到三类地址：

- 上游返回的 `remoteUrl`
- 本地服务可访问的 `localUrl`
- FTP 镜像地址 `ftpUrl`

## 部署信息

当前线上部署形态：

- 项目目录：`/opt/seedance_studio`
- 服务名：`seedance-studio`
- 端口：`3001`
- FTP 根目录：`/data/ftp`
- FTP 镜像目录：`/data/ftp/seedance-studio`

常用命令：

```bash
systemctl status seedance-studio
systemctl restart seedance-studio
journalctl -u seedance-studio -f
systemctl status pure-ftpd
```

## 与技能仓库的关系

服务端项目与技能仓库的关系如下：

- `Seedance Studio` 提供服务能力
- `generate-seedance-video` 技能通过这个服务统一提交和轮询视频任务

推荐调用链路：

1. 代理客户端调用独立技能 `generate-seedance-video`
2. 技能调用 `Seedance Studio` 服务
3. 服务再去调用上游 `NewAPI`

## 常见问题

### 1. 为什么会看到 TOS 链接

因为上游生成平台会把结果先存到它自己的对象存储中，然后把远程地址返回给服务端。服务端只负责把这个远程结果下载回本地和 FTP。

### 2. 为什么前端显示超时，但后台已经扣费

这通常表示上游任务还在跑，或者已经成功但本地链接稍晚落盘。应优先检查：

- `/api/task/:taskId`
- `/api/task-debug/:taskId`
- `/api/history/:taskId`

### 3. 为什么不能自动直连上游再补一次

因为这样会触发第二次计费。当前逻辑明确禁止这种自动回退。
