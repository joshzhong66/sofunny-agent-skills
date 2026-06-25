from __future__ import annotations

import argparse
import json
import os
import socketserver
import sys
import threading
import webbrowser
from dataclasses import dataclass
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from typing import Any
from urllib import error, parse, request


DEFAULT_ACTOR_ID = "sUXx8U35FLlaweCWO"
DEFAULT_API_BASE = "https://api.apify.com/v2"
DEFAULT_WAIT_FOR_FINISH = 180
DEFAULT_OUTPUT_DIRNAME = "outputs"
DEFAULT_WEB_HOST = "127.0.0.1"
DEFAULT_WEB_PORT = 8787


def get_skill_dir() -> Path:
    """Get skill directory, supporting environment variable override."""
    env_dir = os.getenv("SIGNALFLOW_SKILL_DIR")
    if env_dir:
        return Path(env_dir)
    # Check if current working directory has config.json
    cwd = Path.cwd()
    if (cwd / "config.json").exists():
        return cwd
    # Fallback to script location
    return Path(__file__).resolve().parents[1]


SKILL_DIR = get_skill_dir()
PROJECT_ROOT = SKILL_DIR.parents[1]
FRONTEND_DIR = SKILL_DIR / "frontend"


def configure_stdio() -> None:
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except (TypeError, ValueError, OSError):
                pass


NOTE_FIELDS = [
    "operation",
    "item_index",
    "query_keyword",
    "note_id",
    "note_url",
    "note_type",
    "title",
    "summary",
    "author_user_id",
    "author_name",
    "like_count",
    "collect_count",
    "comment_count",
    "page_request_index",
    "page_item_count",
    "page_has_more",
]
COMMENT_FIELDS = [
    "operation",
    "item_index",
    "query_note_id",
    "query_page_token",
    "query_max_items",
    "query_auto_paginate",
    "comment_id",
    "note_id",
    "content",
    "content_type",
    "image_items",
    "publish_time",
    "like_count",
    "reply_count",
    "parent_comment_id",
    "is_pinned",
    "is_author_comment",
    "ip_location",
    "author_user_id",
    "author_name",
    "author_avatar_url",
    "author_profile_url",
    "author_red_id",
    "page_request_index",
    "page_item_count",
    "page_next_page_token",
    "page_comment_count",
    "page_top_level_comment_count",
    "page_has_more",
]

OPERATIONS: dict[str, dict[str, Any]] = {
    "search_notes": {
        "label": "笔记搜索",
        "description": "按关键词搜索小红书笔记。",
        "required_fields": ["keyword"],
        "optional_fields": ["page", "sort_type", "note_type", "publish_time_range", "max_items", "auto_paginate"],
        "defaults": {
            "page": 1,
            "sort_type": "general",
            "note_type": "all",
            "publish_time_range": "all",
            "max_items": 20,
            "auto_paginate": True,
        },
        "field_help": {
            "keyword": "要搜索的关键词，例如“独居生活”或“露营”。",
            "page": "搜索页码，从 1 开始。",
            "sort_type": "可选 general、time_descending、like_count_descending、comment_count_descending、collect_count_descending。",
            "note_type": "可选 all、image、video。",
            "publish_time_range": "可选 all、day、week、half_year。",
            "max_items": "最多返回多少条数据，建议先用较小值测试。",
            "auto_paginate": "是否自动翻页直到达到 max_items。",
        },
    },
    "search_hot_list": {
        "label": "热榜搜索",
        "description": "抓取热榜内容。",
        "required_fields": [],
        "optional_fields": ["max_items"],
        "defaults": {"max_items": 20},
        "field_help": {"max_items": "最多返回多少条热榜结果。"},
    },
    "get_note_detail": {
        "label": "笔记详情",
        "description": "按笔记 ID 或笔记链接读取单条笔记详情。",
        "required_one_of": [["note_id", "note_url"]],
        "optional_fields": [],
        "defaults": {},
        "field_help": {
            "note_id": "笔记 ID，与 note_url 二选一至少提供一个。",
            "note_url": "笔记链接，与 note_id 二选一至少提供一个。",
        },
    },
    "get_user_info": {
        "label": "博主信息",
        "description": "按用户 ID 或主页链接获取博主资料。",
        "required_one_of": [["user_id", "profile_url"]],
        "optional_fields": [],
        "defaults": {},
        "field_help": {
            "user_id": "博主用户 ID，与 profile_url 二选一至少提供一个。",
            "profile_url": "博主主页链接，与 user_id 二选一至少提供一个。",
        },
    },
    "list_user_notes": {
        "label": "博主笔记列表",
        "description": "获取某个博主的笔记列表。",
        "required_one_of": [["user_id", "profile_url"]],
        "optional_fields": ["page_token", "max_items", "auto_paginate"],
        "defaults": {"max_items": 20, "auto_paginate": True},
        "field_help": {
            "user_id": "博主用户 ID，与 profile_url 二选一至少提供一个。",
            "profile_url": "博主主页链接，与 user_id 二选一至少提供一个。",
            "page_token": "上一页返回的 next_page_token，第一页可留空。",
            "max_items": "最多抓取多少条博主笔记。",
            "auto_paginate": "是否自动翻页。",
        },
    },
    "get_note_comments": {
        "label": "评论列表",
        "description": "获取某条笔记的评论列表。",
        "required_one_of": [["note_id", "note_url"]],
        "optional_fields": ["page_token", "max_items", "auto_paginate"],
        "defaults": {"max_items": 20, "auto_paginate": True},
        "field_help": {
            "note_id": "笔记 ID，与 note_url 二选一至少提供一个。",
            "note_url": "笔记链接，与 note_id 二选一至少提供一个。",
            "page_token": "上一页返回的 next_page_token，第一页可留空。",
            "max_items": "最多抓取多少条评论。",
            "auto_paginate": "是否自动翻页。",
        },
    },
    "get_note_sub_comments": {
        "label": "评论回复",
        "description": "获取某条一级评论下的回复。",
        "required_fields": ["note_id", "comment_id"],
        "optional_fields": ["page_token", "max_items", "auto_paginate"],
        "defaults": {"max_items": 20, "auto_paginate": True},
        "field_help": {
            "note_id": "笔记 ID。",
            "comment_id": "一级评论 ID。",
            "page_token": "上一页返回的 next_page_token，第一页可留空。",
            "max_items": "最多抓取多少条回复。",
            "auto_paginate": "是否自动翻页。",
        },
    },
}
ACTOR_FORM = {
    "actor_id": DEFAULT_ACTOR_ID,
    "actor_title": "小红书数据 API | SocialDataX Xiaohongshu XHS RedNote",
    "actor_description": "社媒数据助手 SocialDataX 的只读小红书数据 API。持续使用需要 Apify 付费计划；免费计划仅有少量试用次数。",
    "fields": [
        {
            "key": "operation",
            "label": "操作类型",
            "type": "select",
            "required": True,
            "default": "search_notes",
            "options": [
                {"value": "search_notes", "label": "笔记搜索"},
                {"value": "search_hot_list", "label": "搜索热榜"},
                {"value": "get_note_detail", "label": "笔记详情"},
                {"value": "get_user_info", "label": "博主信息"},
                {"value": "list_user_notes", "label": "博主笔记列表"},
                {"value": "get_note_comments", "label": "评论列表"},
                {"value": "get_note_sub_comments", "label": "评论回复"},
            ],
            "help_text": "先选择 operation，再填写该 operation 需要的字段。",
        },
        {
            "key": "keyword",
            "label": "关键词",
            "type": "text",
            "section": "笔记搜索",
            "default": "露营",
            "help_text": "仅笔记搜索时必填。",
            "visible_for": ["search_notes"],
            "required_for": ["search_notes"],
        },
        {
            "key": "page",
            "label": "搜索页码",
            "type": "number",
            "section": "笔记搜索",
            "default": 1,
            "min": 1,
            "help_text": "仅笔记搜索时使用，从 1 开始。",
            "visible_for": ["search_notes"],
        },
        {
            "key": "sort_type",
            "label": "排序方式",
            "type": "select",
            "section": "笔记搜索",
            "default": "general",
            "options": [
                {"value": "general", "label": "综合"},
                {"value": "time_descending", "label": "最新"},
                {"value": "like_count_descending", "label": "最多点赞"},
                {"value": "comment_count_descending", "label": "最多评论"},
                {"value": "collect_count_descending", "label": "最多收藏"},
            ],
            "help_text": "仅笔记搜索时使用。",
            "visible_for": ["search_notes"],
        },
        {
            "key": "note_type",
            "label": "笔记类型",
            "type": "select",
            "section": "笔记搜索",
            "default": "all",
            "options": [
                {"value": "all", "label": "不限"},
                {"value": "image", "label": "图文"},
                {"value": "video", "label": "视频"},
            ],
            "help_text": "仅笔记搜索时使用。",
            "visible_for": ["search_notes"],
        },
        {
            "key": "publish_time_range",
            "label": "发布时间",
            "type": "select",
            "section": "笔记搜索",
            "default": "all",
            "options": [
                {"value": "all", "label": "不限"},
                {"value": "day", "label": "一天内"},
                {"value": "week", "label": "一周内"},
                {"value": "half_year", "label": "半年内"},
            ],
            "help_text": "仅笔记搜索时使用。",
            "visible_for": ["search_notes"],
        },
        {
            "key": "note_id",
            "label": "笔记 ID",
            "type": "text",
            "section": "笔记与评论",
            "help_text": "笔记详情、评论列表、评论回复时使用。详情和评论列表至少提供 note_id 或 note_url 之一。",
            "visible_for": ["get_note_detail", "get_note_comments", "get_note_sub_comments"],
            "required_for": ["get_note_sub_comments"],
        },
        {
            "key": "note_url",
            "label": "笔记链接",
            "type": "text",
            "section": "笔记与评论",
            "help_text": "支持小红书笔记链接、短链接或分享文案。评论回复不使用 note_url。",
            "visible_for": ["get_note_detail", "get_note_comments"],
        },
        {
            "key": "user_id",
            "label": "用户 ID",
            "type": "text",
            "section": "博主信息",
            "help_text": "博主信息、博主笔记列表至少提供 user_id 或 profile_url 之一。",
            "visible_for": ["get_user_info", "list_user_notes"],
        },
        {
            "key": "profile_url",
            "label": "主页链接",
            "type": "text",
            "section": "博主信息",
            "help_text": "支持主页链接、短链接或分享文案。",
            "visible_for": ["get_user_info", "list_user_notes"],
        },
        {
            "key": "comment_id",
            "label": "一级评论 ID",
            "type": "text",
            "section": "笔记与评论",
            "help_text": "仅评论回复时必填，先从评论列表结果中复制有 reply_count 的 comment_id。",
            "visible_for": ["get_note_sub_comments"],
            "required_for": ["get_note_sub_comments"],
        },
        {
            "key": "page_token",
            "label": "分页令牌",
            "type": "text",
            "section": "分页与导出",
            "help_text": "继续翻页时传入上一页返回的 next_page_token。第一页留空。",
            "visible_for": ["get_note_comments", "get_note_sub_comments", "list_user_notes"],
        },
        {
            "key": "max_items",
            "label": "最大结果数",
            "type": "number",
            "section": "分页与导出",
            "default": 20,
            "min": 1,
            "max": 500,
            "help_text": "建议先用较小值测试，值越大越可能触发更多请求和费用。",
            "visible_for": ["search_notes", "search_hot_list", "list_user_notes", "get_note_comments", "get_note_sub_comments"],
        },
        {
            "key": "auto_paginate",
            "label": "自动翻页",
            "type": "boolean",
            "section": "分页与导出",
            "default": True,
            "help_text": "开启后会继续请求下一页，直到达到 max_items 或没有更多结果。",
            "visible_for": ["search_notes", "list_user_notes", "get_note_comments", "get_note_sub_comments"],
        },
    ],
}


@dataclass
class RunArtifacts:
    result: dict[str, Any]
    items: list[dict[str, Any]]
    output_summary: dict[str, Any] | None


def load_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    text = path.read_text(encoding="utf-8-sig")
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def load_json_file(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8-sig"))


def parse_bool(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
    return bool(value)


def parse_int(value: Any, default: int) -> int:
    if value in ("", None):
        return default
    return int(value)


def resolve_output_dir(config_path: Path, raw_value: str | None) -> Path:
    if raw_value:
        candidate = Path(raw_value)
        if not candidate.is_absolute():
            # First try relative to current working directory
            cwd_candidate = Path.cwd() / candidate
            if cwd_candidate.exists():
                return cwd_candidate.resolve()
            # Fallback to relative to config file directory
            candidate = config_path.parent / candidate
        return candidate.resolve()
    return (SKILL_DIR / DEFAULT_OUTPUT_DIRNAME).resolve()


def find_config() -> dict[str, Any]:
    skill_config_path = SKILL_DIR / "config.json"
    skill_env_path = SKILL_DIR / ".env"
    project_env_path = PROJECT_ROOT / ".env"

    skill_json = load_json_file(skill_config_path)
    skill_env = load_env_file(skill_env_path)
    project_env = load_env_file(project_env_path)

    output_dir = resolve_output_dir(
        skill_config_path,
        os.getenv("SIGNALFLOW_OUTPUT_DIR")
        or skill_json.get("output_dir")
        or skill_env.get("OUTPUT_DIR")
        or project_env.get("SIGNALFLOW_OUTPUT_DIR"),
    )

    return {
        "apify_api_base": os.getenv("SIGNALFLOW_APIFY_API_BASE")
        or skill_json.get("apify_api_base")
        or skill_env.get("APIFY_API_BASE")
        or project_env.get("APIFY_API_BASE")
        or DEFAULT_API_BASE,
        "apify_api_token": os.getenv("SIGNALFLOW_APIFY_API_TOKEN")
        or skill_json.get("apify_api_token")
        or skill_env.get("APIFY_API_TOKEN")
        or project_env.get("APIFY_API_TOKEN")
        or "",
        "apify_actor_id": os.getenv("SIGNALFLOW_APIFY_ACTOR_ID")
        or skill_json.get("apify_actor_id")
        or skill_env.get("APIFY_ACTOR_ID")
        or project_env.get("APIFY_ACTOR_ID")
        or DEFAULT_ACTOR_ID,
        "apify_default_dataset_id": os.getenv("SIGNALFLOW_APIFY_DEFAULT_DATASET_ID")
        or skill_json.get("apify_default_dataset_id")
        or skill_env.get("APIFY_DEFAULT_DATASET_ID")
        or project_env.get("APIFY_DEFAULT_DATASET_ID")
        or "",
        "wait_for_finish": parse_int(
            os.getenv("SIGNALFLOW_APIFY_WAIT_FOR_FINISH")
            or skill_json.get("wait_for_finish")
            or skill_env.get("WAIT_FOR_FINISH"),
            DEFAULT_WAIT_FOR_FINISH,
        ),
        "save_output_summary": parse_bool(
            os.getenv("SIGNALFLOW_SAVE_OUTPUT_SUMMARY")
            or skill_json.get("save_output_summary")
            or skill_env.get("SAVE_OUTPUT_SUMMARY"),
            True,
        ),
        "save_preview_items": parse_bool(
            os.getenv("SIGNALFLOW_SAVE_PREVIEW_ITEMS")
            or skill_json.get("save_preview_items")
            or skill_env.get("SAVE_PREVIEW_ITEMS"),
            True,
        ),
        "output_dir": str(output_dir),
        "skill_config_path": str(skill_config_path),
        "skill_env_path": str(skill_env_path),
        "project_env_path": str(project_env_path),
    }


def get_operation_schema(operation: str) -> dict[str, Any]:
    if operation not in OPERATIONS:
        raise SystemExit(f"不支持的能力：{operation}")
    return OPERATIONS[operation]


def normalize_value(value: str) -> Any:
    lowered = value.lower()
    if lowered in {"true", "false"}:
        return lowered == "true"
    if value.isdigit():
        return int(value)
    return value


def parse_fields(items: list[str]) -> dict[str, Any]:
    parsed: dict[str, Any] = {}
    for item in items:
        if "=" not in item:
            raise SystemExit(f"字段参数格式错误：{item}，应为 key=value")
        key, value = item.split("=", 1)
        parsed[key.strip()] = normalize_value(value.strip())
    return parsed


def load_fields_file(path: str | None) -> dict[str, Any]:
    if not path:
        return {}
    file_path = Path(path)
    if not file_path.is_absolute():
        file_path = Path.cwd() / file_path
    if not file_path.exists():
        raise SystemExit(f"字段文件不存在：{file_path}")
    data = json.loads(file_path.read_text(encoding="utf-8-sig"))
    if not isinstance(data, dict):
        raise SystemExit("字段文件必须是 JSON 对象")
    return data


def build_input(operation: str, user_fields: dict[str, Any]) -> dict[str, Any]:
    schema = get_operation_schema(operation)
    payload = {"operation": operation}
    payload.update(schema.get("defaults", {}))
    payload.update({key: value for key, value in user_fields.items() if value not in ("", None)})
    validate_input(operation, payload)
    return payload


def validate_input(operation: str, payload: dict[str, Any]) -> None:
    schema = get_operation_schema(operation)
    for field in schema.get("required_fields", []):
        value = payload.get(field)
        if value in ("", None):
            raise SystemExit(f"能力“{schema['label']}”缺少必填参数：{field}")
    for field_group in schema.get("required_one_of", []):
        if not any(payload.get(field) not in ("", None) for field in field_group):
            raise SystemExit(f"能力“{schema['label']}”至少需要提供以下其中一个参数：{' / '.join(field_group)}")


def apify_headers(token: str, with_json: bool = False) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {token}"}
    if with_json:
        headers["Content-Type"] = "application/json"
    return headers


def call_json(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    params: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
    timeout: int = 180,
) -> Any:
    body = None
    request_headers = dict(headers or {})
    if params:
        url = f"{url}?{parse.urlencode(params, doseq=True)}"
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")
    req = request.Request(url, data=body, headers=request_headers, method=method.upper())
    try:
        with request.urlopen(req, timeout=timeout) as response:
            text = response.read().decode("utf-8")
            return json.loads(text) if text else None
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"请求失败：HTTP {exc.code} {detail}") from exc
    except error.URLError as exc:
        raise SystemExit(f"请求失败：{exc.reason}") from exc


def get_response_data(payload: Any) -> Any:
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload


def fetch_actor_meta(api_base: str, token: str, actor_id: str) -> dict[str, Any]:
    payload = call_json("GET", f"{api_base}/acts/{actor_id}", headers=apify_headers(token), timeout=45)
    data = get_response_data(payload)
    if not isinstance(data, dict):
        raise SystemExit("Apify Actor 元数据格式异常")
    return data


def run_actor(api_base: str, token: str, actor_id: str, actor_input: dict[str, Any], wait_for_finish: int) -> dict[str, Any]:
    payload = call_json(
        "POST",
        f"{api_base}/acts/{actor_id}/runs",
        headers=apify_headers(token, with_json=True),
        params={"waitForFinish": wait_for_finish},
        data=actor_input,
        timeout=wait_for_finish + 30,
    )
    data = get_response_data(payload)
    if not isinstance(data, dict):
        raise SystemExit("Apify Actor 运行结果格式异常")
    return data


def fetch_dataset_items(api_base: str, token: str, dataset_id: str, limit: int | None = None) -> list[dict[str, Any]]:
    params: dict[str, Any] = {"clean": "true", "format": "json"}
    if limit:
        params["limit"] = limit
    data = call_json("GET", f"{api_base}/datasets/{dataset_id}/items", headers=apify_headers(token), params=params, timeout=90)
    if not isinstance(data, list):
        raise SystemExit("Apify Dataset 返回的不是 JSON 数组")
    return [item for item in data if isinstance(item, dict)]


def fetch_output_summary(api_base: str, token: str, key_value_store_id: str | None) -> dict[str, Any] | None:
    if not key_value_store_id:
        return None
    try:
        data = call_json(
            "GET",
            f"{api_base}/key-value-stores/{key_value_store_id}/records/OUTPUT",
            headers=apify_headers(token),
            timeout=30,
        )
    except SystemExit as exc:
        if "HTTP 404" in str(exc):
            return None
        raise
    return data if isinstance(data, dict) else None


def extract_warning_messages(output_summary: dict[str, Any] | None) -> list[str]:
    if not output_summary:
        return []
    warnings = output_summary.get("warnings", [])
    if not isinstance(warnings, list):
        return []
    return [str(item) for item in warnings if item]


def ensure_output_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def make_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def mask_token(token: str) -> str:
    if not token:
        return ""
    if len(token) <= 10:
        return "*" * len(token)
    return f"{token[:8]}...{token[-4:]}"


def normalize_note(item: dict[str, Any]) -> dict[str, Any]:
    return {field: item.get(field) for field in NOTE_FIELDS}


def normalize_comment(item: dict[str, Any]) -> dict[str, Any]:
    return {field: item.get(field) for field in COMMENT_FIELDS}


def save_current_notes(output_dir: Path, dataset_id: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    normalized_items = [normalize_note(item) for item in items]
    payload = {
        "dataset_id": dataset_id,
        "item_count": len(normalized_items),
        "fields": NOTE_FIELDS,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "items": normalized_items,
    }
    write_json(output_dir / "processed" / "current-notes.json", payload)
    write_json(output_dir / "raw" / f"{dataset_id}.json", items)
    return payload


def read_current_notes(output_dir: Path) -> dict[str, Any]:
    path = output_dir / "processed" / "current-notes.json"
    if not path.exists():
        return {"dataset_id": None, "item_count": 0, "fields": NOTE_FIELDS, "updated_at": None, "items": []}
    return json.loads(path.read_text(encoding="utf-8"))


def comments_dir(output_dir: Path) -> Path:
    return output_dir / "processed" / "comments"


def comment_file(output_dir: Path, note_id: str) -> Path:
    return comments_dir(output_dir) / f"{note_id}.json"


def build_nested_comments(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    top_level: list[dict[str, Any]] = []
    replies_by_parent: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        current = {**normalize_comment(item), "replies": []}
        if current.get("parent_comment_id"):
            replies_by_parent.setdefault(current["parent_comment_id"], []).append(current)
        else:
            top_level.append(current)
    for item in top_level:
        comment_id = item.get("comment_id")
        if comment_id:
            item["replies"] = sorted(replies_by_parent.get(comment_id, []), key=lambda row: row.get("publish_time") or 0)
    return top_level


def flatten_comments(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    flattened: list[dict[str, Any]] = []
    for item in items:
        current = dict(item)
        replies = current.pop("replies", [])
        flattened.append(current)
        flattened.extend(flatten_comments(replies))
    return flattened


def read_comments(output_dir: Path, note_id: str) -> dict[str, Any]:
    path = comment_file(output_dir, note_id)
    if not path.exists():
        return {
            "note_id": note_id,
            "item_count": 0,
            "page_comment_count": None,
            "page_top_level_comment_count": None,
            "page_has_more": None,
            "next_page_token": None,
            "updated_at": None,
            "warnings": [],
            "items": [],
        }
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["item_count"] = len(payload.get("items", []))
    return payload


def merge_and_save_comments(output_dir: Path, note_id: str, fetched_items: list[dict[str, Any]], warnings: list[str] | None = None) -> dict[str, Any]:
    existing = read_comments(output_dir, note_id)
    merged: dict[str, dict[str, Any]] = {}
    for item in flatten_comments(existing.get("items", [])):
        comment_id = item.get("comment_id")
        if comment_id:
            merged[comment_id] = normalize_comment(item)
    for item in fetched_items:
        normalized = normalize_comment(item)
        comment_id = normalized.get("comment_id")
        if comment_id:
            merged[comment_id] = normalized
    flattened = sorted(merged.values(), key=lambda row: row.get("publish_time") or 0, reverse=True)
    latest_page = fetched_items[-1] if fetched_items else {}
    nested = build_nested_comments(flattened)
    payload = {
        "note_id": note_id,
        "item_count": len(nested),
        "page_comment_count": latest_page.get("page_comment_count") or existing.get("page_comment_count"),
        "page_top_level_comment_count": latest_page.get("page_top_level_comment_count") or existing.get("page_top_level_comment_count"),
        "page_has_more": latest_page.get("page_has_more") if fetched_items else existing.get("page_has_more"),
        "next_page_token": latest_page.get("page_next_page_token") or existing.get("next_page_token"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "warnings": list(dict.fromkeys((warnings or []))),
        "items": nested,
    }
    comments_dir(output_dir).mkdir(parents=True, exist_ok=True)
    write_json(comment_file(output_dir, note_id), payload)
    return payload


def save_run_outputs(
    output_dir: Path,
    operation: str,
    run_id: str,
    result: dict[str, Any],
    items: list[dict[str, Any]],
    output_summary: dict[str, Any] | None,
    save_output_summary: bool,
    save_preview_items: bool,
) -> dict[str, str]:
    ensure_output_dir(output_dir)
    run_dir = output_dir / operation / f"{make_timestamp()}-{run_id}"
    run_dir.mkdir(parents=True, exist_ok=True)
    summary_path = run_dir / "run-summary.json"
    items_path = run_dir / "dataset-items.json"
    write_json(summary_path, result)
    write_json(items_path, items)
    saved_paths = {
        "run_dir": str(run_dir),
        "run_summary": str(summary_path),
        "dataset_items": str(items_path),
    }
    if save_output_summary and output_summary is not None:
        output_summary_path = run_dir / "output-summary.json"
        write_json(output_summary_path, output_summary)
        saved_paths["output_summary"] = str(output_summary_path)
    if save_preview_items:
        preview_path = run_dir / "preview-items.json"
        write_json(preview_path, items[:10])
        saved_paths["preview_items"] = str(preview_path)
    return saved_paths


def execute_run(
    *,
    operation: str,
    user_fields: dict[str, Any],
    actor_id: str | None = None,
    api_base: str | None = None,
    wait_for_finish: int | None = None,
    output_dir: Path | None = None,
) -> RunArtifacts:
    config = find_config()
    payload_input = build_input(operation, user_fields)
    token = config["apify_api_token"]
    if not token:
        raise SystemExit("未找到 Apify Token。请先在 skills/signalflow-ai-search/config.json 或环境变量中配置。")

    actual_api_base = (api_base or config["apify_api_base"]).rstrip("/")
    actual_actor_id = actor_id or config["apify_actor_id"]
    actual_wait = wait_for_finish or config["wait_for_finish"]
    actual_output_dir = output_dir or Path(config["output_dir"]).resolve()

    actor_meta = fetch_actor_meta(actual_api_base, token, actual_actor_id)
    run_data = run_actor(actual_api_base, token, actual_actor_id, payload_input, actual_wait)
    dataset_id = run_data.get("defaultDatasetId")
    key_value_store_id = run_data.get("defaultKeyValueStoreId")
    items = fetch_dataset_items(actual_api_base, token, dataset_id) if dataset_id else []
    output_summary = fetch_output_summary(actual_api_base, token, key_value_store_id)

    result = {
        "actor_id": actual_actor_id,
        "actor_title": actor_meta.get("title") or actor_meta.get("name") or actual_actor_id,
        "operation": operation,
        "run_id": run_data["id"],
        "dataset_id": dataset_id,
        "status": run_data.get("status", "UNKNOWN"),
        "item_count": len(items),
        "warning_messages": extract_warning_messages(output_summary),
        "output_summary": output_summary,
        "preview_items": items[:10],
    }
    saved_paths = save_run_outputs(
        actual_output_dir,
        operation,
        run_data["id"],
        result,
        items,
        output_summary,
        config["save_output_summary"],
        config["save_preview_items"],
    )
    result["saved_files"] = saved_paths

    if items and operation in {"search_notes", "search_hot_list", "get_note_detail", "list_user_notes"}:
        save_current_notes(actual_output_dir, dataset_id or run_data["id"], items)
    if items and operation in {"get_note_comments", "get_note_sub_comments"}:
        note_id = payload_input.get("note_id")
        if not note_id and items:
            note_id = items[0].get("note_id")
        if isinstance(note_id, str) and note_id:
            merge_and_save_comments(actual_output_dir, note_id, items, result["warning_messages"])

    return RunArtifacts(result=result, items=items, output_summary=output_summary)


def collect_comments(
    output_dir: Path,
    note_id: str,
    max_items: int,
    continue_from_existing: bool,
    include_replies: bool,
) -> dict[str, Any]:
    existing = read_comments(output_dir, note_id)
    user_fields: dict[str, Any] = {
        "note_id": note_id,
        "max_items": max_items,
        "auto_paginate": False,
    }
    if continue_from_existing and existing.get("next_page_token"):
        user_fields["page_token"] = existing["next_page_token"]
    artifacts = execute_run(operation="get_note_comments", user_fields=user_fields, output_dir=output_dir)
    merged = read_comments(output_dir, note_id)
    fetched_reply_count = 0
    if include_replies:
        reply_result = collect_replies_for_cached_comments(output_dir, note_id, max_items)
        merged = reply_result
        fetched_reply_count = reply_result.get("fetched_reply_count", 0)
    merged["dataset_id"] = artifacts.result.get("dataset_id")
    merged["run_id"] = artifacts.result.get("run_id")
    merged["fetched_count"] = len(artifacts.items)
    merged["fetched_reply_count"] = fetched_reply_count
    merged["merged_count"] = merged.get("item_count", 0)
    return merged


def collect_missing_replies(output_dir: Path, note_id: str, max_items_per_comment: int) -> tuple[list[dict[str, Any]], list[str]]:
    existing = read_comments(output_dir, note_id)
    reply_items: list[dict[str, Any]] = []
    warnings: list[str] = []
    for item in flatten_comments(existing.get("items", [])):
        if item.get("parent_comment_id"):
            continue
        if (item.get("reply_count") or 0) <= 0:
            continue
        comment_id = item.get("comment_id")
        if not comment_id:
            continue
        artifacts = execute_run(
            operation="get_note_sub_comments",
            user_fields={"note_id": note_id, "comment_id": comment_id, "max_items": max_items_per_comment, "auto_paginate": True},
            output_dir=output_dir,
        )
        reply_items.extend(artifacts.items)
        warnings.extend(artifacts.result.get("warning_messages", []))
        if any("paid plan" in warning.lower() for warning in warnings):
            break
    return reply_items, list(dict.fromkeys(warnings))


def collect_replies_for_cached_comments(output_dir: Path, note_id: str, max_items_per_comment: int) -> dict[str, Any]:
    reply_items, warnings = collect_missing_replies(output_dir, note_id, max_items_per_comment)
    merged = merge_and_save_comments(output_dir, note_id, reply_items, warnings)
    merged["dataset_id"] = "multiple-sub-comment-runs"
    merged["run_id"] = "multiple-sub-comment-runs"
    merged["fetched_count"] = 0
    merged["fetched_reply_count"] = len(reply_items)
    merged["merged_count"] = merged.get("item_count", 0)
    return merged


def read_latest_run(output_dir: Path) -> dict[str, Any] | None:
    run_files = sorted(output_dir.glob("*/*/run-summary.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    if not run_files:
        return None
    return json.loads(run_files[0].read_text(encoding="utf-8"))


NOTE_RESULT_OPERATIONS = {"search_notes", "search_hot_list", "get_note_detail", "list_user_notes"}


def summarize_run_query(summary: dict[str, Any]) -> str:
    output_summary = summary.get("output_summary")
    if isinstance(output_summary, dict):
        pages = output_summary.get("pages")
        if isinstance(pages, list) and pages:
            first_page = pages[0]
            if isinstance(first_page, dict):
                query = first_page.get("query")
                if isinstance(query, dict):
                    for key in ("keyword", "note_id", "user_id", "profile_url", "comment_id"):
                        value = query.get(key)
                        if value not in (None, ""):
                            return str(value)

    preview_items = summary.get("preview_items")
    if isinstance(preview_items, list) and preview_items:
        first_item = preview_items[0]
        if isinstance(first_item, dict):
            for key in ("query_keyword", "query_note_id", "note_id", "author_name"):
                value = first_item.get(key)
                if value not in (None, ""):
                    return str(value)

    dataset_id = summary.get("dataset_id")
    if dataset_id:
        return str(dataset_id)
    operation = summary.get("operation")
    return str(operation) if operation else ""


def is_note_result_run(summary: dict[str, Any]) -> bool:
    operation = summary.get("operation")
    if operation in NOTE_RESULT_OPERATIONS:
        return True
    preview_items = summary.get("preview_items")
    if isinstance(preview_items, list) and preview_items:
        first_item = preview_items[0]
        return isinstance(first_item, dict) and "note_id" in first_item and "comment_id" not in first_item
    return False


def run_file_mtime_iso(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()


def list_saved_note_runs(output_dir: Path) -> dict[str, Any]:
    run_files = sorted(output_dir.glob("*/*/run-summary.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    items: list[dict[str, Any]] = []
    for run_file in run_files:
        summary = load_json_file(run_file)
        if not summary or not is_note_result_run(summary):
            continue
        run_dir = run_file.parent
        items.append(
            {
                "run_ref": run_dir.relative_to(output_dir).as_posix(),
                "run_id": summary.get("run_id"),
                "dataset_id": summary.get("dataset_id"),
                "operation": summary.get("operation"),
                "status": summary.get("status"),
                "item_count": summary.get("item_count", 0),
                "created_at": run_file_mtime_iso(run_file),
                "query_label": summarize_run_query(summary),
            }
        )
    return {"items": items, "count": len(items)}


def resolve_run_dir(output_dir: Path, run_ref: str | None) -> Path | None:
    if not run_ref:
        run_files = sorted(output_dir.glob("*/*/run-summary.json"), key=lambda path: path.stat().st_mtime, reverse=True)
        for run_file in run_files:
            summary = load_json_file(run_file)
            if summary and is_note_result_run(summary):
                return run_file.parent
        return None

    candidate = (output_dir / Path(run_ref)).resolve()
    if not candidate.is_relative_to(output_dir.resolve()):
        raise SystemExit("run_ref 不在输出目录内")
    if not candidate.exists() or not candidate.is_dir():
        raise SystemExit("未找到对应的采集结果目录")
    if not (candidate / "run-summary.json").exists():
        raise SystemExit("采集结果目录缺少 run-summary.json")
    return candidate


def read_run_details(output_dir: Path, run_ref: str | None = None) -> dict[str, Any]:
    run_dir = resolve_run_dir(output_dir, run_ref)
    if run_dir is None:
        notes = read_current_notes(output_dir)
        return {
            **notes,
            "run_ref": None,
            "run_id": None,
            "operation": None,
            "status": None,
            "query_label": "",
            "has_history": False,
        }

    summary_path = run_dir / "run-summary.json"
    items_path = run_dir / "dataset-items.json"
    summary = load_json_file(summary_path)
    raw_items = load_json_file(items_path)
    items = raw_items if isinstance(raw_items, list) else []
    normalized_items = [normalize_note(item) for item in items if isinstance(item, dict)]
    return {
        "run_ref": run_dir.relative_to(output_dir).as_posix(),
        "run_id": summary.get("run_id"),
        "dataset_id": summary.get("dataset_id"),
        "operation": summary.get("operation"),
        "status": summary.get("status"),
        "query_label": summarize_run_query(summary),
        "item_count": len(normalized_items),
        "fields": NOTE_FIELDS,
        "updated_at": run_file_mtime_iso(summary_path),
        "items": normalized_items,
        "has_history": True,
    }


def get_port(args_port: int | None) -> int:
    if args_port:
        return args_port
    env_port = os.getenv("SIGNALFLOW_WEB_PORT")
    if env_port:
        return int(env_port)
    return DEFAULT_WEB_PORT


def json_response(handler: SimpleHTTPRequestHandler, status: int, payload: Any) -> None:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(data)


def parse_json_body(handler: SimpleHTTPRequestHandler) -> dict[str, Any]:
    length = int(handler.headers.get("Content-Length", "0"))
    if length <= 0:
        return {}
    raw = handler.rfile.read(length).decode("utf-8")
    if not raw.strip():
        return {}
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("请求体必须是 JSON 对象")
    return data


def update_skill_config(patch: dict[str, Any]) -> dict[str, Any]:
    path = SKILL_DIR / "config.json"
    current = load_json_file(path)
    current.update({key: value for key, value in patch.items() if value is not None})
    write_json(path, current)
    return current


class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


class SkillHttpHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, directory: str | None = None, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(FRONTEND_DIR), **kwargs)

    def log_message(self, format: str, *args: Any) -> None:
        return

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_get(parsed)
            return
        if parsed.path in {"/", "/apify/config", "/apify/socialdatax-xhs/search", "/apify/socialdatax-xhs/results"}:
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self) -> None:
        parsed = parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_post(parsed)
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not Found")

    def handle_api_get(self, parsed: parse.ParseResult) -> None:
        config = find_config()
        output_dir = Path(config["output_dir"]).resolve()
        try:
            query = parse.parse_qs(parsed.query)
            if parsed.path == "/api/config":
                safe = {**config, "apify_api_token": mask_token(config["apify_api_token"])}
                json_response(self, HTTPStatus.OK, safe)
                return
            if parsed.path == "/api/notes":
                json_response(self, HTTPStatus.OK, read_current_notes(output_dir))
                return
            if parsed.path == "/api/run-history":
                json_response(self, HTTPStatus.OK, list_saved_note_runs(output_dir))
                return
            if parsed.path == "/api/run-details":
                run_ref = query.get("run", [None])[0]
                json_response(self, HTTPStatus.OK, read_run_details(output_dir, run_ref))
                return
            if parsed.path.startswith("/api/notes/") and parsed.path.endswith("/comments"):
                note_id = parsed.path.split("/")[3]
                json_response(self, HTTPStatus.OK, read_comments(output_dir, note_id))
                return
            if parsed.path == f"/api/apify/actors/{config['apify_actor_id']}/form":
                json_response(self, HTTPStatus.OK, ACTOR_FORM)
                return
            if parsed.path.startswith("/api/apify/actors/") and parsed.path.endswith("/form"):
                actor_id = parsed.path.split("/")[4]
                form_payload = {**ACTOR_FORM, "actor_id": actor_id}
                json_response(self, HTTPStatus.OK, form_payload)
                return
            if parsed.path == "/api/latest-run":
                json_response(self, HTTPStatus.OK, read_latest_run(output_dir))
                return
            json_response(self, HTTPStatus.NOT_FOUND, {"detail": "Not found"})
        except Exception as exc:  # noqa: BLE001
            json_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, {"detail": str(exc)})

    def handle_api_post(self, parsed: parse.ParseResult) -> None:
        config = find_config()
        output_dir = Path(config["output_dir"]).resolve()
        try:
            body = parse_json_body(self)
            if parsed.path == "/api/config":
                payload = update_skill_config(body)
                safe = {**payload, "apify_api_token": mask_token(payload.get("apify_api_token", ""))}
                json_response(self, HTTPStatus.OK, safe)
                return
            if parsed.path == "/api/apify/actors/run":
                operation = body.get("input", {}).get("operation") or body.get("operation") or "search_notes"
                actor_id = body.get("actor_id") or config["apify_actor_id"]
                wait_for_finish = body.get("wait_for_finish")
                user_fields = dict(body.get("input") or {})
                user_fields.pop("operation", None)
                artifacts = execute_run(
                    operation=operation,
                    user_fields=user_fields,
                    actor_id=actor_id,
                    wait_for_finish=wait_for_finish,
                    output_dir=output_dir,
                )
                json_response(self, HTTPStatus.OK, artifacts.result)
                return
            if parsed.path == "/api/apify/import":
                dataset_id = body.get("dataset_id") or config.get("apify_default_dataset_id")
                if not dataset_id:
                    raise SystemExit("缺少 dataset_id，且 config.json 中未配置 apify_default_dataset_id")
                items = fetch_dataset_items(config["apify_api_base"], config["apify_api_token"], dataset_id, body.get("limit"))
                saved = save_current_notes(output_dir, dataset_id, items)
                json_response(
                    self,
                    HTTPStatus.OK,
                    {
                        "dataset_id": dataset_id,
                        "item_count": len(items),
                        "saved_raw_path": str(output_dir / "raw" / f"{dataset_id}.json"),
                        "saved_processed_path": str(output_dir / "processed" / "current-notes.json"),
                        "notes": saved,
                    },
                )
                return
            if parsed.path.startswith("/api/notes/") and parsed.path.endswith("/comments/import"):
                note_id = parsed.path.split("/")[3]
                result = collect_comments(
                    output_dir=output_dir,
                    note_id=note_id,
                    max_items=int(body.get("max_items", 20)),
                    continue_from_existing=bool(body.get("continue_from_existing", True)),
                    include_replies=bool(body.get("include_replies", False)),
                )
                json_response(self, HTTPStatus.OK, result)
                return
            if parsed.path.startswith("/api/notes/") and parsed.path.endswith("/comments/replies/import"):
                note_id = parsed.path.split("/")[3]
                result = collect_replies_for_cached_comments(output_dir, note_id, int(body.get("max_items", 20)))
                json_response(self, HTTPStatus.OK, result)
                return
            json_response(self, HTTPStatus.NOT_FOUND, {"detail": "Not found"})
        except SystemExit as exc:
            json_response(self, HTTPStatus.BAD_REQUEST, {"detail": str(exc)})
        except ValueError as exc:
            json_response(self, HTTPStatus.BAD_REQUEST, {"detail": str(exc)})
        except Exception as exc:  # noqa: BLE001
            json_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, {"detail": str(exc)})


def cmd_show_config(_: argparse.Namespace) -> None:
    config = find_config()
    safe = {**config, "apify_api_token": mask_token(config["apify_api_token"])}
    print(json.dumps(safe, ensure_ascii=False, indent=2))


def cmd_list_operations(_: argparse.Namespace) -> None:
    output = []
    for key, value in OPERATIONS.items():
        output.append(
            {
                "operation": key,
                "名称": value["label"],
                "说明": value["description"],
                "必填参数": value.get("required_fields", []),
                "至少提供一个": value.get("required_one_of", []),
                "可选参数": value.get("optional_fields", []),
                "默认值": value.get("defaults", {}),
                "参数说明": value.get("field_help", {}),
            }
        )
    print(json.dumps(output, ensure_ascii=False, indent=2))


def cmd_validate(args: argparse.Namespace) -> None:
    user_fields = {**load_fields_file(args.fields_file), **parse_fields(args.field)}
    payload = build_input(args.operation, user_fields)
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def cmd_run(args: argparse.Namespace) -> None:
    user_fields = {**load_fields_file(args.fields_file), **parse_fields(args.field)}
    artifacts = execute_run(
        operation=args.operation,
        user_fields=user_fields,
        actor_id=args.actor_id,
        api_base=args.api_base,
        wait_for_finish=args.wait_for_finish,
        output_dir=Path(args.output_dir).resolve() if args.output_dir else None,
    )
    print(json.dumps(artifacts.result, ensure_ascii=False, indent=2))


def cmd_serve(args: argparse.Namespace) -> None:
    host = args.host or DEFAULT_WEB_HOST
    port = get_port(args.port)
    FRONTEND_DIR.mkdir(parents=True, exist_ok=True)

    server = ThreadingTCPServer((host, port), SkillHttpHandler)
    url = f"http://{host}:{port}"
    print(f"SignalFlow standalone 前端已启动：{url}")
    print(f"配置页：{url}/apify/config")
    print(f"搜索页：{url}/apify/socialdatax-xhs/search")
    print(f"结果页：{url}/apify/socialdatax-xhs/results")

    if args.open_browser:
        threading.Timer(0.6, lambda: webbrowser.open(f"{url}/apify/config")).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止本地服务。")
    finally:
        server.server_close()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="SignalFlow SocialDataX XHS standalone skill")
    subparsers = parser.add_subparsers(dest="command", required=True)

    show_config = subparsers.add_parser("show-config", help="显示当前读取到的配置")
    show_config.set_defaults(func=cmd_show_config)

    list_ops = subparsers.add_parser("list-operations", help="列出支持的 SocialDataX 能力")
    list_ops.set_defaults(func=cmd_list_operations)

    validate = subparsers.add_parser("validate", help="校验某个能力的输入参数")
    validate.add_argument("--operation", required=True, help="能力代码，例如 search_notes")
    validate.add_argument("--fields-file", help="JSON 字段文件路径，适合中文内容")
    validate.add_argument("--field", action="append", default=[], help="字段，格式 key=value")
    validate.set_defaults(func=cmd_validate)

    run = subparsers.add_parser("run", help="执行 SocialDataX 能力")
    run.add_argument("--operation", required=True, help="能力代码，例如 search_notes")
    run.add_argument("--fields-file", help="JSON 字段文件路径，适合中文内容")
    run.add_argument("--field", action="append", default=[], help="字段，格式 key=value")
    run.add_argument("--actor-id", help="覆盖默认 Actor ID")
    run.add_argument("--api-base", help="覆盖默认 API Base，例如 https://api.apify.com/v2")
    run.add_argument("--wait-for-finish", type=int, help="等待 Apify 运行完成的秒数")
    run.add_argument("--output-dir", help="覆盖结果输出目录")
    run.set_defaults(func=cmd_run)

    serve = subparsers.add_parser("serve", help="启动 skill 自带前端和本地 API")
    serve.add_argument("--host", default=DEFAULT_WEB_HOST, help="监听主机，默认 127.0.0.1")
    serve.add_argument("--port", type=int, help="监听端口，默认 8787")
    serve.add_argument("--open-browser", action="store_true", help="启动后自动打开浏览器")
    serve.set_defaults(func=cmd_serve)

    return parser


def main() -> None:
    configure_stdio()
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
