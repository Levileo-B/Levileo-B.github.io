// 博客编辑器界面层，Markdown 渲染在 md.js
(function () {
  var M = window.MD;
  var src = document.getElementById('src');
  var preview = document.getElementById('preview');
  var statsEl = document.getElementById('stats');
  var savedEl = document.getElementById('saved');
  var mTitle = document.getElementById('m-title');
  var mDate = document.getElementById('m-date');
  var mTags = document.getElementById('m-tags');

  var KEY = 'blogDraft';
  var saveTimer = null;

  var SAMPLE = [
    '# 这是标题',
    '',
    '开始写点什么。支持 **加粗**、*斜体*、`行内代码` 和 [链接](https://example.com)。',
    '',
    '## 小标题',
    '',
    '- 列表项一',
    '- 列表项二',
    '',
    '> 引用一段话。',
    '',
    '```js',
    'console.log("代码块会原样保留");',
    '```'
  ].join('\n');

  function fields() {
    return {
      title: mTitle.value.trim(),
      date: mDate.value,
      tags: mTags.value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean)
    };
  }

  function fullDoc() {
    var f = fields();
    var head = (f.title || f.date || f.tags.length) ? M.frontMatter(f) + '\n\n' : '';
    return head + src.value;
  }

  function update() {
    preview.innerHTML = M.render(src.value) ||
      '<p class="hint">左边写点内容，这里会实时预览。</p>';
    var s = M.stats(src.value);
    statsEl.textContent = s.chars + ' 字符 · ' + s.words + ' 词 · 约 ' + s.minutes + ' 分钟读完';
    scheduleSave();
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(KEY, JSON.stringify({
          body: src.value, title: mTitle.value, date: mDate.value, tags: mTags.value
        }));
        var now = new Date();
        savedEl.textContent = '已保存 ' + now.toTimeString().slice(0, 5);
      } catch (e) {
        savedEl.textContent = '本地保存失败';
      }
    }, 400);
  }

  function restore() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    if (raw) {
      try {
        var d = JSON.parse(raw);
        src.value = d.body || '';
        mTitle.value = d.title || '';
        mDate.value = d.date || '';
        mTags.value = d.tags || '';
        return;
      } catch (e) {}
    }
    src.value = SAMPLE;
    mDate.value = new Date().toISOString().slice(0, 10);
  }

  function slug() {
    var t = mTitle.value.trim();
    if (!t) return 'post';
    // 纯中文标题取不出 ASCII，退回 post —— 日期在文件名里已经单独拼过了，
    // 这里再用日期会得到 2026-07-25-2026-07-25.md 这种重复串
    var ascii = t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return ascii || 'post';
  }

  function saveFile() {
    var blob = new Blob([fullDoc()], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (mDate.value ? mDate.value + '-' : '') + slug() + '.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }

  function copy(text, btn) {
    var old = btn.textContent;
    function done() {
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = old; }, 1400);
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = '复制失败'; }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
  }

  // Tab 键插入缩进而不是跳走
  src.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    var s = src.selectionStart, t = src.selectionEnd;
    src.value = src.value.slice(0, s) + '  ' + src.value.slice(t);
    src.selectionStart = src.selectionEnd = s + 2;
    update();
  });

  src.addEventListener('input', update);
  [mTitle, mDate, mTags].forEach(function (el) {
    el.addEventListener('input', scheduleSave);
  });

  document.getElementById('dl-md').addEventListener('click', saveFile);
  document.getElementById('copy-md').addEventListener('click', function () {
    copy(fullDoc(), this);
  });
  document.getElementById('copy-html').addEventListener('click', function () {
    copy(M.render(src.value), this);
  });
  document.getElementById('clear').addEventListener('click', function () {
    if (!src.value.trim() || confirm('清空当前草稿？这个操作不能撤销。')) {
      src.value = '';
      mTitle.value = '';
      mTags.value = '';
      update();
    }
  });

  restore();
  update();
})();
