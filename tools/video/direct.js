// 直链推导 —— 纯逻辑，可在 Node 里单测。
//
// 哪些情况能在纯前端拿到「点一下就能下载」的真实直链：
//   1. 链接本身就是媒体文件（.mp4/.jpg/...）        → 直接就是直链
//   2. GIPHY                                        → 直链可由 ID 拼出，无需接口
//   3. YouTube / 哔哩哔哩 封面图                     → 公开图床，规则固定
//   4. Reddit                                       → 官方 .json 接口开放跨域，需异步请求
// 哪些拿不到：YouTube / B 站 / 抖音的视频流本体 —— 直链带签名且有时效，
// 必须服务端解密，静态站点做不到。那部分走可选的自建解析服务。
(function (root) {

  var FILE_RE = /\.(mp4|webm|mkv|mov|m4v|mp3|m4a|aac|ogg|opus|wav|flac|jpg|jpeg|png|gif|webp|avif|svg|pdf)(?=$|[?#])/i;

  function fileNameFrom(url, fallback) {
    try {
      var u = new URL(url);
      var last = u.pathname.split('/').filter(Boolean).pop();
      if (last && last.indexOf('.') > 0) return decodeURIComponent(last);
    } catch (e) {}
    return fallback;
  }

  // Reddit 帖子地址 → 官方 JSON 接口（该接口开放 CORS）
  function redditJson(url) {
    var m = String(url || '').match(
      /reddit\.com\/(?:r\/[\w-]+\/)?comments\/([a-z0-9]+)/i
    );
    if (!m) return null;
    return 'https://www.reddit.com/comments/' + m[1] + '.json?raw_json=1';
  }

  function direct(raw) {
    var url = String(raw == null ? '' : raw).trim();
    if (!url) return { kind: 'none', items: [] };

    // 1. 链接本身就是媒体文件
    var f = url.match(FILE_RE);
    if (f) {
      var ext = f[1].toLowerCase();
      return {
        kind: 'file',
        items: [{ label: '直接下载（' + ext + '）', url: url, filename: fileNameFrom(url, 'download.' + ext) }]
      };
    }

    // 2. GIPHY：ID 就在链接末尾，直链规则固定
    var g = url.match(/giphy\.com\/(?:gifs|clips|stickers)\/(?:[\w-]*-)?([A-Za-z0-9]{6,})(?=$|[?#\/])/i) ||
            url.match(/(?:i|media[0-9]?)\.giphy\.com\/media\/([A-Za-z0-9]{6,})(?=$|[?#\/])/i);
    if (g) {
      var id = g[1];
      return {
        kind: 'giphy',
        id: id,
        items: [
          { label: 'MP4', url: 'https://i.giphy.com/media/' + id + '/giphy.mp4', filename: id + '.mp4' },
          { label: 'GIF', url: 'https://i.giphy.com/media/' + id + '/giphy.gif', filename: id + '.gif' }
        ]
      };
    }

    // 3. Reddit：要异步问一次官方接口
    var rj = redditJson(url);
    if (rj) return { kind: 'reddit', api: rj, items: [] };

    return { kind: 'none', items: [] };
  }

  // 从 Reddit 的 JSON 响应里挑出可下载的媒体
  function parseReddit(json) {
    var post;
    try {
      post = json[0].data.children[0].data;
    } catch (e) {
      return [];
    }
    var items = [];
    var slug = (post.id || 'reddit');

    var rv = (post.secure_media && post.secure_media.reddit_video) ||
             (post.media && post.media.reddit_video) ||
             (post.preview && post.preview.reddit_video_preview);
    if (rv && rv.fallback_url) {
      var v = String(rv.fallback_url).split('?')[0];
      items.push({ label: '视频' + (rv.height ? '（' + rv.height + 'p，无声轨）' : ''), url: v, filename: slug + '.mp4' });
      // Reddit 的音轨是独立文件，需要用 ffmpeg 合并
      var audio = v.replace(/\/DASH_\d+\.mp4$/, '/DASH_audio.mp4');
      if (audio !== v) items.push({ label: '音轨（需与视频合并）', url: audio, filename: slug + '-audio.mp4' });
    }

    if (post.url_overridden_by_dest && FILE_RE.test(post.url_overridden_by_dest)) {
      var u = post.url_overridden_by_dest;
      items.push({ label: '原图 / 原文件', url: u, filename: fileNameFrom(u, slug) });
    }

    if (post.is_gallery && post.media_metadata) {
      Object.keys(post.media_metadata).forEach(function (k, i) {
        var meta = post.media_metadata[k];
        if (meta && meta.s && (meta.s.u || meta.s.gif)) {
          var src = String(meta.s.u || meta.s.gif).replace(/&amp;/g, '&');
          items.push({ label: '图集 ' + (i + 1), url: src, filename: slug + '-' + (i + 1) + '.jpg' });
        }
      });
    }

    return items;
  }

  var api = { direct: direct, redditJson: redditJson, parseReddit: parseReddit, FILE_RE: FILE_RE };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VideoDirect = api;
})(typeof self !== 'undefined' ? self : this);
