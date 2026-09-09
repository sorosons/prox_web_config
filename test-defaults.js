'use strict';

/**
 * What the panel PROMISES a blank field falls back to, checked against what
 * the app actually does.
 *
 * This is the promise the whole reset button rests on: empty the field,
 * publish, and the app returns to the behaviour it shipped with. If the
 * panel's "Boş bırakılırsa:" line and the app's compiled-in default ever
 * disagree, the operator is being told the wrong thing about the one action
 * they reach for when something has gone wrong -- and they reach for it
 * precisely when they are least able to check.
 *
 * The app side is read out of the Dart source rather than restated here, so
 * changing a default in the app fails this file until the panel is updated
 * with it.
 */

const fs = require('fs');
const path = require('path');
const { FIELDS } = require('./keys.js');

// The app this panel publishes to. prox (Firebase waforall-2024) sits two
// levels up; Pio (waforall-new-design) sits beside this repo. Their source
// layouts differ, so each candidate carries its own paths rather than a single
// APP root -- the previous absolute path pointed at one developer's machine
// and made these checks silently skip everywhere else.
const CANDIDATES = [
  {
    root: path.join(__dirname, '..', 'prox'),
    configs: 'lib/app/helpers/configs_helper.dart',
    constants: 'lib/app/helpers/constants.dart',
  },
  {
    root: path.join(__dirname, '..', 'prox', '.references', 'Pio_latest'),
    configs: 'lib/features/data/helpers/configs_helper.dart',
    constants: 'lib/core/constants/constants.dart',
  },
];
const APP_SRC =
  CANDIDATES.find((c) => fs.existsSync(path.join(c.root, c.configs))) || CANDIDATES[0];
const APP = APP_SRC.root;
const CONFIGS = path.join(APP, APP_SRC.configs);
const CONSTANTS = path.join(APP, APP_SRC.constants);

let failures = 0;
let checks = 0;

function ok(name, condition, detail) {
  checks++;
  if (condition) {
    console.log('  ok  ' + name);
  } else {
    failures++;
    console.log('  FAIL ' + name);
    if (detail) console.log('       ' + detail);
  }
}

console.log('defaults');

let src;
try {
  src = fs.readFileSync(CONFIGS, 'utf8');
} catch (e) {
  console.log('  skip — the Flutter app is not at ' + APP);
  process.exit(0);
}

/** The app's compiled-in default for a key, read from configs_helper.dart. */
function appDefault(key) {
  // _flag(Constants.foo, fallback: true)
  let m = src.match(
    new RegExp('_flag\\(Constants\\.' + key + ',\\s*fallback:\\s*(true|false)\\)')
  );
  if (m) return { kind: 'bool', value: m[1] === 'true' };

  // _posInt / _nonNegInt (Constants.foo, fallback: 24). _nonNegInt exists for
  // the delays where 0 is a real answer, so it must be recognised too or the
  // panel is told those keys have no default at all.
  m = src.match(
    new RegExp(
      '_(?:posInt|nonNegInt)\\(Constants\\.' + key + ',\\s*fallback:\\s*(\\d+)\\)'
    )
  );
  if (m) return { kind: 'int', value: Number(m[1]) };

  // _flagOrNull(Constants.foo) — a tri-state read whose "no opinion" answer
  // is null, used where the app falls through to another config source.
  if (new RegExp('_flagOrNull\\(Constants\\.' + key + '\\)').test(src)) {
    return { kind: 'computed' };
  }

  // _stringMap(Constants.foo) — placement -> value, empty map when unset.
  if (new RegExp('_stringMap\\(Constants\\.' + key + '\\)').test(src)) {
    return { kind: 'blank' };
  }

  // _str with an explicit fallback string, e.g. _str(Constants.foo, fallback: 'x')
  const strWithFallback = src.match(
    new RegExp("_str\\(Constants\\." + key + ",\\s*fallback:\\s*'([^']*)'\\)")
  );
  if (strWithFallback) return { kind: 'text', value: strWithFallback[1] };

  // _str / _localized / _idList / _url — all fall back to "nothing set"
  if (new RegExp('_str\\(Constants\\.' + key + '\\)').test(src)) {
    return { kind: 'blank' };
  }
  if (new RegExp('_localized\\(Constants\\.' + key + '\\)').test(src)) {
    return { kind: 'blank' };
  }
  if (new RegExp('_idList\\(Constants\\.' + key + '\\)').test(src)) {
    return { kind: 'blank' };
  }
  if (new RegExp('_url\\(Constants\\.' + key + ',').test(src)) {
    return { kind: 'url' };
  }
  // A getter that works its default out at runtime (offerProductId picks the
  // longest plan the store returned) has no literal to compare against, but
  // it IS wired up -- which is what the "every live key has a default" check
  // is asking about.
  // The getter need not be named after the key: launchPaywallEnabled is read
  // by launchPaywallEnabledOverride, adUnitIds by adUnitIdFor(placement).
  // What matters is that SOMETHING reads the key, which the Constants
  // reference above already proves -- so accept any getter whose name starts
  // with the key, and any mention of Constants.<key> as a last resort.
  if (new RegExp('get ' + key + '\\w*\\b').test(src)) {
    return { kind: 'computed' };
  }
  if (new RegExp('Constants\\.' + key + '\\b').test(src)) {
    return { kind: 'computed' };
  }
  // Last resort: the Dart constant need not be spelled like the Remote Config
  // key it carries. prox reads "purchaseProductIds" through a constant named
  // `sharedPurchaseIds`, so every name-equals-key branch above misses it and
  // a live key gets reported as having no default at all.
  for (const name of constNamesFor(key)) {
    if (new RegExp('Constants\\.' + name + '\\b').test(src)) {
      return { kind: 'computed' };
    }
  }
  return null;
}

// Remote Config key -> the Dart constant name(s) that hold it.
let CONST_BY_VALUE = null;
function constNamesFor(key) {
  if (!CONST_BY_VALUE) {
    CONST_BY_VALUE = new Map();
    let csrc = '';
    try {
      csrc = fs.readFileSync(CONSTANTS, 'utf8');
    } catch (e) {
      csrc = '';
    }
    const re = /static const String\s+(\w+)\s*=\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(csrc))) {
      if (!CONST_BY_VALUE.has(m[2])) CONST_BY_VALUE.set(m[2], []);
      CONST_BY_VALUE.get(m[2]).push(m[1]);
    }
  }
  return CONST_BY_VALUE.get(key) || [];
}

// --- numbers: the panel prints the figure, so it must be the real one ---

const numberMismatches = [];
for (const f of FIELDS) {
  if (f.inert) continue;
  const d = appDefault(f.key);
  if (!d || d.kind !== 'int') continue;

  // The fallback text must contain the actual number and no other number,
  // so "24" cannot quietly stand while the app uses 48.
  const printed = String(f.fallback).match(/\d+/g) || [];
  if (!printed.includes(String(d.value))) {
    numberMismatches.push(
      `${f.key}: app defaults to ${d.value}, panel says "${f.fallback}"`
    );
  }
}
ok(
  'every number the panel prints is the number the app uses',
  numberMismatches.length === 0,
  numberMismatches.join('\n       ')
);

// --- booleans: "açık"/"kapalı" has to match fallback: true/false ---

const boolMismatches = [];
for (const f of FIELDS) {
  if (f.inert) continue;
  const d = appDefault(f.key);
  if (!d || d.kind !== 'bool') continue;

  const text = String(f.fallback).toLowerCase();
  const saysOn = /açık|acik|on\b/.test(text);
  const saysOff = /kapalı|kapali|off\b/.test(text);

  if (d.value && !saysOn) {
    boolMismatches.push(`${f.key}: app defaults ON, panel says "${f.fallback}"`);
  }
  if (!d.value && !saysOff) {
    boolMismatches.push(`${f.key}: app defaults OFF, panel says "${f.fallback}"`);
  }
  if (saysOn && saysOff) {
    boolMismatches.push(`${f.key}: panel says both on and off`);
  }
}
ok(
  'every on/off default reads the way the app behaves',
  boolMismatches.length === 0,
  boolMismatches.join('\n       ')
);

// --- every live key must actually have a default to fall back to ---

const undefaulted = [];
for (const f of FIELDS) {
  if (f.inert) continue;
  if (['isAllFeatureClosed', 'appVersion', 'appBuildNumber'].includes(f.key)) {
    continue; // console-only kill switches
  }
  if (!appDefault(f.key)) {
    undefaulted.push(f.key);
  }
}
ok(
  'every live key has a compiled-in default in the app',
  undefaulted.length === 0,
  'no getter found for: ' + undefaulted.join(', ')
);

// --- a literal baked into the app must be quoted correctly ---

// Where the panel prints an actual value as the fallback -- "6739641253 --
// uygulamaya gömülü gerçek kimlik" -- that value has to be the one the app
// compiles in. A changed id would otherwise leave the panel confidently
// naming the old one.
const literalMismatches = [];
for (const f of FIELDS) {
  if (f.inert) continue;
  // A masked field's baked-in value is a credential. Quoting it in the
  // panel would print the app's API key on screen and in this repo, which
  // is the opposite of what masking the input is for -- so these say what
  // the fallback IS rather than what it contains.
  if (f.masked) continue;
  const d = appDefault(f.key);
  if (!d || d.kind !== 'text' || !d.value) continue;
  if (!f.fallback.includes(d.value)) {
    literalMismatches.push(
      `${f.key}: app compiles in "${d.value}", panel says "${f.fallback}"`
    );
  }
}
ok(
  'baked-in values the panel quotes match the app',
  literalMismatches.length === 0,
  literalMismatches.join('\n       ')
);

// --- a min of 0 in the panel must mean 0 in the app ---

// The panel's `min` is what the number input and the server validator allow.
// If it permits 0 while the app reads the key with _posInt, an operator can
// publish 0, see it accepted, and get the fallback instead -- the same silent
// no-op as choosing a product the store does not sell.
const zeroAllowedButRejected = FIELDS.filter((f) => {
  if (f.inert || f.min !== 0) return false;
  const d = appDefault(f.key);
  if (!d || d.kind !== 'int') return false;
  return !new RegExp('_nonNegInt\\(Constants\\.' + f.key + '\\b').test(src);
});
ok(
  'keys the panel lets you set to 0 are read with _nonNegInt',
  zeroAllowedButRejected.length === 0,
  'the panel accepts 0 but the app would discard it: ' +
    zeroAllowedButRejected.map((f) => f.key).join(', ')
);

// --- the reset promise itself ---

// Zero is forbidden for anything read with _posInt -- an interval of 0 is a
// notification with no brakes, a count of 0 is a campaign that never fires.
// Where the app deliberately allows zero it says so by reading the key with
// _nonNegInt instead (0 = no cap, 0 = no delay), and that is a state reset
// can legitimately return to.
const zeroDefaults = FIELDS.filter((f) => {
  if (f.inert) return false;
  const d = appDefault(f.key);
  if (!d || d.kind !== 'int' || d.value > 0) return false;
  const allowsZero = new RegExp(
    '_nonNegInt\\(Constants\\.' + f.key + '\\b'
  ).test(src);
  return !allowsZero;
});
ok(
  'no live numeric default is zero unless the app allows zero',
  zeroDefaults.length === 0,
  'a zero interval or count is a state the app cannot run in, so reset ' +
    'could not return to it: ' + zeroDefaults.map((f) => f.key).join(', ')
);

console.log('');
console.log(`${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
