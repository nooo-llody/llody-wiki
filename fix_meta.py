
import re
from pathlib import Path

# 针对已经被破坏的作者结构进行修复
broken_author_pattern = re.compile(r'<span[^>]*?data-pagefind-meta="author"[^>]*?></span>\s*([^<（(]+?)\s*([（(].*?[）)])')

def fix_author(m):
    author_name = m.group(1).strip()
    rest_text = m.group(2).strip()
    
    # 重构为正确的内联写法
    return f'<span hidden data-pagefind-meta="author:{author_name}" data-pagefind-filter="author:{author_name}"></span>{rest_text}'

for path in Path(".").rglob("*.html"):
    text = path.read_text(encoding="utf-8")
    new_text, count = broken_author_pattern.subn(fix_author, text)
    if count > 0:
        path.write_text(new_text, encoding="utf-8")
        print(f"✅ 找回作者: {path} (共 {count} 处)")
