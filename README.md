# Sofunny Agent Skills

AI Agent 技能集合，用于视频生成和数据采集任务。

## 目录结构

```
sofunny-agent-skills/
├── fill-feishu-inspection-records/ # 飞书巡检填报技能
├── generate-seedance-video/    # Seedance视频生成技能
├── generate-happyhorse-video/  # HappyHorse视频生成技能
├── Seedance_Studio/            # 视频生成Web UI服务
└── signalflow-ai-search/       # 小红书数据采集技能
```

## 技能介绍

### fill-feishu-inspection-records

飞书巡检填报技能，用于当前 Sofunny 飞书设备巡检多维表的当天批量填报。

**功能：**
- 按设备表当前顺序选取前 26 台设备
- 批量创建当天巡检记录
- 默认填写“正常”项并留空巡检照片
- 自动跳过当天已存在的重复记录

**使用方式：**
```bash
python scripts/fill_feishu_inspections.py
```

**预览模式：**
```bash
python scripts/fill_feishu_inspections.py --dry-run
```

### generate-seedance-video

Seedance 视频生成技能，通过 Seedance Studio 服务提交视频生成任务。

**功能：**
- 提交视频生成任务
- 轮询任务状态
- 返回服务器本地链接和 FTP 镜像链接
- 支持交互式补问缺失参数

**使用方式：**
```bash
node scripts/generate-video.js \
  --api-key "sk-xxx" \
  --prompt "15秒电影感教室纯爱短片" \
  --service-url "http://10.20.3.69:3001"
```

### generate-happyhorse-video

HappyHorse 视频生成技能，支持文生视频、图生视频、参考生视频和视频编辑。

**支持的模型：**
- `happyhorse-1.1-t2v` / `happyhorse-1.0-t2v` - 文生视频
- `happyhorse-1.1-i2v` / `happyhorse-1.0-i2v` - 图生视频
- `happyhorse-1.1-r2v` / `happyhorse-1.0-r2v` - 参考生视频
- `happyhorse-1.0-edit` - 视频编辑

**使用方式：**
```bash
# 文生视频
node scripts/generate-video.js \
  --api-key "sk-xxx" \
  --prompt "一匹欢乐的小马在海边奔跑"

# 图生视频
node scripts/generate-video.js \
  --api-key "sk-xxx" \
  --prompt "让图片中的小马跑起来" \
  --model "happyhorse-1.1-i2v" \
  --image-url "https://example.com/horse.jpg"
```

### Seedance_Studio

视频生成 Web UI 服务，提供前端界面和 API 代理。

**功能：**
- Web 页面界面
- 代理调用 NewAPI 视频生成接口
- 任务轮询和历史记录
- FTP 镜像和稳定下载链接

**快速开始：**
```bash
cd Seedance_Studio
npm install
npm start
# 访问 http://localhost:3001
```

**核心接口：**
- `POST /api/generate` - 提交视频生成任务
- `GET /api/task/:taskId` - 轮询任务状态
- `GET /api/history` - 获取历史记录

### signalflow-ai-search

小红书数据采集技能，通过 Apify SocialDataX Actor 采集小红书数据。

**功能：**
- 笔记搜索
- 热榜查询
- 笔记详情
- 博主信息
- 评论采集

**使用方式：**
```bash
python scripts/socialdatax_skill.py run --operation search_notes --field keyword=旅行
```

**Web 演示：**
```bash
python scripts/socialdatax_skill.py serve --open-browser
# 访问 http://127.0.0.1:8787
```

## 技能关联

```
generate-seedance-video (AI技能)
        ↓ 调用
Seedance_Studio (Web服务)
        ↓ 代理
NewAPI (上游接口)

generate-happyhorse-video (AI技能)
        ↓ 调用
Seedance_Studio (Web服务)
        ↓ 代理
NewAPI (上游接口) → DashScope
```

- `generate-seedance-video` 和 `generate-happyhorse-video` 是 AI 可调用的技能
- `Seedance_Studio` 是 Web UI 服务
- 技能通过服务提交和轮询视频任务

## 环境要求

- Python 3.x (`fill-feishu-inspection-records`, `signalflow-ai-search`)
- Node.js (Seedance_Studio)
- API Key (根据技能配置)

## 维护说明

- 根 `README.md` 是本仓库 skill 索引入口。
- 新增、删除或重命名 skill 时，必须同步更新目录树和技能介绍。
- 技能细节以各自目录下的 `SKILL.md` 为准，根 README 只保留索引和简述。

## 许可证

内部项目，仅供团队使用。
