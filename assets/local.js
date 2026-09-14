// 「附近最热」—— 按访客所在地区展示当地新闻。
//
// 地区怎么判断（按优先级，前一步不成才走下一步）：
//   1. 用户手动选过 → 一律以手动选择为准，存在 localStorage
//   2. 时区推断 —— Intl 直接给出 Asia/Singapore 这类值，不发任何请求、
//      不涉及 IP，速度最快，所以放在网络请求前面先出结果
//   3. IP 归属地 —— 调 api.country.is（开放跨域、免费、无需 key），
//      比时区准一些，拿到后再校正一次
//   4. 都不成 → 兜底显示国际新闻
//
// 隐私：第 3 步会把访客 IP 暴露给该第三方服务（这是 IP 定位的固有代价）。
// 页面上写明了这一点，并且提供手动切换；用户拦掉这个请求也不影响使用，
// 只会退回按时区判断。
(function () {
  var box = document.getElementById('local-body');
  var picker = document.getElementById('local-region');
  var label = document.getElementById('local-label');
  if (!box) return;

  var KEY = 'localRegion';
  var data = null;
  var detected = '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ago(iso) {
    if (!iso) return '';
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var diff = (Date.now() - t) / 1000;
    if (diff < 0) return '刚刚';
    if (diff < 3600) return Math.max(1, Math.floor(diff / 60)) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 604800) return Math.floor(diff / 86400) + ' 天前';
    return new Date(t).toLocaleDateString('zh-CN');
  }

  // 时区 → 地区。只列 REGIONS 里有的，其余走兜底。
  var TZ = {
    'Asia/Singapore': 'SG',
    'Asia/Shanghai': 'CN', 'Asia/Chongqing': 'CN', 'Asia/Urumqi': 'CN',
    'Asia/Hong_Kong': 'HK', 'Asia/Macau': 'HK',
    'Asia/Taipei': 'TW',
    'Asia/Tokyo': 'JP',
    'Asia/Seoul': 'KR',
    'Asia/Kuala_Lumpur': 'MY', 'Asia/Kuching': 'MY',
    'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
    'Europe/London': 'GB',
    'Europe/Berlin': 'DE',
    'Europe/Paris': 'FR',
    'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA'
  };

  function byTimezone() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (TZ[tz]) return TZ[tz];
      if (/^America\//.test(tz)) return 'US';
      if (/^Australia\//.test(tz)) return 'AU';
    } catch (e) {}
    return '';
  }

  function saved() {
    try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  }
  function save(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
  }

  function pick(code) {
    if (!data) return null;
    if (code && data.regions[code]) return code;
    return data.regions.global ? 'global' : Object.keys(data.regions)[0] || null;
  }

  function render(code, how) {
    var region = data && data.regions[code];
    if (!region || !region.items.length) {
      box.innerHTML = '<p class="news__empty">这个地区暂时没有内容。</p>';
      return;
    }
    if (label) {
      label.textContent = region.name + (how ? '（' + how + '）' : '');
    }
    // 优先保证来源多样性：同一来源先取两条，再用其余内容补足 10 条。
    var counts = {};
    var overflow = [];
    var mixed = region.items.filter(function (it) {
      var source = it.source || '';
      counts[source] = counts[source] || 0;
      if (counts[source] >= 2) {
        overflow.push(it);
        return false;
      }
      counts[source] += 1;
      return true;
    }).concat(overflow).slice(0, 10);

    box.innerHTML = '<ul class="news__list">' + mixed.map(function (it) {
      var when = ago(it.date);
      return '<li class="news__item">' +
               '<a href="' + esc(it.link) + '" target="_blank" rel="noopener noreferrer">' +
                 esc(it.title) + '</a>' +
               '<span class="news__line">' +
                 '<span class="news__src">' + esc(it.source) +
                   (it.channel ? ' · ' + esc(it.channel) : '') + '</span>' +
                 (when ? '<time class="news__time">' + esc(when) + '</time>' : '') +
               '</span>' +
             '</li>';
    }).join('') + '</ul>';
  }

  function fillPicker(current) {
    if (!picker) return;
    var codes = Object.keys(data.regions).sort(function (a, b) {
      if (a === 'global') return 1;
      if (b === 'global') return -1;
      return data.regions[a].name.localeCompare(data.regions[b].name, 'zh');
    });
    picker.innerHTML = codes.map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === current ? ' selected' : '') + '>' +
             esc(data.regions[c].name) + '</option>';
    }).join('');
    picker.disabled = false;
  }

  function show(code, how) {
    var use = pick(code);
    if (!use) return;
    render(use, how);
    if (picker) picker.value = use;
  }

  fetch('data/local.json', { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (json) {
      data = json;

      var manual = saved();
      if (manual && data.regions[manual]) {
        fillPicker(manual);
        show(manual, '你选择的');
        return;                       // 手动选过就不再自动判断
      }

      // 先按时区给个结果，页面立刻有内容
      detected = byTimezone();
      fillPicker(pick(detected));
      show(detected, detected ? '按时区判断' : '默认');

      // 再用 IP 归属地校正一次；失败就保持时区结果
      return fetch('https://api.country.is/', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (geo) {
          if (!geo || !geo.country) return;
          if (saved()) return;                       // 期间用户手动选了就别覆盖
          var code = String(geo.country).toUpperCase();
          if (code === detected) return;             // 和时区一致，不用重画
          fillPicker(pick(code));
          show(code, '按 IP 归属地');
        })
        .catch(function () { /* 被拦或超时都无所谓，时区结果已经在了 */ });
    })
    .catch(function () {
      box.innerHTML = '<p class="news__empty">本地新闻还没生成。' +
        '等 GitHub Actions 跑过一次后就会有内容。</p>';
    });

  if (picker) {
    picker.addEventListener('change', function () {
      save(picker.value);
      show(picker.value, '你选择的');
    });
  }
})();
