// 官方时间线定时重建：只取前 5 条，不在页面暴露 API 凭据。
(function () {
  'use strict';
  var container = document.getElementById('x-timeline');
  if (!container) return;
  var button = document.getElementById('x-refresh');
  var auto = document.getElementById('x-auto');
  var status = document.getElementById('x-status');
  var INTERVAL = 60000, loading = false, loaded = false, lastAttempt = 0;
  var widgetPromise = null, activeTheme = null, themePending = false;
  var darkMode = window.matchMedia('(prefers-color-scheme: dark)');

  function theme() {
    return document.documentElement.getAttribute('data-theme') || (darkMode.matches ? 'dark' : 'light');
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = window.setTimeout(function () { reject(new Error('timeout')); }, ms);
      Promise.resolve(promise).then(function (value) { window.clearTimeout(timer); resolve(value); },
        function (error) { window.clearTimeout(timer); reject(error); });
    });
  }

  function widgets() {
    if (window.twttr && window.twttr.widgets && window.twttr.widgets.createTimeline) return Promise.resolve(window.twttr.widgets);
    if (widgetPromise) return widgetPromise;
    var script = document.createElement('script');
    widgetPromise = withTimeout(new Promise(function (resolve, reject) {
      script.src = 'https://platform.twitter.com/widgets.js';
      script.async = true;
      script.charset = 'utf-8';
      script.onload = function () {
        if (window.twttr && window.twttr.widgets && window.twttr.widgets.createTimeline) resolve(window.twttr.widgets);
        else reject(new Error('unavailable'));
      };
      script.onerror = function () { reject(new Error('blocked')); };
      document.head.appendChild(script);
    }), 12000).catch(function (error) {
      script.remove();
      widgetPromise = null;
      throw error;
    });
    return widgetPromise;
  }

  function fallback() {
    var paragraph = document.createElement('p');
    paragraph.className = 'news__empty';
    paragraph.appendChild(document.createTextNode('X 动态暂时无法加载。请重试，或'));
    var link = document.createElement('a');
    link.href = 'https://x.com/thsottiaux';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '前往 X.com 查看';
    paragraph.appendChild(link);
    container.replaceChildren(paragraph);
  }

  async function refresh() {
    if (loading || document.hidden) return;
    loading = true;
    lastAttempt = Date.now();
    button.disabled = true;
    container.setAttribute('aria-busy', 'true');
    status.textContent = loaded ? '正在刷新…' : '正在加载 X 动态…';
    var host = document.createElement('div');
    host.className = 'x-preview__pending';
    var requestedTheme = theme();
    try {
      var api = await widgets();
      // 保留当前内容直到新时间线加载完成，避免刷新时闪空。
      container.appendChild(host);
      var frame = await withTimeout(api.createTimeline(
        { sourceType: 'profile', screenName: 'thsottiaux' }, host,
        { tweetLimit: 5, theme: requestedTheme, chrome: 'noheader nofooter noborders transparent',
          dnt: true, lang: 'zh-cn' }), 15000);
      if (!frame) throw new Error('empty');
      host.className = '';
      container.replaceChildren(host);
      activeTheme = requestedTheme;
      loaded = true;
      status.textContent = '已刷新 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false }) + ' · 前 5 条';
    } catch (e) {
      host.remove();
      if (!loaded) fallback();
      status.textContent = loaded ? '刷新失败，保留上次内容；可稍后重试。' : '加载失败，请重试或打开 X.com。';
    } finally {
      loading = false;
      button.disabled = false;
      container.setAttribute('aria-busy', 'false');
      if (themePending) { themePending = false; refresh(); }
    }
  }

  function refreshIfDue() {
    if (auto.checked && !document.hidden && Date.now() - lastAttempt >= INTERVAL) refresh();
  }
  function themeChanged() {
    if (theme() === activeTheme) return;
    if (loading) themePending = true;
    else refresh();
  }
  button.addEventListener('click', refresh);
  auto.addEventListener('change', function () {
    if (auto.checked) refreshIfDue();
  });
  window.setInterval(refreshIfDue, INTERVAL);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && theme() !== activeTheme && loaded) themeChanged();
    else refreshIfDue();
  });
  window.addEventListener('focus', refreshIfDue);
  new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  darkMode.addEventListener('change', themeChanged);
  refresh();
})();
