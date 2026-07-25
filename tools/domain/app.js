// 域名分析界面层：DoH 查 DNS，RDAP 查注册信息。解析逻辑在 parse.js。
(function () {
  var P = window.DomainParse;
  var form = document.getElementById('form');
  var qEl = document.getElementById('q');
  var goEl = document.getElementById('go');
  var out = document.getElementById('result');

  var TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'CAA', 'SOA'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function doh(name, type) {
    var g = 'https://dns.google/resolve?name=' + encodeURIComponent(name) + '&type=' + type;
    return fetch(g, { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function () {
        var cf = 'https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(name) + '&type=' + type;
        return fetch(cf, { headers: { Accept: 'application/dns-json' } })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
      })
      .then(function (j) { return { type: type, records: P.parseDoh(j, type) }; })
      .catch(function () { return { type: type, records: [], failed: true }; });
  }

  function rdap(name) {
    return fetch('https://rdap.org/domain/' + encodeURIComponent(name), {
      headers: { Accept: 'application/rdap+json, application/json' }
    })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(P.parseRdap)
      .catch(function () { return null; });
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var t = Date.parse(iso);
    return isNaN(t) ? iso : new Date(t).toLocaleDateString('zh-CN');
  }

  function renderReg(reg, name) {
    if (!reg) {
      return '<div class="result__block"><p class="result__label">注册信息</p>' +
             '<p class="hint">没有取到 RDAP 数据。部分国别域名（如 .cn）不提供公开 RDAP 接口，' +
             '或该域名尚未注册。</p></div>';
    }
    var days = P.ageDays(reg.created);
    var rows = [
      ['注册商', reg.registrar || '—'],
      ['注册时间', fmtDate(reg.created) + (days != null ? '（' + P.humanAge(days) + '前）' : '')],
      ['到期时间', fmtDate(reg.expires)],
      ['最近更新', fmtDate(reg.updated)],
      ['状态', reg.status.length ? reg.status.join('、') : '—'],
      ['域名服务器', reg.nameservers.length ? reg.nameservers.join('<br>') : '—']
    ];
    return '<div class="result__block"><p class="result__label">注册信息</p>' +
           '<table class="kv"><tbody>' +
           rows.map(function (r) {
             return '<tr><th>' + esc(r[0]) + '</th><td>' + r[1] + '</td></tr>';
           }).join('') +
           '</tbody></table></div>';
  }

  function renderDns(results) {
    var any = results.some(function (r) { return r.records.length; });
    var html = '<div class="result__block"><p class="result__label">DNS 记录</p>';

    if (!any) {
      html += '<p class="hint">没有查到任何解析记录。域名可能未注册、未配置解析，或拼写有误。</p>';
      return html + '</div>';
    }

    html += '<table class="kv kv--dns"><tbody>';
    results.forEach(function (r) {
      if (!r.records.length) return;
      r.records.forEach(function (rec, i) {
        html += '<tr>' +
                  '<th>' + (i === 0 ? esc(r.type) : '') + '</th>' +
                  '<td><code>' + esc(rec.value) + '</code></td>' +
                  '<td class="kv__ttl">' + (rec.ttl != null ? rec.ttl + 's' : '') + '</td>' +
                '</tr>';
      });
    });
    html += '</tbody></table>';

    var missing = results.filter(function (r) { return !r.records.length && !r.failed; })
                         .map(function (r) { return r.type; });
    if (missing.length) {
      html += '<p class="hint" style="margin-top:.6rem">无记录：' + esc(missing.join('、')) + '</p>';
    }
    return html + '</div>';
  }

  function run(name) {
    out.innerHTML = '<p class="spinner">查询中…</p>';
    goEl.disabled = true;

    Promise.all([
      Promise.all(TYPES.map(function (t) { return doh(name, t); })),
      rdap(name)
    ])
      .then(function (res) {
        var dnsResults = res[0], reg = res[1];
        var allFailed = dnsResults.every(function (r) { return r.failed; });

        var head = '<p class="result__label" style="margin-bottom:1rem">' +
                     '正在分析 <span class="badge">' + esc(name) + '</span></p>';

        if (allFailed && !reg) {
          out.innerHTML = head + '<p class="notice">DNS 与 RDAP 查询都失败了。' +
            '可能是网络不通，或浏览器 / 扩展拦截了这些请求。</p>';
          return;
        }
        out.innerHTML = head + renderDns(dnsResults) + renderReg(reg, name);
      })
      .then(function () { goEl.disabled = false; }, function () { goEl.disabled = false; });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = P.normalize(qEl.value);
    if (!name) {
      out.innerHTML = '<p class="notice">这不像一个有效域名。试试 <code>example.com</code> 这样的形式。</p>';
      return;
    }
    qEl.value = name;
    history.replaceState(null, '', '?d=' + encodeURIComponent(name));
    run(name);
  });

  var pre = new URLSearchParams(location.search).get('d');
  if (pre) {
    var n = P.normalize(pre);
    if (n) { qEl.value = n; run(n); }
  }
})();
