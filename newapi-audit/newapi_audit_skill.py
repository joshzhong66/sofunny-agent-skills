import os
import zipfile
import gzip
import tarfile
import json
import time
import shutil
import unicodedata
import argparse
from datetime import datetime, timedelta

def get_files_in_dir(directory):
    valid_exts = {'.zip', '.gz', '.sql'}
    if not os.path.exists(directory):
        return []
    files = []
    for f in os.listdir(directory):
        if any(f.endswith(ext) for ext in valid_exts):
            files.append(os.path.join(directory, f))
    return files

def extract_if_needed(filepath):
    if filepath.endswith('.sql'): return filepath
    print(f"\n[🔄 解压缩引擎] 发现压缩包，正在将物理文件解压释出...")
    base_dir, base_name = os.path.dirname(filepath), os.path.basename(filepath)
    extracted_dir = os.path.join(base_dir, base_name + "_unzip")
    if not os.path.exists(extracted_dir): os.makedirs(extracted_dir)

    if filepath.endswith('.zip'):
        with zipfile.ZipFile(filepath, 'r') as z:
            sql_name = next((n for n in z.namelist() if n.endswith('.sql')), z.namelist()[0])
            out_path = os.path.join(extracted_dir, sql_name)
            if not os.path.exists(out_path): z.extract(sql_name, extracted_dir)
            return out_path
    elif filepath.endswith('.gz'):
        if filepath.endswith('.tar.gz'):
            with tarfile.open(filepath, 'r:gz') as tar:
                sql_name = next((m.name for m in tar.getmembers() if m.name.endswith('.sql')), tar.getmembers()[0].name)
                out_path = os.path.join(extracted_dir, sql_name)
                if not os.path.exists(out_path): tar.extract(sql_name, path=extracted_dir)
                return out_path
        else:
            out_name = base_name.replace('.gz', '') if base_name.endswith('.sql.gz') else base_name.replace('.gz', '.sql')
            out_path = os.path.join(extracted_dir, out_name)
            if not os.path.exists(out_path):
                with gzip.open(filepath, 'rb') as f_in, open(out_path, 'wb') as f_out: shutil.copyfileobj(f_in, f_out)
            return out_path
    return filepath

def parse_sql_values(val_str):
    parts, current, in_string, escape = [], [], False, False
    for char in val_str:
        if escape: current.append(char); escape = False
        elif char == '\\' and in_string: current.append(char); escape = True
        elif char == "'": in_string = not in_string; current.append(char)
        elif char == "," and not in_string:
            parts.append("".join(current).strip())
            current = []
        else: current.append(char)
    parts.append("".join(current).strip())

    clean_parts = []
    for p in parts:
        if p.startswith("'") and p.endswith("'"): clean_parts.append(p[1:-1].replace("''", "'"))
        else: clean_parts.append(p)
    return clean_parts

def try_parse_copy_line(line):
    parts = line.split('\t')
    return parts if len(parts) >= 20 else None

def try_parse_insert_line(line):
    prefix = ") VALUES ("
    try:
        start_idx = line.index(prefix) + len(prefix)
        end_idx = line.rindex(");")
        return parse_sql_values(line[start_idx:end_idx])
    except: return None

def extract_universal_row(line, in_copy_mode):
    if line.startswith("COPY public.logs ") or line.startswith("COPY logs "): return None, True
    if in_copy_mode:
        if line.startswith("\\."): return None, False
        return try_parse_copy_line(line), True
    if "INSERT INTO" in line and "logs" in line and "VALUES" in line:
        return try_parse_insert_line(line), False
    return None, in_copy_mode

def fast_prescan(filepath):
    users, min_ts, max_ts, in_copy_mode = set(), float('inf'), 0, False
    with open(filepath, 'rb') as f:
        for raw_line in f:
            try: line = raw_line.decode('utf-8', errors='ignore').strip()
            except: continue
            parts, in_copy_mode = extract_universal_row(line, in_copy_mode)
            if not parts or len(parts) < 20 or parts[3] != '2': continue

            if parts[2].isdigit():
                ts = int(parts[2])
                if ts > 0: min_ts, max_ts = min(min_ts, ts), max(max_ts, ts)
            user_str = parts[5].strip()
            if user_str and user_str not in ('\\N', 'NULL', ''): users.add(user_str)
    return users, min_ts if min_ts != float('inf') else 0, max_ts

def display_len(s): return sum(2 if unicodedata.east_asian_width(c) in 'WF' else 1 for c in str(s))

def truncate_str(text, max_len):
    text = str(text)
    if display_len(text) <= max_len: return text
    curr_len, res = 0, ""
    for char in text:
        w = 2 if unicodedata.east_asian_width(char) in 'WF' else 1
        if curr_len + w > max_len - 3: return res + "..."
        res += char; curr_len += w
    return res

def ljust_zh(s, width):
    s = str(s); dl = display_len(s)
    return s + ' ' * (width - dl) if dl < width else s

def rjust_zh(s, width):
    s = str(s); dl = display_len(s)
    return ' ' * (width - dl) + s if dl < width else s

def draw_table(headers, rows, max_cols=None):
    if not max_cols: max_cols = {}
    col_widths = []
    for i, h in enumerate(headers):
        m_len = display_len(str(h))
        for row in rows:
            td_len = display_len(str(row[i]))
            if i in max_cols and td_len > max_cols[i]: td_len = max_cols[i]
            m_len = max(m_len, td_len)
        col_widths.append(m_len)

    sep_line = "+" + "+".join('-' * (cw + 2) for cw in col_widths) + "+"
    print(sep_line)
    print("|" + "|".join(" " + ljust_zh(h, cw) + " " for h, cw in zip(headers, col_widths)) + "|")
    print(sep_line)
    for row in rows:
        fmt = []
        for i, (val, cw) in enumerate(zip(row, col_widths)):
            val = truncate_str(val, max_cols[i]) if i in max_cols else val
            if isinstance(val, (int, float)) or (isinstance(val, str) and val.startswith(('$','[')) and i == 0):
                 fmt.append(" " + rjust_zh(val, cw) + " ")
            elif isinstance(val, (int, float)) or (isinstance(val, str) and val.startswith('$')):
                 fmt.append(" " + rjust_zh(val, cw) + " ")
            else:
                 fmt.append(" " + ljust_zh(val, cw) + " ")
        print("|" + "|".join(fmt) + "|")
    if rows: print(sep_line)

def draw_users_grid(users_list, cols=3):
    total = len(users_list)
    if total == 0: return {}
    user_map = {str(i+1): u for i, u in enumerate(users_list)}
    rows = []
    for i in range(0, total, cols):
        row = []
        for j in range(cols):
            idx = i + j
            if idx < total: row.extend([f"[{idx+1}]", users_list[idx]])
            else: row.extend(["", ""])
        rows.append(row)
    h = []
    for _ in range(cols): h.extend(["编号", "用户名"])
    draw_table(h, rows, max_cols={1:16, 3:16, 5:16, 7:16})
    return user_map

def select_time_range(min_ts, max_ts):
    if min_ts == 0 or max_ts == 0: return 0, 9999999999
    print("\n[目标时间层级选择]")
    print("  1. 全局检索\n  2. 按年份检索\n  3. 按月份检索\n  4. 按单日检索\n  5. 自定义检索区间")
    choice = input("请填选数字 [1-5] (默认 1): ").strip()
    if not choice: choice = '1'

    if choice == '1': return min_ts, max_ts
    elif choice == '2':
        while True:
            y = input("     -> 输入 4位年份: ").strip()
            if y.isdigit() and len(y) == 4: return int(datetime(int(y), 1, 1).timestamp()), int(datetime(int(y), 12, 31, 23, 59, 59).timestamp())
    elif choice == '3':
        while True:
            ym = input("     -> 输入 年-月 (如 2024-03): ").strip()
            try:
                dt = datetime.strptime(ym, "%Y-%m")
                end_dt = datetime(dt.year+1, 1, 1) - timedelta(seconds=1) if dt.month == 12 else datetime(dt.year, dt.month+1, 1) - timedelta(seconds=1)
                return int(dt.timestamp()), int(end_dt.timestamp())
            except: pass
    elif choice == '4':
        while True:
            ymd = input("     -> 输入 年-月-日 (如 2024-03-05): ").strip()
            try:
                return int(datetime.strptime(ymd, "%Y-%m-%d").timestamp()), int(datetime.strptime(ymd, "%Y-%m-%d").replace(hour=23, minute=59, second=59).timestamp())
            except: pass
    else:
        while True:
            try:
                s_in, e_in = input("     -> 起始时间 (YYYY-MM-DD HH:MM:SS): ").strip(), input("     -> 截止时间 (YYYY-MM-DD HH:MM:SS): ").strip()
                return int(datetime.strptime(s_in, "%Y-%m-%d %H:%M:%S").timestamp()), int(datetime.strptime(e_in, "%Y-%m-%d %H:%M:%S").timestamp())
            except: pass

def main():
    parser = argparse.ArgumentParser(description="NewAPI SQL 解析大盘审计 Skill")
    parser.add_argument("-d", "--dir", default=os.getcwd(), help="日志存放目录，默认当前运行目录")
    args = parser.parse_args()

    print("============================================================")
    print(f" NewAPI PostgreSQL 极速过滤引擎 - 技能版V8")
    print(f" 挂载日志扫描路径: {os.path.abspath(args.dir)}")
    print("============================================================")

    files = get_files_in_dir(args.dir)
    if not files:
        print(f"\n[错误] 未在指定统一路径找到日志 (zip/gz/sql) ！")
        return

    print("\n[探测到以下备选文件]")
    for idx, f in enumerate(files, 1):
        print(f"  {idx}. {os.path.basename(f)}  ({os.path.getsize(f)/(1024*1024):.1f} MB)")

    f_idx = input("\n请分配您要解析的文件编号 [默认 1]: ").strip()
    target_file = files[int(f_idx) - 1] if (f_idx.isdigit() and 1 <= int(f_idx) <= len(files)) else files[0]

    unzipped_path = extract_if_needed(target_file)
    print(f"\n⏳ 读盘提取身份特征中...")
    active_users, min_ts, max_ts = fast_prescan(unzipped_path)

    if min_ts == 0:
        print("\n❌ 警报: 数据集解析后为空，未截获 type=2 的记录。")
        return

    print(f"\n[全量特征快照]")
    print(f"  • 区段始末 : {datetime.fromtimestamp(min_ts).strftime('%Y-%m-%d %H:%M:%S')} 至 {datetime.fromtimestamp(max_ts).strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  • 活跃人数 : 共计 {len(active_users)} 位玩家")

    user_map = draw_users_grid(sorted(list(active_users)), cols=3)

    print("\n👤 身份甄别器")
    print("支持输入【编号】(如 5) 或 【完整用户名】。留空敲回车代表聚合整个大盘。")
    u_in = input("-> 请输入: ").strip()

    target_user = user_map.get(u_in, u_in) if u_in else None
    if target_user and target_user not in active_users: print(f"⚠️ 查无此人 {target_user}，将进入强行检索模式...")

    target_s, target_e = select_time_range(min_ts, max_ts)
    print(f"\n=> 正在高密度聚合演算中...")

    stats, ratios, total_quota, matched, in_copy = {}, {}, 0, 0, False
    with open(unzipped_path, 'rb') as f:
        for raw_line in f:
            try: line = raw_line.decode('utf-8', errors='ignore').strip()
            except: continue

            parts, in_copy = extract_universal_row(line, in_copy)
            if not parts or len(parts) < 20 or parts[3] != '2': continue

            rt = int(parts[2]) if parts[2].isdigit() else 0
            if not (target_s <= rt <= target_e): continue

            ru = parts[5].strip()
            if target_user and ru != target_user: continue

            matched += 1
            mn = parts[7] if parts[7] not in ('\\N', 'NULL', '') else "Default"
            quota = int(parts[8]) if parts[8].isdigit() else 0
            prompt_tc = int(parts[9]) if parts[9].isdigit() else 0
            comp_tc = int(parts[10]) if parts[10].isdigit() else 0
            json_raw = parts[19].strip()

            cache_tc, o_data = 0, {}
            if json_raw.startswith('{'):
                try:
                    o_data = json.loads(json_raw.replace(r'\\', '\\').replace(r'\"', '"'))
                    cache_tc = o_data.get('cache_tokens', 0)
                except: pass

            key = (ru, mn)
            if key not in stats: stats[key] = {'p': 0, 'c': 0, 'ch': 0, 'q': 0}
            stats[key]['p'] += prompt_tc
            stats[key]['c'] += comp_tc
            stats[key]['ch'] += cache_tc
            stats[key]['q'] += quota
            total_quota += quota

            if o_data and 'model_ratio' in o_data:
                ratios[mn] = {'m': o_data.get('model_ratio', '-'), 'c': o_data.get('completion_ratio', '-'), 'g': o_data.get('group_ratio', '-'), 't': o_data.get('tier_rule_name', '-')}

    total_usd = total_quota / 500000.0
    print("\n" + "=" * 70 + "\n 聚合产出快照\n" + "=" * 70)
    print(f" 靶向对象: {'[全局大盘]' if not target_user else target_user}")
    print(f" 消耗合计: {total_quota} (折合估算: $ {total_usd:.4f})\n")

    sorted_s = sorted(stats.items(), key=lambda x: x[1]['q'], reverse=True)
    t_rows = []
    if not target_user:
        for (u, m), c in sorted_s: t_rows.append([u, m, c['p'], c['c'], c['ch'], c['q'], f"${c['q']/500000.0:.4f}"])
        draw_table(["用户", "模型", "P-Token", "C-Token", "Cache", "Quota 账单", "预估($)"], t_rows, max_cols={0: 15, 1: 28})
    else:
        for (u, m), c in sorted_s: t_rows.append([m, c['p'], c['c'], c['ch'], c['q'], f"${c['q']/500000.0:.4f}"])
        draw_table(["模型", "P-Token", "C-Token", "Cache", "Quota 账单", "预估($)"], t_rows, max_cols={0: 32})

    print("\n [最新计费倍率快照]")
    s_rows = []
    for m in set([k[1] for k in stats.keys()]):
        if m in ratios: s_rows.append([m, ratios[m]['m'], ratios[m]['c'], ratios[m]['g'], ratios[m]['t']])
    if s_rows: draw_table(["模型名称", "基线提词", "补全系数", "特定分组系数", "规则"], s_rows, max_cols={0:32})

if __name__ == "__main__":
    main()