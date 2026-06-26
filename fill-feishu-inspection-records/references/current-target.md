# Current Target

This skill is specialized to the current Sofunny Feishu inspection Bitable.

## Feishu objects

- App token: `RkjHbmzGDaO1DmsjmotcXZkLnch`
- Device table ID: `tblA1CEWAGTZf2t5`
- Inspection table ID: `tblpmImVP2ZyihTS`
- Daily device selection rule: use the current device table order's first `26` rows

## Inspection defaults

- `运行情况总结`: `正常`
- `设备外观`: `外观正常无损坏`
- `系统状态`: `系统运行正常、无异常告警`
- `网络状态`: `通讯正常不掉包`
- `日志分析`: `无异常告警`
- `巡检照片`: leave empty

## Important field behavior

- `点检人` is a Feishu `CreatedUser` system field.
- The skill must not try to set `点检人` to a specific person.
- When records are created through the app token flow, the creator is expected to be the app identity.

## Scope boundary

- This skill only creates daily inspection rows.
- This skill does not troubleshoot hidden records, view filters, screenshots, or abnormal issue follow-up.
- Secrets must come from environment variables:
  - `FEISHU_APP_ID`
  - `FEISHU_APP_SECRET`
