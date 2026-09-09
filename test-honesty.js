'use strict';

/**
 * The panel is the only thing standing between one non-technical operator and
 * a live app. Its labels ARE the product: a field that reads as working and
 * does nothing is worse than no field, because the operator walks away
 * believing they changed something.
 *
 * These checks hold the panel to what the app actually does. They read the
 * Flutter source directly rather than trusting a list kept here, so a key
 * wired up tomorrow fails this file until its "HENÜZ ÇALIŞMIYOR" badge is
 * removed -- and a key removed from the app fails until the badge is added.
 */

const fs = require('fs');
const path = require('path');
const { keysTheAppReads } = require('./app_reads');
const { FIELDS, PROTECTED } = require('./keys.js');

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

// Callers still name Pio's paths; map them to whichever app was found.
const REL = {
  'lib/features/data/helpers/configs_helper.dart': 'configs',
  'lib/core/constants/constants.dart': 'constants',
};

function read(rel) {
  try {
    return fs.readFileSync(path.join(APP, APP_SRC[REL[rel]] || rel), 'utf8');
  } catch (e) {
    return null;
  }
}

const constants = read('lib/core/constants/constants.dart');
const configs = read('lib/features/data/helpers/configs_helper.dart');

console.log('honesty');

if (constants === null || configs === null) {
  console.log('  skip — the Flutter app is not at ' + APP);
  process.exit(0);
}

// A key is "wired" when the app both names it and has a getter reaching for
// that name. Either alone is not enough: a constant nobody reads is dead, and
// a getter is what actually pulls the value out of Remote Config.
// Delegated to app_reads.js: "the app reads it" means a published value can
// reach a device, not that a getter exists. This file and test-validate each
// had their own answer, and the two drifted.
const APP_READS = keysTheAppReads();

function isWired(key) {
  return APP_READS !== null && APP_READS.has(key);
}

const wrong = [];
for (const f of FIELDS) {
  // The three protected keys live in the Firebase console, not here.
  if (PROTECTED.some((p) => p.key === f.key)) continue;

  const wired = isWired(f.key);
  const marked = Boolean(f.inert);

  if (wired && marked) {
    wrong.push(`${f.key}: the app reads it, but it is marked HENÜZ ÇALIŞMIYOR`);
  }
  if (!wired && !marked) {
    wrong.push(`${f.key}: the app does NOT read it, and nothing says so`);
  }
}

ok(
  'every field says truthfully whether the app reads it',
  wrong.length === 0,
  wrong.join('\n       ')
);

// An inert badge has to say what IS true, not just what is not.
const emptyNotes = FIELDS.filter((f) => f.inert && String(f.inert).trim().length < 15);
ok(
  'each inert field explains what governs it instead',
  emptyNotes.length === 0,
  emptyNotes.map((f) => f.key).join(', ')
);

// Fallback text is the operator's only view of what happens when they leave a
// field alone, so it may never be blank.
const noFallback = FIELDS.filter((f) => !f.fallback || !String(f.fallback).trim());
ok(
  'every field documents what blank means',
  noFallback.length === 0,
  noFallback.map((f) => f.key).join(', ')
);

// Claims the app cannot keep. These wordings were each wrong at some point
// and the mistakes were not obvious, so they are pinned by name.
const allText = FIELDS.map((f) =>
  [f.label, f.help, f.effect, f.fallback].filter(Boolean).join(' ')
).join('\n');

ok(
  'nothing promises changes reach devices in a minute',
  !/bir dakika/i.test(allText),
  'the app fetches Remote Config only at cold start'
);

ok(
  'the offer trigger help does not invent trigger names',
  !/app_open|feature_locked|settings"/.test(
    (FIELDS.find((f) => f.key === 'offerTriggerPoints') || {}).help || ''
  ),
  'paywall_dismissed is the only trigger the app implements'
);

const offerEnabled = FIELDS.find((f) => f.key === 'offerEnabled') || {};
ok(
  'the offer switch says it needs a campaign id and a product id',
  /kimliği/i.test(offerEnabled.help || '') ,
  'offerEnabled is ANDed with both ids in configs_helper.dart'
);

const campaignDays = FIELDS.find((f) => f.key === 'freeNotifCampaignDays') || {};
ok(
  'the campaign window warns that older installs are already past it',
  /eski kullanıcı|çoktan|14 günden/i.test(
    (campaignDays.effect || '') + (campaignDays.help || '')
  ),
  'the window is anchored to each user first launch'
);

// The panel writes production. Anything that can silently disable a feature
// has to be reachable only through an explicit, named consequence.
const tristates = FIELDS.filter((f) => f.type === 'tristate' && !f.inert);
const noEffect = tristates.filter((f) => !f.effect);
ok(
  'every live on/off switch states its consequence',
  noEffect.length === 0,
  noEffect.map((f) => f.key).join(', ')
);

console.log('');
console.log(`${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
