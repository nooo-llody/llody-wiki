#!/usr/bin/env python3
"""
批量修复 HTML 中 Pagefind 属性的写法：
1. 把一个 data-pagefind-filter 里逗号分隔的多组 key:value 拆成多个独立 <span>
2. 把 data-pagefind-sort="key:date" 转成 键名属性 + ISO 日期内容
3. 同样处理事件日期 <td data-pagefind-meta="event_date" ...>

用法:
    python fix_pagefind.py --dry   # 只预览，不写入
    python fix_pagefind.py         # 直接写入（建议先 git commit 备份）
"""

import re
import sys
from pathlib import Path

ROOT = Path(".")                 # 网站根目录
DRY_RUN = "--dry" in sys.argv

SPAN_RE = re.compile(
    r'<span hidden\s+data-pagefind-filter="[^"]*"[\s\S]*?</span>'
)
TD_RE = re.compile(
    r'<td\s+data-pagefind-meta="event_date"([^>]*)>([\s\S]*?)</td>'
)
TAG_STRIP_RE = re.compile(r"<[^>]+>")


def get_attr(tag_text: str, name: str):
    """从一整段标签文本中提取某个属性的值"""
    m = re.search(rf'{name}="([^"]*)"', tag_text)
    return m.group(1) if m else None


def parse_pairs(raw):
    """把 'a:1, b:2, c:3' 拆成 [(k, v), ...]"""
    pairs = []
    if not raw:
        return pairs
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        if ":" in part:
            k, v = part.split(":", 1)
            pairs.append((k.strip(), v.strip()))
        else:
            pairs.append((part, part))
    return pairs


def to_iso(date_str: str) -> str:
    """'2026-2-20' → '2026-02-20'，非法则返回空串"""
    try:
        parts = [int(x) for x in date_str.strip().split("-")]
        if len(parts) == 3:
            y, m, d = parts
            return f"{y}-{m:02d}-{d:02d}"
    except ValueError:
        pass
    return ""


# ---------- ① 处理页面末尾的元数据 span ----------
def fix_span(match) -> str:
    full = match.group(0)
    filters = parse_pairs(get_attr(full, "data-pagefind-filter"))
    metas = parse_pairs(get_attr(full, "data-pagefind-meta"))
    sort_raw = get_attr(full, "data-pagefind-sort")  # 形如 "date:2026-08-06"

    out = []
    for k, v in filters:
        out.append(f'<span hidden data-pagefind-filter="{k}:{v}"></span>')
    for k, v in metas:
        out.append(f'<span hidden data-pagefind-meta="{k}:{v}"></span>')
    if sort_raw and ":" in sort_raw:
        key, val = sort_raw.split(":", 1)
        out.append(
            f'<span hidden data-pagefind-sort="{key.strip()}" '
            f'data-pagefind-sort-attribute="content">{val.strip()}</span>'
        )
    return "\n".join(out) if out else full


# ---------- ② 处理事件日期 td ----------
def fix_td(match) -> str:
    full = match.group(0)
    content = match.group(2).strip()
    filters = parse_pairs(get_attr(full, "data-pagefind-filter"))
    sort_raw = get_attr(full, "data-pagefind-sort")  # "event_date:2026-2-20"

    # 从 sort 值推导 ISO 日期
    iso = ""
    if sort_raw and ":" in sort_raw:
        iso = to_iso(sort_raw.split(":", 1)[1])

    out = ["<td>", f"  {content}"]
    for k, v in filters:
        out.append(f'  <span hidden data-pagefind-filter="{k}:{v}"></span>')
    if iso:
        out.append(f'  <span hidden data-pagefind-meta="event_date:{iso}"></span>')
        out.append(
            f'  <span hidden data-pagefind-sort="event_date" '
            f'data-pagefind-sort-attribute="content">{iso}</span>'
        )
    out.append("</td>")
    return "\n".join(out)


def walk_html(root: Path):
    """递归收集所有 .html 文件，跳过隐藏目录和 node_modules"""
    for path in root.rglob("*.html"):
        s = str(path)
        if "/." in s or "/node_modules/" in s or s.replace("\\", "/").startswith("./."):
            continue
        yield path


def main():
    changed = 0
    for f in walk_html(ROOT):
        src = f.read_text(encoding="utf-8")
        out = SPAN_RE.sub(fix_span, src)
        out = TD_RE.sub(fix_td, out)
        if out != src:
            changed += 1
            print(f"已修复: {f}")
            if not DRY_RUN:
                f.write_text(out, encoding="utf-8")
    tail = "（dry-run 预览，未写入）" if DRY_RUN else "，已写入"
    print(f"\n完成：{changed} 个文件需要修改{tail}")


if __name__ == "__main__":
    main()
