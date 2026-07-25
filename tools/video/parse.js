// 视频链接解析 —— 纯逻辑，不碰 DOM，可以单独在 Node 里跑测试。
//
// 能力边界说明（重要）：
// 浏览器里拿不到视频的真实流地址。一是跨域被拦，二是各平台的直链都带
// 签名、有时效，需要在服务端解密。静态站点没有后端，所以这里做的是
// 「链接解析」而不是「直链破解」：规范化链接、生成播放器嵌入地址、
// 给出公开的封面图直链，以及拼好 yt-dlp 命令交给本地去下载。
(function (root) {

  var RULES = [
    {
      platform: 'YouTube',
      patterns: [
        /(?:youtube\.com|youtube-nocookie\.com)\/watch\?[^#\s]*\bv=([\w-]{11})/i,
        /youtu\.be\/([\w-]{11})/i,
        /(?:youtube\.com|youtube-nocookie\.com)\/shorts\/([\w-]{11})/i,
        /(?:youtube\.com|youtube-nocookie\.com)\/embed\/([\w-]{11})/i,
        /(?:youtube\.com|youtube-nocookie\.com)\/live\/([\w-]{11})/i
      ],
      build: function (id) {
        return {
          id: id,
          canonical: 'https://www.youtube.com/watch?v=' + id,
          embed: 'https://www.youtube-nocookie.com/embed/' + id,
          thumbs: [
            { label: '最高清晰度', url: 'https://img.youtube.com/vi/' + id + '/maxresdefault.jpg' },
            { label: '高清', url: 'https://img.youtube.com/vi/' + id + '/hqdefault.jpg' }
          ]
        };
      }
    },
    {
      platform: '哔哩哔哩',
      patterns: [
        /bilibili\.com\/video\/(BV[0-9A-Za-z]{10})/i,
        /bilibili\.com\/video\/(av\d+)/i
      ],
      build: function (id) {
        var isBV = /^BV/i.test(id);
        return {
          id: id,
          canonical: 'https://www.bilibili.com/video/' + id,
          embed: 'https://player.bilibili.com/player.html?' +
                 (isBV ? 'bvid=' + id : 'aid=' + id.replace(/^av/i, '')) + '&autoplay=0',
          thumbs: []      // 封面在 API 里，跨域拿不到
        };
      }
    },
    {
      platform: 'Vimeo',
      patterns: [
        /vimeo\.com\/(?:video\/)?(\d+)/i,
        /player\.vimeo\.com\/video\/(\d+)/i
      ],
      build: function (id) {
        return {
          id: id,
          canonical: 'https://vimeo.com/' + id,
          embed: 'https://player.vimeo.com/video/' + id,
          thumbs: []
        };
      }
    },
    {
      platform: 'X / Twitter',
      patterns: [/(?:twitter\.com|x\.com)\/[^\/\s]+\/status\/(\d+)/i],
      build: function (id, raw) {
        var user = (raw.match(/(?:twitter\.com|x\.com)\/([^\/\s]+)\/status/i) || [])[1] || 'i';
        return {
          id: id,
          canonical: 'https://x.com/' + user + '/status/' + id,
          embed: '',
          thumbs: []
        };
      }
    },
    {
      platform: '抖音',
      patterns: [/douyin\.com\/video\/(\d+)/i],
      build: function (id) {
        return {
          id: id,
          canonical: 'https://www.douyin.com/video/' + id,
          embed: '',
          thumbs: []
        };
      }
    },
    {
      platform: 'TikTok',
      patterns: [/tiktok\.com\/@[\w.-]+\/video\/(\d+)/i],
      build: function (id, raw) {
        var user = (raw.match(/tiktok\.com\/@([\w.-]+)\/video/i) || [])[1] || '';
        return {
          id: id,
          canonical: 'https://www.tiktok.com/@' + user + '/video/' + id,
          embed: '',
          thumbs: []
        };
      }
    }
  ];

  // 短链只有服务端跟随跳转才能还原，前端拿不到目标地址
  var SHORT = [
    { re: /b23\.tv\//i, hint: '哔哩哔哩短链' },
    { re: /v\.douyin\.com\//i, hint: '抖音短链' },
    { re: /vm\.tiktok\.com\//i, hint: 'TikTok 短链' }
  ];

  function ytdlp(url) {
    return [
      { label: '默认最佳画质', cmd: 'yt-dlp "' + url + '"' },
      { label: '合并为 mp4', cmd: 'yt-dlp -f "bv*+ba/b" --merge-output-format mp4 "' + url + '"' },
      { label: '只要音频', cmd: 'yt-dlp -x --audio-format mp3 "' + url + '"' },
      { label: '连字幕一起', cmd: 'yt-dlp --write-subs --sub-langs "zh.*,en" "' + url + '"' }
    ];
  }

  function parse(input) {
    var raw = String(input == null ? '' : input).trim();
    if (!raw) return { ok: false, reason: 'empty' };

    for (var s = 0; s < SHORT.length; s++) {
      if (SHORT[s].re.test(raw)) {
        return {
          ok: false,
          reason: 'short',
          hint: SHORT[s].hint,
          ytdlp: ytdlp(raw)      // 短链交给 yt-dlp 反而没问题，它会自己跳转
        };
      }
    }

    for (var i = 0; i < RULES.length; i++) {
      var rule = RULES[i];
      for (var j = 0; j < rule.patterns.length; j++) {
        var m = raw.match(rule.patterns[j]);
        if (m) {
          var built = rule.build(m[1], raw);
          built.ok = true;
          built.platform = rule.platform;
          built.ytdlp = ytdlp(built.canonical);
          return built;
        }
      }
    }

    return { ok: false, reason: 'unknown', ytdlp: /^https?:\/\//i.test(raw) ? ytdlp(raw) : null };
  }

  var api = { parse: parse, ytdlp: ytdlp };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VideoParse = api;
})(typeof self !== 'undefined' ? self : this);
