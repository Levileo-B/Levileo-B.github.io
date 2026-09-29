const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../assets/research-data.js');
const catalog = require('../data/research-catalog.json');
const now = Date.parse('2026-09-28T00:00:00Z');
const call = { title: 'SLAM', url: 'https://example.com/cfp', topics: ['navigation'], status: 'open', deadline: '2026-09-30', verified_on: '2026-09-28' };

test('CFP expires after its date, stays open on deadline day, and uses UTC+8', () => {
  assert.equal(D.today(Date.parse('2026-09-30T16:00:00Z')), '2026-10-01');
  assert.equal(D.cfpState(call, '2026-09-28').days, 2);
  assert.equal(D.cfpState(call, '2026-09-30').label, '今日截止');
  assert.equal(D.cfpState(call, '2026-10-01').key, 'closed');
});
test('unknown, stale, invalid and explicitly closed CFPs never appear as open', () => {
  for (const change of [{ verified_on: '2026-08-01' }, { verified_on: '2026-09-29' }, { verified_on: '' }, { deadline: '2026-02-30' }, { status: 'unknown' }, { status: 'closed' }]) {
    assert.notEqual(D.cfpState({ ...call, ...change }, '2026-09-28').key, 'open');
  }
  assert.equal(D.cfpState({ ...call, verified_on: '2026-08-29' }, '2026-09-28').key, 'open');
});
test('CFP filtering respects topic, urgency and status, with nearest deadline first', () => {
  const later = { ...call, deadline: '2026-12-01' };
  const closed = { ...call, status: 'closed' };
  assert.deepEqual(D.filterCalls([later, closed, call], { today: '2026-09-28', topic: 'navigation', status: 'soon' }), [call]);
  assert.deepEqual(D.filterCalls([later, closed, call], { today: '2026-09-28', topic: 'all', status: 'open' }), [call, later]);
});
test('publisher-verified paper wins DOI deduplication and unsafe records are excluded', () => {
  const paper = catalog.papers[0];
  const merged = D.mergePapers({ journals: catalog.journals, papers: [paper] }, [
    { ...paper, id: paper.id.toUpperCase(), title: 'automatic' },
    { ...paper, id: 'bad', url: 'javascript:alert(1)' },
    { ...paper, id: 'other', journal_id: 'unknown' },
    { ...paper, id: 'invalid', published: '2026-02-30' }
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].title_zh, paper.title_zh);
  assert.equal(D.safeURL('https://user:secret@example.com'), '');
});
test('paper filters combine search, topic, time and followed journal; future papers stay hidden', () => {
  const opts = { today: '2026-09-28', days: 30, topic: 'point-cloud', query: '  SDA-Reg ', followedOnly: true, followed: ['scientific-reports'], journalNames: {} };
  const papers = D.mergePapers(catalog, []);
  assert.equal(D.filterPapers(papers, opts).length, 1);
  assert.equal(D.filterPapers(papers, { ...opts, followed: [] }).length, 0);
  assert.equal(D.filterPapers([{ ...catalog.papers[0], published: '2026-10-01' }], { ...opts, followedOnly: false, query: '' }).length, 0);
  assert.equal(D.paperDay('2026-09'), D.day('2026-09-01'));
});
test('initial curated content covers all directions and all CFPs have official sources', () => {
  const date = catalog.verified_on;
  for (const topic of Object.keys(D.topics)) {
    assert.ok(catalog.papers.some(p => p.topics.includes(topic)));
    assert.ok(catalog.calls.some(c => c.topics.includes(topic) && D.cfpState(c, date).key === 'open'));
  }
  for (const c of catalog.calls) {
    assert.ok(['www.mdpi.com', 'www.frontiersin.org', 'www.nature.com'].includes(new URL(c.url).hostname));
    assert.ok(D.day(c.deadline) >= D.day(c.verified_on));
  }
});

// Small DOM harness exercises actual loading/error paths without a browser dependency.
async function page(fetch, storage) {
  const nodes = {};
  function node(id) {
    return nodes[id] ||= { value: id === 'research-period' ? '180' : id === 'cfp-topic' ? 'all' : id === 'cfp-status' ? 'open' : '',
      checked: false, hidden: false, textContent: '', innerHTML: '', children: [], events: {},
      classList: { toggle() {} }, setAttribute() {}, querySelectorAll() { return []; },
      addEventListener(event, fn) { this.events[event] = fn; }, appendChild(child) { this.children.push(child); } };
  }
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const api = { ...D, today: () => '2026-09-28' };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/research.js'), 'utf8'), {
    window: { ResearchData: api }, document: { getElementById: node, createElement: () => node('button') },
    localStorage: storage || { getItem: () => '[]', setItem() {} }, Date: FixedDate, fetch, AbortController, setTimeout, clearTimeout, setInterval() {}
  });
  await new Promise(resolve => setImmediate(resolve));
  return nodes;
}
const response = value => ({ ok: true, json: async () => value });
test('failed automatic feed falls back to verified papers, retains CFPs and exposes retry', async () => {
  const nodes = await page(async url => { if (url.includes('catalog')) return response(catalog); throw new Error('offline'); });
  assert.match(nodes['research-papers'].innerHTML, /师生式点云/);
  assert.match(nodes['research-cfps'].innerHTML, /移动机器人定位前沿/);
  assert.equal(nodes['research-feed-status'].children[0].textContent, '重新加载');
});
test('catalog failure clears loading messages and offers retry', async () => {
  const nodes = await page(async () => { throw new Error('offline'); });
  assert.match(nodes['research-feed-status'].textContent, /暂时无法加载/);
  assert.match(nodes['cfp-result-count'].textContent, /暂时不可用/);
  assert.ok(nodes['research-feed-status'].children[0].events.click);
});
test('blocked storage and hostile titles cannot break or inject into the page', async () => {
  const fixture = { ...catalog, papers: [{ ...catalog.papers[0], title_zh: '<img src=x onerror=alert(1)>' }] };
  const nodes = await page(async url => response(url.includes('catalog') ? fixture : { schema_version: 1, updated: '2026-09-28T00:00:00Z', papers: [] }),
    { getItem() { throw new Error('blocked'); } });
  assert.match(nodes['research-papers'].innerHTML, /&lt;img/);
  assert.doesNotMatch(nodes['research-papers'].innerHTML, /<img/);
  assert.match(nodes['journal-storage-status'].textContent, /无法读取/);
});
