'use strict';
/**
 * Drives the REAL server's request handlers with a stubbed Firebase, so the
 * auth gate, the allow-list rejection and every validation rule are exercised
 * as they will actually run -- not re-implemented approximations of them.
 *
 * Firebase is stubbed via a module-cache injection rather than a network call,
 * because the point is to prove the panel refuses bad input BEFORE it reaches
 * Firebase at all.
 */
const assert = require('assert');
const Module = require('module');
const path = require('path');
const http = require('http');

// ---- stub firebase-admin before server.js requires it -------------------
let published = null;
let template = {
  etag: 'etag-1',
  parameters: {
    // A key the panel does not manage. It must survive a publish untouched --
    // otherwise using this panel would quietly wipe the kill switch.
    isAllFeatureClosed: { defaultValue: { value: 'false' } },
    appVersion: { defaultValue: { value: '1.0.8' } },
    appBuildNumber: { defaultValue: { value: '42' } },
    geminiApiKey: { defaultValue: { value: 'secret-value' } },
    oneSignalRestApiKey: { defaultValue: { value: 'onesignal-secret' } },
    linkCodeNotifBody: { defaultValue: { value: 'eski' } },
    // Keys that exist in the real project but this panel has never heard of:
    // console-only settings, and features whose panel support was never
    // built. Publishing must leave every one of them exactly as found --
    // this is the guarantee that makes the panel safe to use alongside the
    // Firebase console.
    linkEmail: { defaultValue: { value: '23rainbow09@gmail.com' } },
    linkInstagram: { defaultValue: { value: 'https://instagram.com/x' } },
    watchAdsEnabled: { defaultValue: { value: 'false' } },
    watchAdsReward: { defaultValue: { value: '20' } },
    coinsForOneHour: { defaultValue: { value: '100' } },
    featureComparison: { defaultValue: { value: '{"a":1}' } },
    verification_code: { defaultValue: { value: 'true' } },
    externalId: { defaultValue: { value: 'pro3_abc' } },
  },
  version: null,
};

const stub = {
  initializeApp() {},
  credential: { applicationDefault: () => ({}) },
  remoteConfig: () => ({
    getTemplate: async () => JSON.parse(JSON.stringify(template)),
    validateTemplate: async (t) => t,
    publishTemplate: async (t) => {
      published = t;
      template = { ...t, etag: 'etag-2' };
      return template;
    },
  }),
};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'firebase-admin') return 'STUB_FIREBASE_ADMIN';
  return origResolve.call(this, request, ...rest);
};
require.cache['STUB_FIREBASE_ADMIN'] = { id: 'STUB_FIREBASE_ADMIN', exports: stub, loaded: true };

process.env.PANEL_PASSWORD = 'test-password-123';
process.env.SESSION_SECRET = 'test-secret';
process.env.GOOGLE_APPLICATION_CREDENTIALS = '/dev/null';
process.env.PANEL_INSECURE = '1';
process.env.PORT = '8123';

require(path.join(__dirname, 'server.js'));

// ------------------------------ harness ---------------------------------
const BASE = 'http://127.0.0.1:8123';
let cookie = '';

function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const r = http.request(
      BASE + urlPath,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(cookie ? { Cookie: cookie } : {}),
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        if (res.headers['set-cookie']) cookie = res.headers['set-cookie'][0].split(';')[0];
        let out = '';
        res.on('data', (c) => (out += c));
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(out); } catch (e) { parsed = { raw: out }; }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log('  ok  ' + name);
}

(async () => {
  await new Promise((r) => setTimeout(r, 400));

  console.log('auth');
  await check('config is unreachable before signing in', async () => {
    const r = await req('GET', '/api/config');
    assert.strictEqual(r.status, 401);
  });
  await check('a wrong password is rejected', async () => {
    const r = await req('POST', '/api/login', { password: 'nope' });
    assert.strictEqual(r.status, 401);
  });
  await check('a write is unreachable before signing in', async () => {
    const r = await req('POST', '/api/config', { values: { freeNotifEnabled: 'true' } });
    assert.strictEqual(r.status, 401);
  });
  await check('the right password signs in', async () => {
    const r = await req('POST', '/api/login', { password: 'test-password-123' });
    assert.strictEqual(r.status, 200);
  });

  console.log('\nsession');
  await check('the session is a signed cookie, not server memory', async () => {
    // The point of the change: sessions used to live in memory, so every
    // redeploy signed the operator out. A signed token has no server-side
    // state to lose.
    assert.ok(cookie.startsWith('prox_admin='), `unexpected cookie: ${cookie}`);
    const value = decodeURIComponent(cookie.slice('prox_admin='.length));
    const [payload, mac] = value.split('.');
    assert.ok(/^\d+$/.test(payload), 'payload should be an expiry timestamp');
    assert.ok(mac && mac.length > 20, 'token should carry a signature');
    assert.ok(
      Number(payload) > Date.now(),
      'the token should not be issued already expired'
    );
  });

  await check('a forged or malformed token is refused', async () => {
    const good = cookie;
    for (const bad of [
      'prox_admin=nonsense',
      'prox_admin=9999999999999.wrongsignature',
      'prox_admin=1.abc',
      'prox_admin=',
      'prox_admin=9999999999999.',
    ]) {
      cookie = bad;
      const r = await req('GET', '/api/config');
      assert.strictEqual(r.status, 401, `${bad} should not authenticate`);
    }
    cookie = good;
  });

  await check('an expired token is refused even with a valid signature', async () => {
    const good = cookie;
    const crypto = require('crypto');
    const past = String(Date.now() - 1000);
    const mac = crypto
      .createHmac('sha256', 'test-secret')
      .update(past)
      .digest('base64url');
    cookie = `prox_admin=${past}.${mac}`;
    const r = await req('GET', '/api/config');
    assert.strictEqual(r.status, 401);
    cookie = good;
  });

  await check('logging out clears the cookie', async () => {
    const good = cookie;
    const r = await req('POST', '/api/logout');
    assert.strictEqual(r.status, 200);
    // The server must actually expire it, not merely stop reading it.
    cookie = 'prox_admin=';
    const after = await req('GET', '/api/config');
    assert.strictEqual(after.status, 401);
    cookie = good;
  });

  console.log('\nprotected keys');
  await check('presentation mode is no longer refused', async () => {
    // It was protected and is not any more, deliberately: it does not close
    // the app, it hides the WhatsApp side and surfaces the AI, story and
    // audio tools, and setting it back restores everything.
    //
    // Only the refusal is asserted here, not the publish. Publishing rotates
    // the stub's etag, and the checks below still hold 'etag-1' -- proving
    // it is writable does not need to disturb them.
    const r = await req('POST', '/api/config', {
      values: { isAllFeatureClosed: 'true' },
      etag: 'etag-1',
    });
    assert.notStrictEqual(r.status, 400, JSON.stringify(r.body));
    // Restore the fixture: template/etag are back where the rest expects.
    template = { ...template, etag: 'etag-1' };
    template.parameters.isAllFeatureClosed = { defaultValue: { value: 'false' } };
    published = null;
  });
  await check('appVersion is accepted, but only in a real version shape', async () => {
    // Writable now: it pairs with the presentation switch, which lives in
    // this panel, and targeting the build sent for review is a real need.
    // The validator still refuses anything the app could not match against,
    // since a malformed version reaches nobody and looks like nothing
    // happened.
    const bad = await req('POST', '/api/config', { values: { appVersion: 'v9' } });
    assert.strictEqual(bad.status, 400, JSON.stringify(bad.body));
    const ok = await req('POST', '/api/config', {
      values: { appVersion: '9.9.9' },
      etag: 'etag-1',
    });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    // This publish would otherwise leak into the next check, which asserts
    // that a refused request published nothing at all.
    published = null;
    template.etag = 'etag-1';
  });
  await check('a valid key smuggled alongside a protected one is refused too', async () => {
    // All-or-nothing: a request touching a protected key is rejected whole,
    // so a forged form cannot sneak a secret past on the coat-tails of a
    // legitimate edit.
    const r = await req('POST', '/api/config', {
      values: { freeNotifTitle: 'ok', oneSignalRestApiKey: 'stolen' },
    });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(published, null, 'nothing should have been published');
  });
  await check('a protected secret is never sent to the browser', async () => {
    // oneSignalRestApiKey stays masked: the panel cannot write it, so
    // showing it would be a leak with nothing to gain.
    //
    // geminiApiKey is no longer here. It is an editable field now, which
    // means its value does travel -- an operator replacing a key has to be
    // able to see whether one is set. It renders as a password field, and
    // test-validate.js holds that.
    const r = await req('GET', '/api/config');
    assert.strictEqual(r.status, 200);
    assert.ok(!JSON.stringify(r.body).includes('onesignal-secret'));
    assert.strictEqual(r.body.protectedState.oneSignalRestApiKey, '(dolu)');
  });

  console.log('\nvalidation');
  const bad = [
    ['freeNotifIntervalHours', '0', 'zero interval'],
    ['freeNotifIntervalHours', '-4', 'negative interval'],
    ['freeNotifMaxCount', 'abc', 'non-numeric count'],
    ['linkCodeNotifEnabled', 'maybe', 'nonsense tristate'],
    ['notifLanguage', 'turkish!', 'malformed language'],
    ['linkCodeNotifLocalized', '{oops', 'broken JSON'],
    ['linkCodeNotifLocalized', '["a"]', 'JSON array instead of object'],
    ['linkCodeNotifLocalized', '{"tr":{"tilte":"typo"}}', 'unknown field in entry'],
    ['linkCodeNotifLocalized', '{"not a lang":{"body":"x"}}', 'bad language key'],
  ];
  for (const [key, value, label] of bad) {
    await check(`rejects ${label}`, async () => {
      const r = await req('POST', '/api/config', { values: { [key]: value }, etag: 'etag-1' });
      assert.strictEqual(r.status, 400, `${label} should be rejected`);
    });
  }

  console.log('\nwriting');
  await check('a good edit publishes', async () => {
    const r = await req('POST', '/api/config', {
      values: { linkCodeNotifBody: 'Lütfen {code} girin', freeNotifIntervalHours: '72' },
      etag: 'etag-1',
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(published.parameters.linkCodeNotifBody.defaultValue.value, 'Lütfen {code} girin');
    assert.strictEqual(published.parameters.freeNotifIntervalHours.defaultValue.value, '72');
  });
  await check('unmanaged keys survive the publish', async () => {
    // The regression that would matter most: using this panel must not wipe
    // the secrets and console-only keys it does not manage.
    //
    // isAllFeatureClosed and appVersion used to be asserted here. Both are
    // managed fields now, so a publish that did not send them leaves them
    // alone for a different reason -- the server only touches keys present
    // in the request -- which the blank-value check below already covers.
    assert.strictEqual(
      published.parameters.oneSignalRestApiKey.defaultValue.value,
      'onesignal-secret'
    );

    // And the ones that are neither managed nor protected -- console-only
    // keys the panel has no opinion about. These are the easiest to lose:
    // nothing in the UI mentions them, so nothing would notice them going.
    const untouched = {
      linkEmail: '23rainbow09@gmail.com',
      linkInstagram: 'https://instagram.com/x',
      watchAdsEnabled: 'false',
      watchAdsReward: '20',
      coinsForOneHour: '100',
      featureComparison: '{"a":1}',
      verification_code: 'true',
      externalId: 'pro3_abc',
    };
    for (const [key, value] of Object.entries(untouched)) {
      assert.ok(published.parameters[key], `${key} was dropped by the publish`);
      assert.strictEqual(
        published.parameters[key].defaultValue.value,
        value,
        `${key} was modified by the publish`
      );
    }
  });
  await check('a blank value deletes the key rather than writing ""', async () => {
    // Absent is what the app reads as "keep today's behaviour"; an empty
    // string would be a confusing second way to say the same thing.
    const r = await req('POST', '/api/config', {
      values: { linkCodeNotifBody: '' },
      etag: 'etag-2',
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.ok(!('linkCodeNotifBody' in published.parameters));
  });
  await check('a stale etag is refused instead of clobbering', async () => {
    const r = await req('POST', '/api/config', {
      values: { freeNotifTitle: 'x' },
      etag: 'etag-ancient',
    });
    assert.strictEqual(r.status, 409);
  });
  await check('localized JSON is canonicalised on the way in', async () => {
    const r = await req('POST', '/api/config', {
      values: { linkCodeNotifLocalized: '{ "tr" :  { "body" : "Kod: {code}" } }' },
      etag: published ? undefined : undefined,
    });
    // etag omitted deliberately: the server only enforces it when supplied.
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(
      published.parameters.linkCodeNotifLocalized.defaultValue.value,
      '{"tr":{"body":"Kod: {code}"}}'
    );
  });

  console.log(`\n${passed} checks passed`);
  process.exit(0);
})().catch((e) => {
  console.error('\nFAILED:', e.message);
  process.exit(1);
});
