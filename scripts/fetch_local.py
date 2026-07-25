#!/usr/bin/env python3
"""按地区抓取本地新闻，汇总成 data/local.json，供首页「附近最热」使用。

思路：浏览器拿不到各地新闻站的 RSS（都不开放跨域），所以在 Actions 里
把所有地区一次性抓好落成一个静态文件，前端按访客所在地区取对应那一段。
一个文件装下所有地区（每地区 5 条，整体也就几十 KB），比按地区拆成
多个文件省事，也免去前端拼路径。

RSS 解析直接复用 fetch_news.py —— 那边已经处理过 RSS 1.0 命名空间、
畸形 XML 兜底等一堆坑，没必要再写一份。
"""

import concurrent.futures as cf
import datetime
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from fetch_news import fetch, parse  # noqa: E402  复用抓取与解析

PER_FEED = 5
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "local.json"

# 地区代码用 ISO 3166-1 alpha-2，与前端拿到的 country code 对齐。
# global 是兜底：识别不出所在地、或该地区没有配置时用它。
REGIONS = {
    "SG": {"name": "新加坡", "feeds": [
        ("CNA", "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml"),
        ("The Straits Times", "https://www.straitstimes.com/news/singapore/rss.xml"),
    ]},
    "CN": {"name": "中国大陆", "feeds": [
        ("澎湃新闻", "https://feedx.net/rss/thepaper.xml"),
        ("Solidot", "https://www.solidot.org/index.rss"),
    ]},
    "HK": {"name": "中国香港", "feeds": [
        ("RTHK", "https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml"),
    ]},
    "TW": {"name": "中国台湾", "feeds": [
        ("中央社", "https://feeds.feedburner.com/rsscna/intworld"),
    ]},
    "JP": {"name": "日本", "feeds": [
        ("NHK", "https://www3.nhk.or.jp/rss/news/cat0.xml"),
        ("Japan Times", "https://www.japantimes.co.jp/feed/"),
    ]},
    "KR": {"name": "韩国", "feeds": [
        ("Korea Herald", "https://www.koreaherald.com/rss/newsAll"),
    ]},
    "MY": {"name": "马来西亚", "feeds": [
        ("Malay Mail", "https://www.malaymail.com/feed/rss"),
        ("Free Malaysia Today", "https://www.freemalaysiatoday.com/feed/"),
    ]},
    "IN": {"name": "印度", "feeds": [
        ("NDTV", "https://feeds.feedburner.com/ndtvnews-top-stories"),
        ("The Hindu", "https://www.thehindu.com/news/national/feeder/default.rss"),
    ]},
    "US": {"name": "美国", "feeds": [
        ("NPR", "https://feeds.npr.org/1001/rss.xml"),
        ("CBS News", "https://www.cbsnews.com/latest/rss/us"),
    ]},
    "GB": {"name": "英国", "feeds": [
        ("BBC UK", "https://feeds.bbci.co.uk/news/uk/rss.xml"),
        ("The Guardian", "https://www.theguardian.com/uk/rss"),
    ]},
    "AU": {"name": "澳大利亚", "feeds": [
        ("ABC News", "https://www.abc.net.au/news/feed/51120/rss.xml"),
    ]},
    "CA": {"name": "加拿大", "feeds": [
        ("Global News", "https://globalnews.ca/feed/"),
        ("CBC", "https://www.cbc.ca/cmlink/rss-topstories"),
    ]},
    "DE": {"name": "德国", "feeds": [
        ("tagesschau", "https://www.tagesschau.de/xml/rss2/"),
    ]},
    "FR": {"name": "法国", "feeds": [
        ("Le Monde", "https://www.lemonde.fr/rss/une.xml"),
    ]},
    "global": {"name": "国际", "feeds": [
        ("BBC World", "https://feeds.bbci.co.uk/news/world/rss.xml"),
        ("Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"),
    ]},
}


def load_feed(job):
    code, source, url = job
    try:
        items = parse(fetch(url))[:PER_FEED]
        if not items:
            raise ValueError("解析成功但没有条目")
        return code, source, items, None
    except Exception as exc:
        return code, source, [], f"{type(exc).__name__}: {exc}"


def main() -> int:
    jobs = []
    for code, cfg in REGIONS.items():
        for source, url in cfg["feeds"]:
            jobs.append((code, source, url))

    with cf.ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(load_feed, jobs))

    regions, failed = {}, []
    for code, source, items, err in results:
        if err:
            failed.append(f"{code}/{source}")
            print(f"[fail] {code} {source}: {err}", file=sys.stderr)
            continue
        bucket = regions.setdefault(code, {"name": REGIONS[code]["name"], "items": []})
        for it in items:
            it = dict(it)
            it["source"] = source
            bucket["items"].append(it)
        print(f"[ok]   {code} {source}: {len(items)} 条")

    # 组内按时间倒序，最新的排前面
    for code in regions:
        regions[code]["items"].sort(key=lambda x: x.get("date") or "", reverse=True)

    if "global" not in regions:
        print("兜底地区 global 都没抓到，不覆盖旧文件。", file=sys.stderr)
        return 1

    payload = {
        "updated": datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0).isoformat(),
        "regions": regions,
    }
    if failed:
        payload["failed"] = failed

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    total = sum(len(r["items"]) for r in regions.values())
    print(f"\n写入 {OUT.name}：{len(regions)} 个地区 / {total} 条")
    if failed:
        print(f"失败：{', '.join(failed)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
