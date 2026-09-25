#!/usr/bin/env python3
"""积累 RSS 快照，生成按新加坡自然周 / 自然月统计的热点榜（仅标准库）。"""

import argparse
import datetime as dt
import json
import pathlib
import re
import subprocess
import unicodedata
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
UTC = dt.timezone.utc
SITE_TZ = dt.timezone(dt.timedelta(hours=8))
RETENTION_DAYS = 45
TOP_N = 10


def timestamp(raw):
    try:
        value = dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value
    except (AttributeError, TypeError, ValueError):
        return None


def canonical_link(raw):
    """保留内容参数，去掉锚点和常见追踪参数；也用于拒绝非网页链接。"""
    try:
        parts = urlsplit(raw.strip())
        if parts.scheme.lower() not in ("http", "https") or not parts.hostname:
            return ""
        if parts.username or parts.password:
            return ""
        query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
                 if not k.lower().startswith(("utm_", "at_"))
                 and k.lower() not in ("fbclid", "gclid")]
        return urlunsplit((parts.scheme.lower(), parts.netloc.lower(),
                           parts.path or "/", urlencode(sorted(query)), ""))
    except (AttributeError, TypeError, ValueError):
        return ""


def title_key(title):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", title)).strip().casefold()


def merge_snapshot(history, snapshot, now):
    """同一链接每天每个信源只记一次，重跑或增加抓取频率不会抬高排名。"""
    observed = timestamp(snapshot.get("updated"))
    if observed is None or observed > now:
        return
    cutoff = now - dt.timedelta(days=RETENTION_DAYS)
    if observed < cutoff:
        return
    day = observed.astimezone(SITE_TZ).date().isoformat()
    records = history["items"]
    for source in snapshot.get("sources", []):
        name = source.get("name", "").strip()
        if not name:
            continue
        for item in source.get("items", []):
            link = canonical_link(item.get("link"))
            title = (item.get("title") or "").strip()
            published = timestamp(item.get("date"))
            if not link or not title or (published and not cutoff <= published <= observed):
                continue
            record = records.get(link)
            if record is None:
                record = records[link] = {
                    "title": title, "link": link,
                    "categories": [],
                    "date": published.isoformat() if published else "",
                    "first_seen": observed.isoformat(),
                    "last_seen": observed.isoformat(), "appearances": {},
                }
            categories = record["categories"]
            category = source.get("category") or "其他"
            if category not in categories:
                categories.append(category)
                categories.sort()
            record["first_seen"] = min(timestamp(record["first_seen"]), observed).isoformat()
            if observed >= timestamp(record["last_seen"]):
                record["title"] = title
                record["last_seen"] = observed.isoformat()
            # 固定最早的发布时间，避免 RSS 的更新时间把旧闻重新推上周榜。
            old_date = timestamp(record["date"])
            if published and (old_date is None or published < old_date):
                record["date"] = published.isoformat()
            names = record["appearances"].setdefault(day, [])
            if name not in names:
                names.append(name)
                names.sort()
    latest = timestamp(history.get("updated"))
    if latest is None or observed > latest:
        history["updated"] = observed.isoformat()


def prune_history(history, now):
    cutoff = now - dt.timedelta(days=RETENTION_DAYS)
    cutoff_day = cutoff.astimezone(SITE_TZ).date().isoformat()
    kept = {}
    for link, record in history["items"].items():
        published = timestamp(record["date"]) or timestamp(record["first_seen"])
        if published is None or not cutoff <= published <= now:
            continue
        record["appearances"] = {day: names for day, names in record["appearances"].items()
                                 if cutoff_day <= day <= now.astimezone(SITE_TZ).date().isoformat()}
        if record["appearances"]:
            kept[link] = record
    history["items"] = kept


def build_board(history, start, now):
    start_day = start.date().isoformat()
    end_day = now.astimezone(SITE_TZ).date().isoformat()
    groups = {}
    for record in history["items"].values():
        published = timestamp(record["date"]) or timestamp(record["first_seen"])
        if published is None or not start <= published <= now:
            continue
        appearances = {day: names for day, names in record["appearances"].items()
                       if start_day <= day <= end_day}
        if not appearances:
            continue
        key = title_key(record["title"])
        group = groups.setdefault(key, {
            "title": record["title"], "link": record["link"],
            "date": published.isoformat(), "date_is_observed": not bool(record["date"]),
            "categories": set(), "sources": set(), "days": set(),
        })
        group["categories"].update(record["categories"])
        group["days"].update(appearances)
        for names in appearances.values():
            group["sources"].update(names)
    items = []
    for group in groups.values():
        group["source_count"] = len(group["sources"])
        group["observed_days"] = len(group.pop("days"))
        group["sources"] = sorted(group["sources"])
        group["categories"] = sorted(group["categories"])
        items.append(group)
    items.sort(key=lambda item: (-item["source_count"], -item["observed_days"],
                                -timestamp(item["date"]).timestamp(), item["link"]))
    categories = sorted({category for item in items for category in item["categories"]})
    # 各分类各保留前十，前端切换分类无需下载完整历史。
    by_category = {category: [item for item in items if category in item["categories"]][:TOP_N]
                   for category in categories}
    return {"start": start.isoformat(), "end": now.isoformat(), "total": len(items),
            "items": items[:TOP_N], "by_category": by_category}


def build_rankings(history, now):
    today = now.astimezone(SITE_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    week = today - dt.timedelta(days=today.weekday())
    month = today.replace(day=1)
    return {"generated_at": now.isoformat(), "updated": history.get("updated"),
            "timezone": "Asia/Singapore", "limit": TOP_N,
            "week": build_board(history, week, now),
            "month": build_board(history, month, now)}


def git_snapshots(now):
    """显式 --backfill 时读取已有提交；日常 Actions 不需要完整 Git 历史。"""
    since = (now - dt.timedelta(days=RETENTION_DAYS)).isoformat()
    commits = subprocess.check_output(
        ["git", "log", "--reverse", "--format=%H", "--since=" + since, "--", "data/news.json"],
        cwd=ROOT, text=True).splitlines()
    for commit in commits:
        raw = subprocess.check_output(["git", "show", commit + ":data/news.json"], cwd=ROOT)
        yield json.loads(raw)


def write_json(path, payload, compact=False):
    # 先写临时文件再替换，避免意外中断留下不完整的 JSON。
    pending = path.with_suffix(".tmp")
    if compact:
        # 历史按一条新闻一行保存，日常 Git diff 只显示真正变化的记录。
        entries = ["    " + json.dumps(key, ensure_ascii=False) + ": " + json.dumps(value, ensure_ascii=False)
                   for key, value in payload["items"].items()]
        content = '{\n  "updated": ' + json.dumps(payload.get("updated")) + ',\n  "items": {\n' + ",\n".join(entries) + "\n  }\n}\n"
    else:
        content = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    pending.write_text(content, encoding="utf-8")
    pending.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backfill", action="store_true", help="从本地 Git 历史补录最近 45 天的快照")
    args = parser.parse_args()
    now = dt.datetime.now(UTC).replace(microsecond=0)
    history_path = DATA / "news-history.json"
    # 损坏的历史应使任务失败，不能悄悄覆盖已有积累。
    history = json.loads(history_path.read_text(encoding="utf-8")) if history_path.exists() else {"items": {}}
    if args.backfill:
        snapshots = list(git_snapshots(now))
        for snapshot in sorted(snapshots, key=lambda item: timestamp(item.get("updated")) or dt.datetime.min.replace(tzinfo=UTC)):
            merge_snapshot(history, snapshot, now)
        print(f"Backfilled {len(snapshots)} snapshots from Git.")
    merge_snapshot(history, json.loads((DATA / "news.json").read_text(encoding="utf-8")), now)
    prune_history(history, now)
    rankings = build_rankings(history, now)
    write_json(history_path, history, compact=True)
    write_json(DATA / "news-rankings.json", rankings)
    print(f"Saved {len(history['items'])} articles; week: {rankings['week']['total']}, month: {rankings['month']['total']}.")


if __name__ == "__main__":
    main()
