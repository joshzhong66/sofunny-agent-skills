# 配置说明

## 配置文件优先级

脚本读取配置的顺序如下：

1. 环境变量
2. `skills/signalflow-ai-search/config.json`
3. `skills/signalflow-ai-search/.env`
4. 项目根目录 `.env`
5. 脚本默认值

standalone 模式下，优先依赖 skill 自带的 `config.json`。

## 推荐配置文件

优先在 skill 目录中维护：

- `skills/signalflow-ai-search/config.json`

可参考：

- `skills/signalflow-ai-search/assets/config-template.json`

## 支持字段

| 字段 | 含义 | 是否必需 | 默认值 |
| --- | --- | --- | --- |
| `apify_api_base` | Apify 官方 API 地址 | 否 | `https://api.apify.com/v2` |
| `apify_api_token` | Apify Token | 是 | 无 |
| `apify_actor_id` | SocialDataX Actor ID | 否 | `sUXx8U35FLlaweCWO` |
| `apify_default_dataset_id` | 默认 Dataset ID | 否 | 空 |
| `wait_for_finish` | 等待运行完成秒数 | 否 | `180` |
| `save_output_summary` | 是否保存 OUTPUT 摘要 | 否 | `true` |
| `save_preview_items` | 是否保存预览结果 | 否 | `true` |
| `output_dir` | 结果输出目录 | 否 | `outputs` |

## 环境变量名称

可直接配置为：

- `SIGNALFLOW_APIFY_API_BASE`
- `SIGNALFLOW_APIFY_API_TOKEN`
- `SIGNALFLOW_APIFY_ACTOR_ID`
- `SIGNALFLOW_APIFY_DEFAULT_DATASET_ID`
- `SIGNALFLOW_APIFY_WAIT_FOR_FINISH`
- `SIGNALFLOW_OUTPUT_DIR`

## 输出目录说明

如果 `output_dir` 是相对路径，则相对于 `config.json` 所在目录解析。

默认输出到：

- `skills/signalflow-ai-search/outputs/`

每次运行会生成：

- `<operation>/<timestamp>-<run_id>/run-summary.json`
- `<operation>/<timestamp>-<run_id>/dataset-items.json`
- `<operation>/<timestamp>-<run_id>/output-summary.json`
- `<operation>/<timestamp>-<run_id>/preview-items.json`

## 编码兼容说明

- 脚本按 `utf-8-sig` 读取 `.env` 和 JSON 文件，可兼容 Windows 带 BOM 的 UTF-8 文件
- 如果终端里直接传中文参数出现乱码，优先使用 `--fields-file` 读取 UTF-8 JSON 文件
