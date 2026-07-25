// 实时热点的响应整形 —— 纯逻辑，可在 Node 里单测。
//
// 这里只收录「浏览器能直接请求到」的源：它们都开放 CORS 且不需要 API key，
// 所以能做到真正实时，而不像首页那个窗格是 Actions 定时抓好的快照。
// 微博热搜、知乎热榜这类接口不开放跨域，只能以链接入口的形式给出。
(function (root) {

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }

  // Hacker News：https://hacker-news.firebaseio.com/v0/item/<id>.json
  function hnItem(it) {
    if (!it || !it.title) return null;
    return {
      title: String(it.title),
      // Ask HN 这类没有外链，指回 HN 讨论页
      link: it.url || ('https://news.ycombinator.com/item?id=' + it.id),
      comments: 'https://news.ycombinator.com/item?id=' + it.id,
      score: num(it.score),
      count: num(it.descendants),
      by: it.by || '',
      ts: num(it.time) * 1000
    };
  }

  // Reddit：https://www.reddit.com/r/popular/hot.json
  function reddit(json) {
    var children;
    try { children = json.data.children; } catch (e) { return []; }
    if (!Array.isArray(children)) return [];
    return children.map(function (c) {
      var d = c && c.data;
      if (!d || !d.title) return null;
      return {
        title: String(d.title),
        link: d.url_overridden_by_dest || ('https://www.reddit.com' + (d.permalink || '')),
        comments: 'https://www.reddit.com' + (d.permalink || ''),
        score: num(d.score),
        count: num(d.num_comments),
        by: d.subreddit ? 'r/' + d.subreddit : '',
        ts: num(d.created_utc) * 1000
      };
    }).filter(Boolean);
  }

  // GitHub：https://api.github.com/search/repositories?q=created:>...&sort=stars
  function github(json) {
    var items = json && json.items;
    if (!Array.isArray(items)) return [];
    return items.map(function (r) {
      if (!r || !r.full_name) return null;
      return {
        title: String(r.full_name),
        desc: r.description || '',
        link: r.html_url || ('https://github.com/' + r.full_name),
        comments: '',
        score: num(r.stargazers_count),
        count: num(r.forks_count),
        by: r.language || '',
        ts: Date.parse(r.created_at || '') || 0
      };
    }).filter(Boolean);
  }

  // 取「最近 N 天内创建」的仓库，按星标排序
  function githubQuery(days, perPage) {
    var d = new Date(Date.now() - (days || 7) * 86400000);
    var since = d.toISOString().slice(0, 10);
    return 'https://api.github.com/search/repositories?q=' +
           encodeURIComponent('created:>' + since) +
           '&sort=stars&order=desc&per_page=' + (perPage || 12);
  }

  var api = { hnItem: hnItem, reddit: reddit, github: github, githubQuery: githubQuery };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HotParse = api;
})(typeof self !== 'undefined' ? self : this);
