import re
from pathlib import Path

# 目标：如果字段之间是空格或中文逗号，统统改成英文逗号
# 例如： description:xxx, image:yyy ->  description:xxx,, image:yyy
pattern = re.compile(r'(date:[^\s"]+)\s+(description:[^\s"]+)\s+(image:[^\s"]+)\s+(image_alt:[^\s"]+)\s+(keywords:[^"]+)')

def fix_format(m):
    date_str = m.group(1)
    desc_str = m.group(2)
    image_str = m.group(3)
    image_alt_str = m.group(4)
    keywords_str = m.group(5)
    
    # 把 keywords 内部的英文逗号换成中文逗号（防止干扰）
    keywords_str = keywords_str.replace(',', '，')
    
    # 用标准的英文逗号+空格拼接
    return f"{date_str}, {desc_str}, {image_str}, {image_alt_str}, {keywords_str}"

for path in Path(".").rglob("*.html"):
    text = path.read_text(encoding="utf-8")
    # 找到 data-pagefind-meta 的属性内容
    new_text, count = pattern.subn(fix_format, text)
    
    if count > 0:
        path.write_text(new_text, encoding="utf-8")
        print(f"✅ 已修复: {path} (共 {count} 处)")

print("修复完成！")