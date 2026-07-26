// 实时热点的响应整形 —— 纯逻辑，可在 Node 里单测。
//
// 这里只收录「浏览器能直接请求到」的源：它们都开放 CORS 且不需要 API key，
// 所以能做到真正实时，而不像首页那个窗格是 Actions 定时抓好的快照。
// 微博热搜、知乎热榜这类接口不开放跨域，只能以链接入口的形式给出。
(function (root) {

  function num(v) {
    var n = Number(v);
    return v !== null && v !== '' && isFinite(n) ? n : 0;
  }

  function plainText(value) {
    var named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    return String(value == null ? '' : value)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&#x([0-9a-f]+);/gi, function (_, n) {
        return String.fromCodePoint(parseInt(n, 16));
      })
      .replace(/&#(\d+);/g, function (_, n) {
        return String.fromCodePoint(parseInt(n, 10));
      })
      .replace(/&([a-z]+);/gi, function (all, name) {
        return Object.prototype.hasOwnProperty.call(named, name.toLowerCase()) ?
          named[name.toLowerCase()] : all;
      })
      .replace(/\s+/g, ' ')
      .trim();
  }

  function shorten(value, max) {
    var text = plainText(value);
    return text.length > max ? text.slice(0, max - 1).trim() + '…' : text;
  }

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

  // DEV Community：https://dev.to/api/articles?top=7
  function dev(json) {
    if (!Array.isArray(json)) return [];
    return json.map(function (a) {
      if (!a || !a.title || !a.url) return null;
      return {
        title: String(a.title),
        desc: a.description || '',
        link: a.url,
        comments: a.url + '#comments',
        score: num(a.public_reactions_count || a.positive_reactions_count),
        count: num(a.comments_count),
        by: a.user && (a.user.name || a.user.username) || '',
        ts: Date.parse(a.published_timestamp || a.published_at || '') || 0
      };
    }).filter(Boolean);
  }

  // Stack Overflow：https://api.stackexchange.com/2.3/questions?sort=hot
  function stackOverflow(json) {
    var items = json && json.items;
    if (!Array.isArray(items)) return [];
    return items.map(function (q) {
      if (!q || !q.title || !q.link) return null;
      return {
        title: plainText(q.title),
        link: q.link,
        comments: q.link,
        score: num(q.score),
        count: num(q.answer_count),
        by: Array.isArray(q.tags) ? q.tags.slice(0, 2).join(' · ') : '',
        ts: num(q.last_activity_date || q.creation_date) * 1000
      };
    }).filter(Boolean);
  }

  // Mastodon：https://mastodon.social/api/v1/trends/statuses
  function mastodon(json) {
    if (!Array.isArray(json)) return [];
    return json.map(function (status) {
      var s = status && (status.reblog || status);
      var title = s && shorten(s.content || s.spoiler_text, 140);
      if (!s || !title || !s.url) return null;
      return {
        title: title,
        desc: s.card && s.card.title ? shorten(s.card.title, 100) : '',
        link: s.url,
        comments: s.url,
        score: num(s.favourites_count) + num(s.reblogs_count),
        count: num(s.replies_count),
        by: s.account && (s.account.display_name || s.account.acct) || '',
        ts: Date.parse(s.created_at || '') || 0
      };
    }).filter(Boolean);
  }

  // Wikimedia Analytics：中文维基百科前一日浏览量榜单
  function wikipedia(json) {
    var first = json && json.items && json.items[0];
    var articles = first && first.articles;
    if (!Array.isArray(articles)) return [];

    var ts = first.year && first.month && first.day ?
      Date.UTC(num(first.year), num(first.month) - 1, num(first.day)) : 0;

    return articles.map(function (a) {
      var raw = a && a.article;
      if (!raw || /^(?:Main_Page$|首页$|Special:|特殊:|Wikipedia:|维基百科:|-$)/i.test(raw)) return null;
      var title = raw.replace(/_/g, ' ');
      try { title = decodeURIComponent(title); } catch (e) {}
      return {
        title: title,
        link: 'https://zh.wikipedia.org/wiki/' + encodeURIComponent(raw),
        comments: '',
        score: num(a.views),
        count: 0,
        by: '中文维基百科',
        ts: ts
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

  function wikipediaQuery(daysAgo) {
    var d = new Date(Date.now() - (daysAgo || 1) * 86400000);
    return 'https://wikimedia.org/api/rest_v1/metrics/pageviews/top/' +
      'zh.wikipedia.org/all-access/' + d.getUTCFullYear() + '/' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '/' +
      String(d.getUTCDate()).padStart(2, '0');
  }

  var api = {
    hnItem: hnItem,
    github: github,
    dev: dev,
    stackOverflow: stackOverflow,
    mastodon: mastodon,
    wikipedia: wikipedia,
    githubQuery: githubQuery,
    wikipediaQuery: wikipediaQuery
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HotParse = api;
})(typeof self !== 'undefined' ? self : this);
