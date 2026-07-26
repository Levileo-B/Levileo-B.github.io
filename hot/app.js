// 实时热点：浏览器直连六个开放跨域的接口，整形逻辑在 parse.js
(function () {
  var P = window.HotParse;
  var live = document.getElementById('live');
  var stamp = document.getElementById('stamp');
  var refreshBtn = document.getElementById('refresh');
  var autoEl = document.getElementById('auto');

  var ITEM_LIMIT = 12;
  var AUTO_MS = 5 * 60 * 1000;
  var timer = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ago(ms) {
    if (!ms) return '';
    var diff = (Date.now() - ms) / 1000;
    if (diff < 0) return '刚刚';
    if (diff < 3600) return Math.max(1, Math.floor(diff / 60)) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    return Math.floor(diff / 86400) + ' 天前';
  }

  function formatNumber(n) {
    return Number(n).toLocaleString('zh-CN');
  }

  function getJSON(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // ---------- 六个数据源 ----------
  function loadHN() {
    return getJSON('https://hacker-news.firebaseio.com/v0/topstories.json')
      .then(function (ids) {
        if (!Array.isArray(ids)) throw new Error('响应格式异常');
        return Promise.all(ids.slice(0, ITEM_LIMIT).map(function (id) {
          return getJSON('https://hacker-news.firebaseio.com/v0/item/' + id + '.json')
            .then(P.hnItem)
            .catch(function () { return null; });
        }));
      })
      .then(function (list) { return list.filter(Boolean); });
  }

  function loadGitHub() {
    return getJSON(P.githubQuery(7, ITEM_LIMIT)).then(P.github);
  }

  function loadDev() {
    return getJSON('https://dev.to/api/articles?top=7&per_page=' + ITEM_LIMIT).then(P.dev);
  }

  function loadStackOverflow() {
    return getJSON('https://api.stackexchange.com/2.3/questions?' +
      'site=stackoverflow&order=desc&sort=hot&pagesize=' + ITEM_LIMIT)
      .then(P.stackOverflow);
  }

  function loadMastodon() {
    return getJSON('https://mastodon.social/api/v1/trends/statuses?limit=' + ITEM_LIMIT)
      .then(P.mastodon);
  }

  function loadWikipedia(daysAgo) {
    var offset = daysAgo || 1;
    return getJSON(P.wikipediaQuery(offset))
      .then(P.wikipedia)
      .then(function (items) { return items.slice(0, ITEM_LIMIT); })
      .catch(function (error) {
        // Wikimedia 日榜偶尔延迟生成，自动向前回退两天。
        if (offset < 3) return loadWikipedia(offset + 1);
        throw error;
      });
  }

  var PANELS = [
    { key: 'hn', title: 'Hacker News', note: '当前 Top', unit: '分', countUnit: '评论',
      load: loadHN, home: 'https://news.ycombinator.com' },
    { key: 'gh', title: 'GitHub 新星', note: '近 7 天新建 · 按星标', unit: '★', countUnit: 'fork',
      load: loadGitHub, home: 'https://github.com/trending' },
    { key: 'dev', title: 'DEV Community', note: '近 7 天热门文章', unit: '反应', countUnit: '评论',
      load: loadDev, home: 'https://dev.to/top/week' },
    { key: 'so', title: 'Stack Overflow', note: '当前热门问题', unit: '分', countUnit: '回答',
      load: loadStackOverflow, home: 'https://stackoverflow.com/questions?tab=Hot' },
    { key: 'mastodon', title: 'Mastodon 趋势', note: '公开热门嘟文', unit: '互动', countUnit: '回复',
      load: loadMastodon, home: 'https://mastodon.social/explore' },
    { key: 'wiki', title: '中文维基热榜', note: '昨日浏览排行', unit: '次浏览', countUnit: '',
      load: loadWikipedia, home: 'https://zh.wikipedia.org/wiki/Special:PopularPages' }
  ];

  // ---------- 渲染 ----------
  function itemHtml(it, panel, i) {
    var meta = [];
    if (it.score) meta.push(formatNumber(it.score) + ' ' + panel.unit);
    if (it.count) meta.push(formatNumber(it.count) + ' ' + panel.countUnit);
    if (it.by) meta.push(esc(it.by));
    var when = ago(it.ts);
    if (when) meta.push(when);

    return '<li class="hot-item">' +
             '<span class="hot-item__rank">' + (i + 1) + '</span>' +
             '<div class="hot-item__body">' +
               '<a href="' + esc(it.link) + '" target="_blank" rel="noopener noreferrer">' +
                 esc(it.title) + '</a>' +
               (it.desc ? '<p class="hot-item__desc">' + esc(it.desc) + '</p>' : '') +
               '<div class="hot-item__meta">' + meta.join(' · ') +
                 (it.comments ? ' · <a href="' + esc(it.comments) +
                   '" target="_blank" rel="noopener noreferrer">讨论</a>' : '') +
               '</div>' +
             '</div>' +
           '</li>';
  }

  function panelShell(p, inner) {
    return '<section class="hot-panel" data-key="' + p.key + '">' +
             '<div class="hot-panel__head">' +
               '<h2 class="hot-panel__title">' + esc(p.title) + '</h2>' +
               '<a class="hot-panel__more" href="' + esc(p.home) +
                 '" target="_blank" rel="noopener">' + esc(p.note) + ' →</a>' +
             '</div>' + inner +
           '</section>';
  }

  function renderPanel(p, state, data) {
    var el = live.querySelector('[data-key="' + p.key + '"]');
    var inner;
    if (state === 'loading') inner = '<p class="spinner">加载中…</p>';
    else if (state === 'error') inner = '<p class="hint">没能取到数据（' + esc(data) +
      '）。可能是接口限流、网络不通，或浏览器扩展拦截了请求。</p>';
    else if (!data.length) inner = '<p class="hint">暂时没有内容。</p>';
    else inner = '<ol class="hot-list">' + data.map(function (it, i) {
      return itemHtml(it, p, i);
    }).join('') + '</ol>';

    var html = panelShell(p, inner);
    if (el) el.outerHTML = html;
    else live.insertAdjacentHTML('beforeend', html);
  }

  var lastLoad = 0;

  function loadAll() {
    lastLoad = Date.now();
    refreshBtn.disabled = true;
    stamp.textContent = '正在拉取…';

    PANELS.forEach(function (p) { renderPanel(p, 'loading'); });

    var done = 0;
    PANELS.forEach(function (p) {
      p.load()
        .then(function (data) { renderPanel(p, 'ok', data); })
        .catch(function (e) { renderPanel(p, 'error', e.message); })
        .then(function () {
          if (++done === PANELS.length) {
            refreshBtn.disabled = false;
            stamp.textContent = '更新于 ' + new Date().toTimeString().slice(0, 8);
          }
        });
    });
  }

  function setAuto(on) {
    clearInterval(timer);
    if (on) timer = setInterval(loadAll, AUTO_MS);
  }

  refreshBtn.addEventListener('click', loadAll);
  autoEl.addEventListener('change', function () { setAuto(autoEl.checked); });

  // 切回这个标签页且距上次刷新超过 5 分钟时补一次
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && autoEl.checked && Date.now() - lastLoad > AUTO_MS) loadAll();
  });

  loadAll();
  setAuto(true);
})();
