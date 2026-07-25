#!/usr/bin/env python3
"""抓取「每日一题」与「每日英文」，写入 data/daily.json。

为什么放在服务端跑：
- LeetCode 的 GraphQL 接口不发 CORS 头，浏览器直连会被拦
- 维基百科接口虽然开放跨域，但顺手一起抓可以少一次前端请求

版权上的取舍：
- LeetCode 只存标题、难度、标签和链接这类元信息，不存题面正文
- 英文短文取维基百科「每日精选条目」的摘要，CC BY-SA 4.0，
  页面上标注来源与许可并回链原文
- 视频与音乐都取自 Internet Archive 的公有领域 / CC 授权馆藏，
  归档站明确允许直链，页面上标注出处与许可
"""

import datetime
import json
import pathlib
import random
import sys
import urllib.parse
import urllib.request

TIMEOUT = 15
UA = "Mozilla/5.0 (compatible; LevileoBot/1.0; +https://levileo-b.github.io/)"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "daily.json"

LC_QUERY = """
query questionOfToday {
  activeDailyCodingChallengeQuestion {
    date
    link
    question {
      questionFrontendId
      title
      translatedTitle
      titleSlug
      difficulty
      topicTags { name translatedName }
    }
  }
}
"""

# 先试中文站（有中文标题），不行再退回国际站
LC_ENDPOINTS = [
    ("https://leetcode.cn/graphql", "https://leetcode.cn"),
    ("https://leetcode.com/graphql", "https://leetcode.com"),
]


def post_json(url: str, payload: dict, referer: str) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": UA,
            "Referer": referer,
            "Origin": referer,
        },
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_json(url: str) -> dict:
    req = urllib.request.Request(
        url, headers={"User-Agent": UA, "Accept": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_leetcode() -> dict:
    last = None
    for endpoint, referer in LC_ENDPOINTS:
        try:
            data = post_json(endpoint, {"query": LC_QUERY, "variables": {}}, referer)
            node = (data.get("data") or {}).get("activeDailyCodingChallengeQuestion")
            if not node:
                raise ValueError("响应里没有 activeDailyCodingChallengeQuestion")
            q = node.get("question") or {}
            title_en = q.get("title") or ""
            title_cn = q.get("translatedTitle") or ""
            slug = q.get("titleSlug") or ""
            link = node.get("link") or ""
            if link and not link.startswith("http"):
                link = referer + link
            tags = []
            for t in q.get("topicTags") or []:
                tags.append(t.get("translatedName") or t.get("name") or "")
            return {
                "date": node.get("date") or "",
                "id": q.get("questionFrontendId") or "",
                "title": title_cn or title_en,
                "titleEn": title_en,
                "slug": slug,
                "difficulty": q.get("difficulty") or "",
                "tags": [t for t in tags if t][:4],
                "link": link or (referer + "/problems/" + slug + "/"),
                "source": referer,
            }
        except Exception as exc:
            last = f"{endpoint}: {type(exc).__name__}: {exc}"
            print(f"[warn] LeetCode {last}", file=sys.stderr)
    raise RuntimeError(last or "全部端点均失败")


def fetch_english() -> dict:
    """维基百科每日精选条目摘要，CC BY-SA 4.0。"""
    today = datetime.datetime.now(datetime.timezone.utc)
    base = "https://en.wikipedia.org/api/rest_v1/feed/featured/"
    err = None

    # 当天的精选偶尔还没出，往前回退两天
    for back in range(3):
        d = today - datetime.timedelta(days=back)
        url = base + d.strftime("%Y/%m/%d")
        try:
            data = get_json(url)
            tfa = data.get("tfa")
            if not tfa or not tfa.get("extract"):
                raise ValueError("当天没有 tfa 摘要")
            text = tfa["extract"].strip()
            page = ((tfa.get("content_urls") or {}).get("desktop") or {}).get("page", "")
            return {
                "title": (tfa.get("titles") or {}).get("normalized") or tfa.get("title", ""),
                "text": text,
                "words": len([w for w in text.split() if w.strip()]),
                "url": page or "https://en.wikipedia.org/",
                "date": d.strftime("%Y-%m-%d"),
                "source": "Wikipedia 每日精选条目",
                "license": "CC BY-SA 4.0",
                "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
            }
        except Exception as exc:
            err = f"{url}: {type(exc).__name__}: {exc}"
            print(f"[warn] Wikipedia {err}", file=sys.stderr)

    raise RuntimeError(err or "维基百科精选获取失败")


# ---------------- Internet Archive ----------------
IA_SEARCH = "https://archive.org/advancedsearch.php"
IA_META = "https://archive.org/metadata/"
IA_DL = "https://archive.org/download/"


def ia_search(query: str, rows: int = 80):
    """按条件搜馆藏，返回 [{identifier, title, year, licenseurl}]。"""
    params = [
        ("q", query),
        ("rows", str(rows)),
        ("page", "1"),
        ("output", "json"),
    ]
    for f in ("identifier", "title", "year", "licenseurl", "creator"):
        params.append(("fl[]", f))
    url = IA_SEARCH + "?" + urllib.parse.urlencode(params)
    data = get_json(url)
    return ((data.get("response") or {}).get("docs")) or []


def ia_pick_file(identifier: str, exts, prefer):
    """在条目的文件列表里挑一个可直接播放的文件，返回 (直链, 文件名)。"""
    meta = get_json(IA_META + identifier)
    files = meta.get("files") or []

    def score(f):
        name = (f.get("name") or "").lower()
        fmt = (f.get("format") or "").lower()
        if not name.endswith(exts):
            return -1
        for i, key in enumerate(prefer):
            if key in fmt or key in name:
                return len(prefer) - i
        return 1

    best, best_score = None, 0
    for f in files:
        sc = score(f)
        if sc > best_score:
            best, best_score = f, sc
    if not best:
        return None, None
    name = best.get("name") or ""
    return IA_DL + identifier + "/" + urllib.parse.quote(name), name


def _first(v):
    if isinstance(v, list):
        return v[0] if v else ""
    return v or ""


def fetch_video() -> dict:
    """每日趣味视频：Prelinger 档案馆的公有领域短片，按日期选，当天固定。"""
    docs = ia_search("collection:(prelinger) AND mediatype:(movies)", rows=100)
    if not docs:
        raise ValueError("搜索没有返回条目")

    today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    rng = random.Random(today)                 # 同一天选同一个，跨天才换
    order = list(range(len(docs)))
    rng.shuffle(order)

    last = None
    for idx in order[:12]:                     # 挑不到可播文件就顺延
        d = docs[idx]
        ident = d.get("identifier")
        if not ident:
            continue
        try:
            url, name = ia_pick_file(
                ident, (".mp4", ".m4v"), ("512kb", "mpeg4", "h.264", "mp4")
            )
            if not url:
                raise ValueError("没有可播放的 mp4")
            return {
                "title": _first(d.get("title")) or ident,
                "creator": _first(d.get("creator")),
                "year": str(_first(d.get("year")) or ""),
                "url": url,
                "page": "https://archive.org/details/" + ident,
                "date": today,
                "source": "Internet Archive · Prelinger Archives",
                "license": "公有领域",
                "licenseUrl": "https://archive.org/details/prelinger",
            }
        except Exception as exc:
            last = f"{ident}: {type(exc).__name__}: {exc}"
    raise RuntimeError(last or "没挑到可播放的视频")


def fetch_music(limit: int = 12) -> list:
    """背景音乐歌单：Netlabels 馆藏，均为 CC 授权。"""
    docs = ia_search(
        "collection:(netlabels) AND mediatype:(audio) AND format:(VBR MP3)", rows=100
    )
    if not docs:
        raise ValueError("搜索没有返回条目")

    random.shuffle(docs)
    tracks = []
    for d in docs:
        if len(tracks) >= limit:
            break
        ident = d.get("identifier")
        if not ident:
            continue
        try:
            url, name = ia_pick_file(ident, (".mp3",), ("vbr mp3", "mp3"))
            if not url:
                continue
            tracks.append({
                "title": _first(d.get("title")) or name or ident,
                "artist": _first(d.get("creator")),
                "url": url,
                "page": "https://archive.org/details/" + ident,
                "license": _first(d.get("licenseurl")) or "Creative Commons",
            })
        except Exception:
            continue

    if not tracks:
        raise RuntimeError("没挑到可播放的音频")
    return tracks


def main() -> int:
    payload = {
        "updated": datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
    }
    failed = []

    for key, fn, label in (("leetcode", fetch_leetcode, "LeetCode 每日一题"),
                           ("english", fetch_english, "每日英文短文"),
                           ("video", fetch_video, "每日趣味视频"),
                           ("music", fetch_music, "背景音乐歌单")):
        try:
            payload[key] = fn()
            n = len(payload[key]) if isinstance(payload[key], list) else 1
            print(f"[ok]   {label}" + (f"：{n} 首" if key == "music" else ""))
        except Exception as exc:
            failed.append(label)
            print(f"[fail] {label}: {type(exc).__name__}: {exc}", file=sys.stderr)

    if len(failed) == 4:
        print("四项全部失败，保留上一次的 data/daily.json 不覆盖。", file=sys.stderr)
        return 1

    if failed:
        payload["failed"] = failed

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n写入 {OUT.name}" + (f"；失败：{', '.join(failed)}" if failed else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
