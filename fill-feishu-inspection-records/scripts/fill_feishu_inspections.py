# -*- coding: utf-8 -*-
"""Fill Feishu Bitable inspection records with normal defaults."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any


API_ROOT = "https://open.feishu.cn/open-apis"

DEFAULT_APP_TOKEN = "RkjHbmzGDaO1DmsjmotcXZkLnch"
DEFAULT_DEVICE_TABLE_ID = "tblA1CEWAGTZf2t5"
DEFAULT_INSPECTION_TABLE_ID = "tblpmImVP2ZyihTS"
DEFAULT_DEVICE_COUNT = 26

FIELD_INSPECTION_POINT = "巡检点位选择"
FIELD_SUMMARY = "运行情况总结"
FIELD_APPEARANCE = "设备外观"
FIELD_SYSTEM = "系统状态"
FIELD_NETWORK = "网络状态"
FIELD_LOG = "日志分析"
FIELD_CREATOR = "点检人"
FIELD_CREATED_TIME = "点检时间"
FIELD_PROJECT = "巡检项目"
FIELD_DEVICE_NAME = "设备名称"
FIELD_DEVICE_TYPE = "设备类型"
FIELD_LOCATION = "当前位置"
FIELD_PHOTO = "巡检照片"

NORMAL_FIELDS = {
    FIELD_SUMMARY: "正常",
    FIELD_APPEARANCE: ["外观正常无损坏"],
    FIELD_SYSTEM: ["系统运行正常、无异常告警"],
    FIELD_NETWORK: ["通讯正常不掉包"],
    FIELD_LOG: ["无异常告警"],
}

CHINA_TZ = dt.timezone(dt.timedelta(hours=8), name="Asia/Shanghai")


class FeishuError(RuntimeError):
    pass


def request_json(
    method: str,
    url: str,
    token: str | None = None,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise FeishuError(f"HTTP {exc.code} from {url}: {error_body}") from exc

    result = json.loads(payload)
    if result.get("code") != 0:
        raise FeishuError(f"Feishu API error: code={result.get('code')}, msg={result.get('msg')}")
    return result


def get_tenant_access_token(app_id: str, app_secret: str) -> str:
    result = request_json(
        "POST",
        f"{API_ROOT}/auth/v3/tenant_access_token/internal",
        body={"app_id": app_id, "app_secret": app_secret},
    )
    return result["tenant_access_token"]


def bitable_records_url(app_token: str, table_id: str, suffix: str = "") -> str:
    return f"{API_ROOT}/bitable/v1/apps/{app_token}/tables/{table_id}/records{suffix}"


def get_all_records(token: str, app_token: str, table_id: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    page_token: str | None = None

    while True:
        query = {"page_size": "500"}
        if page_token:
            query["page_token"] = page_token
        url = bitable_records_url(app_token, table_id, "?" + urllib.parse.urlencode(query))
        result = request_json("GET", url, token=token)
        data = result["data"]
        records.extend(data.get("items", []))
        if not data.get("has_more"):
            return records
        page_token = data.get("page_token")


def get_record(token: str, app_token: str, table_id: str, record_id: str) -> dict[str, Any]:
    result = request_json("GET", bitable_records_url(app_token, table_id, f"/{record_id}"), token=token)
    return result["data"]["record"]


def create_records(
    token: str,
    app_token: str,
    table_id: str,
    device_record_ids: list[str],
) -> list[dict[str, Any]]:
    if not device_record_ids:
        return []

    records = []
    for device_record_id in device_record_ids:
        fields = {FIELD_INSPECTION_POINT: [device_record_id], **NORMAL_FIELDS}
        records.append({"fields": fields})

    query = urllib.parse.urlencode({"client_token": str(uuid.uuid4())})
    result = request_json(
        "POST",
        bitable_records_url(app_token, table_id, f"/batch_create?{query}"),
        token=token,
        body={"records": records},
    )
    return result["data"]["records"]


def display_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return ",".join(text for item in value if (text := display_text(item)))
    if isinstance(value, dict):
        for key in ("text", "name", "en_name", "id"):
            if value.get(key):
                return str(value[key])
        if value.get("users"):
            return ",".join(display_text(user) for user in value["users"])
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def linked_record_ids(value: Any) -> list[str]:
    record_ids: list[str] = []
    if not isinstance(value, list):
        return record_ids
    for item in value:
        if isinstance(item, str):
            record_ids.append(item)
        elif isinstance(item, dict):
            ids = item.get("record_ids")
            if isinstance(ids, list):
                record_ids.extend(str(record_id) for record_id in ids)
    return record_ids


def record_time_ms(record: dict[str, Any]) -> int | None:
    value = record.get("fields", {}).get(FIELD_CREATED_TIME)
    return value if isinstance(value, int) else None


def today_bounds_ms(now: dt.datetime | None = None) -> tuple[int, int]:
    now = now.astimezone(CHINA_TZ) if now else dt.datetime.now(CHINA_TZ)
    start = dt.datetime(now.year, now.month, now.day, tzinfo=CHINA_TZ)
    end = start + dt.timedelta(days=1)
    return int(start.timestamp() * 1000), int(end.timestamp() * 1000)


def format_time(value_ms: int | None) -> str:
    if not value_ms:
        return ""
    value = dt.datetime.fromtimestamp(value_ms / 1000, tz=dt.timezone.utc).astimezone(CHINA_TZ)
    return value.strftime("%Y-%m-%d %H:%M:%S")


def find_existing_today(records: list[dict[str, Any]], device_ids: set[str]) -> dict[str, dict[str, Any]]:
    start_ms, end_ms = today_bounds_ms()
    existing: dict[str, dict[str, Any]] = {}

    for record in records:
        fields = record.get("fields", {})
        created_ms = record_time_ms(record)
        if created_ms is None or not (start_ms <= created_ms < end_ms):
            continue
        for device_id in linked_record_ids(fields.get(FIELD_INSPECTION_POINT)):
            if device_id in device_ids and device_id not in existing:
                existing[device_id] = record
    return existing


def summarize_record(record: dict[str, Any]) -> dict[str, Any]:
    fields = record.get("fields", {})
    photo = fields.get(FIELD_PHOTO)
    return {
        "record_id": record.get("record_id") or record.get("id"),
        FIELD_CREATED_TIME: format_time(record_time_ms(record)),
        FIELD_PROJECT: display_text(fields.get(FIELD_PROJECT)),
        FIELD_DEVICE_NAME: display_text(fields.get(FIELD_DEVICE_NAME)),
        FIELD_CREATOR: display_text(fields.get(FIELD_CREATOR)),
        FIELD_SUMMARY: display_text(fields.get(FIELD_SUMMARY)),
        FIELD_APPEARANCE: display_text(fields.get(FIELD_APPEARANCE)),
        FIELD_SYSTEM: display_text(fields.get(FIELD_SYSTEM)),
        FIELD_NETWORK: display_text(fields.get(FIELD_NETWORK)),
        FIELD_LOG: display_text(fields.get(FIELD_LOG)),
        "照片数": 0 if photo is None else len(photo if isinstance(photo, list) else [photo]),
    }


def print_table(rows: list[dict[str, Any]]) -> None:
    if not rows:
        print("(no rows)")
        return

    headers = list(rows[0].keys())
    widths = {
        header: max(len(str(header)), *(len(str(row.get(header, ""))) for row in rows))
        for header in headers
    }

    print(" | ".join(str(header).ljust(widths[header]) for header in headers))
    print("-+-".join("-" * widths[header] for header in headers))
    for row in rows:
        print(" | ".join(str(row.get(header, "")).ljust(widths[header]) for header in headers))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fill Feishu inspection records with normal defaults.")
    parser.add_argument("--app-id", default=os.getenv("FEISHU_APP_ID"), help="Feishu app ID.")
    parser.add_argument("--app-secret", default=os.getenv("FEISHU_APP_SECRET"), help="Feishu app secret.")
    parser.add_argument("--app-token", default=DEFAULT_APP_TOKEN, help="Bitable app token.")
    parser.add_argument("--device-table-id", default=DEFAULT_DEVICE_TABLE_ID, help="Device table ID.")
    parser.add_argument("--inspection-table-id", default=DEFAULT_INSPECTION_TABLE_ID, help="Inspection table ID.")
    parser.add_argument("--device-count", type=int, default=DEFAULT_DEVICE_COUNT, help="Number of devices to fill.")
    parser.add_argument("--skip-devices", type=int, default=0, help="Skip N devices from the device table order.")
    parser.add_argument("--dry-run", action="store_true", help="Show selected devices without creating records.")
    parser.add_argument("--allow-duplicates", action="store_true", help="Create records even if today's records already exist.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.app_id or not args.app_secret:
        raise SystemExit("Missing FEISHU_APP_ID/FEISHU_APP_SECRET or --app-id/--app-secret.")

    token = get_tenant_access_token(args.app_id, args.app_secret)

    devices = get_all_records(token, args.app_token, args.device_table_id)
    selected = devices[args.skip_devices : args.skip_devices + args.device_count]
    if not selected:
        raise SystemExit("No devices selected. Check --skip-devices and --device-count.")

    preview_rows = []
    for index, device in enumerate(selected, start=1 + args.skip_devices):
        fields = device.get("fields", {})
        preview_rows.append(
            {
                "序号": index,
                "record_id": device.get("record_id") or device.get("id"),
                FIELD_DEVICE_NAME: display_text(fields.get(FIELD_DEVICE_NAME)),
                FIELD_DEVICE_TYPE: display_text(fields.get(FIELD_DEVICE_TYPE)),
                FIELD_LOCATION: display_text(fields.get(FIELD_LOCATION)),
            }
        )

    if args.dry_run:
        print_table(preview_rows)
        print(f"DRY_RUN_SELECTED={len(preview_rows)}")
        return 0

    selected_ids = [str(device.get("record_id") or device.get("id")) for device in selected]
    ids_to_create = selected_ids
    skipped_today = 0

    if not args.allow_duplicates:
        all_inspections = get_all_records(token, args.app_token, args.inspection_table_id)
        existing = find_existing_today(all_inspections, set(selected_ids))
        ids_to_create = [device_id for device_id in selected_ids if device_id not in existing]
        skipped_today = len(existing)
        if skipped_today:
            print(f"SKIPPED_EXISTING_TODAY={skipped_today}")

    created = create_records(token, args.app_token, args.inspection_table_id, ids_to_create)
    created_ids = [str(record["record_id"]) for record in created]

    verified_rows = [
        summarize_record(get_record(token, args.app_token, args.inspection_table_id, record_id))
        for record_id in created_ids
    ]

    print("Created records:")
    print_table(verified_rows)
    print(f"CREATED={len(created_ids)}")
    print(f"FIRST_RECORD_ID={created_ids[0] if created_ids else ''}")
    if skipped_today and not created_ids:
        print("STATUS=ALL_SKIPPED")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except FeishuError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
