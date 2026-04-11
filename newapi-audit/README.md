# NewAPI SQL 日志账单审计向导 (AI Skill 集成版)

这是一个专门配合大语言模型 CLI（如 Claude Code、Codex 等）或人工交互使用的高效 SQL 流式抓取脚本。旨在通过 0 OOM（内存防爆） 的方式解析高达几个 GB 的 NewAPI 数据库备份，出具详细的 Token 和 美金($) 消耗账单。

## 模型环境兼容支持 (Agentic Rules)
在使用主流终端 AI 工具前，将该项目放入本地后，主控模型会自动吸收以下文件内的规则：
- **Claude Code**: 支持读取 `CLAUDE.md` 来指导 Claude 如何帮你查询。
- **Gemini / Codex**: 支持读取 `Codex.md` 指导行为。

## 目录结构
```text
/skills/newapi-audit/
├── newapi_audit_skill.py # 核心 Python 代码
├── CLAUDE.md             # 针对 Claude Code 终端的指令说明
├── Codex.md              # 针对 Codex/OpenCode 的运行约束
└── README.md             # 用户查看的使用文档（本文件）
```

## 使用建议
不需要再到代码里“写死”你的日志文件夹路径！直接使用 `-d` 或 `--dir` 指定参数传递路径。如果留空，它会默认扫描命令执行的「当前所在文件夹」。

**使用方法 1 (指定目录)**：
```powershell
python skills/newapi-audit/newapi_audit_skill.py -d "F:\NewAPI\newapi_log_file"
```

**使用方法 2 (直接在日志目录下启动)**：
```powershell
cd F:\NewAPI\newapi_log_file
python ../skills/newapi-audit/newapi_audit_skill.py
```