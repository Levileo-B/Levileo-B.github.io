import datetime as dt
import pathlib
import sys
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'scripts'))
import fetch_research as research


class ResearchTests(unittest.TestCase):
    today = dt.date(2026, 9, 28)
    now = dt.datetime(2026, 9, 28, tzinfo=dt.timezone.utc)
    journal = {'id': 'test', 'issn': '1234-5678', 'topics': ['navigation']}

    def item(self, **changes):
        return {'title': ['Robot navigation with LiDAR point clouds and collision avoidance'],
                'type': 'journal-article', 'DOI': '10.1234/ABC', 'published-online': {'date-parts': [[2026, 9, 21]]}, **changes}

    def test_topics_require_robot_context_for_navigation_and_avoidance(self):
        self.assertEqual(research.classify('Collision avoidance for autonomous robots'), ['avoidance'])
        self.assertEqual(research.classify('LiDAR-inertial odometry for SLAM'), ['point-cloud', 'navigation'])
        self.assertEqual(research.classify('Collision avoidance in communication networks'), [])
        self.assertEqual(research.classify('Navigation of website pages'), [])

    def test_prefer_online_date_and_preserve_month_precision(self):
        self.assertEqual(research.publication_date(self.item(published={'date-parts': [[2027, 1, 1]]})), '2026-09-21')
        month = self.item(**{'published-online': {'date-parts': [[2026, 9]]}})
        self.assertEqual(research.normalize(month, self.journal, self.today)['published'], '2026-09')
        self.assertIsNone(research.publication_date({'published': {'date-parts': [[2026]]}}))

    def test_future_missing_old_dates_and_proceedings_excluded(self):
        for parts in ([[2026, 9, 29]], [[2027, 1]], [[2025, 1, 1]], [[2026, 2, 30]], []):
            item = self.item(**{'published-online': {'date-parts': parts}})
            self.assertIsNone(research.normalize(item, self.journal, self.today))
        self.assertIsNone(research.normalize(self.item(type='proceedings-article'), self.journal, self.today))

    def test_metadata_doi_and_title_cleaned(self):
        item = research.normalize(self.item(title=['<i>Robot</i> navigation &amp; SLAM']), self.journal, self.today)
        self.assertEqual(item['title'], 'Robot navigation & SLAM')
        self.assertEqual(item['id'], '10.1234/abc')
        self.assertEqual(item['url'], 'https://doi.org/10.1234/abc')
        self.assertIsNone(research.normalize(self.item(DOI='javascript:alert(1)'), self.journal, self.today))

    def test_corrections_are_not_presented_as_new_research(self):
        item = research.normalize(self.item(title=['Correction: Robot navigation']), self.journal, self.today)
        self.assertEqual(item['kind'], '更正')

    def test_partial_failure_preserves_other_journal_records(self):
        old = {'id': '10.1234/old', 'journal_id': 'failed', 'published': '2026-09-01', 'title': 'Robot navigation'}
        new = {'id': '10.1234/new', 'journal_id': 'test', 'published': '2026-09-20', 'title': 'Robot navigation'}
        catalog = {'journals': [self.journal, {'id': 'failed'}]}
        def fetcher(j, date):
            return ([new], 1, []) if j['id'] == 'test' else ([], 0, ['HTTPError 503'])
        previous = {'papers': [old], 'sources': [{'journal_id': 'failed', 'last_success': '2026-09-01T00:00:00+00:00'}]}
        result, count = research.collect(catalog, previous, self.now, fetcher)
        self.assertEqual(count, 1)
        self.assertEqual({p['id'] for p in result['papers']}, {new['id'], old['id']})
        self.assertEqual(result['sources'][0]['last_success'], '2026-09-01T00:00:00+00:00')

    def test_total_failure_never_advances_success_timestamp(self):
        previous = {'updated': '2026-09-01T00:00:00+00:00', 'papers': [], 'sources': []}
        result, count = research.collect({'journals': [self.journal]}, previous, self.now, lambda j, d: ([], 0, ['error']))
        self.assertEqual(count, 0)
        self.assertEqual(result['updated'], previous['updated'])
        self.assertEqual(result['sources'][0]['status'], 'error')
        self.assertIsNone(result['sources'][0]['last_success'])

    def test_merge_deduplicates_and_retires_old_records(self):
        base = {'id': '10.1234/abc', 'journal_id': 'test', 'published': '2026-09', 'title': 'old'}
        records = research.merge_records([base, {**base, 'id': '10.1234/old', 'published': '2025-01'}],
                                         [{**base, 'id': '10.1234/ABC', 'title': 'new'}], self.today, {'test'})
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]['title'], 'new')

    def test_rate_limit_retry_is_bounded(self):
        error = HTTPError('https://api.crossref.org', 429, 'rate limited', {'Retry-After': '2'}, None)
        with patch.object(research.urllib.request, 'urlopen', side_effect=error) as request, patch.object(research.time, 'sleep') as sleep:
            with self.assertRaises(HTTPError):
                research.fetch_json(None)
            self.assertEqual(request.call_count, 3)
            self.assertEqual(sleep.call_count, 2)


if __name__ == '__main__':
    unittest.main()
