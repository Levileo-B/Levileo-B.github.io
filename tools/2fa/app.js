(function () {
  'use strict';
  var T = window.TOTP;
  function el(id) { return document.getElementById('totp-' + id); }
  var form = el('form'), input = el('secret'), result = el('result');
  var session = null, revision = 0;

  function status(message, error) {
    el('status').textContent = message;
    el('status').classList.toggle('is-error', !!error);
  }

  function invalidate() {
    revision++;
    session = null;
    result.hidden = true;
    el('code').textContent = '------';
    el('copy').disabled = true;
    el('generate').disabled = false;
    input.removeAttribute('aria-invalid');
  }

  async function tick() {
    var current = session;
    if (!current) return;
    var now = Date.now(), step = Math.floor(now / 1000 / current.period);
    var remaining = T.remainingSeconds(now, current.period);
    el('remaining').textContent = remaining;
    el('progress').max = current.period;
    el('progress').value = remaining;
    if (current.step === step) return;
    el('copy').disabled = true;
    el('code').textContent = '…';
    if (current.busy) return;
    current.busy = true;
    try {
      var code = await T.generate(current, now);
      if (session !== current || Math.floor(Date.now() / 1000 / current.period) !== step) return;
      current.step = step;
      current.code = code;
      el('code').textContent = code;
      el('copy').disabled = false;
    } catch (e) {
      if (session === current) { invalidate(); status('验证码计算失败，请重新计算。', true); }
    } finally { current.busy = false; }
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    invalidate();
    var version = revision;
    el('generate').disabled = true;
    status('正在计算…');
    try {
      var config = T.parseInput(input.value, { algorithm: el('algorithm').value,
        digits: el('digits').value, period: el('period').value });
      var prepared = await T.prepare(config);
      if (version !== revision) return;
      el('algorithm').value = prepared.algorithm;
      el('digits').value = prepared.digits;
      el('period').value = prepared.period;
      session = prepared;
      el('account').textContent = prepared.label || '当前验证码';
      el('settings').textContent = prepared.algorithm.replace('SHA', 'SHA-') + ' · ' + prepared.digits + ' 位 · ' + prepared.period + ' 秒';
      result.hidden = false;
      status('验证码会自动更新；密钥仅用于本地计算。');
      await tick();
    } catch (e) {
      if (version !== revision) return;
      input.setAttribute('aria-invalid', 'true');
      status(e.message || '计算失败，请检查输入。', true);
    } finally { if (version === revision) el('generate').disabled = false; }
  });

  input.addEventListener('input', function () {
    invalidate();
    status('输入已修改，请重新计算。');
  });
  ['algorithm', 'digits', 'period'].forEach(function (id) {
    el(id).addEventListener('input', function () { invalidate(); status('参数已修改，请重新计算。'); });
  });
  el('reveal').addEventListener('click', function () {
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    el('reveal').textContent = show ? '隐藏' : '显示';
    el('reveal').setAttribute('aria-pressed', String(show));
  });
  function clear() {
    invalidate();
    form.reset();
    input.value = '';
    input.type = 'password';
    el('reveal').textContent = '显示';
    el('reveal').setAttribute('aria-pressed', 'false');
    el('account').textContent = '当前验证码';
    status('密钥已清空。');
  }
  el('clear').addEventListener('click', function () { clear(); input.focus(); });
  el('copy').addEventListener('click', async function () {
    var current = session;
    if (!current || current.step !== Math.floor(Date.now() / 1000 / current.period)) {
      await tick();
      status('验证码正在更新，请再次点击复制。');
      return;
    }
    try {
      await navigator.clipboard.writeText(current.code);
      if (session === current) status('验证码已复制。');
    } catch (e) { if (session === current) status('无法访问剪贴板，请选中验证码手动复制。', true); }
  });
  window.setInterval(function () { if (!document.hidden) tick(); }, 250);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  window.addEventListener('pagehide', clear);
})();
