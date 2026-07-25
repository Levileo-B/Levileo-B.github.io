// 论文检索：OpenAlex 为主，失败时回退 Crossref。两者都支持跨域、无需 API key。
(function () {
  var form = document.getElementById('form');
  var qEl = document.getElementById('q');
  var sortEl = document.getElementById('sort');
  var sinceEl = document.getElementById('since');
  var goEl = document.getElementById('go');
  var out = document.getElementById('result');

  var PER_PAGE = 25;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function sinceDate(years) {
    if (!years) return '';
    var d = new Date();
    d.setFullYear(d.getFullYear() - years);
    return d.toISOString().slice(0, 10);
  }

  // ---------- 数据源 ----------
  function openAlexUrl(q, sort, years) {
    var p = ['search=' + encodeURIComponent(q),
             'per-page=' + PER_PAGE,
             'sort=' + encodeURIComponent(sort)];
    var from = sinceDate(years);
    if (from) p.push('filter=' + encodeURIComponent('from_publication_date:' + from));
    return 'https://api.openalex.org/works?' + p.join('&');
  }

  function fromOpenAlex(json) {
    return (json.results || []).map(function (w) {
      var authors = (w.authorships || []).map(function (a) {
        return a.author && a.author.display_name;
      }).filter(Boolean);
      var venue = w.primary_location && w.primary_location.source
                    ? w.primary_location.source.display_name : '';
      var topic = w.primary_topic ? w.primary_topic.display_name
                  : ((w.topics || [])[0] || {}).display_name || '';
      return {
        title: w.display_name || w.title || '（无标题）',
        authors: authors,
        venue: venue,
        year: w.publication_year || '',
        date: w.publication_date || '',
        cited: w.cited_by_count || 0,
        doi: w.doi || '',
        oa: (w.open_access && w.open_access.oa_url) || '',
        link: w.doi || w.id || '',
        topic: topic
      };
    });
  }

  function crossrefUrl(q, sort, years) {
    var p = ['query=' + encodeURIComponent(q), 'rows=' + PER_PAGE];
    if (sort.indexOf('cited') === 0) p.push('sort=is-referenced-by-count', 'order=desc');
    else if (sort.indexOf('publication_date') === 0) p.push('sort=published', 'order=desc');
    var from = sinceDate(years);
    if (from) p.push('filter=from-pub-date:' + from);
    return 'https://api.crossref.org/works?' + p.join('&');
  }

  function fromCrossref(json) {
    return ((json.message && json.message.items) || []).map(function (w) {
      var parts = (w.issued && w.issued['date-parts'] && w.issued['date-parts'][0]) || [];
      return {
        title: (w.title && w.title[0]) || '（无标题）',
        authors: (w.author || []).map(function (a) {
          return [a.given, a.family].filter(Boolean).join(' ');
        }).filter(Boolean),
        venue: (w['container-title'] && w['container-title'][0]) || '',
        year: parts[0] || '',
        date: parts.join('-'),
        cited: w['is-referenced-by-count'] || 0,
        doi: w.DOI ? 'https://doi.org/' + w.DOI : '',
        oa: '',
        link: w.URL || (w.DOI ? 'https://doi.org/' + w.DOI : ''),
        topic: ''            // Crossref 没有方向标签
      };
    });
  }

  // ---------- 渲染 ----------
  function topicSummary(items) {
    var counts = {};
    items.forEach(function (it) {
      if (it.topic) counts[it.topic] = (counts[it.topic] || 0) + 1;
    });
    var list = Object.keys(counts).map(function (k) { return { name: k, n: counts[k] }; });
    list.sort(function (a, b) { return b.n - a.n; });
    return list.slice(0, 10);
  }

  function paperHtml(p) {
    var meta = [];
    if (p.authors.length) {
      meta.push(esc(p.authors.slice(0, 3).join('、') + (p.authors.length > 3 ? ' 等' : '')));
    }
    if (p.venue) meta.push(esc(p.venue));
    if (p.date || p.year) meta.push(esc(p.date || p.year));
    meta.push('被引 ' + p.cited);

    var links = '';
    if (p.oa) links += '<a href="' + esc(p.oa) + '" target="_blank" rel="noopener">开放获取 PDF</a>';
    if (p.doi) links += '<a href="' + esc(p.doi) + '" target="_blank" rel="noopener">DOI</a>';
    links += '<a href="https://scholar.google.com/scholar?q=' + encodeURIComponent(p.title) +
             '" target="_blank" rel="noopener">Google 学术</a>';

    var href = p.link || p.doi;
    return '<li class="paper">' +
             '<h3 class="paper__title">' +
               (href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(p.title) + '</a>'
                     : esc(p.title)) +
             '</h3>' +
             '<div class="paper__meta">' + meta.map(function (m) { return '<span>' + m + '</span>'; }).join('') + '</div>' +
             '<div class="paper__links">' + links + '</div>' +
           '</li>';
  }

  function render(items, source) {
    if (!items.length) {
      out.innerHTML = '<p class="hint">没有找到匹配的论文。换个关键词，或把时间范围放宽试试。</p>';
      return;
    }
    var topics = topicSummary(items);
    var html = '';

    if (topics.length) {
      html += '<p class="result__label">这批结果的研究方向分布</p>';
      html += '<ul class="topics">' + topics.map(function (t) {
        return '<li>' + esc(t.name) + ' <b>' + t.n + '</b></li>';
      }).join('') + '</ul>';
    }

    html += '<p class="result__label">共 ' + items.length + ' 篇 · 数据来源 ' + esc(source) + '</p>';
    html += '<ul class="papers">' + items.map(paperHtml).join('') + '</ul>';
    out.innerHTML = html;
  }

  function fail(msg, url) {
    out.innerHTML = '<p class="notice">' + esc(msg) +
      '<br><br>如果反复失败，可以直接打开接口地址确认：<br>' +
      '<a href="' + esc(url) + '" target="_blank" rel="noopener" style="word-break:break-all">' + esc(url) + '</a>' +
      '</p>';
  }

  function getJSON(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function search(q) {
    var sort = sortEl.value;
    var years = parseInt(sinceEl.value, 10) || 0;
    var oaUrl = openAlexUrl(q, sort, years);

    out.innerHTML = '<p class="spinner">检索中…</p>';
    goEl.disabled = true;

    getJSON(oaUrl)
      .then(function (json) { render(fromOpenAlex(json), 'OpenAlex'); })
      .catch(function () {
        // OpenAlex 不通就换 Crossref，仍失败才报错
        var cr = crossrefUrl(q, sort, years);
        return getJSON(cr)
          .then(function (json) { render(fromCrossref(json), 'Crossref（OpenAlex 未响应）'); })
          .catch(function (e2) {
            fail('两个数据源都没能取到结果（' + e2.message + '）。' +
                 '可能是网络不通、接口临时故障，或浏览器拦截了跨域请求。', oaUrl);
          });
      })
      .then(function () { goEl.disabled = false; });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = qEl.value.trim();
    if (!q) { qEl.focus(); return; }
    history.replaceState(null, '', '?q=' + encodeURIComponent(q));
    search(q);
  });

  [sortEl, sinceEl].forEach(function (el) {
    el.addEventListener('change', function () {
      var q = qEl.value.trim();
      if (q) search(q);
    });
  });

  // 支持 ?q= 直接带关键词进来
  var pre = new URLSearchParams(location.search).get('q');
  if (pre) { qEl.value = pre; search(pre); }
})();
