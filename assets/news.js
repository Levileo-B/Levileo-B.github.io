// 热点新闻窗格：读取由 GitHub Actions 定时生成的 data/news.json
//
// 源变多以后不再按源分栏（二十几栏没法看），改成按分类合并：
// 同一分类下的条目打散、按时间倒序，每条标注来源。
(function () {
  var box = document.getElementById('news-body');
  var stamp = document.getElementById('news-updated');
  if (!box) return;

  var PER_CATEGORY = 8;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ago(iso) {
    if (!iso) return '';
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var diff = (Date.now() - t) / 1000;
    if (diff < 0) return '刚刚';
    if (diff < 3600) return Math.max(1, Math.floor(diff / 60)) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 604800) return Math.floor(diff / 86400) + ' 天前';
    return new Date(t).toLocaleDateString('zh-CN');
  }

  // 把 sources 打散重组成 { 分类: [条目...] }，条目带上来源名
  function groupByCategory(sources) {
    var map = {};
    var order = [];
    sources.forEach(function (src) {
      var cat = src.category || '其他';
      if (!map[cat]) { map[cat] = []; order.push(cat); }
      (src.items || []).forEach(function (it) {
        map[cat].push({
          title: it.title,
          link: it.link,
          date: it.date,
          source: src.name,
          ts: Date.parse(it.date || '') || 0
        });
      });
    });
    order.forEach(function (cat) {
      map[cat].sort(function (a, b) { return b.ts - a.ts; });
      map[cat] = map[cat].slice(0, PER_CATEGORY);
    });
    return { order: order, map: map };
  }

  function render(data) {
    var sources = (data && data.sources) || [];
    if (!sources.length) {
      box.innerHTML = '<p class="news__empty">暂时没有拿到新闻内容。</p>';
      return;
    }

    var g = groupByCategory(sources);

    box.innerHTML = g.order.map(function (cat) {
      var items = g.map[cat].map(function (it) {
        var when = ago(it.date);
        return '<li class="news__item">' +
                 '<a href="' + esc(it.link) + '" target="_blank" rel="noopener noreferrer">' +
                   esc(it.title) +
                 '</a>' +
                 '<span class="news__line">' +
                   '<span class="news__src">' + esc(it.source) + '</span>' +
                   (when ? '<time class="news__time">' + esc(when) + '</time>' : '') +
                 '</span>' +
               '</li>';
      }).join('');
      return '<div class="news__group">' +
               '<h3 class="news__source">' + esc(cat) + '</h3>' +
               '<ul class="news__list">' + items + '</ul>' +
             '</div>';
    }).join('');

    if (stamp && data.updated) {
      var when = ago(data.updated);
      var n = sources.length;
      stamp.textContent = (when ? '更新于 ' + when : '') + ' · ' + n + ' 个源';
    }
  }

  fetch('data/news.json', { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(render)
    .catch(function () {
      // 本地用 file:// 直接打开时 fetch 会被 CORS 拦掉，这属于预期情况
      box.innerHTML = '<p class="news__empty">新闻数据还没生成。' +
        '等 GitHub Actions 跑过一次「更新热点」后，这里就会有内容。</p>';
    });
})();
