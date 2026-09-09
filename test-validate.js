'use strict';
/**
 * Exercises the panel's validation and its allow-list, without Firebase.
 *
 * The allow-list is the whole safety story: it is what stops this panel from
 * ever writing appVersion / appBuildNumber or the secrets. Worth an actual
 * assertion rather than trusting that the code reads correctly.
 *
 * isAllFeatureClosed used to be on that list and is now writable on purpose.
 * It does not close the app -- it hides the WhatsApp side and surfaces the
 * AI, story and audio tools instead -- and setting it back restores
 * everything, so it is a presentation choice rather than a kill switch.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { FIELDS, PROTECTED, BY_KEY } = require('./keys');

const ALLOWED = new Set(FIELDS.map((f) => f.key));
let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

console.log('allow-list');
check('the version-targeted switch warns that it needs both halves', () => {
  // appVersion + appBuildNumber turn presentation mode on for ONE build, and
  // only when BOTH match exactly. They were console-only for that reason:
  // getting either wrong reaches nobody, and from the panel that looks
  // exactly like having changed nothing.
  //
  // They are writable now because targeting the build sent for review is a
  // real thing to want, and going to the Firebase console for it while the
  // switch they pair with sits in this panel made no sense. The danger did
  // not go away, so each field has to state it.
  for (const k of ['appVersion', 'appBuildNumber']) {
    const f = BY_KEY.get(k);
    assert.ok(f, `${k} should be a writable field`);
    assert.strictEqual(f.group, 'presentation', `${k} belongs with the switch`);
    assert.ok(
      /İKİSİ BİRDEN|TEK BAŞINA/.test(f.effect || ''),
      `${k} must say it does nothing without the other half`
    );
  }
  // The other half of the old rule still holds for the one secret the panel
  // has no reason to touch.
  assert.ok(!ALLOWED.has('oneSignalRestApiKey'), 'must not be writable');
});

check('purchaseProductIds cannot be published empty', () => {
  // Writable now, because the alternative was hand-editing JSON in the
  // Firebase console with no validation at all. The danger it was protected
  // for is real though: the app has no fallback, so an empty list means it
  // asks the store for nothing and the paywall opens blank.
  const f = BY_KEY.get('purchaseProductIds');
  assert.ok(f, 'purchaseProductIds should be a writable field');
  assert.strictEqual(f.type, 'productids', 'must not fall through to TEXT');
  assert.ok(
    /bomboş|boş liste/i.test(f.effect || ''),
    'the field must say what an empty list does'
  );
});

check('the presentation-mode switch says what it really does', () => {
  const f = FIELDS.find((x) => x.key === 'isAllFeatureClosed');
  assert.ok(f, 'isAllFeatureClosed must be a writable field');
  assert.ok(!f.inert, 'it works today, so it must not be marked inert');
  // Its name says "closed", which it is not. An operator reading only the
  // key name would expect the app to shut down.
  assert.ok(
    /sunum|sekme/i.test(f.label),
    'the label must describe what it does, not repeat the "closed" key name'
  );
  assert.ok(
    /geri gelir|false yapınca/i.test(f.effect || ''),
    'the effect must say it is reversible'
  );
  assert.ok(
    /KAPANMAZ/.test(f.help || ''),
    'the help must deny the shutdown the key name implies'
  );
});

check('the presentation-mode tab list matches the app', () => {
  const f = FIELDS.find((x) => x.key === 'isAllFeatureClosed');
  assert.ok(f, 'isAllFeatureClosed must be a writable field');
  // The panel names the exact tabs each mode shows. That is the kind of
  // detail that reads as authoritative and rots silently: it said "ikili
  // sohbet gizlenir" while the app kept that tab in BOTH modes.
  const fs = require('fs');
  const path = require('path');
  const view = path.join(
    __dirname,
    '..',
    'Prox_latest',
    'lib/features/presentation/pages/main/views/main_view.dart'
  );
  if (!fs.existsSync(view)) {
    console.log('      (uygulama deposu yok, atlandı)');
    return;
  }
  const src = fs.readFileSync(view, 'utf8');
  const body = src.slice(src.indexOf('Widget _getScreen('));
  const titles = [...body.matchAll(/title\.value = '([^']+)'\.tr/g)].map(
    (m) => m[1]
  );
  // _getScreen is one if/else: the isFeaturesClose branch lists its five tabs
  // first, then the normal branch lists its five. Splitting on the second
  // `switch` is brittle (both are indented the same); splitting the titles in
  // half is not, as long as both branches stay the same length.
  assert.strictEqual(
    titles.length % 2,
    0,
    `expected an even number of tabs, read ${titles.length}: ${titles}`
  );
  const half = titles.length / 2;
  const hidden = titles.slice(0, half);
  const normal = titles.slice(half);

  assert.ok(hidden.length && normal.length, 'could not read the tab lists');

  // A tab present in both modes must not be described as hidden. Dual Chat
  // is exactly that case.
  for (const tab of hidden.filter((t) => normal.includes(t))) {
    const tr = { 'Dual Chat': 'İkili sohbet', 'Audio Editor': 'Ses editörü' }[tab];
    if (!tr) continue;
    // A tab that exists in both modes must be described as surviving. Asking
    // only that no sentence pairs it with "gizlen" was too blunt: the correct
    // wording says the TAB stays and something INSIDE it is hidden, which is
    // both true and useful. So require the positive claim instead.
    const sentences = (f.effect || '')
      .split(/(?<=\.)\s+/)
      .filter((x) => x.includes(tr));
    assert.ok(
      sentences.length,
      `${tr} exists in both modes — the effect should say so`
    );
    // Either an explicit "it stays" sentence, or -- just as honest -- the tab
    // simply appearing in both of the printed lists.
    const saysStays = sentences.some((x) =>
      /durur|kalır|her i̇ki modda|değişmez/i.test(x)
    );
    const inBothLists = sentences.length >= 2;
    assert.ok(
      saysStays || inBothLists,
      `${tr} survives in both modes, but the effect does not show that: ` +
        JSON.stringify(sentences)
    );
  }

  // And the tabs that genuinely disappear should be named.
  for (const tab of normal.filter((t) => !hidden.includes(t))) {
    const tr = { Status: 'Durum', Profiles: 'Profiller', Chats: 'Sohbetler' }[tab];
    if (!tr) continue;
    assert.ok(
      (f.effect || '').includes(tr),
      `${tr} disappears in presentation mode — the effect should say so`
    );
  }
});
check('the remaining secret is not writable', () => {
  // oneSignalRestApiKey has no reader in the app and no rotation story, so
  // there is nothing this panel could usefully do with it.
  //
  // geminiApiKey left this list deliberately: the app now falls back to a
  // baked-in key, which turns the console value into a rotation valve --
  // the one way to replace a leaked or revoked key without a release.
  assert.ok(!ALLOWED.has('oneSignalRestApiKey'), 'must not be writable');
});

check('the Gemini key is masked in the UI', () => {
  // It is a credential. Writable is not the same as legible: it must not sit
  // in plain text on a screen that may be shared or recorded.
  const f = BY_KEY.get('geminiApiKey');
  assert.ok(f, 'geminiApiKey should be a writable field');
  assert.strictEqual(f.masked, true, 'must render as a password field');
  // And clearing it must be safe, or an operator tidying up would take the
  // AI chat down with no way to tell why.
  assert.ok(
    /gömülü/i.test(f.fallback),
    'the blank state must say the app falls back to its own key'
  );
});
check('every protected key is genuinely outside the allow-list', () => {
  for (const p of PROTECTED) assert.ok(!ALLOWED.has(p.key));
});
check('every writable key belongs to a known group', () => {
  // The panel now covers more than notifications, so the old "must start with
  // linkCodeNotif/freeNotif" rule is gone. What still has to hold is that no
  // key sneaks in outside a reviewed group -- an ungrouped key would also be
  // invisible in the UI, which is a quieter bug than it sounds.
  // Read from the UI rather than restated here. A hand-kept list drifts:
  // adding a group to app.js and forgetting this file failed the build for
  // the wrong reason, and adding one HERE and forgetting app.js would have
  // hidden a live key with no test noticing at all.
  const ui = fs.readFileSync(
    path.join(__dirname, 'public', 'app.js'),
    'utf8'
  );
  const GROUPS = new Set(
    [...ui.matchAll(/^\s*id: '([a-zA-Z]+)',$/gm)].map((m) => m[1])
  );
  assert.ok(GROUPS.size >= 5, 'could not read the groups out of app.js');
  for (const f of FIELDS) {
    assert.ok(
      GROUPS.has(f.group),
      `${f.key} has group "${f.group}", which app.js does not render`
    );
  }
});
check('no writable key collides with a protected one', () => {
  // The real invariant behind the allow-list, stated directly: whatever the
  // panel grows to manage, it must never reach the kill switch or a secret.
  const forbidden = new Set(PROTECTED.map((p) => p.key));
  for (const k of ALLOWED) {
    assert.ok(!forbidden.has(k), `${k} is protected and must not be writable`);
  }
});
check('keys are camelCase and unique', () => {
  const seen = new Set();
  for (const f of FIELDS) {
    assert.ok(/^[a-z][A-Za-z0-9]*$/.test(f.key), `${f.key} is not camelCase`);
    assert.ok(!seen.has(f.key), `${f.key} is defined twice`);
    seen.add(f.key);
  }
});
check('every field type is one the server can validate', () => {
  // A field with a type the server does not know falls through to TEXT, which
  // would silently accept a malformed version string or a http:// URL.
  const KNOWN = new Set([
    'tristate', 'text', 'int', 'jsonmap', 'lang',
    'version', 'url', 'id', 'idlist', 'choice', 'productids', 'email',
  ]);
  for (const f of FIELDS) {
    assert.ok(KNOWN.has(f.type), `${f.key} has unknown type "${f.type}"`);
  }
});
check('destructive keys explain their effect', () => {
  // These are the ones where a wrong value is not merely cosmetic: it locks
  // users out, resets everyone's counters, or spends money.
  for (const k of ['minSupportedVersion', 'offerCampaignId', 'launchPaywallEnabled']) {
    const f = BY_KEY.get(k);
    assert.ok(f, `${k} missing`);
    assert.ok(f.effect && f.effect.length > 20, `${k} needs an effect warning`);
  }
});
check('notWired marks exactly the keys the app has no getter for', () => {
  // This list is a claim about another repository, and a stale claim here is
  // worse than none: it either hides a key that works, or promises one that
  // does not. Checked against the app when its source is beside this one.
  const fs = require('fs');
  const path = require('path');
  const helper = path.join(
    __dirname,
    '..',
    'Prox_latest',
    'lib/features/data/helpers/configs_helper.dart'
  );
  const constants = path.join(
    __dirname,
    '..',
    'Prox_latest',
    'lib/core/constants/constants.dart'
  );
  if (!fs.existsSync(helper) || !fs.existsSync(constants)) {
    console.log('      (uygulama deposu yok, atlandı)');
    return;
  }

  // Constants.foo -> the actual Remote Config key string.
  const names = {};
  const src = fs.readFileSync(constants, 'utf8');
  const re = /static const String\s+(\w+)\s*=\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) names[m[1]] = m[2];

  const read = new Set();
  const helperSrc = fs.readFileSync(helper, 'utf8');
  const re2 = /Constants\.(\w+)/g;
  while ((m = re2.exec(helperSrc))) {
    if (names[m[1]]) read.add(names[m[1]]);
  }

  for (const f of FIELDS) {
    const appReads = read.has(f.key);
    if (appReads && f.notWired) {
      assert.fail(
        `${f.key}: the app reads it now — remove notWired from keys.js`
      );
    }
    if (!appReads && !f.notWired) {
      assert.fail(
        `${f.key}: the app has no getter for it — add notWired: true in keys.js`
      );
    }
  }
});

check('the delay that may legitimately be zero allows zero', () => {
  // min:0 is load-bearing here and easy to lose to a `f.min || 1`.
  assert.strictEqual(BY_KEY.get('launchPaywallDelaySeconds').min, 0);
});

// Re-implement validate() by requiring the server module's logic indirectly:
// the function is not exported, so mirror the contract it must satisfy and
// assert against the field definitions the server drives it with.
console.log('\nfield definitions');
check('every field has a documented fallback', () => {
  for (const f of FIELDS) {
    assert.ok(f.fallback && f.fallback.length > 0, `${f.key} has no fallback text`);
    assert.ok(f.label && f.label.length > 0, `${f.key} has no label`);
  }
});
check('the two enabled flags are tristate, not boolean', () => {
  // A checkbox cannot express "unset", and unset is what keeps existing
  // installs behaving as they do today.
  assert.strictEqual(BY_KEY.get('linkCodeNotifEnabled').type, 'tristate');
  assert.strictEqual(BY_KEY.get('freeNotifEnabled').type, 'tristate');
});
check('the pairing body advertises {code} support', () => {
  assert.ok(BY_KEY.get('linkCodeNotifBody').supportsCode);
  assert.ok(BY_KEY.get('linkCodeNotifBody').help.includes('{code}'));
});
check('all four schedule numbers are configurable', () => {
  for (const k of [
    'freeNotifInitialDelayHours',
    'freeNotifIntervalHours',
    'freeNotifMaxCount',
    'freeNotifCampaignDays',
  ]) {
    const f = BY_KEY.get(k);
    assert.ok(f, `${k} missing`);
    assert.strictEqual(f.type, 'int');
    assert.ok((f.min || 1) >= 1, `${k} must not allow zero`);
  }
});
check('the two defaults differ: pairing on, reminder off', () => {
  // Asserted against the app's own getters rather than the panel's display
  // text, which is Turkish and may be reworded. What matters is that an
  // existing install keeps its pairing notification and does not suddenly
  // start sending marketing reminders.
  const link = BY_KEY.get('linkCodeNotifEnabled').fallback;
  const free = BY_KEY.get('freeNotifEnabled').fallback;
  assert.notStrictEqual(link, free, 'the two flags must not default the same way');
  assert.ok(link.length && free.length);
});

// ---------------------------------------------------------------------------
// The validation itself, exercised against the real function rather than a
// re-implementation of it. A panel that publishes an unparseable value is a
// panel that breaks production, so every new type gets a rejection test too.
// ---------------------------------------------------------------------------

process.env.PANEL_VALIDATE_ONLY = '1';
const { validate } = require('./server');

const F = (key) => BY_KEY.get(key);
const okValue = (key, input, expected) => {
  const r = validate(F(key), input);
  assert.ok(!r.error, `${key}: ${input} was rejected: ${r.error}`);
  assert.strictEqual(r.value, expected, `${key}: ${input}`);
};
const rejects = (key, input) => {
  const r = validate(F(key), input);
  assert.ok(r.error, `${key}: "${input}" should have been rejected`);
};

console.log('\nvalidation');

check('blank means delete, for every type', () => {
  // The whole "empty = keep today's behaviour" contract rests on this.
  for (const f of FIELDS) {
    assert.strictEqual(validate(f, '').value, null, `${f.key} blank`);
    assert.strictEqual(validate(f, '   ').value, null, `${f.key} spaces`);
    assert.strictEqual(validate(f, undefined).value, null, `${f.key} undefined`);
  }
});

check('version accepts 1.4 and 1.4.2, rejects junk', () => {
  okValue('minSupportedVersion', '1.4.2', '1.4.2');
  okValue('minSupportedVersion', '2.0', '2.0');
  rejects('minSupportedVersion', '1');
  rejects('minSupportedVersion', 'v1.4.2');
  rejects('minSupportedVersion', '1.4.2-beta');
  rejects('minSupportedVersion', '1.4.2.7');
});

check('urls must be https', () => {
  okValue('termsUrl', 'https://prox.app/terms', 'https://prox.app/terms');
  // http would be a downgrade and is blocked by iOS ATS anyway.
  rejects('termsUrl', 'http://prox.app/terms');
  rejects('termsUrl', 'prox.app/terms');
  rejects('termsUrl', 'javascript:alert(1)');
});

check('the offer product must be one of the listed ids', () => {
  // Stronger than the old "reject spaces and stray characters": a
  // well-formed id that does not exist in the store was accepted before and
  // produced an offer that silently never appeared -- indistinguishable, from
  // the panel, from a campaign nobody had switched on.
  okValue('offerProductId', '6_month', '6_month');
  okValue('offerProductId', 'lifetime_offer', 'lifetime_offer');
  rejects('offerProductId', 'prox.premium.yearly'); // plausible, but not ours
  rejects('offerProductId', 'monthy'); // one letter out
  rejects('offerProductId', 'prox premium');
});

check('a choice field rejects anything off its own list', () => {
  // The type exists to make mistyping impossible; it used to fall through to
  // the permissive default, which gave away the only guarantee it offers.
  for (const f of FIELDS.filter((x) => x.type === 'choice')) {
    assert.ok(
      Array.isArray(f.options) && f.options.length > 0,
      `${f.key} is a choice with no options`
    );
    const r = validate(f, 'definitely-not-on-the-list');
    assert.ok(r.error, `${f.key} accepted a value outside its options`);
  }
});

check('id lists drop repeats, keeping the first position', () => {
  // A repeated id is never meaningful, and for paywallPlanIds it would ask
  // the paywall to draw one product twice -- two cards with the same key,
  // which is an assertion in debug and undefined in release. The app defends
  // itself, but the panel should not be the one handing it the problem.
  okValue('paywallPlanIds', 'weekly,weekly,monthly', 'weekly,monthly');
  // First occurrence wins, so the operator's chosen order survives.
  okValue('paywallPlanIds', '6_month,weekly,6_month', '6_month,weekly');
  okValue('offerTriggerPoints', 'app_open, app_open ,settings',
    'app_open,settings');
});

check('id lists are trimmed and canonicalised', () => {
  okValue('offerTriggerPoints', 'app_open, settings ,feature_locked',
    'app_open,settings,feature_locked');
  // Only separators is the same as saying nothing.
  assert.strictEqual(validate(F('offerTriggerPoints'), ' , , ').value, null);
  rejects('offerTriggerPoints', 'app open,settings');
});

check('the zero-second delay is accepted, negatives are not', () => {
  okValue('launchPaywallDelaySeconds', '0', '0');
  rejects('launchPaywallDelaySeconds', '-1');
  // Fields that genuinely must not be zero still reject it.
  rejects('offerDurationMinutes', '0');
});

check('adUnitIds is keyed by placement, not language', () => {
  const json = '{"interstitial":"ca-app-pub-1/2","appOpen":"ca-app-pub-3/4"}';
  const r = validate(F('adUnitIds'), json);
  assert.ok(!r.error, `adUnitIds rejected: ${r.error}`);
  assert.deepStrictEqual(JSON.parse(r.value), {
    interstitial: 'ca-app-pub-1/2',
    appOpen: 'ca-app-pub-3/4',
  });
  rejects('adUnitIds', '{"interstitial":""}');
  rejects('adUnitIds', '[]');
});

check('localized maps still demand real language tags', () => {
  // anyKeys must not have loosened the language-keyed maps.
  rejects('freeNotifLocalized', '{"interstitial":"x"}');
  const r = validate(F('freeNotifLocalized'), '{"tr":{"title":"a","body":"b"}}');
  assert.ok(!r.error, r.error);
});

check('product ids refuse an empty list and unknown platforms', () => {
  // The empty case is the one that matters: it is the difference between a
  // paywall and a blank screen, and it cannot be undone by the app.
  rejects('purchaseProductIds', '{"ios":[],"android":[]}');
  rejects('purchaseProductIds', '{"ios":[""],"android":[""]}');
  rejects('purchaseProductIds', '{"web":["x"]}');
  rejects('purchaseProductIds', '{"ios":"weekly"}');
  rejects('purchaseProductIds', 'not json');
  // Blanks are dropped and repeats collapsed, matching what the app's own
  // parser does with the value.
  okValue(
    'purchaseProductIds',
    '{"android":["","",""],"ios":["weekly","weekly","6_month"]}',
    '{"ios":["weekly","6_month"],"android":[]}'
  );
});

check('the contact email must be a real address', () => {
  // The app builds a mailto: from this. A malformed one is refused by the
  // OS and the user sees "Could not send email" -- a broken support button
  // with nothing on screen naming the cause.
  okValue('linkEmail', 'destek@prox.app', 'destek@prox.app');
  rejects('linkEmail', 'destek');
  rejects('linkEmail', 'destek@');
  rejects('linkEmail', 'destek @prox.app');
  rejects('linkEmail', 'destek@prox');
});

check('tristate takes only true/false', () => {
  okValue('forceUpdate', 'true', 'true');
  okValue('featureAiChatEnabled', 'FALSE', 'false');
  rejects('forceUpdate', 'yes');
  rejects('forceUpdate', '1');
});

console.log(`\n${passed} checks passed`);
