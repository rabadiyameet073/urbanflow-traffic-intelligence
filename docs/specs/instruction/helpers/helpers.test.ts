/** Self-tests for the helper library. Run: `node --test` on the compiled output (see README). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalJson } from './canonical-json.js';
import { hashState, fnv1a64 } from './hash.js';
import { signHex, verifyHex, withinWindow } from './hmac.js';
import { fitTitle, jsonLdScript } from './meta-helpers.js';
import { detLn, expSample, mulberry32, randInt, splitRng } from './rng.js';
import { excludesZero, pairedBootstrapCi } from './stats.js';

test('mulberry32 is deterministic and in [0,1)', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test('splitRng streams are independent of other stream names', () => {
  const first = splitRng(7, 'arrivals');
  const seq1 = [first(), first(), first()];
  splitRng(7, 'newStream')(); // creating another stream must not affect 'arrivals'
  const again = splitRng(7, 'arrivals');
  assert.deepEqual([again(), again(), again()], seq1);
  assert.notDeepEqual([splitRng(7, 'behavior')()], [seq1[0]]);
});

test('detLn matches Math.log closely and rejects bad input', () => {
  for (const x of [1e-9, 0.001, 0.25, 0.5, 1, 1.5, 2, Math.E, 10, 1234.5678, 1e9]) {
    const got = detLn(x);
    const want = Math.log(x);
    assert.ok(Math.abs(got - want) <= 1e-13 * Math.max(1, Math.abs(want)), `x=${x} got=${got} want=${want}`);
  }
  assert.equal(detLn(1), 0);
  assert.throws(() => detLn(0), RangeError);
  assert.throws(() => detLn(-1), RangeError);
  assert.throws(() => detLn(Number.NaN), RangeError);
});

test('randInt and expSample behave', () => {
  const r = mulberry32(5);
  for (let i = 0; i < 500; i++) {
    const v = randInt(r, 3, 6);
    assert.ok(v >= 3 && v <= 6 && Number.isInteger(v));
  }
  const r2 = mulberry32(9);
  let sum = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) sum += expSample(r2, 0.5);
  assert.ok(Math.abs(sum / n - 2) < 0.1, `mean ${sum / n}`);
});

test('fnv1a64 known vectors', () => {
  assert.equal(fnv1a64(new Uint8Array([])), 'cbf29ce484222325');
  assert.equal(fnv1a64(new TextEncoder().encode('a')), 'af63dc4c8601ec8c');
  assert.equal(fnv1a64(new TextEncoder().encode('foobar')), '85944171f73967e8');
});

test('hashState covers all arrays in order', () => {
  const a = new Float32Array([1, 2, 3]);
  const b = new Int32Array([4, 5]);
  const h1 = hashState([a, b]);
  assert.equal(h1, hashState([a, b]));
  assert.notEqual(h1, hashState([b, a]));
  b[0] = 9;
  assert.notEqual(h1, hashState([a, b]));
});

test('canonicalJson sorts keys, normalises -0, rejects non-finite/undefined', () => {
  assert.equal(canonicalJson({ b: 1, a: [true, null, 'x'], c: { z: 1, y: 2 } }), '{"a":[true,null,"x"],"b":1,"c":{"y":2,"z":1}}');
  assert.equal(canonicalJson(-0), '0');
  assert.throws(() => canonicalJson(Number.POSITIVE_INFINITY), RangeError);
  assert.throws(() => canonicalJson({ a: undefined } as never), TypeError);
  assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }));
});

test('HMAC sign/verify, tamper, malformed, window', async () => {
  const msg = canonicalJson({ id: 'e1', lane: 'NB-TR', nonce: 'abcd1234' });
  const sig = await signHex('secret', msg);
  assert.match(sig, /^[0-9a-f]{64}$/);
  assert.equal(await verifyHex('secret', msg, sig), true);
  assert.equal(await verifyHex('other', msg, sig), false);
  assert.equal(await verifyHex('secret', msg + ' ', sig), false);
  assert.equal(await verifyHex('secret', msg, 'zz'), false);
  assert.equal(await verifyHex('secret', msg, sig.slice(2)), false);
  assert.equal(withinWindow(1000, 1500, 600), true);
  assert.equal(withinWindow(1000, 2000, 600), false);
  assert.equal(withinWindow(Number.NaN, 2000, 600), false);
});

test('pairedBootstrapCi is deterministic and sensible', () => {
  const diffs = Array.from({ length: 50 }, (_, i) => -5 + ((i * 7) % 5) * 0.4);
  const r1 = pairedBootstrapCi(diffs, 123, 2000);
  const r2 = pairedBootstrapCi(diffs, 123, 2000);
  assert.deepEqual(r1, r2);
  assert.ok(r1.lo <= r1.mean && r1.mean <= r1.hi);
  assert.equal(excludesZero(r1), true);
  const zeroish = pairedBootstrapCi([-1, 1, -1, 1, -1, 1, -1, 1], 5, 2000);
  assert.equal(excludesZero(zeroish), false);
  assert.throws(() => pairedBootstrapCi([], 1), RangeError);
});

test('fitTitle and jsonLdScript', () => {
  assert.equal(fitTitle('Short title'), 'Short title');
  const long = fitTitle('UrbanFlow AI — adaptive traffic signals with a Safety Kernel and safe emergency preemption', 60);
  assert.ok(long.length <= 60, long);
  assert.ok(long.endsWith('…'));
  const html = jsonLdScript({ name: '</script><b>&' });
  assert.ok(!html.slice(0, -9).includes('</script>'));
  assert.ok(html.includes('\\u003c/script\\u003e'));
  assert.equal(JSON.parse(html.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')).name, '</script><b>&');
});
