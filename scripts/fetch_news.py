#!/usr/bin/env python3
"""抓取若干 RSS/Atom 源，汇总成 data/news.json 供首页热点窗格读取。

设计要点：
- 只用标准库，无第三方依赖，Actions 里开箱即用
- 单个源失败不影响整体，失败原因会打到日志里
- 全部源都失败时不覆盖旧文件，直接非零退出，避免把页面刷成空的
"""

import concurrent.futures as cf
import datetime
import json
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
FEEDS = [
    # ---- 综合 ----
    {"name": "BBC 中文", "category": "综合", "url": "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml"},
    {"name": "BBC World", "category": "综合", "url": "https://feeds.bbci.co.uk/news/world/rss.xml"},
    {"name": "联合国新闻", "category": "综合", "url": "https://news.un.org/zh/feed/subscribe/zh/news/all/rss.xml"},

    # ---- 科技 ----
    {"name": "36 氪", "category": "科技", "url": "https://36kr.com/feed"},
    {"name": "少数派", "category": "科技", "url": "https://sspai.com/feed"},
    {"name": "爱范儿", "category": "科技", "url": "https://www.ifanr.com/feed"},
    {"name": "虎嗅", "category": "科技", "url": "https://www.huxiu.com/rss/0.xml"},
    {"name": "极客公园", "category": "科技", "url": "https://www.geekpark.net/rss"},
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

    # ---- 科研 / AI ----
    {"name": "机器之心", "category": "科研", "url": "https://www.jiqizhixin.com/rss"},
    {"name": "量子位", "category": "科研", "url": "https://www.qbitai.com/feed"},
    {"name": "MIT Technology Review", "category": "科研", "url": "https://www.technologyreview.com/feed/"},
    {"name": "Nature", "category": "科研", "url": "https://www.nature.com/nature.rss"},
    {"name": "ScienceDaily", "category": "科研", "url": "https://www.sciencedaily.com/rss/all.xml"},
    {"name": "arXiv cs.AI", "category": "科研", "url": "https://rss.arxiv.org/rss/cs.AI"},
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
