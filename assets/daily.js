// 渲染「每日一题」与「每日英文」，数据来自 Actions 生成的 data/daily.json
(function () {
  var lcBox = document.getElementById('lc-body');
  var enBox = document.getElementById('en-body');
  if (!lcBox && !enBox) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var DIFF = { Easy: '简单', Medium: '中等', Hard: '困难' };

  function renderLeetCode(d) {
    if (!d) {
      lcBox.innerHTML = '<p class="news__empty">今天的题目还没抓到。</p>';
      return;
    }
    var diff = DIFF[d.difficulty] || d.difficulty || '';
    var tags = (d.tags || []).map(function (t) {
      return '<li>' + esc(t) + '</li>';
    }).join('');

    lcBox.innerHTML =
      '<div class="daily__head">' +
        '<span class="daily__no">#' + esc(d.id) + '</span>' +
        (diff ? '<span class="daily__diff daily__diff--' +
                esc((d.difficulty || '').toLowerCase()) + '">' + esc(diff) + '</span>' : '') +
        (d.date ? '<span class="daily__date">' + esc(d.date) + '</span>' : '') +
      '</div>' +
      '<h3 class="daily__title">' +
        '<a href="' + esc(d.link) + '" target="_blank" rel="noopener noreferrer">' +
          esc(d.title) + '</a>' +
      '</h3>' +
      (d.titleEn && d.titleEn !== d.title
        ? '<p class="daily__sub">' + esc(d.titleEn) + '</p>' : '') +
      (tags ? '<ul class="tags">' + tags + '</ul>' : '') +
      '<a class="btn btn--primary btn--sm" href="' + esc(d.link) +
        '" target="_blank" rel="noopener noreferrer">去做题 →</a>';
  }

  function renderEnglish(d) {
    if (!d) {
      enBox.innerHTML = '<p class="news__empty">今天的短文还没抓到。</p>';
      return;
    }
    var mins = Math.max(1, Math.round((d.words || 0) / 200));
    enBox.innerHTML =
      '<div class="daily__head">' +
        '<span class="daily__no">' + (d.words || 0) + ' words</span>' +
        '<span class="daily__date">约 ' + mins + ' 分钟</span>' +
      '</div>' +
      '<h3 class="daily__title">' + esc(d.title) + '</h3>' +
      '<p class="daily__text" lang="en">' + esc(d.text) + '</p>' +
      '<p class="daily__credit">' +
        '来源：<a href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">' +
          esc(d.source) + '</a>' +
        ' · 许可 <a href="' + esc(d.licenseUrl) + '" target="_blank" rel="noopener noreferrer">' +
          esc(d.license) + '</a>' +
      '</p>';
  }

  fetch('data/daily.json', { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      if (lcBox) renderLeetCode(data.leetcode);
      if (enBox) renderEnglish(data.english);
    })
    .catch(function () {
      var msg = '<p class="news__empty">数据还没生成。等 GitHub Actions 跑过一次后就会有内容。</p>';
      if (lcBox) lcBox.innerHTML = msg;
      if (enBox) enBox.innerHTML = msg;
    });
})();
