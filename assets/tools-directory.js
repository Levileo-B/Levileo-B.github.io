// 在线工具目录：数据和检索都在浏览器本地运行，不会发送搜索关键词。
(function () {
  var DATA = [
    ['ai-tools', 'AI 助手', '对话、检索、写作、编程与模型体验', [
      ['ChatGPT', 'https://chatgpt.com', '通用对话、写作与多模态助手'],
      ['Claude', 'https://claude.ai', '长文理解、写作与代码协作'],
      ['Gemini', 'https://gemini.google.com', 'Google 的多模态 AI 助手'],
      ['Perplexity', 'https://www.perplexity.ai', '带来源引用的 AI 搜索'],
      ['DeepSeek', 'https://chat.deepseek.com', '推理、问答与代码生成'],
      ['Microsoft Copilot', 'https://copilot.microsoft.com', '搜索、创作与办公协作'],
      ['Poe', 'https://poe.com', '集中体验多种 AI 模型'],
      ['Hugging Face Spaces', 'https://huggingface.co/spaces', '体验开源模型与 AI 应用']
    ]],
    ['diagram-tools', '画图与白板', '流程图、架构图、思维整理与协作画布', [
      ['Excalidraw', 'https://excalidraw.com', '轻量手绘风白板'],
      ['tldraw', 'https://www.tldraw.com', '快速自由绘制的无限画布'],
      ['draw.io', 'https://app.diagrams.net', '流程图、网络图与架构图'],
      ['Mermaid Live', 'https://mermaid.live', '用文本生成流程与时序图'],
      ['FigJam', 'https://www.figma.com/figjam/', '团队协作白板与工作坊'],
      ['Miro', 'https://miro.com', '团队白板与模板协作'],
      ['Whimsical', 'https://whimsical.com', '流程图、线框图与思维导图'],
      ['ProcessOn', 'https://www.processon.com', '中文在线作图与协作']
    ]],
    ['design-tools', '设计与界面资源', '界面设计、配色、字体、图标和可访问性', [
      ['Figma', 'https://www.figma.com', '界面设计、原型与协作'],
      ['Penpot', 'https://penpot.app', '开源界面设计与原型工具'],
      ['Coolors', 'https://coolors.co', '生成、调整与导出配色'],
      ['Adobe Color', 'https://color.adobe.com', '色轮、配色规则与趋势'],
      ['WebAIM Contrast', 'https://webaim.org/resources/contrastchecker/', '检查文字颜色对比度'],
      ['Google Fonts', 'https://fonts.google.com', '开放字体查找与预览'],
      ['Lucide', 'https://lucide.dev/icons/', '一致、轻量的开源图标库'],
      ['Iconify', 'https://icon-sets.iconify.design', '统一搜索大量开源图标集']
    ]],
    ['dev-tools', '开发文档与生态', '技术文档、包索引、问答社区与学习路线', [
      ['MDN Web Docs', 'https://developer.mozilla.org', 'Web 平台权威参考文档'],
      ['DevDocs', 'https://devdocs.io', '集中检索多种技术文档'],
      ['Can I use', 'https://caniuse.com', '浏览器特性兼容性查询'],
      ['Stack Overflow', 'https://stackoverflow.com', '开发问题与社区解答'],
      ['GitHub', 'https://github.com', '代码托管、协作与开源项目'],
      ['npm', 'https://www.npmjs.com', 'JavaScript 软件包索引'],
      ['PyPI', 'https://pypi.org', 'Python 软件包索引'],
      ['crates.io', 'https://crates.io', 'Rust 社区软件包'],
      ['Go Packages', 'https://pkg.go.dev', 'Go 软件包与 API 文档'],
      ['roadmap.sh', 'https://roadmap.sh', '开发方向与技能学习路线']
    ]],
    ['api-tools', 'API、数据与编码', '接口调试、数据格式化、正则和编码转换', [
      ['Hoppscotch', 'https://hoppscotch.io', '轻量在线 API 请求与调试'],
      ['Postman Web', 'https://web.postman.co', 'API 设计、测试与协作'],
      ['Swagger Editor', 'https://editor.swagger.io', '编写和预览 OpenAPI 文档'],
      ['JSON Crack', 'https://jsoncrack.com', 'JSON、YAML 与 XML 可视化'],
      ['JSONLint', 'https://jsonlint.com', '校验并格式化 JSON'],
      ['jq play', 'https://jqplay.org', '在线编写和测试 jq 查询'],
      ['Regex101', 'https://regex101.com', '正则表达式解释与测试'],
      ['JWT.io', 'https://jwt.io', '查看与调试 JWT 内容'],
      ['CyberChef', 'https://gchq.github.io/CyberChef/', '编码、解码与数据转换'],
      ['Crontab Guru', 'https://crontab.guru', '解释和验证 cron 表达式']
    ]],
    ['network-tools', '网络、域名与安全', 'DNS、证书、邮件配置、IP 和安全情报查询', [
      ['WhatsMyDNS', 'https://www.whatsmydns.net', '检查全球 DNS 传播状态'],
      ['DNSChecker', 'https://dnschecker.org', '多节点 DNS 记录查询'],
      ['MXToolbox', 'https://mxtoolbox.com', '邮件、DNS 与黑名单诊断'],
      ['SSL Labs', 'https://www.ssllabs.com/ssltest/', 'HTTPS 与证书配置评分'],
      ['Security Headers', 'https://securityheaders.com', '检查网站安全响应头'],
      ['urlscan.io', 'https://urlscan.io', '分析网页请求和安全行为'],
      ['VirusTotal', 'https://www.virustotal.com', '检查网址、域名与文件风险'],
      ['Shodan', 'https://www.shodan.io', '互联网设备与服务搜索'],
      ['IPinfo', 'https://ipinfo.io', 'IP 归属与网络信息查询'],
      ['Have I Been Pwned', 'https://haveibeenpwned.com', '检查邮箱是否出现在泄露中']
    ]],
    ['media-tools', '图像与媒体', '压缩、抠图、编辑、转换与演示素材', [
      ['Squoosh', 'https://squoosh.app', '浏览器内压缩和转换图片'],
      ['TinyPNG', 'https://tinypng.com', '压缩 WebP、PNG 与 JPEG'],
      ['SVGOMG', 'https://jakearchibald.github.io/svgomg/', '清理并压缩 SVG 文件'],
      ['remove.bg', 'https://www.remove.bg', '自动移除图片背景'],
      ['Photopea', 'https://www.photopea.com', '浏览器中的图像与 PSD 编辑器'],
      ['Ezgif', 'https://ezgif.com', 'GIF 与短视频裁剪转换'],
      ['CloudConvert', 'https://cloudconvert.com', '音视频和图像格式转换'],
      ['Carbon', 'https://carbon.now.sh', '生成适合分享的代码截图'],
      ['Ray.so', 'https://ray.so', '制作简洁的代码展示图片'],
      ['Unsplash', 'https://unsplash.com', '高质量可授权图片素材']
    ]],
    ['file-tools', '文件与办公', 'PDF、格式转换、文字识别和内容对比', [
      ['PDF24 Tools', 'https://tools.pdf24.org', '合并、拆分、压缩与转换 PDF'],
      ['iLovePDF', 'https://www.ilovepdf.com', '常用 PDF 在线处理合集'],
      ['Smallpdf', 'https://smallpdf.com', 'PDF 编辑、签名与格式转换'],
      ['TinyWow', 'https://tinywow.com', 'PDF、图片与视频工具集合'],
      ['Convertio', 'https://convertio.co', '文档、媒体与压缩包转换'],
      ['Diffchecker', 'https://www.diffchecker.com', '比较文本、图片和 PDF 差异'],
      ['OCR.Space', 'https://www.ocr.space', '从图片和扫描件识别文字'],
      ['Archive Extractor', 'https://www.archive-extractor.com', '在线解压多种压缩文件']
    ]],
    ['research-tools', '科研与学术', '论文检索、引用关系、开放数据和写作管理', [
      ['Google Scholar', 'https://scholar.google.com', '跨学科论文与引用检索'],
      ['arXiv', 'https://arxiv.org', '理工领域开放预印本'],
      ['OpenAlex', 'https://explore.openalex.org', '开放学术目录与知识图谱'],
      ['Semantic Scholar', 'https://www.semanticscholar.org', 'AI 辅助的科学文献检索'],
      ['Connected Papers', 'https://www.connectedpapers.com', '从一篇论文探索关联网络'],
      ['ResearchRabbit', 'https://www.researchrabbit.ai', '发现并整理论文引用关系'],
      ['Papers with Code', 'https://paperswithcode.com', '查找论文、代码与基准结果'],
      ['Crossref Search', 'https://search.crossref.org', '检索 DOI 和出版元数据'],
      ['Overleaf', 'https://www.overleaf.com', '在线 LaTeX 写作与协作'],
      ['Zotero', 'https://www.zotero.org', '文献收集、引用与资料管理']
    ]],
    ['data-tools', '数据分析与可视化', '在线计算环境、数据集、图表与故事化展示', [
      ['Google Colab', 'https://colab.research.google.com', '浏览器中的 Python Notebook'],
      ['Kaggle', 'https://www.kaggle.com', '数据集、Notebook 与竞赛'],
      ['Observable', 'https://observablehq.com', '交互式数据分析与可视化'],
      ['Datawrapper', 'https://www.datawrapper.de', '快速制作图表、地图与表格'],
      ['Flourish', 'https://flourish.studio', '模板化交互图表和数据故事'],
      ['RAWGraphs', 'https://www.rawgraphs.io', '从表格生成多种统计图形'],
      ['Tableau Public', 'https://public.tableau.com', '公开数据看板与作品社区'],
      ['WolframAlpha', 'https://www.wolframalpha.com', '计算、公式与知识查询']
    ]],
    ['learning-tools', '学习与编程练习', '系统课程、算法题、交互练习和技能挑战', [
      ['freeCodeCamp', 'https://www.freecodecamp.org', '免费编程课程与项目练习'],
      ['Exercism', 'https://exercism.org', '多语言练习与社区辅导'],
      ['LeetCode', 'https://leetcode.com', '算法、数据结构与面试题'],
      ['HackerRank', 'https://www.hackerrank.com', '编程技能与岗位测试练习'],
      ['CSSBattle', 'https://cssbattle.dev', '用最短 CSS 还原目标图形'],
      ['Flexbox Froggy', 'https://flexboxfroggy.com/#zh-cn', '游戏化学习 Flexbox 布局'],
      ['Grid Garden', 'https://cssgridgarden.com/#zh-cn', '游戏化学习 CSS Grid'],
      ['TypingClub', 'https://www.typingclub.com', '循序渐进练习键盘输入']
    ]]
  ];

  var input = document.getElementById('tool-search');
  var directory = document.getElementById('tool-directory');
  var nav = document.getElementById('category-nav');
  var status = document.getElementById('directory-status');
  var empty = document.getElementById('directory-empty');
  if (!input || !directory || !nav) return;

  function element(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  DATA.forEach(function (category) {
    var id = category[0], label = category[1], description = category[2], tools = category[3];

    var navItem = element('li');
    var navLink = element('a');
    navLink.href = '#' + id;
    navLink.appendChild(document.createTextNode(label + ' '));
    navLink.appendChild(element('span', '', tools.length));
    navItem.appendChild(navLink);
    nav.appendChild(navItem);

    var article = element('article', 'card tool-category');
    article.id = id;
    var head = element('header', 'tool-category__head');
    var headText = element('div');
    headText.appendChild(element('h3', '', label));
    headText.appendChild(element('p', '', description));
    head.appendChild(headText);
    head.appendChild(element('span', 'tool-category__count', tools.length + ' 个'));
    article.appendChild(head);

    var list = element('ul', 'link-grid');
    tools.forEach(function (tool) {
      var item = element('li');
      var link = element('a');
      link.href = tool[1];
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.appendChild(element('strong', '', tool[0]));
      link.appendChild(element('span', '', tool[2]));
      item.appendChild(link);
      list.appendChild(item);
    });
    article.appendChild(list);
    directory.appendChild(article);
  });

  var categories = Array.prototype.slice.call(directory.querySelectorAll('.tool-category'));
  var allItems = Array.prototype.slice.call(directory.querySelectorAll('.link-grid li'));

  function normalize(value) {
    return String(value || '').trim().toLocaleLowerCase('zh-CN');
  }

  function update() {
    var query = normalize(input.value);
    var visible = 0;
    categories.forEach(function (category) {
      var items = Array.prototype.slice.call(category.querySelectorAll('.link-grid li'));
      var categoryVisible = 0;
      items.forEach(function (item) {
        var match = !query || normalize(item.textContent).indexOf(query) !== -1;
        item.hidden = !match;
        if (match) categoryVisible++;
      });
      category.hidden = categoryVisible === 0;
      visible += categoryVisible;
    });
    if (status) status.textContent = query
      ? '找到 ' + visible + ' 个匹配入口'
      : '共收录 ' + allItems.length + ' 个在线工具入口';
    if (empty) empty.hidden = visible !== 0;
  }

  input.addEventListener('input', update);
  Array.prototype.forEach.call(nav.querySelectorAll('a'), function (link) {
    link.addEventListener('click', function () {
      if (!input.value) return;
      input.value = '';
      update();
    });
  });
  update();
})();