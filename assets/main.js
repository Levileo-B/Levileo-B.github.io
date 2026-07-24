// 深色 / 浅色模式切换，记忆用户选择
(function () {
  var root = document.documentElement;
  var KEY = 'theme';

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* 隐私模式下忽略 */ }
  if (saved === 'dark' || saved === 'light') {
    root.setAttribute('data-theme', saved);
  }

  var toggle = document.querySelector('.theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var current = root.getAttribute('data-theme') || (systemDark ? 'dark' : 'light');
      var next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* 忽略 */ }
    });
  }

  // 页脚年份
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
