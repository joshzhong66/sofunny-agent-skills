# 架构说明

## 产品层级

必须保持以下结构：

```text
AI搜索方案
└─ Apify API 方案
   ├─ 配置 Apify
   └─ SocialDataX XHS Data API
      ├─ 搜索与采集
      └─ 采集结果
```

## standalone skill 执行链路

当前 skill 采用独立运行架构：

```text
skill 配置
└─ socialdatax_skill.py
   ├─ 读取 config.json / .env / 环境变量
   ├─ 调用 Apify 官方 API
   ├─ 运行 SocialDataX Xiaohongshu XHS RedNote Actor
   ├─ 拉取 Dataset items
   ├─ 拉取 OUTPUT 摘要
   └─ 保存结果到 outputs/
```

## 与仓库后端的关系

当前 skill 的目标是可复制运行。

因此：

- 不依赖当前项目后端
- 不要求本地启动 `127.0.0.1:18000`
- 不要求访问仓库中的 FastAPI 接口

如果未来需要重新接回项目后端，应当作为额外模式，而不是覆盖 standalone 默认行为。

## 输出结构

每次采集默认保存到：

```text
outputs/
└─ <operation>/
   └─ <timestamp>-<run_id>/
      ├─ run-summary.json
      ├─ dataset-items.json
      ├─ output-summary.json
      └─ preview-items.json
```

## 前端结构说明

当任务涉及当前仓库前端页面时，仍然保持以下页面拆分：

- `/apify/config`
- `/apify/socialdatax-xhs/search`
- `/apify/socialdatax-xhs/results`

不要把这些路由重新合并成单页面。
