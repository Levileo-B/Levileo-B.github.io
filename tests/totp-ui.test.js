const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '../tools/2fa/app.js'), 'utf8');

function page() {
  let now = 29000, preparing = null, generating = null;
  const intervals = [], copied = [], elements = new Map();
  const defaults = { secret: '', algorithm: 'SHA1', digits: '6', period: '30' };
  function el(id) {
    if (!elements.has(id)) elements.set(id, { value: defaults[id] || '', type: id === 'secret' ? 'password' : 'text',
      textContent: '', disabled: false, hidden: true, attrs: {}, listeners: {}, classList: { toggle() {} },
      addEventListener(name, fn) { this.listeners[name] = fn; },
      setAttribute(name, value) { this.attrs[name] = value; }, removeAttribute(name) { delete this.attrs[name]; },
      focus() {} });
    return elements.get(id);
  }
  el('form').reset = () => Object.entries(defaults).forEach(([id, value]) => { el(id).value = value; });
  const document = { hidden: false, listeners: {}, getElementById: id => el(id.replace('totp-', '')),
    addEventListener(name, fn) { this.listeners[name] = fn; } };
  const window = { listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; },
    setInterval(fn) { intervals.push(fn); }, TOTP: {
      parseInput(secret) { return { secret }; },
      prepare() { return preparing || Promise.resolve({ algorithm: 'SHA1', digits: 6, period: 30, label: 'Test' }); },
      generate(session, time) { return generating || Promise.resolve(time < 30000 ? '111111' : '222222'); },
      remainingSeconds(time, period) { return period - Math.floor(time / 1000) % period; }
    } };
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(script, { window, document, Date: Clock,
    navigator: { clipboard: { async writeText(code) { copied.push(code); } } } });
  return { el, window, document, copied, time(ms) { now = ms; },
    preparing(value) { preparing = value; }, generating(value) { generating = value; },
    submit() { return el('form').listeners.submit({ preventDefault() {} }); },
    tick() { intervals[0](); },
    async settle() { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); } };
}

test('clearing during key import cannot restore a secret or display a stale code', async () => {
  const p = page(); let resolve;
  p.el('secret').value = 'TEST'; p.preparing(new Promise(done => { resolve = done; }));
  const task = p.submit(); p.el('clear').listeners.click();
  resolve({ algorithm: 'SHA1', digits: 6, period: 30 }); await task;
  assert.equal(p.el('secret').value, '');
  assert.equal(p.el('result').hidden, true);
  assert.equal(p.el('copy').disabled, true);
  assert.equal(p.el('generate').disabled, false);
  assert.equal(p.el('status').textContent, '密钥已清空。');
});

test('expired code becomes unavailable until replacement is computed', async () => {
  const p = page(); await p.submit(); assert.equal(p.el('code').textContent, '111111');
  let resolve; p.generating(new Promise(done => { resolve = done; }));
  p.time(30000); p.tick();
  assert.equal(p.el('copy').disabled, true);
  assert.equal(p.el('code').textContent, '…');
  assert.equal(p.el('remaining').textContent, 30);
  resolve('222222'); await p.settle();
  assert.equal(p.el('code').textContent, '222222');
  await p.el('copy').listeners.click(); assert.deepEqual(p.copied, ['222222']);
});

test('editing parameters and leaving the page invalidate previous results', async () => {
  const p = page(); await p.submit();
  p.el('digits').listeners.input();
  assert.equal(p.el('result').hidden, true);
  assert.equal(p.el('copy').disabled, true);
  await p.submit(); p.window.listeners.pagehide();
  assert.equal(p.el('result').hidden, true);
  assert.equal(p.el('secret').value, '');
  assert.equal(p.el('secret').type, 'password');
});

test('an obsolete computation cannot replace a newer session', async () => {
  const p = page(); let resolve;
  p.generating(new Promise(done => { resolve = done; }));
  const old = p.submit(); await p.settle();
  p.el('secret').listeners.input(); p.generating(null); p.time(30000);
  await p.submit(); resolve('111111'); await old;
  assert.equal(p.el('code').textContent, '222222');
  assert.equal(p.el('copy').disabled, false);
});
