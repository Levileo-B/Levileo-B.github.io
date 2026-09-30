const assert = require('node:assert/strict');
const test = require('node:test');
const { webcrypto, createHmac } = require('node:crypto');
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const T = require('../tools/2fa/totp.js');

function base32(text) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let buffer = 0, bits = 0, result = '';
  for (const byte of Buffer.from(text)) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) { bits -= 5; result += alphabet[(buffer >>> bits) & 31]; }
    buffer &= (1 << bits) - 1;
  }
  if (bits) result += alphabet[(buffer << (5 - bits)) & 31];
  return result;
}

// RFC 6238 Appendix B, including counters beyond 32-bit Unix timestamps.
const vectors = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826']
];
['SHA1', 'SHA256', 'SHA512'].forEach((algorithm, column) => {
  test('RFC 6238 vectors: ' + algorithm, async () => {
    const length = [20, 32, 64][column];
    const secret = '1234567890'.repeat(7).slice(0, length);
    const session = await T.prepare(T.parseInput(base32(secret), { algorithm, digits: 8 }));
    assert.equal(session.key.extractable, false);
    assert.equal(session.secret, undefined);
    for (const row of vectors) assert.equal(await T.generate(session, row[0] * 1000), row[column + 1]);
  });
});

test('Base32 decodes grouping, case and valid padding; rejects corrupt input', () => {
  assert.equal(Buffer.from(T.decodeBase32('mzxw-6y tb oi======')).toString(), 'foobar');
  for (const raw of ['', 'A', 'AAA', 'AAAAAA', 'A0', 'AB', 'MY=', 'MY========', 'M=Y', 'ß', '<script>']) {
    assert.throws(() => T.decodeBase32(raw), /密钥|Base32/);
  }
});

test('URI parameters and defaults override manual options and preserve account labels', () => {
  const uri = 'otpauth://totp/Example%3Aalice%40example.com?secret=MY&algorithm=SHA256&digits=8&period=60';
  assert.deepEqual(T.parseInput(uri), { secret: 'MY', algorithm: 'SHA256', digits: 8, period: 60, label: 'Example:alice@example.com' });
  const defaults = T.parseInput('otpauth://totp/Test?secret=MY', { algorithm: 'SHA512', digits: 8, period: 60 });
  assert.equal(defaults.algorithm, 'SHA1');
  assert.equal(defaults.digits, 6);
  assert.equal(defaults.period, 30);
});

test('unsupported URI types and invalid parameters fail explicitly', () => {
  for (const raw of ['otpauth://hotp/Test?secret=MY', 'otpauth://totp/Test',
    'otpauth://totp/Test?secret=MY&algorithm=MD5', 'otpauth://totp/Test?secret=MY&digits=7',
    'otpauth://totp/Test?secret=MY&period=0', 'otpauth://totp/Test?secret=MY&period=',
    'otpauth://totp/Test?secret=MY&period=30.5', 'otpauth://totp/%XX?secret=MY']) {
    assert.throws(() => T.parseInput(raw));
  }
  for (const period of [0, -1, 1.5, 3601, NaN]) assert.throws(() => T.parseInput('MY', { period }));
});

test('6-digit codes, custom periods, time boundaries and leading zeros', async () => {
  const secret = '12345678901234567890';
  const session = await T.prepare(T.parseInput(base32(secret), { period: 60 }));
  for (const ms of [0, 59999, 60000, 119999, 120000]) {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(ms / 60000)));
    const mac = createHmac('sha1', secret).update(counter).digest();
    const expected = String((mac.readUInt32BE(mac[19] & 15) & 0x7fffffff) % 1000000).padStart(6, '0');
    assert.equal(await T.generate(session, ms), expected);
  }
  assert.equal(T.remainingSeconds(59999, 60), 1);
  assert.equal(T.remainingSeconds(60000, 60), 60);
  await assert.rejects(T.generate(session, -1), /时间/);
});
