'use strict';

/**
 * Which Remote Config keys the app actually reads — meaning a published value
 * can reach a device, not merely that a getter for it exists.
 *
 * A getter nobody calls is as inert as a missing one: the operator sets a
 * value, publishes, and nothing happens, with the panel saying the key works.
 * That is the failure `notWired` exists to prevent, so it is the definition
 * the checks have to use.
 *
 * This lived separately in test-validate and test-honesty, each with its own
 * idea of "reads". They drifted, which is how twenty-five inert keys came to
 * be advertised as working. One module now, both checks call it.
 */

const fs = require('fs');
const path = require('path');

/** Where the app is, relative to this repo. prox first, Pio as a fallback. */
const CANDIDATES = [
  {
    root: path.join(__dirname, '..', 'prox'),
    configs: 'lib/app/helpers/configs_helper.dart',
    constants: 'lib/app/helpers/constants.dart',
    lib: 'lib',
  },
  {
    root: path.join(__dirname, '..', '..'),
    configs: 'lib/app/helpers/configs_helper.dart',
    constants: 'lib/app/helpers/constants.dart',
    lib: 'lib',
  },
  {
    root: path.join(__dirname, '..', 'prox', '.references', 'Pio_latest'),
    configs: 'lib/features/data/helpers/configs_helper.dart',
    constants: 'lib/core/constants/constants.dart',
    lib: 'lib',
  },
];

/** The app repo that is actually on disk, or null when none is. */
function findApp() {
  return (
    CANDIDATES.find((c) => fs.existsSync(path.join(c.root, c.configs))) || null
  );
}

/** Every reader call the tri-state family and the raw API can make. */
const READER =
  '(?:remoteConfig\\.get\\w+|_(?:flag|flagOrNull|str|posInt|nonNegInt|localized|idList|stringMap|url))';

function dartFiles(dir, skip, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) dartFiles(full, skip, out);
    else if (entry.name.endsWith('.dart') && full !== skip) out.push(full);
  }
  return out;
}

/**
 * The set of Remote Config keys whose value can change something on a device.
 *
 * Returns null when the app repo is not beside this one, so callers can skip
 * rather than guess.
 */
function keysTheAppReads() {
  const app = findApp();
  if (!app) return null;

  const configsPath = path.join(app.root, app.configs);
  const constantsSrc = fs.readFileSync(path.join(app.root, app.constants), 'utf8');
  const helperSrc = fs.readFileSync(configsPath, 'utf8');

  // Dart constant name -> the Remote Config key it holds. The two are not
  // always spelled alike: prox reads "purchaseProductIds" through a constant
  // called sharedPurchaseIds.
  const keyOfConst = {};
  const constRe = /static const String\s+(\w+)\s*=\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = constRe.exec(constantsSrc))) keyOfConst[m[1]] = m[2];

  // Split configs_helper into getter bodies, and note which key each reads.
  const marks = [];
  const getterRe = /\bget\s+(\w+)\s*(?:=>|\{)/g;
  while ((m = getterRe.exec(helperSrc))) {
    marks.push({ name: m[1], at: m.index, end: getterRe.lastIndex });
  }
  const bodies = {};
  const getterOfKey = {};
  marks.forEach((mk, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].at : helperSrc.length;
    const body = helperSrc.slice(mk.end, end);
    bodies[mk.name] = body;
    const re = new RegExp(READER + '\\(\\s*Constants\\.(\\w+)', 'g');
    let r;
    while ((r = re.exec(body))) {
      const key = keyOfConst[r[1]];
      if (key && !getterOfKey[key]) getterOfKey[key] = mk.name;
    }
  });

  // A getter is live when something outside configs_helper calls it...
  const all = dartFiles(path.join(app.root, app.lib), configsPath)
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
  const live = new Set(
    Object.keys(bodies).filter((n) => new RegExp('\\.' + n + '\\b').test(all))
  );

  // ...or when a live getter calls it. isAllFeatureClosed is read only
  // through isFeaturesClose, showWebviewAndStatus only through
  // isWebviewStatusEnable; both are as live as the getter that wraps them.
  for (let pass = 0; pass < 8; pass++) {
    let grew = false;
    for (const n of [...live]) {
      for (const other of Object.keys(bodies)) {
        if (live.has(other)) continue;
        if (new RegExp('\\b' + other + '\\b').test(bodies[n])) {
          live.add(other);
          grew = true;
        }
      }
    }
    if (!grew) break;
  }

  return new Set(
    Object.keys(getterOfKey).filter((k) => live.has(getterOfKey[k]))
  );
}

module.exports = { keysTheAppReads, findApp };
