const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../assets/news-rankings.js'), 'utf8');
const now = Date.parse('2026-09-16T12:00:00Z');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}

function payload() {
  const item = { title: 'An AI article', link: 'https://example.com/ai',
    categories: ['AI'], sources: ['Source A'], date: '2026-09-15T12:00:00Z',
    source_count: 1, observed_days: 2, date_is_observed: false };
  const board = { start: '2026-09-14T00:00:00+08:00', end: '2026-09-16T12:00:00Z',
    total: 1, items: [item], by_category: { AI: [item], 科技: [] } };
  return { updated: '2026-09-16T11:00:00Z', week: board,
    month: { ...board, start: '2026-09-01T00:00:00+08:00' } };
}

async function page(fetch) {
  // 仅模拟页面容器与事件；实际布局、原生下拉框交互另在浏览器验证。
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', value: '',
      disabled: false, attributes: {}, listeners: {}, classList: { toggle() {} },
      setAttribute(key, value) { this.attributes[key] = value; },
      addEventListener(name, handler) { this.listeners[name] = handler; },
      querySelector() { return element('retry'); } });
    return elements.get(id);
  }
  vm.runInNewContext(script, { document: { getElementById: element }, fetch,
    Date: FixedDate, URL, AbortController, setTimeout, clearTimeout });
  async function settled() {
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(resolve => setImmediate(resolve));
      if (element('news-rankings').attributes['aria-busy'] === 'false') return;
    }
    throw new Error('Ranking render did not finish');
  }
  await settled();
  return { element, settled };
}

function response(data) { return { ok: true, json: async () => data }; }

test('both boards load, expose source metadata and filter independently of daily news', async () => {
  const { element } = await page(async () => response(payload()));
  assert.match(element('week-ranking-body').innerHTML, /An AI article/);
  assert.match(element('month-ranking-body').innerHTML, /收录 2 天/);
  assert.equal(element('ranking-category').disabled, false);
  element('ranking-category').value = '科技';
  element('ranking-category').listeners.change();
  assert.match(element('week-ranking-body').innerHTML, /本期该分类暂无/);
  assert.match(element('month-ranking-body').innerHTML, /本期该分类暂无/);
  element('ranking-category').value = 'AI';
  element('ranking-category').listeners.change();
  assert.match(element('week-ranking-body').innerHTML, /An AI article/);
  assert.match(element('ranking-status').textContent, /当前分类：AI/);
  assert.equal(element('news-body').innerHTML, '');
});

test('network failure releases loading state and retry recovers', async () => {
  let attempts = 0;
  const { element, settled } = await page(async () => {
    if (++attempts === 1) throw new Error('Network unavailable');
    return response(payload());
  });
  assert.equal(element('ranking-category').disabled, true);
  assert.match(element('ranking-status').innerHTML, /重试/);
  element('retry').listeners.click();
  await settled();
  assert.equal(attempts, 2);
  assert.match(element('week-ranking-body').innerHTML, /An AI article/);
});

test('previous-week data is hidden while current-month data stays usable', async () => {
  const data = payload();
  data.week.start = '2026-09-07T00:00:00+08:00';
  data.updated = '2026-09-10T11:00:00Z';
  const { element } = await page(async () => response(data));
  assert.match(element('week-ranking-body').innerHTML, /新一期榜单正在积累/);
  assert.doesNotMatch(element('week-ranking-body').innerHTML, /An AI article/);
  assert.match(element('month-ranking-body').innerHTML, /An AI article/);
  assert.match(element('ranking-status').textContent, /数据更新有延迟/);
});

test('untrusted titles are escaped and non-web links are excluded', async () => {
  const data = payload();
  data.week.items[0].title = '<img src=x onerror=alert(1)>';
  data.week.items.push({ ...data.week.items[0], title: 'Unsafe', link: 'javascript:alert(1)' });
  const { element } = await page(async () => response(data));
  const html = element('week-ranking-body').innerHTML;
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img|javascript:|Unsafe/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('empty and invalid responses produce clear, non-loading states', async () => {
  const data = payload();
  data.week.items = [];
  const empty = await page(async () => response(data));
  assert.match(empty.element('week-ranking-body').innerHTML, /本期暂无已收录新闻/);
  const invalid = await page(async () => response({}));
  assert.match(invalid.element('ranking-status').innerHTML, /暂时无法加载/);
  assert.equal(invalid.element('news-rankings').attributes['aria-busy'], 'false');
});
