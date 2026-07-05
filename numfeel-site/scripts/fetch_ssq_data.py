#!/usr/bin/env python3
"""
双色球历史开奖数据抓取脚本

数据源: 500.com 历史数据页面 (datachart.500.com)
输出: numfeel-site/pages/data/ssq-history.json

用法:
    python3 scripts/fetch_ssq_data.py

输出 JSON 格式:
{
  "meta": {
    "source": "500.com",
    "total": 3000,
    "firstIssue": "03001",
    "lastIssue": "26075",
    "fetchedAt": "2026-07-05T12:00:00"
  },
  "data": [
    {
      "issue": "26075",
      "red": [8, 12, 18, 21, 24, 30],
      "blue": 1,
      "date": "2026-07-02"
    },
    ...
  ]
}
"""

import json
import re
import sys
import os
from datetime import datetime
from urllib.request import Request, urlopen
from html.parser import HTMLParser


# 500.com 历史数据完整 URL（通过 start/end 参数获取全量数据）
# start=03001 是双色球第一期，end 设一个足够大的值
SSQ_HISTORY_URL = "https://datachart.500.com/ssq/history/newinc/history.php?start=03001&end=99999"
SSQ_REFERER = "https://datachart.500.com/ssq/history/history.shtml"

# 输出路径（相对于脚本所在目录的上级）
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
OUTPUT_PATH = os.path.join(PROJECT_ROOT, "pages", "data", "ssq-history.json")


class SSQHTMLParser(HTMLParser):
    """解析 500.com 双色球历史数据 HTML 表格"""

    def __init__(self):
        super().__init__()
        self.results = []
        self.in_tr = False
        self.in_td = False
        self.current_row = []
        self.current_td_class = ""
        self.current_td_text = ""

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == "tr" and "t_tr1" in attrs_dict.get("class", ""):
            self.in_tr = True
            self.current_row = []
        elif tag == "td" and self.in_tr:
            self.in_td = True
            self.current_td_class = attrs_dict.get("class", "")
            self.current_td_text = ""

    def handle_endtag(self, tag):
        if tag == "tr" and self.in_tr:
            self.in_tr = False
            if len(self.current_row) >= 9:
                self._process_row(self.current_row)
        elif tag == "td" and self.in_td:
            self.in_td = False
            self.current_row.append(self.current_td_text.strip())

    def handle_data(self, data):
        if self.in_td:
            self.current_td_text += data

    def handle_entityref(self, name):
        if self.in_td:
            self.current_td_text += " "

    def handle_charref(self, name):
        if self.in_td:
            self.current_td_text += " "

    def _process_row(self, row):
        """
        行格式 (从 HTML 中提取的 td):
        [期号, 红1, 红2, 红3, 红4, 红5, 红6, 蓝, 幸运蓝(可能空), 奖池, 一等奖注数, 一等奖金额, 二等奖注数, 二等奖金额, 销售额, 日期]
        """
        try:
            issue = row[0].strip()
            # 只取数字格式的期号
            if not re.match(r'^\d+$', issue):
                return

            red_balls = []
            for i in range(1, 7):
                val = row[i].strip().replace(",", "")
                if val and val.isdigit():
                    red_balls.append(int(val))

            if len(red_balls) != 6:
                return

            blue_ball_str = row[7].strip().replace(",", "")
            if not blue_ball_str or not blue_ball_str.isdigit():
                return
            blue_ball = int(blue_ball_str)

            # 日期在最后一列
            date_str = ""
            for item in reversed(row):
                item = item.strip()
                if re.match(r'\d{4}-\d{2}-\d{2}', item):
                    date_str = item[:10]
                    break

            self.results.append({
                "issue": issue,
                "red": red_balls,
                "blue": blue_ball,
                "date": date_str
            })
        except (IndexError, ValueError):
            pass


def fetch_html(url, referer=None):
    """抓取 HTML 内容"""
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9",
    }
    if referer:
        headers["Referer"] = referer
    req = Request(url, headers=headers)
    print(f"正在抓取: {url}")
    with urlopen(req, timeout=60) as resp:
        charset = resp.headers.get_content_charset() or "gb2312"
        html = resp.read().decode(charset, errors="replace")
    print(f"获取到 HTML 大小: {len(html)} 字节")
    return html


def parse_ssq_data(html):
    """解析 HTML 获取双色球数据"""
    parser = SSQHTMLParser()
    parser.feed(html)
    return parser.results


def validate_data(data):
    """校验数据完整性"""
    errors = []
    for i, record in enumerate(data):
        # 红球: 1~33 范围，6个不重复
        red = record["red"]
        if len(red) != 6:
            errors.append(f"期号 {record['issue']}: 红球数量不是6个")
        if len(set(red)) != 6:
            errors.append(f"期号 {record['issue']}: 红球有重复")
        for r in red:
            if r < 1 or r > 33:
                errors.append(f"期号 {record['issue']}: 红球 {r} 超出范围")

        # 蓝球: 1~16 范围
        blue = record["blue"]
        if blue < 1 or blue > 16:
            errors.append(f"期号 {record['issue']}: 蓝球 {blue} 超出范围")

    return errors


def build_output(data):
    """构建输出 JSON 结构"""
    # 按期号排序（升序，最早的在前）
    data.sort(key=lambda x: x["issue"])

    meta = {
        "source": "500.com",
        "description": "中国福利彩票双色球历史开奖数据",
        "total": len(data),
        "firstIssue": data[0]["issue"] if data else "",
        "lastIssue": data[-1]["issue"] if data else "",
        "firstDate": data[0]["date"] if data else "",
        "lastDate": data[-1]["date"] if data else "",
        "fetchedAt": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "rules": {
            "redBalls": "从1~33中选6个，不重复，开奖时按升序排列",
            "blueBall": "从1~16中选1个"
        }
    }

    return {"meta": meta, "data": data}


def main():
    # 1. 抓取 HTML
    html = fetch_html(SSQ_HISTORY_URL, referer=SSQ_REFERER)

    # 2. 解析数据
    data = parse_ssq_data(html)
    print(f"解析到 {len(data)} 条记录")

    if len(data) == 0:
        print("错误: 未解析到任何数据，请检查页面结构是否变化", file=sys.stderr)
        sys.exit(1)

    # 3. 校验
    errors = validate_data(data)
    if errors:
        print(f"警告: 发现 {len(errors)} 个数据问题:")
        for e in errors[:10]:
            print(f"  - {e}")
        if len(errors) > 10:
            print(f"  ... 还有 {len(errors) - 10} 个问题")

    # 4. 构建输出
    output = build_output(data)

    # 5. 写入 JSON
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    file_size = os.path.getsize(OUTPUT_PATH)
    print(f"\n完成!")
    print(f"  输出文件: {OUTPUT_PATH}")
    print(f"  文件大小: {file_size / 1024:.1f} KB")
    print(f"  记录数: {output['meta']['total']}")
    print(f"  时间范围: {output['meta']['firstDate']} ~ {output['meta']['lastDate']}")
    print(f"  期号范围: {output['meta']['firstIssue']} ~ {output['meta']['lastIssue']}")


if __name__ == "__main__":
    main()
