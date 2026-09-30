const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '../assets/x-updates.js'), 'utf8');

function page({ api = true } = {}) {
  let now = 0, fail = false, pending = null, observer;
  const timers = new Map(), intervals = [], calls = [];
  let timerId = 0;
  function element() {
    return { textContent: '', disabled: false, checked: true, children: [], attrs: {}, listeners: {},
      addEventListener(name, handler) { this.listeners[name] = handler; },
      setAttribute(name, value) { this.attrs[name] = value; },
      getAttribute(name) { return this.attrs[name] || null; },
      appendChild(child) { child.parent = this; this.children.push(child); },
      replaceChildren(...children) { this.children = children; children.forEach(child => { child.parent = this; }); },
      remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
    };
  }
  const elements = Object.fromEntries(['x-timeline', 'x-refresh', 'x-auto', 'x-status'].map(id => [id, element()]));
  const document = { hidden: false, listeners: {}, head: element(), documentElement: element(),
    createElement: element, createTextNode: text => ({ textContent: text }),
    getElementById: id => elements[id], addEventListener(name, handler) { this.listeners[name] = handler; } };
  const media = { matches: false, addEventListener(name, handler) { this.handler = handler; } };
  const factory = { createTimeline(source, host, options) {
    calls.push({ source, options });
    if (pending) return pending;
    if (fail) return Promise.reject(new Error('network'));
    const frame = element(); host.appendChild(frame); return Promise.resolve(frame);
  } };
  const window = { listeners: {}, matchMedia: () => media,
    addEventListener(name, handler) { this.listeners[name] = handler; },
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval(fn) { intervals.push(fn); } };
  if (api) window.twttr = { widgets: factory };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  vm.runInNewContext(script, { window, document, Date: Clock,
    MutationObserver: class { constructor(handler) { observer = handler; } observe() {} } });
  return { elements, document, window, calls, timers,
    time(ms) { now = ms; }, fail(value) { fail = value; }, pending(value) { pending = value; },
    interval() { intervals[0](); }, theme(value) { document.documentElement.attrs['data-theme'] = value; observer(); },
    async settle() { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); } };
}

test('initial X timeline requests the target profile and exactly 5 posts', async () => {
  const p = page(); await p.settle();
  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0].source.screenName, 'thsottiaux');
  assert.equal(p.calls[0].options.tweetLimit, 5);
  assert.equal(p.calls[0].options.dnt, true);
  assert.equal(p.elements['x-timeline'].attrs['aria-busy'], 'false');
  assert.match(p.elements['x-status'].textContent, /已刷新.*前 5 条/);
});

test('polling pauses when disabled or hidden and refreshes overdue content on return', async () => {
  const p = page(); await p.settle();
  p.time(60000); p.interval(); await p.settle(); assert.equal(p.calls.length, 2);
  p.elements['x-auto'].checked = false;
  p.time(120000); p.interval(); await p.settle(); assert.equal(p.calls.length, 2);
  p.elements['x-auto'].checked = true; p.document.hidden = true;
  p.time(180000); p.interval(); await p.settle(); assert.equal(p.calls.length, 2);
  p.document.hidden = false; p.document.listeners.visibilitychange(); await p.settle();
  assert.equal(p.calls.length, 3);
  p.window.listeners.focus(); await p.settle(); assert.equal(p.calls.length, 3);
});

test('failed refresh retains rendered content and allows manual retry', async () => {
  const p = page(); await p.settle();
  const before = p.elements['x-timeline'].children[0];
  p.fail(true); await p.elements['x-refresh'].listeners.click();
  assert.equal(p.elements['x-timeline'].children[0], before);
  assert.match(p.elements['x-status'].textContent, /保留上次内容/);
  assert.equal(p.elements['x-refresh'].disabled, false);
  p.fail(false); await p.elements['x-refresh'].listeners.click();
  assert.match(p.elements['x-status'].textContent, /已刷新/);
});

test('blocked widget script provides a fallback, releases loading and retries script loading', async () => {
  const p = page({ api: false });
  const first = p.document.head.children[0]; first.onerror(); await p.settle();
  assert.match(p.elements['x-status'].textContent, /加载失败/);
  assert.equal(p.elements['x-timeline'].children[0].children[1].href, 'https://x.com/thsottiaux');
  p.elements['x-refresh'].listeners.click();
  assert.notEqual(p.document.head.children[0], first);
  p.document.head.children[0].onerror(); await p.settle();
});

test('theme changes rebuild the widget even with automatic refresh disabled', async () => {
  const p = page(); await p.settle(); p.elements['x-auto'].checked = false;
  p.theme('dark'); await p.settle();
  assert.equal(p.calls[1].options.theme, 'dark');
  p.theme('dark'); await p.settle(); assert.equal(p.calls.length, 2);
});

test('pending requests never overlap and timeouts preserve the previous timeline', async () => {
  const p = page(); await p.settle(); const before = p.elements['x-timeline'].children[0];
  p.pending(new Promise(() => {})); p.elements['x-refresh'].listeners.click(); await p.settle();
  p.time(60000); p.interval(); await p.settle(); assert.equal(p.calls.length, 2);
  for (const timer of p.timers.values()) timer(); await p.settle();
  assert.equal(p.elements['x-timeline'].children[0], before);
  assert.equal(p.elements['x-refresh'].disabled, false);
  assert.equal(p.elements['x-timeline'].attrs['aria-busy'], 'false');
});
