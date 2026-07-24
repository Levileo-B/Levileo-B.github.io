#!/usr/bin/env python3
"""抓取若干 RSS/Atom 源，汇总成 data/news.json 供首页热点窗格读取。

设计要点：
- 只用标准库，无第三方依赖，Actions 里开箱即用
- 单个源失败不影响整体，失败原因会打到日志里
- 全部源都失败时不覆盖旧文件，直接非零退出，避免把页面刷成空的
"""

import datetime
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

# 想增删新闻源，改这个列表就行。name 是页面上显示的分组标题。
FEEDS = [
    {"name": "BBC 中文", "url": "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml"},
    {"name": "Hacker News", "url": "https://hnrss.org/frontpage?count=10"},
    {"name": "少数派", "url": "https://sspai.com/feed"},
    {"name": "V2EX", "url": "https://www.v2ex.com/index.xml"},
    {"name": "36 氪", "url": "https://36kr.com/feed"},
    {"name": "阮一峰的网络日志", "url": "https://www.ruanyifeng.com/blog/atom.xml"},
]

PER_FEED = 6          # 每个源最多保留几条
TIMEOUT = 20          # 秒
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


def parse(raw: bytes):
    # 有些源会带 BOM 或前导空白，ET 对此很敏感（BOM 不是空白，lstrip() 去不掉）
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    root = ET.fromstring(raw.lstrip())
    items = []

    for it in root.iterfind(".//item"):  # RSS 2.0 / RDF
        items.append(
            {
                "title": text_of(it.find("title")),
                "link": text_of(it.find("link")),
                "date": norm_date(text_of(it.find("pubDate")) or text_of(it.find("date"))),
            }
        )

    if not items:  # Atom
        for it in root.iterfind(f".//{ATOM}entry"):
            link = ""
            for ln in it.iterfind(f"{ATOM}link"):
                rel = ln.get("rel", "alternate")
                if rel == "alternate":
                    link = ln.get("href", "")
                    break
            if not link:
                ln = it.find(f"{ATOM}link")
                link = ln.get("href", "") if ln is not None else ""
            items.append(
                {
                    "title": text_of(it.find(f"{ATOM}title")),
                    "link": link,
                    "date": norm_date(
                        text_of(it.find(f"{ATOM}updated")) or text_of(it.find(f"{ATOM}published"))
                    ),
                }
            )

    return [i for i in items if i["title"] and i["link"].startswith("http")]


def main() -> int:
    sources, failed = [], []

    for feed in FEEDS:
        name, url = feed["name"], feed["url"]
        try:
            items = parse(fetch(url))[:PER_FEED]
            if not items:
                raise ValueError("解析成功但没有条目")
            sources.append({"name": name, "url": url, "items": items})
            print(f"[ok]   {name}: {len(items)} 条")
        except Exception as exc:  # 网络错误、XML 畸形、结构不符都在这里兜住
            failed.append(name)
            print(f"[fail] {name}: {type(exc).__name__}: {exc}", file=sys.stderr)

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
