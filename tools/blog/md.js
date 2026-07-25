// 一个够用的 Markdown 渲染器 —— 纯逻辑，可在 Node 里单测。
//
// 安全策略：先把所有 HTML 转义，再套 Markdown 语法。也就是说正文里的原始
// HTML 一律当纯文本显示，不会被执行。链接和图片地址额外过一遍协议白名单，
// 挡掉 javascript: / data: 这类可执行伪协议。
(function (root) {

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 只允许安全协议；其余一律变成空链接
  function safeUrl(u) {
    var s = String(u == null ? '' : u).trim();
    // 转义后的实体先还原，避免 java&#115;cript: 这类绕过
    s = s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    if (/^\s*(?:javascript|data|vbscript|file)\s*:/i.test(s.replace(/[\u0000-\u0020]/g, ''))) return '';
    if (/^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i.test(s)) return s;
    if (/^[\w.-]+\.[a-z]{2,}/i.test(s)) return s;          // 裸域名当相对外链
    if (/^[\w./-]+$/.test(s)) return s;                     // 相对路径
    return '';
  }

  function inline(s) {
    // 行内代码先抽走，免得里面的星号下划线被当成语法
    var codes = [];
    s = s.replace(/`([^`\n]+)`/g, function (_, c) {
      codes.push(c);
      return '\u0000' + (codes.length - 1) + '\u0000';
    });

    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, function (_, alt, src, title) {
      var u = safeUrl(src);
      if (!u) return esc('![' + alt + '](' + src + ')');
      return '<img src="' + u + '" alt="' + alt + '"' + (title ? ' title="' + title + '"' : '') + '>';
    });

    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, function (_, txt, href, title) {
      var u = safeUrl(href);
      if (!u) return esc('[' + txt + '](' + href + ')');
      return '<a href="' + u + '"' + (title ? ' title="' + title + '"' : '') +
             ' target="_blank" rel="noopener">' + txt + '</a>';
    });

    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    return s.replace(/\u0000(\d+)\u0000/g, function (_, i) {
      return '<code>' + codes[+i] + '</code>';
    });
  }

  // 抽出 YAML front matter，返回 { meta, body }
  function splitFrontMatter(src) {
    var m = String(src == null ? '' : src).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!m) return { meta: '', body: String(src == null ? '' : src) };
    return { meta: m[1], body: src.slice(m[0].length) };
  }

  function render(src) {
    var body = splitFrontMatter(src).body;
    var lines = esc(body).split(/\r?\n/);
    var html = [];
    var i = 0;

    function listBlock(ordered) {
      var tag = ordered ? 'ol' : 'ul';
      var items = [];
      var re = ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
      while (i < lines.length) {
        var m = lines[i].match(re);
        if (!m) break;
        items.push('<li>' + inline(m[1]) + '</li>');
        i++;
      }
      html.push('<' + tag + '>' + items.join('') + '</' + tag + '>');
    }

    while (i < lines.length) {
      var line = lines[i];

      if (/^\s*$/.test(line)) { i++; continue; }

      // 围栏代码块
      var fence = line.match(/^\s*```(\w*)\s*$/);
      if (fence) {
        var lang = fence[1];
        var buf = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;  // 跳过收尾的 ```
        html.push('<pre><code' + (lang ? ' class="lang-' + lang + '"' : '') + '>' +
                  buf.join('\n') + '</code></pre>');
        continue;
      }

      // 标题
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        var lv = h[1].length;
        html.push('<h' + lv + '>' + inline(h[2].replace(/\s+#+\s*$/, '')) + '</h' + lv + '>');
        i++;
        continue;
      }

      // 分隔线
      if (/^\s*([-*_])\s*(?:\1\s*){2,}$/.test(line)) { html.push('<hr>'); i++; continue; }

      // 引用（连续行合并）。注意此时整段已经转义过了，行首的 > 变成了 &gt;，
      // 块级判断必须按转义后的形态来匹配。
      if (/^\s*&gt;\s?/.test(line)) {
        var quote = [];
        while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) {
          quote.push(lines[i].replace(/^\s*&gt;\s?/, ''));
          i++;
        }
        html.push('<blockquote>' + inline(quote.join(' ')) + '</blockquote>');
        continue;
      }

      if (/^\s*[-*+]\s+/.test(line)) { listBlock(false); continue; }
      if (/^\s*\d+[.)]\s+/.test(line)) { listBlock(true); continue; }

      // 段落：连续非空行合并，行尾两空格才换行
      var para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) &&
             !/^\s*(?:```|#{1,6}\s|&gt;|[-*+]\s|\d+[.)]\s)/.test(lines[i]) &&
             !/^\s*([-*_])\s*(?:\1\s*){2,}$/.test(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      if (para.length) {
        html.push('<p>' + inline(para.join('\n')).replace(/ {2,}\n/g, '<br>').replace(/\n/g, ' ') + '</p>');
      }
    }

    return html.join('\n');
  }

  // 中文按字计、西文按词计
  function stats(src) {
    var body = splitFrontMatter(src).body;
    var cjk = (body.match(/[一-龥぀-ヿ]/g) || []).length;
    var latin = (body.replace(/[一-龥぀-ヿ]/g, ' ')
                     .match(/[A-Za-z0-9'’-]+/g) || []).length;
    var words = cjk + latin;
    return {
      chars: body.length,
      words: words,
      minutes: Math.max(1, Math.round(words / 350))
    };
  }

  function frontMatter(fields) {
    var out = ['---'];
    Object.keys(fields).forEach(function (k) {
      var v = fields[k];
      if (v == null || v === '') return;
      if (Array.isArray(v)) {
        if (!v.length) return;
        out.push(k + ': [' + v.map(function (x) { return JSON.stringify(String(x)); }).join(', ') + ']');
      } else {
        out.push(k + ': ' + JSON.stringify(String(v)));
      }
    });
    out.push('---');
    return out.join('\n');
  }

  var api = { render: render, stats: stats, splitFrontMatter: splitFrontMatter,
              frontMatter: frontMatter, safeUrl: safeUrl, esc: esc };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MD = api;
})(typeof self !== 'undefined' ? self : this);
