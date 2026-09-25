import copy
import datetime as dt
import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
import build_news_rankings as rankings


def snapshot(at, title="A story", link="https://example.com/story", published=None,
             source="Source A", category="科技"):
    return {"updated": at, "sources": [{"name": source, "category": category,
            "items": [{"title": title, "link": link, "date": published if published is not None else at}]}]}


class RankingTests(unittest.TestCase):
    def setUp(self):
        self.now = rankings.timestamp("2026-09-16T12:00:00Z")
        self.history = {"items": {}}

    def add(self, **kwargs):
        rankings.merge_snapshot(self.history, snapshot(**kwargs), self.now)

    def boards(self):
        return rankings.build_rankings(self.history, self.now)

    def test_site_week_boundary_and_month_boundary(self):
        self.add(at="2026-09-13T15:59:59Z", title="Sunday", link="https://example.com/1")
        self.add(at="2026-09-13T16:00:00Z", title="Monday", link="https://example.com/2")
        self.add(at="2026-08-31T16:00:00Z", title="Month start", link="https://example.com/3")
        self.add(at="2026-08-31T15:59:59Z", title="Previous month", link="https://example.com/4")
        self.assertEqual([item["title"] for item in self.boards()["week"]["items"]], ["Monday"])
        self.assertEqual(self.boards()["month"]["total"], 3)

    def test_week_can_cross_month_and_year(self):
        self.now = rankings.timestamp("2027-01-01T10:00:00Z")
        self.add(at="2026-12-29T10:00:00Z")
        boards = self.boards()
        self.assertEqual(boards["week"]["total"], 1)
        self.assertEqual(boards["month"]["total"], 0)
        self.assertEqual(boards["week"]["start"], "2026-12-28T00:00:00+08:00")

    def test_reruns_and_hourly_snapshots_do_not_inflate_days(self):
        self.add(at="2026-09-14T01:00:00Z")
        before = copy.deepcopy(self.history)
        self.add(at="2026-09-14T01:00:00Z")
        self.assertEqual(before, self.history)
        self.add(at="2026-09-14T02:00:00Z")
        self.add(at="2026-09-15T01:00:00Z")
        item = self.boards()["week"]["items"][0]
        self.assertEqual((item["observed_days"], item["source_count"]), (2, 1))

    def test_tracking_links_and_matching_titles_merge_across_sources(self):
        self.add(at="2026-09-14T01:00:00Z", link="https://example.com/story?utm_source=rss#top")
        self.add(at="2026-09-14T02:00:00Z", source="Source B")
        self.add(at="2026-09-15T01:00:00Z", title="Ａ STORY", link="https://other.example/story", source="Source C", category="AI")
        self.assertEqual(len(self.history["items"]), 2)
        self.assertEqual(self.boards()["week"]["total"], 1)
        item = self.boards()["week"]["items"][0]
        self.assertEqual(item["source_count"], 3)
        self.assertEqual(item["observed_days"], 2)
        self.assertEqual(item["categories"], ["AI", "科技"])

    def test_source_count_then_days_then_recency(self):
        self.add(at="2026-09-14T01:00:00Z", title="Many sources", link="https://example.com/1")
        self.add(at="2026-09-14T01:00:00Z", title="Many sources", link="https://example.com/1", source="Source B")
        self.add(at="2026-09-14T01:00:00Z", title="Two days", link="https://example.com/2")
        self.add(at="2026-09-15T01:00:00Z", title="Two days", link="https://example.com/2")
        self.add(at="2026-09-15T01:00:00Z", title="Older", link="https://example.com/3")
        self.add(at="2026-09-16T01:00:00Z", title="Newest", link="https://example.com/4")
        self.assertEqual([item["title"] for item in self.boards()["week"]["items"]],
                         ["Many sources", "Two days", "Newest", "Older"])

    def test_same_link_can_belong_to_multiple_categories(self):
        self.add(at="2026-09-14T01:00:00Z", category="综合")
        self.add(at="2026-09-14T01:00:00Z", source="Source B", category="财经")
        board = self.boards()["week"]
        self.assertEqual(board["items"][0]["categories"], ["综合", "财经"])
        self.assertEqual(board["by_category"]["财经"][0]["source_count"], 2)

    def test_old_or_future_articles_cannot_enter_current_week(self):
        self.add(at="2026-09-15T01:00:00Z", title="Old", published="2026-09-05T01:00:00Z")
        self.add(at="2026-09-15T01:00:00Z", title="Future", link="https://example.com/2", published="2026-09-30T01:00:00Z")
        self.add(at="2026-09-30T01:00:00Z", title="Future snapshot", link="https://example.com/3")
        self.assertEqual(self.boards()["week"]["total"], 0)
        self.assertEqual(self.boards()["month"]["total"], 1)

    def test_publication_updates_do_not_resurface_old_story(self):
        self.add(at="2026-09-05T01:00:00Z")
        self.add(at="2026-09-15T01:00:00Z")
        self.assertEqual(self.boards()["week"]["total"], 0)

    def test_missing_date_uses_first_seen_and_is_labelled(self):
        self.add(at="2026-09-14T01:00:00Z", published="")
        self.add(at="2026-09-15T01:00:00Z", published="invalid")
        item = self.boards()["week"]["items"][0]
        self.assertTrue(item["date_is_observed"])
        self.assertEqual(item["date"], "2026-09-14T01:00:00+00:00")

    def test_limit_and_categories_have_their_own_top_ten(self):
        for index in range(15):
            self.add(at="2026-09-14T01:00:00Z", title=f"Story {index}", link=f"https://example.com/{index}")
        self.add(at="2026-09-14T01:00:00Z", title="AI story", link="https://example.com/z", category="AI")
        board = self.boards()["week"]
        self.assertEqual(board["total"], 16)
        self.assertEqual(len(board["items"]), 10)
        self.assertEqual(len(board["by_category"]["科技"]), 10)
        self.assertEqual(board["by_category"]["AI"][0]["title"], "AI story")

    def test_stale_snapshot_keeps_its_real_update_time(self):
        self.add(at="2026-09-14T01:00:00Z")
        self.assertEqual(self.boards()["updated"], "2026-09-14T01:00:00+00:00")
        self.assertEqual(self.boards()["generated_at"], self.now.isoformat())

    def test_retention_prunes_old_records(self):
        self.add(at="2026-09-14T01:00:00Z")
        rankings.prune_history(self.history, self.now + dt.timedelta(days=46))
        self.assertEqual(self.history["items"], {})

    def test_link_validation_preserves_content_query_parameters(self):
        self.assertEqual(rankings.canonical_link("javascript:alert(1)"), "")
        self.assertEqual(rankings.canonical_link("https://user:pass@example.com/"), "")
        self.assertEqual(rankings.canonical_link("https://example.com/view?id=1&utm_source=rss#top"), "https://example.com/view?id=1")
        self.assertNotEqual(rankings.canonical_link("https://example.com/view?id=1"), rankings.canonical_link("https://example.com/view?id=2"))

    def test_main_generates_both_files_and_reruns_without_extra_counts(self):
        with tempfile.TemporaryDirectory() as temporary:
            data = pathlib.Path(temporary)
            now = dt.datetime.now(rankings.UTC) - dt.timedelta(hours=1)
            (data / "news.json").write_text(json.dumps(snapshot(now.isoformat())), encoding="utf-8")
            with patch.object(rankings, "DATA", data), patch.object(sys, "argv", ["build_news_rankings.py"]):
                rankings.main()
                first = json.loads((data / "news-history.json").read_text(encoding="utf-8"))
                rankings.main()
            second = json.loads((data / "news-history.json").read_text(encoding="utf-8"))
            self.assertEqual(first, second)
            self.assertIn("week", json.loads((data / "news-rankings.json").read_text(encoding="utf-8")))


if __name__ == "__main__":
    unittest.main()
