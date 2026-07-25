# Levileo-B.github.io

我的个人主页，使用纯静态 HTML/CSS/JS 构建，由 GitHub Pages 托管。

**访问地址：** https://levileo-b.github.io/

## 特性

- 零依赖、零构建，纯静态文件，加载快
- 响应式布局，手机 / 平板 / 桌面均适配
- 自动跟随系统深色模式，也可手动切换（选择会被记住）
- 基础无障碍支持：跳转链接、语义化标签、键盘焦点样式
- 自定义 404 页面
- **每日热点窗格**：GitHub Actions 每天自动抓取多个 RSS 源
- **小游戏**：2048、贪吃蛇、QWOP 式跑步模拟，纯前端实现，支持键盘与触屏
- **工具箱**：视频链接解析（含一键下载）、论文检索、域名分析、博客编辑器，
  以及 30 个常用工具站点入口

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
│   └── news.js             # 热点窗格渲染
├── games/
│   ├── index.html          # 游戏列表
│   ├── 2048/
│   │   ├── board.js        # 棋盘纯逻辑，可在 Node 里单测
│   │   └── game.js         # 界面层：渲染 / 输入 / 存档
│   ├── snake/              # 贪吃蛇
│   └── qwop/               # QWOP 式跑步（Verlet 布娃娃物理）
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
│   └── news.json           # 由 Actions 生成，不要手工改
├── scripts/
│   └── fetch_news.py       # RSS 抓取脚本（仅标准库）
└── .github/workflows/
    └── update-news.yml     # 每日定时任务
```

## 每日热点是怎么工作的

静态站点没有后端，所以新闻不是浏览器直接去抓的（会遇到 CORS 和 API key 问题），而是：

1. `.github/workflows/update-news.yml` 每天 UTC 22:00（北京时间次日 06:00）触发
2. `scripts/fetch_news.py` 抓取 RSS 源，解析后写入 `data/news.json`
3. 有变化就自动 commit 回仓库，Pages 随之更新
4. 首页的 `assets/news.js` 只是读取这个静态 JSON 并渲染

**换新闻源**：编辑 `scripts/fetch_news.py` 顶部的 `FEEDS` 列表即可，`name` 是页面上显示的分组名。单个源失败不影响其他源，失败原因会写在 Actions 日志里。

**想立刻更新一次**：仓库 → Actions → 「更新每日热点」→ Run workflow。

> 注意：定时任务需要仓库的 Actions 有写权限。若 push 步骤报 403，去 Settings → Actions → General → Workflow permissions，选 `Read and write permissions`。

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
