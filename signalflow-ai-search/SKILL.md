---
name: signalflow-ai-search
description: >-
  小红书数据采集技能。通过 Apify SocialDataX Actor 执行笔记搜索、热榜查询、
  笔记详情、博主信息、评论采集。当用户需要搜索小红书内容、获取笔记数据、
  查看博主信息、采集评论时使用此技能。
---

# SignalFlow AI 搜索

## 对话流程

当用户使用此技能时，按以下步骤引导：

### 步骤 1：功能介绍

向用户介绍支持的能力：

| 功能 | 说明 |
|------|------|
| 笔记搜索 | 按关键词搜索笔记 |
| 热榜搜索 | 获取热门内容 |
| 笔记详情 | 获取单条笔记信息 |
| 博主信息 | 获取博主资料 |
| 博主笔记 | 获取博主的笔记列表 |
| 评论列表 | 获取笔记评论 |
| 评论回复 | 获取评论下的回复 |

### 步骤 2：选择采集功能

提供选项让用户选择采集功能。

### 步骤 3：收集参数

根据用户选择的功能，收集必要参数：

| 功能 | 必填参数 |
|------|----------|
| 笔记搜索 | `keyword`（搜索关键词） |
| 热榜搜索 | 无 |
| 笔记详情 | `note_id` 或 `note_url` |
| 博主信息 | `user_id` 或 `profile_url` |
| 博主笔记 | `user_id` 或 `profile_url` |
| 评论列表 | `note_id` 或 `note_url` |
| 评论回复 | `note_id` + `comment_id` |

### 步骤 4：执行采集

调用脚本执行采集：

```powershell
python scripts/socialdatax_skill.py run --operation <能力名> --field <参数>
```

示例：
```powershell
python scripts/socialdatax_skill.py run --operation search_notes --field keyword=旅行 --field max_items=5
```

### 步骤 5：展示结果

向用户展示采集结果摘要。

### 步骤 6：是否启动Web演示

提供选项让用户选择是否启动Web演示查看结果。

启动Web演示：
```powershell
python scripts/socialdatax_skill.py serve --open-browser
```

访问地址：http://127.0.0.1:8787

## 支持的能力

| 能力 | 用途 | 核心参数 |
|------|------|----------|
| `search_notes` | 笔记搜索 | `keyword` |
| `search_hot_list` | 热榜搜索 | 无必填 |
| `get_note_detail` | 笔记详情 | `note_id` 或 `note_url` |
| `get_user_info` | 博主信息 | `user_id` 或 `profile_url` |
| `list_user_notes` | 博主笔记列表 | `user_id` 或 `profile_url` |
| `get_note_comments` | 评论列表 | `note_id` 或 `note_url` |
| `get_note_sub_comments` | 评论回复 | `note_id` + `comment_id` |

## 意图映射

当用户没有明确指定能力时，按以下规则映射：

- 按关键词找内容 → `search_notes`
- 看热点内容 → `search_hot_list`
- 给了笔记ID或链接要详情 → `get_note_detail`
- 看某个博主 → `get_user_info` 或 `list_user_notes`
- 要评论 → `get_note_comments`
- 要评论下的回复 → `get_note_sub_comments`

## 手动执行

用户也可直接在终端运行向导：

```powershell
python scripts/wizard.py
```

或直接执行命令：

```powershell
# 检查配置
python scripts/socialdatax_skill.py show-config

# 列出能力
python scripts/socialdatax_skill.py list-operations

# 执行采集
python scripts/socialdatax_skill.py run --operation search_notes --field keyword=旅行

# 启动Web演示
python scripts/socialdatax_skill.py serve --open-browser
```

## 输出位置

采集结果保存到：

```
outputs/<operation>/<timestamp>-<run_id>/
├── run-summary.json
├── dataset-items.json
├── output-summary.json
└── preview-items.json
```

## 参考资料

按需读取：

- 配置详情：[references/configuration.md](references/configuration.md)
- 能力参数：[references/operations.md](references/operations.md)
- 架构说明：[references/architecture.md](references/architecture.md)

## 反模式清单

| 不要做 | 应该做 |
|--------|--------|
| 猜测 `keyword` 值 | 要求用户明确搜索关键词 |
| 在终端直接传中文参数 | 使用 `--fields-file` 读取 JSON 文件 |
| 跳过 validate 直接 run | 先校验再执行 |
| 替用户选择能力 | 根据意图映射规则选择，不确定时询问 |
| 一次性拉取大量数据 | 从小 `max_items` 开始，按需增加 |
| 在 body 中重复 references 的内容 | 引用链接，按需加载 |
| 后台静默执行 | 按对话流程一步步引导用户 |
