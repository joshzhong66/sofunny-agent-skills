#!/usr/bin/env python3
"""SignalFlow AI 搜索交互式向导"""

import json
import subprocess
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = SKILL_DIR / "scripts"
ASSETS_DIR = SKILL_DIR / "assets"

OPERATIONS = {
    "1": {
        "id": "search_notes",
        "name": "笔记搜索",
        "desc": "按关键词搜索小红书笔记",
        "required": ["keyword"],
        "example": ASSETS_DIR / "search-notes-example.json"
    },
    "2": {
        "id": "search_hot_list",
        "name": "热榜搜索",
        "desc": "获取小红书热榜内容",
        "required": [],
        "example": None
    },
    "3": {
        "id": "get_note_detail",
        "name": "笔记详情",
        "desc": "按笔记ID或链接获取详情",
        "required": ["note_id 或 note_url"],
        "example": None
    },
    "4": {
        "id": "get_user_info",
        "name": "博主信息",
        "desc": "按用户ID或主页链接获取博主资料",
        "required": ["user_id 或 profile_url"],
        "example": None
    },
    "5": {
        "id": "list_user_notes",
        "name": "博主笔记列表",
        "desc": "获取某个博主的笔记列表",
        "required": ["user_id 或 profile_url"],
        "example": None
    },
    "6": {
        "id": "get_note_comments",
        "name": "评论列表",
        "desc": "获取某条笔记的评论",
        "required": ["note_id 或 note_url"],
        "example": None
    },
    "7": {
        "id": "get_note_sub_comments",
        "name": "评论回复",
        "desc": "获取某条一级评论下的回复",
        "required": ["note_id", "comment_id"],
        "example": None
    }
}

SEPARATOR = "=" * 50


def print_header():
    """打印欢迎信息"""
    print(SEPARATOR)
    print("  SignalFlow AI 搜索 - 小红书数据采集工具")
    print(SEPARATOR)
    print()
    print("功能：")
    print("  - 笔记搜索：按关键词搜索小红书笔记")
    print("  - 热榜搜索：获取热门内容")
    print("  - 笔记详情：获取单条笔记完整信息")
    print("  - 博主信息：获取博主资料和笔记列表")
    print("  - 评论采集：获取笔记评论和回复")
    print()
    print(SEPARATOR)


def print_operations():
    """打印可用操作列表"""
    print("\n可用操作：\n")
    for key, op in OPERATIONS.items():
        required = ", ".join(op["required"]) if op["required"] else "无必填参数"
        print(f"  [{key}] {op['name']} - {op['desc']}")
        print(f"       必填参数: {required}")
    print()


def select_operation() -> dict:
    """让用户选择操作"""
    while True:
        choice = input("请选择操作 [1-7]: ").strip()
        if choice in OPERATIONS:
            op = OPERATIONS[choice]
            print(f"\n已选择: {op['name']}")
            return op
        print("无效选择，请重试")


def collect_params(op: dict) -> dict:
    """收集操作参数"""
    params = {}

    if op["example"] and op["example"].exists():
        print(f"\n提示: 使用示例文件 {op['example'].name}")
        use_example = input("是否使用示例文件? [Y/n]: ").strip().lower()
        if use_example != "n":
            with open(op["example"], "r", encoding="utf-8") as f:
                params = json.load(f)
            print(f"已加载示例参数: {json.dumps(params, ensure_ascii=False, indent=2)}")
            return params

    if op["required"]:
        print(f"\n请提供以下参数:")
        for param in op["required"]:
            value = input(f"  {param}: ").strip()
            if value:
                params[param] = value

    print("\n可选参数 (直接回车跳过):")
    optional_params = {
        "page": "页码 (默认: 1)",
        "sort_type": "排序 (general/time_descending/like_count_descending)",
        "note_type": "笔记类型 (all/image/video)",
        "publish_time_range": "时间范围 (all/day/week/half_year)",
        "max_items": "最大数量 (默认: 20)"
    }

    for key, desc in optional_params.items():
        value = input(f"  {key} ({desc}): ").strip()
        if value:
            if key == "page" or key == "max_items":
                params[key] = int(value)
            else:
                params[key] = value

    return params


def ask_web_demo() -> bool:
    """询问是否启用web演示"""
    print("\n是否启用Web演示界面?")
    print("  启动后可在浏览器中查看搜索结果")
    choice = input("启用Web演示? [y/N]: ").strip().lower()
    return choice == "y"


def save_params(params: dict) -> Path:
    """保存参数到临时文件"""
    temp_file = SKILL_DIR / "outputs" / "temp_params.json"
    temp_file.parent.mkdir(parents=True, exist_ok=True)
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(params, f, ensure_ascii=False, indent=2)
    return temp_file


def run_operation(op: dict, params: dict):
    """执行操作"""
    params_file = save_params(params)

    print(f"\n{SEPARATOR}")
    print("执行采集...")
    print(f"操作: {op['name']}")
    print(f"参数: {json.dumps(params, ensure_ascii=False)}")
    print(SEPARATOR)

    cmd = [
        sys.executable,
        str(SCRIPTS_DIR / "socialdatax_skill.py"),
        "run",
        "--operation", op["id"],
        "--fields-file", str(params_file)
    ]

    result = subprocess.run(cmd, capture_output=False)
    return result.returncode == 0


def run_web_demo():
    """启动web演示"""
    print(f"\n{SEPARATOR}")
    print("启动Web演示...")
    print("访问地址: http://127.0.0.1:8787")
    print("按 Ctrl+C 停止")
    print(SEPARATOR)

    cmd = [
        sys.executable,
        str(SCRIPTS_DIR / "socialdatax_skill.py"),
        "serve",
        "--open-browser"
    ]

    try:
        subprocess.run(cmd)
    except KeyboardInterrupt:
        print("\nWeb演示已停止")


def check_api() -> bool:
    """检查API配置和连接"""
    print(f"\n[步骤 1/4] 检查API连接")
    print("正在验证配置和API连接...")

    cmd = [
        sys.executable,
        str(SCRIPTS_DIR / "socialdatax_skill.py"),
        "show-config"
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print("[FAIL] 配置检查失败:")
        print(result.stderr)
        return False

    try:
        config = json.loads(result.stdout)
        token = config.get("apify_api_token", "")
        actor_id = config.get("apify_actor_id", "")

        if not token or token == "apify_ap...":
            print("[FAIL] API Token 未配置或无效")
            print("   请在 config.json 中设置 apify_api_token")
            return False

        print(f"[OK] API Token: {token[:10]}...")
        print(f"[OK] Actor ID: {actor_id}")
        print(f"[OK] API Base: {config.get('apify_api_base')}")
        print(f"[OK] 输出目录: {config.get('output_dir')}")
        print("\n[OK] API 配置正常!")
        return True

    except json.JSONDecodeError:
        print("[FAIL] 无法解析配置信息")
        return False


def main():
    """主流程"""
    print_header()

    # 步骤0: 检查API
    if not check_api():
        print("\n请先配置API后再使用")
        print(f"配置文件: {SKILL_DIR / 'config.json'}")
        return

    # 步骤1: 选择操作
    print(f"\n[步骤 2/4] 选择采集功能")
    print_operations()
    op = select_operation()

    # 步骤2: 输入参数
    print(f"\n[步骤 3/4] 配置采集参数")
    params = collect_params(op)

    # 步骤3: 确认执行
    print(f"\n[步骤 4/4] 确认并执行")
    print(f"\n操作: {op['name']}")
    print(f"参数: {json.dumps(params, ensure_ascii=False, indent=2)}")

    confirm = input("\n确认执行? [Y/n]: ").strip().lower()
    if confirm == "n":
        print("已取消")
        return

    # 执行采集
    success = run_operation(op, params)

    if success:
        print(f"\n{SEPARATOR}")
        print("采集完成!")

        # 询问是否启动web演示
        if ask_web_demo():
            run_web_demo()
    else:
        print("\n采集失败，请检查错误信息")


if __name__ == "__main__":
    main()
