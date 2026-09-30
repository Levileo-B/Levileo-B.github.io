// RFC 6238 TOTP：原生 Web Crypto，无依赖、无网络或存储操作。
(function (root) {
  'use strict';
  var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  var HASHES = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' };

  function decodeBase32(raw) {
    var value = String(raw || '').replace(/[\s-]/g, '');
    if (/[^A-Za-z2-7=]/.test(value)) throw new Error('密钥格式不正确，请输入 Base32 字母 A–Z 和数字 2–7。');
    value = value.toUpperCase();
    if (!/^[A-Z2-7]+={0,6}$/.test(value)) throw new Error('密钥格式不正确，请输入 Base32 字母 A–Z 和数字 2–7。');
    var unpadded = value.replace(/=+$/, '');
    var remainder = unpadded.length % 8;
    if ([1, 3, 6].indexOf(remainder) !== -1 ||
        (value.indexOf('=') !== -1 && (value.length % 8 !== 0 || remainder === 0))) {
      throw new Error('Base32 密钥长度或补位不正确。');
    }
    var bytes = [], buffer = 0, bits = 0;
    for (var i = 0; i < unpadded.length; i++) {
      buffer = (buffer << 5) | ALPHABET.indexOf(unpadded[i]);
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >>> bits) & 255);
        buffer &= (1 << bits) - 1;
      }
    }
    if (buffer !== 0 || !bytes.length) throw new Error('Base32 密钥末尾补位不正确，请检查是否完整。');
    return new Uint8Array(bytes);
  }

  function parseInput(raw, options) {
    var value = String(raw || '').trim();
    if (!value) throw new Error('请先输入密钥或 otpauth 链接。');
    if (value.length > 4096) throw new Error('密钥或链接过长。');
    options = options || {};
    var config = { secret: value, algorithm: options.algorithm || 'SHA1',
      digits: options.digits == null ? 6 : options.digits,
      period: options.period == null ? 30 : options.period, label: '' };
    if (/^otpauth:/i.test(value)) {
      var uri;
      try { uri = new URL(value); } catch (e) { throw new Error('otpauth 链接格式不正确。'); }
      if (uri.hostname !== 'totp' || uri.username || uri.password || uri.port) {
        throw new Error('仅支持 otpauth://totp/ 链接，不支持 HOTP 计数器验证码。');
      }
      config.secret = uri.searchParams.get('secret') || '';
      if (!config.secret) throw new Error('otpauth 链接缺少 secret 密钥。');
      config.algorithm = uri.searchParams.get('algorithm') || 'SHA1';
      config.digits = uri.searchParams.has('digits') ? uri.searchParams.get('digits') : 6;
      config.period = uri.searchParams.has('period') ? uri.searchParams.get('period') : 30;
      try { config.label = decodeURIComponent(uri.pathname.replace(/^\//, '')); }
      catch (e) { throw new Error('otpauth 链接中的账号名称编码不正确。'); }
    }
    config.algorithm = String(config.algorithm).toUpperCase().replace(/-/g, '');
    if (!HASHES[config.algorithm]) throw new Error('仅支持 SHA-1、SHA-256 和 SHA-512 算法。');
    if (!/^[68]$/.test(String(config.digits))) throw new Error('验证码位数必须为 6 或 8。');
    if (!/^\d+$/.test(String(config.period)) || Number(config.period) < 1 || Number(config.period) > 3600) {
      throw new Error('更新周期必须为 1–3600 之间的整数秒。');
    }
    config.digits = Number(config.digits);
    config.period = Number(config.period);
    return config;
  }

  async function prepare(config) {
    if (!root.crypto || !root.crypto.subtle) throw new Error('当前环境不支持安全计算，请使用 HTTPS 网站或 localhost。');
    var bytes = decodeBase32(config.secret);
    try {
      var key = await root.crypto.subtle.importKey('raw', bytes,
        { name: 'HMAC', hash: HASHES[config.algorithm] }, false, ['sign']);
      return { key: key, algorithm: config.algorithm, digits: config.digits, period: config.period, label: config.label };
    } finally { bytes.fill(0); }
  }

  async function generate(session, timeMs) {
    var time = timeMs == null ? Date.now() : timeMs;
    if (!Number.isFinite(time) || time < 0) throw new Error('设备时间不正确。');
    var counter = Math.floor(time / 1000 / session.period);
    if (!Number.isSafeInteger(counter)) throw new Error('设备时间超出支持范围。');
    var message = new Uint8Array(8);
    for (var i = 7; i >= 0; i--) {
      message[i] = counter % 256;
      counter = Math.floor(counter / 256);
    }
    var mac = new Uint8Array(await root.crypto.subtle.sign('HMAC', session.key, message));
    var offset = mac[mac.length - 1] & 15;
    var binary = ((mac[offset] & 127) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
    return String(binary % Math.pow(10, session.digits)).padStart(session.digits, '0');
  }

  function remainingSeconds(timeMs, period) {
    return period - Math.floor(timeMs / 1000) % period;
  }

  var api = { decodeBase32: decodeBase32, parseInput: parseInput, prepare: prepare,
    generate: generate, remainingSeconds: remainingSeconds };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TOTP = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
