#!/usr/bin/env python3
"""Daily journal metadata snapshot (stdlib only); CFP dates stay manually verified.

Keep existing records on partial failure, never invent a successful fetch time,
and limit automatic entries to title-matched journal articles from the last 180 days.
"""
import concurrent.futures
import datetime as dt
import html
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CATALOG = ROOT / 'data/research-catalog.json'
OUT = ROOT / 'data/research-feed.json'
QUERIES = {'point-cloud': 'point cloud lidar', 'navigation': 'robot navigation SLAM', 'avoidance': 'robot obstacle collision avoidance planning'}
UA = 'LevileoResearch/1.0 (+https://levileo-b.github.io/research/)'


def classify(title):
    text = title.lower().replace('–', '-').replace('—', '-')
    topics = []
    if re.search(r'point[ -]?cloud|\blidar\b|\blaser scann', text):
        topics.append('point-cloud')
    robot = re.search(r'robot|autonomous|\buavs?\b|\bauvs?\b|\bugvs?\b|\busvs?\b|drone|manipulator|unmanned', text)
    if re.search(r'\bslam\b|simultaneous locali[sz]ation|odometry', text) or robot and re.search(r'navigat|locali[sz]|mapping|exploration', text):
        topics.append('navigation')
    if robot and re.search(r'avoidance|collision|path planning|motion planning|trajectory planning', text):
        topics.append('avoidance')
    return topics


def publication_date(item):
    # Prefer online publication, not Crossref's deposit/index date or future issue date.
    for field in ('published-online', 'published', 'published-print', 'issued'):
        try:
            parts = item[field]['date-parts'][0]
            if len(parts) not in (2, 3):
                continue
            date = dt.date(*parts) if len(parts) == 3 else dt.date(*parts, 1)
            return date.isoformat() if len(parts) == 3 else date.strftime('%Y-%m')
        except (KeyError, TypeError, ValueError, IndexError):
            continue
    return None


def date_floor(value):
    """Month-only dates retain their precision; use month start only for filtering."""
    return dt.date.fromisoformat(value + '-01' if re.fullmatch(r'\d{4}-\d{2}', value) else value)


def normalize(item, journal, today):
    if item.get('type') != 'journal-article':
        return None
    title = html.unescape(re.sub(r'<[^>]+>', '', ' '.join(item.get('title', [])))).strip()
    topics = classify(title)
    date = publication_date(item)
    doi = str(item.get('DOI', '')).strip().lower()
    if not title or not topics or not re.fullmatch(r'10\.\d{4,9}/\S+', doi) or date is None or not 0 <= (today - date_floor(date)).days <= 180:
        return None
    kind = '更正' if re.match(r'correction|corrigendum|erratum', title, re.I) else '撤稿通知' if re.match(r'retract', title, re.I) else '期刊论文'
    return {'id': doi, 'title': title, 'journal_id': journal['id'], 'published': date,
            'topics': topics, 'kind': kind, 'url': 'https://doi.org/' + urllib.parse.quote(doi, safe='/():;'), 'source': 'crossref'}


def fetch_json(request):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
            # Honor short Retry-After values; a long server delay defers to next run.
            retry = exc.headers.get('Retry-After', '')
            delay = int(retry) if retry.isdigit() else 2 ** (attempt + 1)
            if delay > 30:
                raise
            time.sleep(delay)


def fetch_journal(journal, today):
    papers, errors = [], []
    successes = 0
    for topic in journal['topics']:
        params = urllib.parse.urlencode({
            'query.title': QUERIES[topic], 'rows': 40, 'sort': 'published', 'order': 'desc',
            'filter': 'type:journal-article,from-pub-date:' + (today - dt.timedelta(days=180)).isoformat() + ',until-pub-date:' + today.isoformat(),
            'select': 'DOI,title,type,published,published-online,published-print,issued'
        })
        url = 'https://api.crossref.org/journals/' + journal['issn'] + '/works?' + params
        request = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
        try:
            items = fetch_json(request)['message']['items']
            if not isinstance(items, list):
                raise ValueError('Crossref items must be a list')
            successes += 1
            papers.extend(p for item in items if (p := normalize(item, journal, today)))
        except Exception as exc:
            errors.append(topic + ': ' + type(exc).__name__ + (' ' + str(exc.code) if isinstance(exc, urllib.error.HTTPError) else ''))
    return papers, successes, errors


def merge_records(existing, incoming, today, journal_ids):
    unique = {}
    for item in existing + incoming:
        try:
            date = date_floor(item['published'])
            if item['journal_id'] not in journal_ids or not 0 <= (today - date).days <= 180:
                continue
            unique[item['id'].lower()] = item
        except (KeyError, TypeError, ValueError):
            continue
    # Per-journal cap avoids broad journals crowding all robotics journals out.
    counts, result = {}, []
    for item in sorted(unique.values(), key=lambda p: (p['published'], p['id']), reverse=True):
        journal = item['journal_id']
        counts[journal] = counts.get(journal, 0) + 1
        if counts[journal] <= 30:
            result.append(item)
    return result


def collect(catalog, previous, now, fetcher=fetch_journal):
    today = now.astimezone(dt.timezone(dt.timedelta(hours=8))).date()
    old_sources = {s['journal_id']: s for s in previous.get('sources', [])}
    incoming, sources, success_count = [], [], 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        jobs = {executor.submit(fetcher, j, today): j for j in catalog['journals']}
        for job in concurrent.futures.as_completed(jobs):
            journal = jobs[job]
            try:
                records, successes, errors = job.result()
            except Exception as exc:
                records, successes, errors = [], 0, [type(exc).__name__]
            success_count += successes
            incoming.extend(records)
            sources.append({'journal_id': journal['id'], 'status': 'partial' if successes and errors else 'error' if errors else 'ok',
                            'last_success': now.isoformat() if successes else old_sources.get(journal['id'], {}).get('last_success'), 'errors': errors})
    return {'schema_version': 1, 'updated': now.isoformat() if success_count else previous.get('updated'),
            'attempted_at': now.isoformat(), 'sources': sorted(sources, key=lambda s: s['journal_id']),
            'papers': merge_records(previous.get('papers', []), incoming, today, {j['id'] for j in catalog['journals']})}, success_count


def main():
    catalog = json.loads(CATALOG.read_text(encoding='utf-8'))
    # Invalid existing JSON must raise, so a damaged snapshot is never overwritten.
    previous = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {'papers': [], 'sources': [], 'updated': None}
    payload, successes = collect(catalog, previous, dt.datetime.now(dt.timezone.utc))
    temp = OUT.with_suffix('.tmp')
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(OUT)
    for source in payload['sources']:
        print(source['journal_id'] + ': ' + source['status'])
    print('Retained %d papers; successful queries: %d' % (len(payload['papers']), successes))
    return 0 if successes else 1


if __name__ == '__main__':
    sys.exit(main())
