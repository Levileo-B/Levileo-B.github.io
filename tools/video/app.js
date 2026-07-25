// 视频链接解析的界面层。解析在 parse.js，直链推导在 direct.js。
(function () {
  var form = document.getElementById('form');
  var input = document.getElementById('input');
  var out = document.getElementById('result');
  var dl = document.getElementById('download');
  var resolverEl = document.getElementById('resolver');
  var KEY_RESOLVER = 'videoResolver';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function copyRow(text) {
    return '<div class="copy-row"><code>' + esc(text) + '</code>' +
           '<button class="copy-btn" type="button" data-copy="' + esc(text) + '">复制</button></div>';
  }

  function block(label, inner) {
    return '<div class="result__block"><p class="result__label">' + esc(label) + '</p>' + inner + '</div>';
  }

  // ---------- 一键下载 ----------
  function dlItem(it) {
    return '<div class="dl-item">' +
             '<div class="dl-item__info">' +
               '<strong>' + esc(it.label) + '</strong>' +
               '<span>' + esc(it.filename) + '</span>' +
             '</div>' +
             '<button class="btn btn--primary dl-btn" type="button" ' +
               'data-url="' + esc(it.url) + '" data-name="' + esc(it.filename) + '">下载</button>' +
             '<a class="copy-btn" href="' + esc(it.url) + '" target="_blank" rel="noopener">打开</a>' +
           '</div>';
  }

  function showDownloads(items, note) {
    if (!items.length) { dl.innerHTML = ''; return; }
    dl.innerHTML =
      '<div class="dl-box">' +
        '<p class="result__label" style="margin-bottom:.6rem">一键下载 —— 这些是真实直链</p>' +
        items.map(dlItem).join('') +
        (note ? '<p class="hint" style="margin-top:.75rem">' + note + '</p>' : '') +
      '</div>';
  }

  function showDlHint(html) {
    dl.innerHTML = '<div class="dl-box dl-box--muted">' + html + '</div>';
  }

  // 优先取回二进制再触发下载；跨域被拒时退回新标签页打开
  function grab(url, filename, btn) {
    var old = btn.textContent;
    btn.textContent = '下载中…';
    btn.disabled = true;

    fetch(url, { mode: 'cors' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.blob();
      })
      .then(function (blob) {
        var a = document.createElement('a');
        var href = URL.createObjectURL(blob);
        a.href = href;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(href); }, 4000);
        btn.textContent = '已保存';
      })
      .catch(function () {
        // 对方没开跨域，浏览器不允许脚本读取内容 —— 只能交给新标签页
        window.open(url, '_blank', 'noopener');
        btn.textContent = '已在新标签打开';
      })
      .then(function () {
        setTimeout(function () { btn.textContent = old; btn.disabled = false; }, 2200);
      });
  }

  // ---------- 自建解析服务（可选） ----------
  function resolverUrl() {
    try { return (localStorage.getItem(KEY_RESOLVER) || '').trim(); } catch (e) { return ''; }
  }

  function tryResolver(pageUrl) {
    var ep = resolverUrl();
    if (!ep) return Promise.resolve(null);
    return fetch(ep, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ url: pageUrl })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return null;
        if (j.url) return [{ label: '解析服务返回', url: j.url, filename: 'video.mp4' }];
        if (j.picker && j.picker.length) {
          return j.picker.map(function (x, i) {
            return { label: '可选 ' + (i + 1), url: x.url, filename: 'video-' + (i + 1) + '.mp4' };
          });
        }
        return null;
      })
      .catch(function () { return null; });
  }

  // ---------- 主渲染 ----------
  function render(r, rawInput) {
    dl.innerHTML = '';
    if (r.reason === 'empty') { out.innerHTML = ''; return; }

    var html = '';

    if (r.ok) {
      html += '<p class="result__label" style="margin-bottom:1rem">识别为 <span class="badge">' +
              esc(r.platform) + '</span>　视频 ID <code>' + esc(r.id) + '</code></p>';
      html += block('规范链接', copyRow(r.canonical));
      if (r.embed) {
        html += block('播放器嵌入地址', copyRow(r.embed));
        html += block('嵌入代码', copyRow('<iframe src="' + r.embed +
                 '" width="560" height="315" frameborder="0" allowfullscreen></iframe>'));
      }
      if (r.thumbs && r.thumbs.length) {
        html += block('封面图', r.thumbs.map(function (x) {
          return '<div class="cmd-list__name">' + esc(x.label) + '</div>' + copyRow(x.url);
        }).join('') + '<img class="thumb-preview" src="' + esc(r.thumbs[0].url) +
          '" alt="视频封面预览" onerror="this.style.display=\'none\'">');
      }
    } else if (r.reason === 'short') {
      html += '<p class="notice">这是' + esc(r.hint) + '。短链要跟随跳转才能还原，浏览器里做不到。' +
              '不过 <strong>yt-dlp 自己会跳转</strong>，下面的命令可以直接用。</p>';
    } else {
      html += '<p class="notice">没认出这个平台。' +
              (r.ytdlp ? 'yt-dlp 支持上千个站点，可以直接拿下面的命令试试。'
                       : '请粘贴一个完整的视频页面链接（以 http 开头）。') + '</p>';
    }

    if (r.ytdlp) {
      html += block('yt-dlp 下载命令（在本地终端执行）',
        '<div class="cmd-list">' + r.ytdlp.map(function (c) {
          return '<div><div class="cmd-list__name">' + esc(c.label) + '</div>' + copyRow(c.cmd) + '</div>';
        }).join('') + '</div>');
    }

    out.innerHTML = html;

    // ---- 直链部分 ----
    var d = window.VideoDirect.direct(rawInput);
    var thumbItems = (r.thumbs || []).map(function (x, i) {
      return { label: '封面图 · ' + x.label, url: x.url, filename: (r.id || 'cover') + (i ? '-' + i : '') + '.jpg' };
    });

    if (d.kind === 'reddit') {
      showDlHint('<p class="spinner">正在向 Reddit 官方接口查询直链…</p>');
      fetch(d.api, { headers: { Accept: 'application/json' } })
        .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
        .then(function (json) {
          var items = window.VideoDirect.parseReddit(json);
          if (items.length) {
            showDownloads(items, items.length > 1 && /音轨/.test(items[1] && items[1].label || '')
              ? 'Reddit 的画面和声音是两个文件，合并命令：<code>ffmpeg -i 视频.mp4 -i 音轨.mp4 -c copy 输出.mp4</code>'
              : '');
          } else {
            showDlHint('<p class="hint">这个帖子里没找到可下载的媒体。</p>');
          }
        })
        .catch(function (e) {
          showDlHint('<p class="hint">查询 Reddit 接口失败（' + esc(e.message) +
                     '）。可以改用下面的 yt-dlp 命令。</p>');
        });
      return;
    }

    if (d.items.length || thumbItems.length) {
      showDownloads(d.items.concat(thumbItems), '');
      return;
    }

    // 平台视频本体拿不到 —— 看有没有配自建解析服务
    if (r.ok && resolverUrl()) {
      showDlHint('<p class="spinner">正在请求你配置的解析服务…</p>');
      tryResolver(r.canonical).then(function (items) {
        if (items && items.length) showDownloads(items, '来自你配置的解析服务。');
        else showDlHint('<p class="hint">解析服务没有返回可用直链，可改用下面的 yt-dlp 命令。</p>');
      });
    } else if (r.ok) {
      showDlHint(
        '<p class="hint"><strong>这个平台拿不到一键直链。</strong>' +
        '它的视频流地址带签名、有时效，必须服务端解密，静态页面做不到。' +
        '用下面的 yt-dlp 命令，或在下方配置一个自建解析服务后再试。</p>');
    }
  }

  function run() {
    var v = input.value;
    render(window.VideoParse.parse(v), v);
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); run(); });

  // 下载与复制
  document.addEventListener('click', function (e) {
    var d = e.target.closest('.dl-btn');
    if (d) { grab(d.getAttribute('data-url'), d.getAttribute('data-name'), d); return; }

    var btn = e.target.closest('.copy-btn[data-copy]');
    if (!btn) return;
    var text = btn.getAttribute('data-copy');
    function done() {
      var old = btn.textContent;
      btn.textContent = '已复制';
      btn.classList.add('is-done');
      setTimeout(function () { btn.textContent = old; btn.classList.remove('is-done'); }, 1400);
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (err) { btn.textContent = '复制失败'; }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
  });

  // 解析服务设置
  if (resolverEl) {
    resolverEl.value = resolverUrl();
    resolverEl.addEventListener('change', function () {
      try { localStorage.setItem(KEY_RESOLVER, resolverEl.value.trim()); } catch (e) {}
    });
  }

  var q = new URLSearchParams(location.search).get('u');
  if (q) { input.value = q; run(); }
})();
