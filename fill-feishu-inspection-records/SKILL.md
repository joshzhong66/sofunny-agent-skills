---
name: fill-feishu-inspection-records
description: Batch-create today's inspection records in the current Feishu Bitable device inspection workflow and fill the default "normal" values for each selected device. Use when the user asks to fill today's inspection records, re-run the daily Feishu inspection entry flow, or bulk-create the standard 26 device inspection rows in the current Sofunny Feishu inspection tables.
---

# Fill Feishu Inspection Records

Use this skill only for the current Sofunny Feishu inspection Bitable flow.

## Workflow

1. Confirm `FEISHU_APP_ID` and `FEISHU_APP_SECRET` are available in the environment before doing anything else.
2. Read [references/current-target.md](references/current-target.md) if table IDs, field semantics, or workflow boundaries are needed.
3. Run `python scripts/fill_feishu_inspections.py --dry-run` when the user wants a preview or when you need to confirm which devices will be filled.
4. Run `python scripts/fill_feishu_inspections.py` for the normal daily workflow.
5. Report `SKIPPED_EXISTING_TODAY`, `CREATED`, and `FIRST_RECORD_ID` from the script output.

## Defaults

- Fill the current device table order's first 26 devices.
- Write these fixed defaults:
  - `运行情况总结=正常`
  - `设备外观=外观正常无损坏`
  - `系统状态=系统运行正常、无异常告警`
  - `网络状态=通讯正常不掉包`
  - `日志分析=无异常告警`
- Leave `巡检照片` empty.
- Accept the app identity as the creator. Do not try to force a person into `点检人`.

## Duplicate Policy

- Default behavior must skip devices that already have an inspection record today.
- Use `--allow-duplicates` only when the user explicitly asks to refill or intentionally create another batch for the same day.

## Constraints

- Do not guess a different app, table, or device range.
- Do not rewrite the fill script ad hoc when the bundled script already covers the request.
- Do not mix screenshot upload, photo补填, abnormal issue handling, or view-filter troubleshooting into this skill.
- Do not treat this as a generic Feishu Bitable filler; it is specialized to the current inspection tables.

## Resources

- `scripts/fill_feishu_inspections.py`: deterministic daily fill script.
- `references/current-target.md`: current table IDs, field meanings, and workflow notes.
