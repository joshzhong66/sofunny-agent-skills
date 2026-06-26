# HappyHorse Seedance Studio 接口参考

## 支持的模型

| 模型 ID | 能力 | 输入 | 说明 |
|---------|------|------|------|
| `happyhorse-1.1-t2v` | Text to Video | 文本 | 文生视频（1.1版本，推荐） |
| `happyhorse-1.0-t2v` | Text to Video | 文本 | 文生视频（1.0版本） |
| `happyhorse-1.1-i2v` | Image to Video | 图片+Prompt | 图生视频（1.1版本，推荐） |
| `happyhorse-1.0-i2v` | Image to Video | 图片+Prompt | 图生视频（1.0版本） |
| `happyhorse-1.1-r2v` | Reference to Video | 图片/视频+Prompt | 参考生视频（1.1版本，推荐） |
| `happyhorse-1.0-r2v` | Reference to Video | 图片/视频+Prompt | 参考生视频（1.0版本） |
| `happyhorse-1.0-edit` | Video Editing | 视频+Prompt | 视频编辑 |

## 分辨率与时长

- 支持分辨率：720P、1080P
- 支持时长：3～15 秒
- 官方价格（720P）：￥0.90/秒
- 官方价格（1080P）：￥1.60/秒

## 接口总览

### `POST /api/generate`

通过本地 Seedance Studio 服务提交一个视频生成任务。

#### 文生视频请求体

```json
{
  "apiKey": "sk-xxx",
  "prompt": "一匹欢乐的小马在海边奔跑，电影感，黄昏光影",
  "duration": 5,
  "aspectRatio": "16:9",
  "resolution": "1080p",
  "apiUrl": "https://llm-api-proxy-prev.hnfunny.com",
  "model": "happyhorse-1.1-t2v"
}
```

#### 图生视频请求体

```json
{
  "apiKey": "sk-xxx",
  "prompt": "让图片中的小马跑起来",
  "imageUrl": "https://example.com/horse.jpg",
  "duration": 5,
  "aspectRatio": "16:9",
  "resolution": "1080p",
  "apiUrl": "https://llm-api-proxy-prev.hnfunny.com",
  "model": "happyhorse-1.1-i2v"
}
```

也支持 Base64 格式：

```json
{
  "apiKey": "sk-xxx",
  "prompt": "让图片中的小马跑起来",
  "imageUrl": "data:image/jpeg;base64,/9j/4AAQ...",
  "duration": 5,
  "model": "happyhorse-1.1-i2v"
}
```

#### 参考生视频请求体

```json
{
  "apiKey": "sk-xxx",
  "prompt": "生成类似风格的视频",
  "imageUrl": "https://example.com/reference.jpg",
  "duration": 5,
  "model": "happyhorse-1.1-r2v"
}
```

或使用视频作为参考：

```json
{
  "apiKey": "sk-xxx",
  "prompt": "生成类似风格的视频",
  "videoUrl": "https://example.com/reference.mp4",
  "duration": 5,
  "model": "happyhorse-1.1-r2v"
}
```

#### 视频编辑请求体

```json
{
  "apiKey": "sk-xxx",
  "prompt": "添加夕阳效果，让画面更温暖",
  "videoUrl": "https://example.com/original.mp4",
  "duration": 5,
  "model": "happyhorse-1.0-edit"
}
```

#### 请求参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| apiKey | string | ✅ | API 密钥 |
| prompt | string | ✅ | 视频生成提示词 |
| model | string | ❌ | 模型 ID，默认 `happyhorse-1.1-t2v` |
| duration | number | ❌ | 视频时长（3-15秒），默认 5 |
| aspectRatio | string | ❌ | 宽高比，默认 `16:9` |
| resolution | string | ❌ | 分辨率：`720p` 或 `1080p`，默认 `1080p` |
| apiUrl | string | ❌ | 上游 NewAPI 地址覆盖 |
| imageUrl | string | ❌ | 参考图片 URL 或 Base64（i2v/r2v 必填） |
| videoUrl | string | ❌ | 参考视频 URL 或 Base64（r2v/edit 必填） |

#### 成功响应

```json
{
  "task_id": "task_DUIYpBWZqECGPoSSIWMckhdCYwoAzbnH",
  "id": "task_DUIYpBWZqECGPoSSIWMckhdCYwoAzbnH",
  "object": "video",
  "model": "happyhorse-1.1-t2v",
  "status": "queued",
  "progress": 0,
  "created_at": 1782372416
}
```

### `GET /api/task/:taskId`

通过本地服务轮询任务状态。

查询参数：

- `apiKey`：必填
- `apiUrl`：可选，用于覆盖默认上游地址

成功时需要关注的字段：

- `data.status` 或 `status`
- `data.progress` 或 `progress`
- `data.result_url` 或同类上游结果地址
- `data.local_result_url`：优先交付的服务器本地下载链接
- `data.ftp_result_url`：如果启用了 FTP 镜像，对应 FTP 链接
- `data.ftp_result_path`：FTP 服务器上的实际路径

当前已识别的成功状态：

- `COMPLETED`
- `SUCCESS`
- `SUCCEEDED`
- `DONE`

需要继续轮询的状态：

- `PENDING`
- `IN_PROGRESS`
- `RUNNING`
- `NOT_START`
- `QUEUED`
- `SUBMITTED`

### `GET /api/task-debug/:taskId`

当普通轮询结果不明确时，用这个接口查看原始返回。

返回字段：

- `statusCode`
- `contentType`
- `body`

### `GET /api/history`

读取 `history/records.json` 中最近保存的历史记录。

### `GET /api/history/:taskId`

读取某个任务对应的一条已落盘历史记录。

### `GET /api/validate`

快速检查凭证和上游联通性。

## 结果返回优先级

1. `/api/task/:taskId` 中的 `local_result_url`
2. `/api/history/:taskId` 中的 `localUrl`
3. `ftp_result_url` 或 `ftpUrl`
4. 上游 `result_url` 或其他远程视频地址

## 环境变量

| 环境变量 | 说明 |
|----------|------|
| `HAPPYHORSE_API_KEY` | API 密钥 |
| `HAPPYHORSE_PROMPT` | 视频提示词 |
| `HAPPYHORSE_SERVICE_URL` | Seedance Studio 地址 |
| `HAPPYHORSE_API_URL` | 上游 NewAPI 地址 |
| `HAPPYHORSE_MODEL` | 模型 ID |
| `HAPPYHORSE_DURATION` | 视频时长 |
| `HAPPYHORSE_SIZE` | 分辨率 |
| `HAPPYHORSE_IMAGE_URL` | 参考图片 URL |
| `HAPPYHORSE_VIDEO_URL` | 参考视频 URL |
| `HAPPYHORSE_DOWNLOAD_DIR` | 下载目录 |
| `HAPPYHORSE_TIMEOUT_SECONDS` | 超时时间 |
| `HAPPYHORSE_POLL_INTERVAL_MS` | 轮询间隔 |
| `HAPPYHORSE_SKIP_PROJECT_DOWNLOAD` | 跳过本地下载 |

## 使用示例

### 文生视频

```bash
node scripts/generate-video.js \
  --api-key "sk-xxx" \
  --prompt "一匹欢乐的小马在海边奔跑" \
  --model "happyhorse-1.1-t2v" \
  --duration 5
```

### 图生视频

```bash
node scripts/generate-video.js \
  --api-key "sk-xxx" \
  --prompt "让图片中的小马跑起来" \
  --model "happyhorse-1.1-i2v" \
  --image-url "https://example.com/horse.jpg" \
  --duration 5
```

### 参考生视频

```bash
node scripts/generate-video.js \
  --api-key "sk-xxx" \
  --prompt "生成类似风格的视频" \
  --model "happyhorse-1.1-r2v" \
  --image-url "https://example.com/reference.jpg" \
  --duration 5
```

### 视频编辑

```bash
node scripts/generate-video.js \
  --api-key "sk-xxx" \
  --prompt "添加夕阳效果" \
  --model "happyhorse-1.0-edit" \
  --video-url "https://example.com/video.mp4" \
  --duration 5
```

## 超时处理

如果客户端看起来超时，但上游实际上已经消费：

1. 保留原始 `taskId`
2. 查询 `/api/task/:taskId`
3. 如果状态不明确，再查 `/api/task-debug/:taskId`
4. 最后再查 `/api/history/:taskId`

在完成这些检查前，不要重新提交第二个生成任务。
