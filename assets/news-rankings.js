// 周榜 / 月榜单独加载，某个数据文件失败不影响每日热点。
(function () {
  var root = document.getElementById('news-rankings');
  if (!root) return;
  var picker = document.getElementById('ranking-category');
  var status = document.getElementById('ranking-status');
  var data;
  var stalePeriod = {};

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function safeLink(link) {
    try {
      var url = new URL(link);
      return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : '';
    } catch (e) { return ''; }
  }

  function dateLabel(value, withTime) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return '';
    var options = { timeZone: 'Asia/Singapore', month: 'numeric', day: 'numeric' };
    if (withTime) { options.hour = '2-digit'; options.minute = '2-digit'; }
    return date.toLocaleString('zh-CN', options);
  }

  function siteDay(value) {
    return new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 10);
  }

  function periodStart(period) {
    var today = new Date(Date.now() + 8 * 3600000);
    if (period === 'month') today.setUTCDate(1);
    else today.setUTCDate(today.getUTCDate() - (today.getUTCDay() + 6) % 7);
    return today.toISOString().slice(0, 10);
  }

  function renderBoard(period) {
    var board = data[period];
    var body = document.getElementById(period + '-ranking-body');
    var category = picker.value;
    var items = category ? (board.by_category[category] || []) : board.items;
    if (stalePeriod[period]) {
      body.innerHTML = '<p class="news__empty">新一期榜单正在积累，等待下一次更新。</p>';
      return;
    }
    items = items.filter(function (item) { return item.title && safeLink(item.link); }).slice(0, 10);
    if (!items.length) {
      body.innerHTML = '<p class="news__empty">' + (category ? '本期该分类暂无已收录新闻。' : '本期暂无已收录新闻，更新后会自动上榜。') + '</p>';
      return;
    }
    body.innerHTML = '<ol class="ranking-list" role="list">' + items.map(function (item, index) {
      return '<li class="ranking-list__item">' +
        '<span class="ranking-list__number" aria-hidden="true">' + (index + 1) + '</span>' +
        '<div class="ranking-list__content">' +
        '<a class="ranking-list__link" href="' + esc(safeLink(item.link)) + '" target="_blank" rel="noopener noreferrer">' + esc(item.title) + '</a>' +
        '<div class="ranking-list__meta"><span class="news__src">' + esc(item.categories.join(' / ')) + '</span>' +
        '<span>' + esc(item.source_count) + ' 个来源 · 收录 ' + esc(item.observed_days) + ' 天</span>' +
        '<time datetime="' + esc(item.date) + '">' + esc(dateLabel(item.date)) + (item.date_is_observed ? ' 首次收录' : ' 发布') + '</time>' +
        '<span class="ranking-list__sources">' + esc(item.sources.join(' · ')) + '</span></div></div></li>';
    }).join('') + '</ol>';
  }

  function render() {
    ['week', 'month'].forEach(function (period) {
      var board = data[period];
      stalePeriod[period] = siteDay(board.start) !== periodStart(period);
      document.getElementById(period + '-ranking-period').textContent = stalePeriod[period]
        ? '新一期 · 等待更新'
        : dateLabel(board.start) + ' — ' + dateLabel(board.end) + ' · 共收录 ' + board.total + ' 条';
      renderBoard(period);
    });
    var updated = Date.parse(data.updated || '');
    var stale = !isFinite(updated) || Date.now() - updated > 24 * 3600000;
    status.classList.toggle('rankings__status--stale', stale);
    status.textContent = (stale ? '数据更新有延迟 · ' : '') +
      (isFinite(updated) ? '新闻快照截至 ' + dateLabel(data.updated, true) + ' · ' : '') +
      '按新加坡时间（UTC+8）统计 · 每小时更新';
    if (picker.value) status.textContent += ' · 当前分类：' + picker.value;
  }

  function load() {
    root.setAttribute('aria-busy', 'true');
    picker.disabled = true;
    status.textContent = '正在整理热点榜单…';
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 15000);
    fetch('data/news-rankings.json', { cache: 'no-cache', signal: controller.signal })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (payload) {
        ['week', 'month'].forEach(function (period) {
          var board = payload[period];
          if (!board || !Array.isArray(board.items) || !board.by_category ||
              !isFinite(Date.parse(board.start)) || !isFinite(Date.parse(board.end))) {
            throw new Error('Invalid ranking data');
          }
        });
        data = payload;
        var categories = Object.keys(data.week.by_category).concat(Object.keys(data.month.by_category));
        categories = categories.filter(function (category, index) { return categories.indexOf(category) === index; });
        picker.innerHTML = '<option value="">全部分类</option>' + categories.map(function (category) {
          return '<option value="' + esc(category) + '">' + esc(category) + '</option>';
        }).join('');
        picker.disabled = false;
        render();
      })
      .catch(function () {
        status.innerHTML = '热点榜单暂时无法加载。<button type="button" class="rankings__retry">重试</button>';
        status.querySelector('button').addEventListener('click', load);
        ['week', 'month'].forEach(function (period) {
          document.getElementById(period + '-ranking-body').innerHTML = '<p class="news__empty">请稍后重试，或先浏览下方每日热点。</p>';
        });
      })
      .finally(function () {
        clearTimeout(timeout);
        root.setAttribute('aria-busy', 'false');
      });
  }

  picker.addEventListener('change', render);
  load();
})();
