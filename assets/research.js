(function () {
  'use strict';
  var root = document.getElementById('research-monitor');
  if (!root) return;
  var D = window.ResearchData;
  var catalog, feed, papers = [], topic = 'all', limit = 6, followed = [];
  var storageKey = 'research-followed-journals-v1';
  function el(id) { return document.getElementById(id); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function link(url, label, cls) {
    var safe = D.safeURL(url);
    return safe ? '<a' + (cls ? ' class="' + cls + '"' : '') + ' href="' + esc(safe) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + '</a>' : esc(label);
  }
  function tags(values) { return values.filter(function (v) { return Object.hasOwn(D.topics, v); }).map(function (v) { return '<span class="research-tag" data-direction="' + v + '">' + esc(D.topics[v]) + '</span>'; }).join(''); }
  function empty(message) { return '<p class="research-empty">' + esc(message) + '</p>'; }
  try {
    var saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(saved)) followed = saved.filter(function (id) { return typeof id === 'string'; });
  } catch (e) { el('journal-storage-status').textContent = '无法读取本地关注列表，本次仍可关注期刊。'; }

  function renderPapers() {
    if (!catalog) return;
    var names = {};
    catalog.journals.forEach(function (j) { names[j.id] = j.name; });
    var filtered = D.filterPapers(papers, { today: D.today(), days: Number(el('research-period').value), topic: topic,
      query: el('research-query').value, followedOnly: el('research-followed').checked, followed: followed, journalNames: names });
    el('research-result-count').textContent = '找到 ' + filtered.length + ' 篇 · 当前显示 ' + Math.min(limit, filtered.length) + ' 篇';
    el('research-papers').innerHTML = filtered.length ? filtered.slice(0, limit).map(function (p) {
      return '<article class="card research-paper"><div class="research-card-meta"><span>' + esc(names[p.journal_id]) + '</span><time datetime="' + esc(p.published) + '">' + esc(p.published) + (p.published.length === 7 ? '（月份）' : '') + '</time></div>' +
        '<h3>' + link(p.url, p.title_zh || p.title) + '</h3>' + (p.title_zh ? '<p class="research-paper-original" lang="en">' + esc(p.title) + '</p>' : '') +
        '<div class="research-tags">' + tags(p.topics) + '</div>' +
        (p.summary ? '<p class="research-summary">' + esc(p.summary) + '</p>' : '<p class="research-summary">自动收录期刊论文元数据，研究方法与实验结果请阅读原文。</p>') +
        '<footer class="research-card-footer"><span>' + esc(p.kind || '期刊论文') + ' · ' + (p.source === 'publisher' ? '精选导读' : 'Crossref') + '</span>' + link(p.url, '阅读原文 ↗') + '</footer></article>';
    }).join('') : empty(el('research-followed').checked && !followed.length ? '尚未关注期刊。请到下方添加关注，或取消「只看已关注期刊」。' : '当前条件下暂无动态，试试其他方向、扩大时间范围或清空关键词。');
    el('research-more').hidden = filtered.length <= limit;
  }

  function renderCalls() {
    if (!catalog) return;
    var date = D.today();
    var allOpen = catalog.calls.filter(function (c) { return D.cfpState(c, date).key === 'open'; }).length;
    el('cfp-open-count').textContent = allOpen + ' 个已核验开放专题';
    var calls = D.filterCalls(catalog.calls, { today: date, topic: el('cfp-topic').value, status: el('cfp-status').value });
    el('cfp-result-count').textContent = '当前显示 ' + calls.length + ' 个专题 · 截止日期由近到远 · 每项核验日期见卡片';
    el('research-cfps').innerHTML = calls.length ? calls.map(function (c) {
      var state = D.cfpState(c, date);
      var countdown = state.key === 'open' ? state.days === 0 ? '今日截止 · 请确认投稿时区' : '距截止 ' + state.days + ' 天' : state.key === 'closed' ? '可在官方页查看是否延期' : '请到官方页确认是否仍接收稿件';
      return '<article class="card research-cfp"><div class="research-card-meta"><span>' + esc(c.journal) + '</span><span class="research-state research-state--' + state.key + (state.key === 'open' && state.days <= 30 ? ' research-state--soon' : '') + '">' + state.label + '</span></div>' +
        '<h3>' + link(c.url, c.title_zh || c.title) + '</h3><p class="research-paper-original" lang="en">' + esc(c.title) + '</p>' +
        '<div class="research-tags">' + tags(c.topics) + '</div><p class="research-summary">' + esc(c.scope) + '</p>' +
        '<div class="research-deadline"><span>稿件截止 <time datetime="' + esc(c.deadline) + '">' + esc(c.deadline || '未公布') + '</time></span><strong>' + countdown + '</strong></div>' +
        '<p class="research-cfp-note">' + esc(c.note) + '</p><footer class="research-card-footer"><span>核验于 ' + esc(c.verified_on || '未知') + '</span>' + link(c.url, '官方征稿 ↗') + '</footer></article>';
    }).join('') : empty('当前条件下暂无已核验的征稿专题。可切换「全部」查看待核验或已截止条目，或选择其他方向。');
  }

  function renderJournals() {
    el('journal-count').textContent = '已关注 ' + followed.length + ' / ' + catalog.journals.length;
    el('research-journals').innerHTML = catalog.journals.map(function (j) {
      var active = followed.includes(j.id);
      var count = D.filterPapers(papers, { today: D.today(), days: 180, topic: 'all', query: '', followedOnly: true, followed: [j.id], journalNames: {} }).length;
      return '<article class="research-journal"><div class="research-journal-top"><span class="research-journal-short">' + esc(j.short) + '</span>' +
        '<button type="button" class="research-follow" data-journal="' + esc(j.id) + '" aria-label="' + (active ? '取消关注 ' : '关注 ') + esc(j.name) + '" aria-pressed="' + active + '">' + (active ? '✓ 已关注' : '＋ 关注') + '</button></div>' +
        '<h3>' + link(j.url, j.name) + '</h3><p>' + esc(j.description) + '</p><footer class="research-card-footer"><span>' + esc(j.publisher) + ' · 已收录 ' + count + ' 篇</span>' + link(j.latest_url, '期刊最新文章 ↗') + '</footer></article>';
    }).join('');
  }

  function renderFreshness(feedFailed) {
    var date = feed && Date.parse(feed.updated);
    var stale = !isFinite(date) || Date.now() - date > 48 * 3600000 || Date.now() < date - 3600000;
    var label = isFinite(date) ? new Date(date).toLocaleString('zh-CN', { timeZone: 'Asia/Singapore', hour12: false }) + '（UTC+8）' : '';
    var failed = feed && Array.isArray(feed.sources) ? feed.sources.filter(function (s) { return s.status !== 'ok'; }).length : 0;
    el('research-feed-status').classList.toggle('research-status--warning', stale || feedFailed || failed > 0);
    el('research-feed-status').textContent = feedFailed ? '自动动态暂时不可用，已展示官方核验的精选条目。' :
      (stale ? '自动动态等待更新；' : '') + (label ? '最近成功更新：' + label + '。' : '当前展示精选条目。') +
      (failed ? '有 ' + failed + ' 个期刊数据源未完整更新，保留之前收录。' : '') + ' 自动动态计划每日更新。';
    if (feedFailed) addRetry(el('research-feed-status'));
  }
  function addRetry(node) {
    var button = document.createElement('button');
    button.type = 'button'; button.className = 'research-retry'; button.textContent = '重新加载';
    button.addEventListener('click', load); node.appendChild(button);
  }
  async function getJSON(url) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 15000);
    try {
      var response = await fetch(url, { cache: 'no-cache', signal: controller.signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  async function load() {
    ['research-papers', 'research-cfps', 'research-journals'].forEach(function (id) { el(id).setAttribute('aria-busy', 'true'); });
    el('research-feed-status').textContent = '正在加载研究动态…';
    var results = await Promise.allSettled([getJSON('../data/research-catalog.json'), getJSON('../data/research-feed.json')]);
    try {
      if (results[0].status !== 'fulfilled') throw new Error('catalog');
      var value = results[0].value;
      if (value.schema_version !== 1 || !Array.isArray(value.journals) || !Array.isArray(value.papers) || !Array.isArray(value.calls)) throw new Error('catalog');
      catalog = value;
      feed = results[1].status === 'fulfilled' && results[1].value.schema_version === 1 && Array.isArray(results[1].value.papers) ? results[1].value : null;
      followed = Array.from(new Set(followed)).filter(function (id) { return catalog.journals.some(function (j) { return j.id === id; }); });
      papers = D.mergePapers(catalog, feed ? feed.papers : []);
      renderPapers(); renderCalls(); renderJournals(); renderFreshness(!feed);
    } catch (e) {
      el('research-feed-status').textContent = '科研数据暂时无法加载，请重试。下方科研工具仍可使用。';
      addRetry(el('research-feed-status'));
      if (!catalog) {
        ['research-papers', 'research-cfps', 'research-journals'].forEach(function (id) { el(id).innerHTML = empty('暂时无法加载，请使用上方按钮重新加载。'); });
        el('cfp-result-count').textContent = '征稿数据暂时不可用'; el('cfp-open-count').textContent = '等待数据';
      }
    } finally {
      ['research-papers', 'research-cfps', 'research-journals'].forEach(function (id) { el(id).setAttribute('aria-busy', 'false'); });
    }
  }
  root.querySelectorAll('[data-topic]').forEach(function (button) {
    button.addEventListener('click', function () {
      topic = button.dataset.topic; limit = 6;
      root.querySelectorAll('[data-topic]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
      renderPapers();
    });
  });
  ['research-query', 'research-period', 'research-followed'].forEach(function (id) {
    el(id).addEventListener(id === 'research-query' ? 'input' : 'change', function () { limit = 6; renderPapers(); });
  });
  ['cfp-topic', 'cfp-status'].forEach(function (id) { el(id).addEventListener('change', renderCalls); });
  el('research-more').addEventListener('click', function () { limit += 6; renderPapers(); });
  el('research-journals').addEventListener('click', function (event) {
    var button = event.target.closest('[data-journal]');
    if (!button || !catalog) return;
    var id = button.dataset.journal;
    followed = followed.includes(id) ? followed.filter(function (v) { return v !== id; }) : followed.concat(id);
    try { localStorage.setItem(storageKey, JSON.stringify(followed)); el('journal-storage-status').textContent = '关注列表已保存到当前浏览器。'; }
    catch (e) { el('journal-storage-status').textContent = '浏览器不允许保存，关注列表仅在本次页面停留期间有效。'; }
    renderJournals(); limit = 6; renderPapers();
    el('research-journals').querySelector('[data-journal="' + id + '"]').focus();
  });
  // 跨日仍打开页面时，重新判断截稿与时效，不把过期专题留在开放列表。
  setInterval(function () { if (catalog) { renderCalls(); renderPapers(); renderFreshness(!feed); } }, 60000);
  load();
})();
