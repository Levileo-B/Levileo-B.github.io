// 热点新闻窗格：读取由 GitHub Actions 每日生成的 data/news.json
(function () {
  var box = document.getElementById('news-body');
  var stamp = document.getElementById('news-updated');
  if (!box) return;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 输出「3 小时前」这类相对时间，超过一周则退回日期
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

  function render(data) {
    var sources = (data && data.sources) || [];
    if (!sources.length) {
      box.innerHTML = '<p class="news__empty">暂时没有拿到新闻内容。</p>';
      return;
    }

    var html = sources.map(function (src) {
      var items = (src.items || []).map(function (it) {
        var when = ago(it.date);
        return '<li class="news__item">' +
                 '<a href="' + esc(it.link) + '" target="_blank" rel="noopener noreferrer">' +
                   esc(it.title) +
                 '</a>' +
                 (when ? '<time class="news__time">' + esc(when) + '</time>' : '') +
               '</li>';
      }).join('');

      return '<div class="news__group">' +
               '<h3 class="news__source">' + esc(src.name) + '</h3>' +
               '<ul class="news__list">' + items + '</ul>' +
             '</div>';
    }).join('');

    box.innerHTML = html;

    if (stamp && data.updated) {
      var when = ago(data.updated);
      stamp.textContent = when ? '更新于 ' + when : '';
    }
  }

  function fail(msg) {
    box.innerHTML = '<p class="news__empty">' + esc(msg) + '</p>';
  }

  fetch('data/news.json', { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(render)
    .catch(function () {
      // 本地用 file:// 直接打开时 fetch 会被 CORS 拦掉，这属于预期情况
      fail('新闻数据还没生成。等 GitHub Actions 跑过一次「更新每日热点」后，这里就会有内容。');
    });
})();
