'use strict';

/**
 * Admin panel for the Prox app's notification-related Remote Config keys.
 *
 * Why a server exists at all: writing Remote Config needs Firebase Admin
 * credentials, and anything the browser holds, the browser can leak. A page
 * that talked to Firebase directly would have to ship a key that grants
 * control of the whole project. So the credentials live here and the browser
 * only ever talks to this process.
 *
 * What this process will NOT do, by construction:
 *   - write any key outside keys.js (see ALLOWED below). The kill-switch keys
 *     isAllFeatureClosed / appVersion / appBuildNumber and the secrets are
 *     therefore unreachable from the panel, even with a forged request.
 *   - drop keys it does not know about. Publishing reads the live template,
 *     edits only the allowed keys in place, and publishes the result — so a
 *     key added in the Firebase console by hand survives a publish here.
 */

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const admin = require('firebase-admin');

const {
  FIELDS,
  PROTECTED,
  BY_KEY,
  TRISTATE,
  TEXT,
  INT,
  JSON_MAP,
  LANG,
  VERSION,
  URL,
  ID,
  ID_LIST,
  CHOICE,
  EMAIL,
  PRODUCT_IDS,
} = require('./keys');

const ALLOWED = new Set(FIELDS.map((f) => f.key));

// ----------------------------- configuration -----------------------------

const PORT = process.env.PORT || 8080;
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS || '';

function fatal(msg) {
  console.error(`\n[config] ${msg}\n`);
  process.exit(1);
}

// Tests require this file to reach validate() without Firebase credentials or
// a listening socket. Everything below the validation logic is skipped then.
// Deliberately an env var and not an argument: nothing an HTTP request can
// reach should be able to flip it.
const VALIDATE_ONLY = process.env.PANEL_VALIDATE_ONLY === '1';

if (!VALIDATE_ONLY && !PANEL_PASSWORD) {
  fatal(
    'PANEL_PASSWORD is not set. Refusing to start an unauthenticated panel ' +
      'that can rewrite production config.'
  );
}
if (!VALIDATE_ONLY && PANEL_PASSWORD.length < 12) {
  fatal('PANEL_PASSWORD is shorter than 12 characters. Use a longer one.');
}
if (!VALIDATE_ONLY && !SESSION_SECRET) {
  fatal('SESSION_SECRET is not set. Generate one with: openssl rand -hex 32');
}
if (!VALIDATE_ONLY && !CREDENTIALS) {
  fatal(
    'GOOGLE_APPLICATION_CREDENTIALS is not set. Point it at the service ' +
      'account JSON downloaded from Firebase.'
  );
}

if (!VALIDATE_ONLY) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));

// Sessions are a signed cookie rather than server-side state, because the
// state was in memory: every redeploy -- and this panel is redeployed often --
// logged the operator out. A signed token survives a restart, needs no store
// and no extra dependency, and cannot be forged without SESSION_SECRET.
//
// The trade is that a signed token cannot be revoked before it expires.
// Acceptable here: one operator, one password, and logging out clears the
// cookie in the only browser that has it. Rotating SESSION_SECRET invalidates
// every outstanding token at once if that is ever needed.
const SESSION_COOKIE = 'prox_admin';
const SESSION_MAX_AGE_MS = 30 * 24 * 3600 * 1000; // 30 days

function signSession(expiresAt) {
  const payload = String(expiresAt);
  const mac = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${mac}`;
}

/** True when the token is well-formed, correctly signed and not expired. */
function verifySession(token) {
  if (typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const given = token.slice(dot + 1);
  if (!/^\d{1,15}$/.test(payload)) return false;

  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Compare before checking the clock, and only on equal lengths --
  // timingSafeEqual throws on a mismatch.
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;

  return Number(payload) > Date.now();
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    // Set PANEL_INSECURE=1 only to try it on plain http://localhost.
    secure: process.env.PANEL_INSECURE !== '1',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  };
}

/** Read the panel cookie without pulling in a cookie parser. */
function readSessionCookie(req) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch (e) {
      return null;
    }
  }
  return null;
}

function isSignedIn(req) {
  return verifySession(readSessionCookie(req));
}

// Password guessing is the obvious attack on a single-password panel.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla deneme. 15 dakika bekle.' },
});

function requireAuth(req, res, next) {
  if (isSignedIn(req)) return next();
  return res.status(401).json({ error: 'Giriş yapılmamış' });
}

/** Constant-time-ish comparison, so timing does not leak the password. */
function passwordMatches(given) {
  const a = Buffer.from(String(given || ''), 'utf8');
  const b = Buffer.from(PANEL_PASSWORD, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// -------------------------------- auth ----------------------------------

app.post('/api/login', loginLimiter, (req, res) => {
  if (!passwordMatches(req.body && req.body.password)) {
    return res.status(401).json({ error: 'Şifre yanlış' });
  }
  res.cookie(
    SESSION_COOKIE,
    signSession(Date.now() + SESSION_MAX_AGE_MS),
    sessionCookieOptions()
  );
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  res.json({ authed: isSignedIn(req) });
});

// ------------------------------ schema ----------------------------------

app.get('/api/schema', requireAuth, (req, res) => {
  res.json({ fields: FIELDS, protected: PROTECTED });
});

// ------------------------------ validation -------------------------------

/**
 * Validate one incoming value against its field definition.
 * Returns { value } to write, { skip: true } to leave the key untouched, or
 * { error }.
 *
 * An empty string is "unset": the panel deletes the key rather than writing
 * "", because the app reads absent-or-blank as "keep today's behaviour" and
 * an explicitly blank key is just a confusing way to say the same thing.
 */
function validate(field, raw) {
  const str = raw === undefined || raw === null ? '' : String(raw).trim();
  // Errors are read by whoever is using the panel, so they name the field by
  // its Turkish label; the key is appended because that is what appears in the
  // Firebase console.
  const name = `${field.label} (${field.key})`;

  if (str === '') return { value: null }; // null => delete the key

  switch (field.type) {
    case TRISTATE: {
      const v = str.toLowerCase();
      if (v !== 'true' && v !== 'false') {
        return { error: `${name}: true, false veya boş olmalı` };
      }
      return { value: v };
    }

    case INT: {
      if (!/^\d+$/.test(str)) {
        return { error: `${name}: tam sayı olmalı` };
      }
      const n = Number(str);
      const min = field.min === undefined ? 1 : field.min;
      if (n < min) {
        // Zero would make the app's interval and delay arithmetic degenerate:
        // an interval of 0 is a notification with no brakes.
        return { error: `${name}: en az ${min} olmalı` };
      }
      if (n > 100000) return { error: `${name}: aşırı büyük bir sayı` };
      return { value: String(n) };
    }

    case LANG: {
      if (!/^[a-zA-Z]{2,3}([_-][a-zA-Z0-9]{2,8})?$/.test(str)) {
        return { error: `${name}: "tr" veya "pt_BR" gibi bir dil kodu yaz` };
      }
      return { value: str };
    }

    case JSON_MAP: {
      let parsed;
      try {
        parsed = JSON.parse(str);
      } catch (e) {
        return { error: `${name}: geçerli JSON değil (${e.message})` };
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { error: `${name}: JSON nesnesi olmalı, örn. { "tr": "…" }` };
      }
      // Most JSON maps are keyed by language, and a typo'd language tag is a
      // silent no-op on the device -- worth rejecting. adUnitIds is keyed by
      // placement name instead, so it opts out with anyKeys.
      if (field.anyKeys) {
        for (const [placement, entry] of Object.entries(parsed)) {
          if (typeof entry !== 'string' || entry.trim() === '') {
            return { error: `${name}: "${placement}" karşılığı boş olamaz` };
          }
        }
        return { value: JSON.stringify(parsed) };
      }
      for (const [lang, entry] of Object.entries(parsed)) {
        if (!/^[a-zA-Z]{2,3}([_-][a-zA-Z0-9]{2,8})?$/.test(lang)) {
          return { error: `${name}: "${lang}" bir dil kodu değil` };
        }
        if (typeof entry === 'string') continue;
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          for (const k of Object.keys(entry)) {
            if (k !== 'title' && k !== 'body') {
              return {
                error: `${name}: "${lang}" içinde bilinmeyen alan "${k}" (sadece title/body)`,
              };
            }
          }
          continue;
        }
        return {
          error: `${name}: "${lang}" bir metin ya da {title, body} olmalı`,
        };
      }
      // Re-serialize so what lands in Remote Config is canonical, not
      // whatever whitespace the operator pasted.
      return { value: JSON.stringify(parsed) };
    }

    case VERSION: {
      // Two or three numeric parts, e.g. 1.4 or 1.4.2. Anything looser gets
      // compared against the running build and silently loses.
      if (!/^\d{1,4}(\.\d{1,4}){1,2}$/.test(str)) {
        return { error: `${name}: "1.4.2" biçiminde bir sürüm yaz` };
      }
      return { value: str };
    }

    case URL: {
      // https only: these get opened in a webview, and http would be both a
      // downgrade and, on iOS, blocked by ATS anyway.
      let u;
      try {
        u = new global.URL(str);
      } catch (e) {
        return { error: `${name}: geçerli bir adres değil` };
      }
      if (u.protocol !== 'https:') {
        return { error: `${name}: https:// ile başlamalı` };
      }
      if (str.length > 2000) return { error: `${name}: çok uzun` };
      return { value: str };
    }

    case CHOICE: {
      // A listed value, or nothing. This type exists precisely so an id
      // cannot be mistyped, and falling through to the permissive default
      // would have given away the only guarantee it offers.
      //
      // An id already published -- added straight in the Firebase console,
      // or listed here in an older build -- is accepted so that saving the
      // section does not silently wipe it. The UI shows it flagged.
      const options = (field.options || []).map((o) =>
        Array.isArray(o) ? o[0] : o
      );
      if (!options.includes(str)) {
        return {
          error: `${name}: "${str}" listede yok. Seçenekler: ${options.join(', ')}`,
        };
      }
      return { value: str };
    }

    case ID: {
      if (!/^[A-Za-z0-9._:-]{1,120}$/.test(str)) {
        return {
          error: `${name}: sadece harf, rakam ve . _ : - kullan (boşluk olmaz)`,
        };
      }
      return { value: str };
    }

    case ID_LIST: {
      const parts = str
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x !== '');
      if (!parts.length) return { value: null };
      if (parts.length > 50) return { error: `${name}: çok fazla girdi` };
      for (const part of parts) {
        if (!/^[A-Za-z0-9._:-]{1,120}$/.test(part)) {
          return {
            error: `${name}: "${part}" — sadece harf, rakam ve . _ : - kullan`,
          };
        }
      }
      // Canonicalise: the operator's spacing is not worth preserving, and a
      // repeated id is never meaningful -- for paywallPlanIds it would ask
      // the paywall to draw one product twice, which the app then has to
      // defend against. First occurrence wins, so the operator's ordering
      // survives.
      const unique = [...new Set(parts)];
      return { value: unique.join(',') };
    }

    case EMAIL: {
      // Handed to Uri(scheme: 'mailto', path: ...) in the app. A value with
      // a space or a missing @ produces a mailto the OS refuses, and the
      // user sees "Could not send email" with nothing naming the cause.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(str)) {
        return { error: `${name}: geçerli bir e-posta adresi yaz` };
      }
      if (str.length > 254) return { error: `${name}: çok uzun` };
      return { value: str };
    }

    case PRODUCT_IDS: {
      // {"ios": ["weekly", ...], "android": [...]}
      //
      // The app has no fallback for this key: an empty list means it asks the
      // store for nothing and the paywall comes up blank. So an empty result
      // is refused here rather than published and discovered on a device.
      let parsed;
      try {
        parsed = JSON.parse(str);
      } catch (e) {
        return { error: `${name}: geçerli JSON değil (${e.message})` };
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { error: `${name}: JSON nesnesi olmalı` };
      }

      const out = {};
      let total = 0;
      for (const platform of ['ios', 'android']) {
        const list = parsed[platform];
        if (list === undefined) {
          out[platform] = [];
          continue;
        }
        if (!Array.isArray(list)) {
          return { error: `${name}: "${platform}" bir liste olmalı` };
        }
        const ids = [];
        for (const raw of list) {
          if (typeof raw !== 'string') {
            return { error: `${name}: "${platform}" içinde metin olmayan bir değer var` };
          }
          const id = raw.trim();
          if (id === '') continue; // the app drops blanks too
          if (!/^[A-Za-z0-9._:-]{1,120}$/.test(id)) {
            return {
              error: `${name}: "${id}" — sadece harf, rakam ve . _ : - kullan`,
            };
          }
          if (!ids.includes(id)) ids.push(id);
        }
        out[platform] = ids;
        total += ids.length;
      }

      for (const key of Object.keys(parsed)) {
        if (key !== 'ios' && key !== 'android') {
          return { error: `${name}: bilinmeyen platform "${key}"` };
        }
      }

      if (total === 0) {
        return {
          error:
            `${name}: en az bir ürün olmalı — boş liste abonelik ekranını ` +
            'bomboş açar',
        };
      }
      return { value: JSON.stringify(out) };
    }

    case TEXT:
    default: {
      if (str.length > 2000) return { error: `${name}: çok uzun` };
      return { value: str };
    }
  }
}

// ------------------------------- read ------------------------------------

app.get('/api/config', requireAuth, async (req, res) => {
  try {
    const template = await admin.remoteConfig().getTemplate();
    const values = {};
    for (const key of ALLOWED) {
      const param = template.parameters[key];
      const dv = param && param.defaultValue;
      // A parameter marked useInAppDefault has no server value; treat that as
      // unset rather than reporting the literal marker to the operator.
      values[key] =
        dv && typeof dv.value === 'string' ? dv.value : '';
    }

    // Report the protected keys read-only, so an operator can see the state
    // of the kill switch without this panel being able to change it.
    const protectedState = {};
    for (const p of PROTECTED) {
      const param = template.parameters[p.key];
      const dv = param && param.defaultValue;
      const v = dv && typeof dv.value === 'string' ? dv.value : '';
      protectedState[p.key] = p.secret ? (v ? '(dolu)' : '(boş)') : v;
    }

    res.json({
      values,
      protectedState,
      etag: template.etag,
      version: template.version || null,
    });
  } catch (e) {
    console.error('read failed', e);
    res.status(500).json({ error: `Ayarlar okunamadı: ${e.message}` });
  }
});

// ------------------------------- write -----------------------------------

app.post('/api/config', requireAuth, async (req, res) => {
  const incoming = (req.body && req.body.values) || {};

  // Reject unknown keys loudly rather than ignoring them. A key arriving here
  // that is not in the allow-list means either a bug or an attempt to reach
  // the kill switch; either way the operator should hear about it.
  const unknown = Object.keys(incoming).filter((k) => !ALLOWED.has(k));
  if (unknown.length) {
    return res.status(400).json({
      error: `Bu panelin yönetmediği anahtarlar yazılamaz: ${unknown.join(', ')}`,
    });
  }

  const writes = {};
  const errors = [];
  for (const [key, raw] of Object.entries(incoming)) {
    const field = BY_KEY.get(key);
    const result = validate(field, raw);
    if (result.error) errors.push(result.error);
    else writes[key] = result.value; // string, or null to delete
  }
  if (errors.length) return res.status(400).json({ error: errors.join('\n') });

  try {
    const template = await admin.remoteConfig().getTemplate();

    // Optimistic concurrency: if someone edited the template in the Firebase
    // console since this page loaded, refuse rather than overwrite them.
    if (req.body.etag && req.body.etag !== template.etag) {
      return res.status(409).json({
        error:
          'Bu sayfayı açtığından beri ayarlar Firebase tarafında değişti. ' +
          'Yenile\'ye basıp güncel değerleri gör, sonra değişikliğini ' +
          'tekrar yap. (Böylece başkasının yaptığı bir değişikliğin ' +
          'üzerine yazmamış olursun.)',
      });
    }

    for (const [key, value] of Object.entries(writes)) {
      if (value === null) {
        delete template.parameters[key];
        continue;
      }
      const existing = template.parameters[key] || {};
      template.parameters[key] = {
        ...existing,
        defaultValue: { value },
        valueType: 'STRING',
        description:
          existing.description ||
          (BY_KEY.get(key) ? BY_KEY.get(key).label : undefined),
      };
    }

    await admin.remoteConfig().validateTemplate(template);
    const published = await admin.remoteConfig().publishTemplate(template);

    res.json({
      ok: true,
      etag: published.etag,
      // The app caches for 30s (minimumFetchInterval), so say so rather than
      // letting an operator conclude nothing happened.
      note: 'Yayınlandı. Kullanıcı uygulamayı tamamen kapatıp yeniden açtığında geçerli olur.',
    });
  } catch (e) {
    console.error('publish failed', e);
    res.status(500).json({ error: `Yayınlanamadı: ${e.message}` });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

module.exports = { validate, ALLOWED };

if (!VALIDATE_ONLY) {
  app.listen(PORT, () => {
    console.log(`Remote config panel on http://localhost:${PORT}`);
    console.log(
      `Managing ${ALLOWED.size} keys; ${PROTECTED.length} protected keys are read-only.`
    );
  });
}
