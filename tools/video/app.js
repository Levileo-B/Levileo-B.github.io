// 视频链接解析的界面层，解析逻辑全在 parse.js
(function () {
  var form = document.getElementById('form');
  var input = document.getElementById('input');
  var out = document.getElementById('result');

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function copyRow(text) {
    return '<div class="copy-row">' +
             '<code>' + esc(text) + '</code>' +
             '<button class="copy-btn" type="button" data-copy="' + esc(text) + '">复制</button>' +
           '</div>';
  }

  function block(label, inner) {
    return '<div class="result__block"><p class="result__label">' + esc(label) + '</p>' + inner + '</div>';
  }

  function render(r) {
    if (r.reason === 'empty') { out.innerHTML = ''; return; }

    var html = '';

    if (r.ok) {
      html += '<p class="result__label" style="margin-bottom:1rem">' +
                '识别为 <span class="badge">' + esc(r.platform) + '</span> ' +
                '　视频 ID <code style="font-size:.82rem">' + esc(r.id) + '</code>' +
              '</p>';
      html += block('规范链接', copyRow(r.canonical));

      if (r.embed) {
        html += block('播放器嵌入地址', copyRow(r.embed));
        html += block('嵌入代码',
          copyRow('<iframe src="' + r.embed + '" width="560" height="315" frameborder="0" allowfullscreen></iframe>'));
      }

      if (r.thumbs && r.thumbs.length) {
        var t = r.thumbs.map(function (x) {
          return '<div class="cmd-list__name">' + esc(x.label) + '</div>' + copyRow(x.url);
        }).join('');
        t += '<img class="thumb-preview" src="' + esc(r.thumbs[0].url) + '" alt="视频封面预览" ' +
             'onerror="this.style.display=\'none\'">';
        html += block('封面图直链（这个是真的直链，可以直接下载）', t);
      }
    } else if (r.reason === 'short') {
      html += '<p class="notice" style="margin-bottom:1.25rem">' +
              '这是' + esc(r.hint) + '。短链需要跟随跳转才能还原成真实地址，' +
              '浏览器里做不到（会被跨域拦住）。不过 <strong>yt-dlp 自己会跳转</strong>，' +
              '下面的命令可以直接用；或者在浏览器里打开这个短链，把跳转后的地址粘回来。</p>';
    } else {
      html += '<p class="notice" style="margin-bottom:1.25rem">' +
              '没认出这个平台。' +
              (r.ytdlp ? '不过 yt-dlp 支持上千个站点，可以直接拿下面的命令试试。'
                       : '请粘贴一个完整的视频页面链接（以 http 开头）。') +
              '</p>';
    }

    if (r.ytdlp) {
      var cmds = r.ytdlp.map(function (c) {
        return '<div><div class="cmd-list__name">' + esc(c.label) + '</div>' + copyRow(c.cmd) + '</div>';
      }).join('');
      html += block('yt-dlp 下载命令（在本地终端执行）', '<div class="cmd-list">' + cmds + '</div>');
    }

    out.innerHTML = html;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    render(window.VideoParse.parse(input.value));
  });

  // 复制按钮：优先用剪贴板 API，不可用时退回 execCommand
  out.addEventListener('click', function (e) {
    var btn = e.target.closest('.copy-btn');
    if (!btn) return;
    var text = btn.getAttribute('data-copy');

    function done() {
      var old = btn.textContent;
      btn.textContent = '已复制';
      btn.classList.add('is-done');
      setTimeout(function () { btn.textContent = old; btn.classList.remove('is-done'); }, 1400);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }

    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (err) { btn.textContent = '复制失败'; }
      document.body.removeChild(ta);
    }
  });

  // 支持通过 ?u= 直接带链接进来
  var q = new URLSearchParams(location.search).get('u');
  if (q) { input.value = q; render(window.VideoParse.parse(q)); }
})();
