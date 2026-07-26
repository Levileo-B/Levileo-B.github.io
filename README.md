# Levileo-B.github.io

我的个人主页，使用纯静态 HTML/CSS/JS 构建，由 GitHub Pages 托管。

**访问地址：** https://levileo-b.github.io/

## 特性

- 零依赖、零构建，纯静态文件，加载快
- 响应式布局，手机 / 平板 / 桌面均适配
- 自动跟随系统深色模式，也可手动切换（选择会被记住）
- 基础无障碍支持：跳转链接、语义化标签、键盘焦点样式
- 自定义 404 页面
- **热点窗格**：GitHub Actions 每 3 小时抓取 22 个 RSS 源，按六个分类聚合
- **实时热点页**：浏览器直连拉取 HN / GitHub / Reddit 榜单，另附各大热搜入口
- **附近最热**：按访客所在地区展示当地新闻，可手动切换地区
- **每日**：LeetCode 每日一题、每日英文短文（维基百科精选）、每日趣味视频（Prelinger 公有领域短片）
- **背景音乐**：随机播放 Internet Archive 的 CC 授权曲目，可切歌，顶部导航栏开关
- **小游戏**：2048、贪吃蛇、QWOP 式跑步模拟，纯前端实现，支持键盘与触屏
- **工具箱**：视频链接解析（含一键下载）、论文检索、域名分析、博客编辑器，
  以及 98 个常用工具站点入口
- **科研工作台**：按检索、发现、阅读、写作、计算与开放科学六阶段整合 36 个常用服务

## 文件结构

```
.
├── index.html              # 主页
├── 404.html                # 404 页面
├── .nojekyll               # 跳过 Jekyll 处理，直接发布原始文件
├── assets/
│   ├── style.css           # 站点样式（含主题变量）
│   ├── game.css            # 游戏页样式
│   ├── main.js             # 主题切换、页脚年份
│   ├── news.js             # 热点窗格渲染
│   ├── daily.js            # 每日一题 / 每日英文渲染
│   └── bgm.js              # 背景音乐开关（Web Audio 合成）
├── games/
│   ├── index.html          # 游戏列表
│   ├── 2048/
│   │   ├── board.js        # 棋盘纯逻辑，可在 Node 里单测
│   │   └── game.js         # 界面层：渲染 / 输入 / 存档
│   ├── snake/              # 贪吃蛇
│   └── qwop/               # QWOP 式跑步（Verlet 布娃娃物理）
├── research/
│   └── index.html          # 科研工作台：检索、阅读、写作、计算与开放科学
├── hot/
│   ├── index.html          # 实时热点（浏览器直连）
│   ├── parse.js            # 三个接口的响应整形（可单测）
│   └── app.js              # 界面层
├── tools/
│   ├── index.html          # 工具箱 + 常用网站清单
│   ├── video/
│   │   ├── parse.js        # 平台与 ID 识别（纯逻辑，可单测）
│   │   ├── direct.js       # 直链推导（纯逻辑，可单测）
│   │   └── app.js          # 界面层
│   ├── papers/app.js       # 论文检索（OpenAlex，回退 Crossref）
│   ├── domain/
│   │   ├── parse.js        # 域名归一化 + DoH/RDAP 整形（可单测）
│   │   └── app.js          # 界面层
│   └── blog/
│       ├── md.js           # Markdown 渲染器（可单测）
│       └── app.js          # 界面层
├── data/
│   ├── news.json           # 由 Actions 生成，不要手工改
│   └── daily.json          # 同上
├── scripts/
│   ├── fetch_news.py       # RSS 抓取脚本（仅标准库）
│   ├── fetch_daily.py      # 每日一题 / 英文短文 / 视频 / 音乐歌单
│   └── fetch_local.py      # 各地区本地新闻（复用 fetch_news 的解析器）
└── .github/workflows/
    └── update-news.yml     # 每 3 小时定时任务
```

## 两套热点有什么区别

**首页的「每日热点」是定时快照。** 绝大多数 RSS 源不开放跨域，浏览器直接抓会被拦，
所以走 Actions 在服务端抓好再落地成静态文件：

1. `.github/workflows/update-news.yml` 每 3 小时触发一次
2. `scripts/fetch_news.py` 并发抓取 22 个源（8 线程），写入 `data/news.json`
3. 有变化就自动 commit 回仓库，Pages 随之更新
4. 首页 `assets/news.js` 读取这个静态 JSON，按 `category` 分类聚合后渲染

**`/hot/` 的「实时热点」是打开即拉。** 只收录那些开放 CORS 且不需要 API key 的接口，
所以能在浏览器里直连：Hacker News（Firebase API）、GitHub（搜索 API 取近 7 天新星项目）、
Reddit（`r/popular` 的 `.json`）。支持手动刷新与每 5 分钟自动刷新。
微博、知乎、百度这些热榜接口不开放跨域，拉不到内容，所以只以链接入口的形式给出。

**换新闻源**：编辑 `scripts/fetch_news.py` 顶部的 `FEEDS`，每项含 `name`、`category`、`url`。
`category` 决定它归到首页哪一栏。单个源失败不影响其他源，失败原因写在 Actions 日志里。

**想立刻更新一次**：仓库 → Actions → 「更新热点」→ Run workflow。

> 注意：定时任务需要仓库的 Actions 有写权限。若 push 步骤报 403，去 Settings → Actions → General → Workflow permissions，选 `Read and write permissions`。

## 「附近最热」怎么判断地区

各地新闻站的 RSS 同样不开放跨域，所以还是 Actions 预生成：`scripts/fetch_local.py`
把所有地区抓好写进一个 `data/local.json`，前端按访客地区取对应那一段。

前端判断地区的顺序：

1. **用户手动选过** → 一律以手动选择为准，之后不再自动判断
2. **浏览器时区** → `Intl` 直接给出 `Asia/Singapore` 这类值，不发请求、不涉及 IP，
   所以放在网络请求前面先出结果，页面立刻有内容
3. **IP 归属地** → 调 [api.country.is](https://api.country.is)（开放跨域、免费、无需 key）
   再校正一次，比时区准
4. 都不成 → 显示国际新闻

**隐私**：第 3 步会把访客 IP 暴露给那个第三方服务，这是 IP 定位绕不开的代价，
页面上写明了。用户可以直接手动选地区（选择被记住，此后不再自动判断），
或者用扩展拦掉该请求 —— 拦掉不影响使用，只会退回按时区判断。

**增删地区**：改 `scripts/fetch_local.py` 顶部的 `REGIONS`，键用 ISO 3166-1
alpha-2 国家码，和前端拿到的 country code 对齐。`global` 是兜底，不能删。

## 每日内容与背景音乐

**LeetCode 每日一题**走服务端抓取（`scripts/fetch_daily.py`），因为 LeetCode 的
GraphQL 接口不发 CORS 头，浏览器直连会被拦。先试 leetcode.cn（有中文标题），
失败再退到 leetcode.com。**只存标题、难度、标签和链接这类元信息，不存题面正文** ——
题目内容是 LeetCode 的版权材料，点链接过去看。

**每日英文短文**取维基百科「每日精选条目」的摘要，CC BY-SA 4.0，页面上标注来源与
许可并回链原文。选它是因为要每天更新又不能侵权，公有领域 / 开放许可的英文素材里
这个质量和稳定性最好。当天精选还没发布时会自动往前回退最多 3 天。

**每日趣味视频**从 Internet Archive 的 Prelinger 档案馆随机挑一部公有领域短片，
用日期做随机种子，所以同一天内固定、跨天才换。`preload="none"`，不点播放不消耗流量。
换片源改 `scripts/fetch_daily.py` 里 `fetch_video()` 的搜索条件即可。

**背景音乐**同样来自 Internet Archive —— Netlabels 馆藏，全部是 CC 授权。
每次刷新歌单取 12 首，打开时随机起播，一首放完自动下一首，也可以点 ⏭ 手动切。
当前曲目的标题、作者和许可显示在左下角并回链原页（CC 署名要求）。

开关在每个页面顶部导航栏，由 `bgm.js` 自动注入，不用逐页改 HTML；
开关状态和音量存 localStorage。浏览器禁止未经交互自动播放，所以首次必须点一下；
之前开过的话脚本只是预备好，等第一次点击或按键才出声。

歌单取不到、或曲目全部加载失败时，会回落到 Web Audio 实时合成的环境音
（五声音阶随机音符 + 低音铺底），保证外链挂掉也不会哑。

## 工具箱的能力边界

**视频一键下载**分两种情况，页面上也写明了：

*能*拿到真实直链、点一下就存的：链接本身是媒体文件（.mp4/.jpg 等）、GIPHY、
Reddit 的视频与图集（官方 `.json` 接口开放跨域）、以及各平台封面图。
下载按钮会先 `fetch` 成 Blob 再触发保存；对方没开跨域时自动退回新标签页打开。

*不能*的：YouTube、哔哩哔哩、抖音的**视频本体**。它们的流地址带签名且有时效，
必须服务端解密，静态页面做不到 —— 这类给的是拼好的 `yt-dlp` 命令。
另外页面底部可以填一个自建解析服务地址（cobalt 格式），填了之后这类平台也能一键下载；
地址只存在浏览器 localStorage 里。

**域名分析**用 DNS-over-HTTPS（Google，回退 Cloudflare）查解析记录，
用 RDAP（WHOIS 的现代替代）查注册信息，两者都开放跨域、无需注册。

**博客编辑器**只做写作与导出，不碰 GitHub 令牌 —— 把令牌存进网页不安全。
发布走「下载 .md → 仓库网页版新建文件粘贴」。
预览会把正文里的原始 HTML 当纯文本显示，链接和图片地址过协议白名单，
挡掉 `javascript:` / `data:` 这类伪协议。

**论文检索**直接从浏览器请求 [OpenAlex](https://openalex.org)，失败时自动回退
[Crossref](https://www.crossref.org)，两者都免费、无需 API key 且支持跨域。
arXiv 官方 API 没有开放 CORS，所以没有用它。
换数据源或调整每页数量，改 `tools/papers/app.js` 顶部即可。

## 如何启用 GitHub Pages

仓库名为 `Levileo-B.github.io`（用户站点），推送到默认分支后通常会自动发布。若未生效：

1. 打开仓库的 **Settings → Pages**
2. **Source** 选择 `Deploy from a branch`
3. **Branch** 选择 `main`（或你的默认分支），目录选 `/ (root)`
4. 保存，等待 1–2 分钟后访问 https://levileo-b.github.io/

## 如何修改内容

需要改动的地方都在 `index.html` 里，直接编辑文本即可：

- **首屏介绍**：`<section class="hero">` 中的标题、副标题和描述
- **关于我**：`#about` 区块的段落和 `.facts` 列表
- **项目卡片**：`#projects` 区块，复制一个 `<article class="card card--project">` 即可新增一项；标记为「待补充」的两张卡片可以替换成你的真实项目
- **技能栈**：`#skills` 区块的 `.tags` 列表项
- **联系方式**：`#contact` 区块的链接

配色在 `assets/style.css` 顶部的 `:root` 变量里统一定义，改 `--accent` 就能换主题色，游戏页面的配色也会跟着变。

## 本地预览

```bash
python3 -m http.server 8000
# 然后打开 http://localhost:8000
```

必须用 HTTP server，不能直接双击 `index.html` —— `file://` 协议下热点窗格的 `fetch` 会被浏览器拦掉（页面其余部分正常，只是新闻区显示提示文字）。
