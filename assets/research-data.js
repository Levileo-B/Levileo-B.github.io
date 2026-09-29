// 共享数据规则：浏览器使用，Node 可直接验证日期、筛选和去重行为。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResearchData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var topics = { 'point-cloud': '点云与三维感知', navigation: '自主导航', avoidance: '避障与运动规划' };
  function safeURL(value) {
    try {
      var url = new URL(value);
      return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : '';
    } catch (e) { return ''; }
  }
  function day(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return NaN;
    var time = Date.parse(value + 'T00:00:00Z');
    return isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
  }
  function today(now) { return new Date((now == null ? Date.now() : now) + 8 * 3600000).toISOString().slice(0, 10); }
  function paperDay(value) { return day(/^\d{4}-\d{2}$/.test(value || '') ? value + '-01' : value); }
  function validTopics(values) { return Array.isArray(values) && values.some(function (value) { return Object.hasOwn(topics, value); }); }
  function cfpState(call, date) {
    var days = (day(call.deadline) - day(date)) / 86400000;
    var age = (day(date) - day(call.verified_on)) / 86400000;
    if (call.status === 'closed') return { key: 'closed', label: '官方已关闭', days: days };
    if (isFinite(days) && days < 0) return { key: 'closed', label: '已截止', days: days };
    if (!isFinite(days) || !isFinite(age) || age < 0 || age > 30 || call.status !== 'open') {
      return { key: 'unverified', label: '待核验', days: days };
    }
    return { key: 'open', label: days === 0 ? '今日截止' : days <= 30 ? '即将截止' : '正在征稿', days: days };
  }
  function mergePapers(catalog, feed) {
    var journals = new Set(catalog.journals.map(function (j) { return j.id; }));
    var unique = new Map();
    // 官方核验导读优先于自动元数据；大小写不同的 DOI 仍视作同一篇。
    (feed || []).concat(catalog.papers || []).forEach(function (p) {
      if (!p || !p.id || !p.title || !journals.has(p.journal_id) || !safeURL(p.url) || !isFinite(paperDay(p.published)) || !validTopics(p.topics)) return;
      unique.set(String(p.id).toLowerCase(), p);
    });
    return Array.from(unique.values()).sort(function (a, b) { return b.published.localeCompare(a.published) || a.title.localeCompare(b.title); });
  }
  function filterPapers(papers, options) {
    var query = (options.query || '').trim().toLocaleLowerCase();
    var now = day(options.today);
    return papers.filter(function (p) {
      var age = (now - paperDay(p.published)) / 86400000;
      return age >= 0 && age <= options.days &&
        (options.topic === 'all' || p.topics.includes(options.topic)) &&
        (!options.followedOnly || options.followed.includes(p.journal_id)) &&
        (!query || [p.title, p.title_zh, p.summary, p.id, options.journalNames[p.journal_id]].join(' ').toLocaleLowerCase().includes(query));
    });
  }
  function filterCalls(calls, options) {
    return calls.filter(function (c) {
      if (!c.title || !safeURL(c.url) || !validTopics(c.topics)) return false;
      var state = cfpState(c, options.today);
      return (options.topic === 'all' || c.topics.includes(options.topic)) &&
        (options.status === 'all' || state.key === 'open' && (options.status !== 'soon' || state.days <= 30));
    }).sort(function (a, b) {
      var priority = { open: 0, unverified: 1, closed: 2 };
      return priority[cfpState(a, options.today).key] - priority[cfpState(b, options.today).key] ||
        (isFinite(day(a.deadline)) ? day(a.deadline) : Infinity) - (isFinite(day(b.deadline)) ? day(b.deadline) : Infinity);
    });
  }
  return { topics: topics, safeURL: safeURL, day: day, paperDay: paperDay, today: today, cfpState: cfpState, mergePapers: mergePapers, filterPapers: filterPapers, filterCalls: filterCalls };
});
