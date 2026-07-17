#!/usr/bin/env python3
"""
sync.py — 从 data/demos.json 同步生成：
  1. sitemap.xml
  2. README.md 演示列表
  3. 为 pages/ 下的 HTML（含子目录 index.html）注入 meta description（如果还没有）

用法：python3 scripts/sync.py
"""

import json, re, os
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEMOS_JSON  = os.path.join(ROOT, 'data', 'demos.json')
SITEMAP     = os.path.join(ROOT, 'sitemap.xml')
README      = os.path.join(ROOT, 'README.md')
PAGES_DIR   = os.path.join(ROOT, 'pages')
BASE_URL    = 'https://numfeel.996.ninja'
TODAY       = date.today().isoformat()

CATEGORY_EMOJI = {
    'probability':  '🎲',
    'gambling':     '🃏',
    'finance':      '💰',
    'game-theory':  '♟️',
    'math':         '📐',
    'psychology':   '🧠',
    'fun':          '✨',
    'tech':         '💻',
}

# ── 读取数据 ──────────────────────────────────────────────
with open(DEMOS_JSON, 'r', encoding='utf-8') as f:
    data = json.load(f)

categories = data['categories']

# 收集所有 demo 条目（href → desc）
all_demos = []
for cat in categories:
    for demo in cat.get('demos', []):
        all_demos.append({
            'href':  demo['href'],          # e.g. pages/xxx.html
            'title': demo['title'],
            'desc':  demo['desc'],
            'cat':   cat['id'],
            'cat_name': cat['name'],
        })

# ── 1. 生成 sitemap.xml ───────────────────────────────────
urls = [f"""  <url>
    <loc>{BASE_URL}/</loc>
    <lastmod>{TODAY}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>"""]

for demo in sorted(all_demos, key=lambda d: d['href']):
    loc = f"{BASE_URL}/{demo['href']}"
    urls.append(f"""  <url>
    <loc>{loc}</loc>
    <lastmod>{TODAY}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>""")

sitemap_content = '<?xml version="1.0" encoding="UTF-8"?>\n'
sitemap_content += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
sitemap_content += '\n'.join(urls) + '\n'
sitemap_content += '</urlset>\n'

with open(SITEMAP, 'w', encoding='utf-8') as f:
    f.write(sitemap_content)

print(f'✓ sitemap.xml 已更新，共 {len(all_demos)+1} 条 URL')

# ── 2. 更新 README.md 演示列表 ────────────────────────────
readme_section = '## 📋 演示列表\n\n'
for cat in categories:
    emoji = CATEGORY_EMOJI.get(cat['id'], '📌')
    readme_section += f"### {emoji} {cat['name']}\n"
    for demo in cat.get('demos', []):
        url = f"{BASE_URL}/{demo['href']}"
        # 去掉 desc 里的中文引号，截断到 40 字
        short_desc = demo['desc'].replace('「', '').replace('」', '')
        if len(short_desc) > 40:
            short_desc = short_desc[:40] + '...'
        readme_section += f"- [{demo['title']}]({url}) - {short_desc}\n"
    readme_section += '\n'

with open(README, 'r', encoding='utf-8') as f:
    readme = f.read()

# 替换 ## 📋 演示列表 到下一个 ## 之间的内容
new_readme = re.sub(
    r'## 📋 演示列表\n.*?(?=\n## )',
    readme_section.rstrip(),
    readme,
    flags=re.DOTALL
)

with open(README, 'w', encoding='utf-8') as f:
    f.write(new_readme)

print(f'✓ README.md 演示列表已更新，共 {len(all_demos)} 个 demo')

# ── 3. 为 pages/ 下的 HTML 注入 meta description ──────────
# href 使用相对于站点根目录的 POSIX 路径，目录型页面映射到 index.html。
desc_map = {}
for demo in all_demos:
    href = demo['href'].strip('/')
    html_href = f'{href}/index.html' if not href.endswith('.html') else href
    desc = demo['desc'].replace('「', '').replace('」', '')
    if len(desc) > 120:
        desc = desc[:120] + '...'
    desc_map[html_href] = desc

injected = 0
skipped = 0

for current_dir, _, filenames in os.walk(PAGES_DIR):
    for filename in filenames:
        if not filename.endswith('.html'):
            continue
        filepath = os.path.join(current_dir, filename)
        relative_href = os.path.relpath(filepath, ROOT).replace(os.sep, '/')
        if relative_href not in desc_map:
            continue

        with open(filepath, 'r', encoding='utf-8') as f:
            html = f.read()

        if 'name="description"' in html or "name='description'" in html:
            skipped += 1
            continue

        desc = desc_map[relative_href].replace('"', '&quot;')
        meta_tag = f'  <meta name="description" content="{desc}">\n'
        new_html = re.sub(r'(\s*<title>)', f'\n{meta_tag}\\1', html, count=1)
        if new_html != html:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_html)
            injected += 1

print(f'✓ meta description：注入 {injected} 个页面，跳过 {skipped} 个（已有）')
print('\n全部完成。')
