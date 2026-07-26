#!/usr/bin/env python3
"""抓取若干 RSS/Atom 源，汇总成 data/news.json 供首页热点窗格读取。

设计要点：
- 只用标准库，无第三方依赖，Actions 里开箱即用
- 单个源失败不影响整体，失败原因会打到日志里
- 全部源都失败时不覆盖旧文件，直接非零退出，避免把页面刷成空的
"""

import concurrent.futures as cf
import datetime
import html
import json
import re
import os
import pathlib
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

# 想增删新闻源，改这个列表就行。
# name 是条目上显示的来源名，category 决定它归到页面上哪一栏。
# 某个源挂掉不影响其他源，失败原因会打在 Actions 日志里。
# 下面这些源都经 Actions 实跑验证可用。想加新源直接往里塞，
# 跑一次 workflow 看日志即可确认；解析不出条目通常是地址给错了。
FEEDS = [
    # ---- 综合 ----
    {"name": "BBC 中文", "category": "综合", "url": "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml"},
    {"name": "BBC World", "category": "综合", "url": "https://feeds.bbci.co.uk/news/world/rss.xml"},

    # ---- 财经 ----
    {"name": "BBC Business", "category": "财经", "url": "https://feeds.bbci.co.uk/news/business/rss.xml"},
    {"name": "CNBC", "category": "财经", "url": "https://www.cnbc.com/id/100003114/device/rss/rss.html"},

    # ---- 科技 ----
    {"name": "36 氪", "category": "科技", "url": "https://36kr.com/feed"},
    {"name": "少数派", "category": "科技", "url": "https://sspai.com/feed"},
    {"name": "爱范儿", "category": "科技", "url": "https://www.ifanr.com/feed"},
    {"name": "Solidot", "category": "科技", "url": "https://www.solidot.org/index.rss"},
    {"name": "The Verge", "category": "科技", "url": "https://www.theverge.com/rss/index.xml"},
    {"name": "Ars Technica", "category": "科技", "url": "https://feeds.arstechnica.com/arstechnica/index"},

    # ---- 开发 ----
    {"name": "Hacker News", "category": "开发", "url": "https://hnrss.org/frontpage?count=10"},
    {"name": "Lobsters", "category": "开发", "url": "https://lobste.rs/rss"},
    {"name": "V2EX", "category": "开发", "url": "https://www.v2ex.com/index.xml"},
    {"name": "InfoQ 中文", "category": "开发", "url": "https://www.infoq.cn/feed"},
    {"name": "GitHub Blog", "category": "开发", "url": "https://github.blog/feed/"},
    {"name": "阮一峰的网络日志", "category": "开发", "url": "https://www.ruanyifeng.com/blog/atom.xml"},
    {"name": "酷壳", "category": "开发", "url": "https://coolshell.cn/feed"},
    {"name": "美团技术团队", "category": "开发", "url": "https://tech.meituan.com/feed/"},

    # ---- AI ----
    {"name": "量子位", "category": "AI", "url": "https://www.qbitai.com/feed"},
    {"name": "MIT Technology Review", "category": "AI", "url": "https://www.technologyreview.com/feed/"},
    # ---- 科研 ----
    {"name": "Nature", "category": "科研", "url": "https://www.nature.com/nature.rss"},
    {"name": "ScienceDaily", "category": "科研", "url": "https://www.sciencedaily.com/rss/all.xml"},
]

PER_FEED = 5          # 每个源最多保留几条
TIMEOUT = 15          # 秒
ATOM = "{http://www.w3.org/2005/Atom}"
UA = "Mozilla/5.0 (compatible; LevileoBot/1.0; +https://levileo-b.github.io/)"

OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "news.json"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return resp.read()


def text_of(el) -> str:
    if el is None:
        return ""
    return "".join(el.itertext()).strip()


def norm_date(raw: str) -> str:
    """把各种日期格式统一成 UTC ISO 字符串，解析不了就留空。"""
    raw = (raw or "").strip()
    if not raw:
        return ""
    try:  # RFC 822，RSS 常用
        dt = parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt.astimezone(datetime.timezone.utc).isoformat()
    except Exception:
        pass
    try:  # ISO 8601，Atom 常用
        dt = datetime.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt.astimezone(datetime.timezone.utc).isoformat()
    except Exception:
        return ""


def _ln(tag) -> str:
    """取标签的本地名，剥掉命名空间前缀。

    RSS 1.0 / RDF 的 <item> 带命名空间（{http://purl.org/rss/1.0/}item），
    直接用 .//item 是找不到的 —— Nature 和 arXiv 就栽在这上面。
    统一按本地名匹配，RSS 2.0 / RSS 1.0 / Atom 就都能吃下。
    """
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def _child(el, *names):
    for c in el:
        if _ln(c.tag) in names:
            return c
    return None


def _child_text(el, *names) -> str:
    c = _child(el, *names)
    return text_of(c) if c is not None else ""


def _entry_link(el) -> str:
    # RSS 系：<link>http://…</link>；Atom：<link rel="alternate" href="…"/>
    txt = _child_text(el, "link")
    if txt.startswith("http"):
        return txt
    alt = ""
    first = ""
    for c in el:
        if _ln(c.tag) != "link":
            continue
        href = c.get("href", "")
        if not href:
            continue
        first = first or href
        if c.get("rel", "alternate") == "alternate":
            alt = alt or href
    return alt or first


def _extract(root):
    items = []
    for el in root.iter():
        if _ln(el.tag) not in ("item", "entry"):
            continue
        items.append(
            {
                "title": _child_text(el, "title"),
                "link": _entry_link(el),
                "date": norm_date(
                    _child_text(el, "pubDate", "published", "updated", "date")
                ),
            }
        )
    return items


# XML 畸形时的兜底：直接按文本抠出条目。某些源（如机器之心）会输出
# 标签不闭合的 XML，严格解析器直接罢工，但内容其实是可用的。
_ITEM_RE = re.compile(r"<(item|entry)\b[^>]*>(.*?)</\1>", re.S | re.I)
_TITLE_RE = re.compile(r"<title\b[^>]*>(.*?)</title>", re.S | re.I)
_LINK_RE = re.compile(r"<link\b[^>]*>(.*?)</link>|<link\b[^>]*href=[\"']([^\"']+)[\"']", re.S | re.I)
_DATE_RE = re.compile(r"<(?:pubDate|published|updated|dc:date)\b[^>]*>(.*?)</", re.S | re.I)


def _strip_tags(s: str) -> str:
    s = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", s, flags=re.S)
    s = re.sub(r"<[^>]+>", "", s)
    return html.unescape(s).strip()


def _extract_loose(raw: bytes):
    text = raw.decode("utf-8", "replace")
    items = []
    for m in _ITEM_RE.finditer(text):
        body = m.group(2)
        t = _TITLE_RE.search(body)
        l = _LINK_RE.search(body)
        d = _DATE_RE.search(body)
        items.append(
            {
                "title": _strip_tags(t.group(1)) if t else "",
                "link": _strip_tags(l.group(1) or l.group(2) or "") if l else "",
                "date": norm_date(_strip_tags(d.group(1)) if d else ""),
            }
        )
    return items


def parse(raw: bytes):
    # 有些源会带 BOM 或前导空白，ET 对此很敏感（BOM 不是空白，lstrip() 去不掉）
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    try:
        items = _extract(ET.fromstring(raw.lstrip()))
    except ET.ParseError:
        items = _extract_loose(raw)

    return [i for i in items if i["title"] and i["link"].startswith("http")]


def load_one(feed: dict) -> dict:
    """抓一个源。异常不外抛，塞进返回值里由调用方统一汇报。"""
    try:
        items = parse(fetch(feed["url"]))[:PER_FEED]
        if not items:
            raise ValueError("解析成功但没有条目")
        return {
            "name": feed["name"],
            "category": feed.get("category", "其他"),
            "url": feed["url"],
            "items": items,
        }
    except Exception as exc:  # 网络错误、XML 畸形、结构不符都在这里兜住
        return {"name": feed["name"], "error": f"{type(exc).__name__}: {exc}"}


def main() -> int:
    sources, failed = [], []

    # 源多了以后串行抓太慢（单个超时 20s × 25 个），并发跑
    with cf.ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(load_one, FEEDS))

    for res in results:
        if "error" in res:
            failed.append(res["name"])
            print(f"[fail] {res['name']}: {res['error']}", file=sys.stderr)
        else:
            sources.append(res)
            print(f"[ok]   {res['name']}（{res['category']}）: {len(res['items'])} 条")

    if not sources:
        print("所有新闻源都失败了，保留上一次的 data/news.json 不覆盖。", file=sys.stderr)
        return 1

    payload = {
        "updated": datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0)
        .isoformat(),
        "sources": sources,
    }
    if failed:
        payload["failed"] = failed

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    total = sum(len(s["items"]) for s in sources)
    print(f"\n写入 {OUT.relative_to(OUT.parent.parent)}：{len(sources)} 个源 / {total} 条")
    if failed:
        print(f"失败的源：{', '.join(failed)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
