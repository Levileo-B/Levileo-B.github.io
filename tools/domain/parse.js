// 域名分析的纯逻辑：输入归一化 + DoH / RDAP 响应整形。可在 Node 里单测。
(function (root) {

  // 各种粘贴形态都归一化成主机名：带协议、带路径、带端口、带 @ 的邮箱等
  function normalize(raw) {
    var s = String(raw == null ? '' : raw).trim().toLowerCase();
    if (!s) return '';
    if (s.indexOf('@') > -1) s = s.split('@').pop();      // 从邮箱里取域名
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');          // 去协议
    s = s.split(/[\/?#]/)[0];                              // 去路径 / 查询
    s = s.replace(/:\d+$/, '');                            // 去端口
    s = s.replace(/\.$/, '');                              // 去根点
    if (!/^[a-z0-9.-]+$/.test(s)) return '';               // 只留合法字符
    if (s.indexOf('.') < 1) return '';                     // 至少要有一个点
    if (/^\d+(\.\d+){3}$/.test(s)) return s;               // IPv4 直接放行
    if (!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(s)) return '';
    return s;
  }

  var TYPE_NAME = {
    1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 15: 'MX', 16: 'TXT', 28: 'AAAA', 257: 'CAA'
  };

  // DoH 响应（Google / Cloudflare 同一种 JSON 形状）
  function parseDoh(json, wanted) {
    if (!json || typeof json !== 'object') return [];
    var answers = json.Answer || [];
    return answers
      .filter(function (a) { return !wanted || TYPE_NAME[a.type] === wanted; })
      .map(function (a) {
        return {
          type: TYPE_NAME[a.type] || String(a.type),
          ttl: a.TTL,
          value: String(a.data == null ? '' : a.data).replace(/^"|"$/g, '')
        };
      });
  }

  function vcardName(entity) {
    try {
      var arr = entity.vcardArray[1];
      for (var i = 0; i < arr.length; i++) {
        if (arr[i][0] === 'fn' && arr[i][3]) return String(arr[i][3]);
      }
    } catch (e) {}
    return '';
  }

  // RDAP 响应 → 注册信息摘要
  function parseRdap(json) {
    if (!json || typeof json !== 'object') return null;

    var events = {};
    (json.events || []).forEach(function (e) {
      if (e && e.eventAction) events[e.eventAction] = e.eventDate;
    });

    var registrar = '';
    (json.entities || []).forEach(function (en) {
      var roles = (en && en.roles) || [];
      if (roles.indexOf('registrar') > -1 && !registrar) registrar = vcardName(en);
    });

    var ns = (json.nameservers || [])
      .map(function (n) { return n && (n.ldhName || n.unicodeName); })
      .filter(Boolean);

    return {
      domain: json.ldhName || json.unicodeName || '',
      registrar: registrar,
      status: json.status || [],
      created: events.registration || '',
      updated: events['last changed'] || events['last update of RDAP database'] || '',
      expires: events.expiration || '',
      nameservers: ns
    };
  }

  // 域名年龄（天），拿不到返回 null
  function ageDays(created, now) {
    if (!created) return null;
    var t = Date.parse(created);
    if (isNaN(t)) return null;
    return Math.floor(((now == null ? Date.now() : now) - t) / 86400000);
  }

  function humanAge(days) {
    if (days == null) return '';
    if (days < 0) return '日期异常';
    var y = Math.floor(days / 365);
    var m = Math.floor((days % 365) / 30);
    if (y > 0) return y + ' 年' + (m ? ' ' + m + ' 个月' : '');
    if (m > 0) return m + ' 个月';
    return days + ' 天';
  }

  var api = {
    normalize: normalize,
    parseDoh: parseDoh,
    parseRdap: parseRdap,
    ageDays: ageDays,
    humanAge: humanAge,
    TYPE_NAME: TYPE_NAME
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DomainParse = api;
})(typeof self !== 'undefined' ? self : this);
