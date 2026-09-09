'use strict';

/**
 * Panel front-end. Holds no credentials: everything goes through this app's
 * own /api, which is where the Firebase service account lives.
 */

const state = {
  fields: [],
  protected: [],
  values: {},
  etag: null,
  // Which section is open. Publishing re-reads and re-renders, so this has to
  // survive a redraw or the operator gets bounced back to the first section
  // every time they publish.
  activeGroup: null,
  // The read-only keys, kept because purchaseProductIds names the products
  // the app will actually ask the store for.
  protectedState: {},
};

/**
 * Product ids the app asks the store for, read from purchaseProductIds.
 *
 * The offer product list in keys.js is written by hand and cannot know which
 * ids exist today. Choosing one the store does not return produces an offer
 * that silently never appears -- which is exactly what happened with
 * "3_month": the panel offered it as though it were live, the store returned
 * weekly/monthly/6_month, and the campaign looked switched off.
 *
 * Returns null when the value cannot be read, so the UI marks nothing rather
 * than marking everything wrong.
 */
function storeProductIds() {
  // The form first, then what is published. purchaseProductIds is edited in
  // the same section as the lists that depend on it, so a product added but
  // not yet published still has to appear in them -- otherwise you add one,
  // look immediately below for it, and it is not there.
  const field = document.getElementById('in-purchaseProductIds');
  const raw =
    (field && field.value) ||
    (state.values && state.values.purchaseProductIds) ||
    (state.protectedState && state.protectedState.purchaseProductIds);
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    const ids = [];
    for (const list of Object.values(parsed)) {
      if (!Array.isArray(list)) continue;
      for (const id of list) {
        if (typeof id === 'string' && id.trim() !== '') ids.push(id.trim());
      }
    }
    return ids.length ? new Set(ids) : null;
  } catch (e) {
    return null;
  }
}

const $ = (sel) => document.querySelector(sel);

const GROUPS = [
  {
    id: 'link',
    title: 'Eşleşme kodu bildirimi',
    blurb:
      'WhatsApp bağlanma kodunu kilit ekranına koyan bildirim. Kullanıcı ' +
      'WhatsApp’ın içindeyken kodu buradan okuyor.',
  },
  {
    id: 'free',
    title: 'Ücretsiz kullanıcı hatırlatıcısı',
    blurb:
      'Sadece abone olmayan ve deneme sürümünde olmayan kullanıcılara gider. ' +
      'Varsayılan olarak kapalı.',
  },
  {
    id: 'shared',
    title: 'Her ikisi için ortak',
    blurb: 'Aşağıdaki ayar iki bildirimi de etkiler.',
  },
  {
    id: 'update',
    title: 'Zorunlu güncelleme',
    blurb:
      'Eski sürümdeki kullanıcıyı güncellemeye yönlendirir. Sürüme göre ' +
      'kapatan kill switch\'ten ayrıdır: bu, kullanıcıya çıkış yolu bırakır.',
  },
  {
    id: 'features',
    title: 'Özellik anahtarları',
    blurb:
      'Tek tek özellikleri kapatır. Bir aksaklıkta sürüm göndermeden ' +
      'kapatabilmek için var; normal şartlarda hepsi açık kalır.',
  },
  {
    id: 'freeAccess',
    title: 'Ücretsiz kullanıcı erişimi',
    blurb:
      'Abone olmayan biri hangi ekranları kullanabilsin. Kapalı olan ' +
      'ekranda "premium\'a geç" kaplaması durur. Dördü de varsayılan olarak ' +
      'kapalı — uygulamanın bugünkü davranışı budur.',
  },
  {
    id: 'ai',
    title: 'Yapay zekâ',
    blurb:
      'Gemini anahtarı ve model adı. İkisi de boş bırakılabilir — uygulama ' +
      'kendi gömülü değerlerini kullanır.',
  },
  {
    id: 'guide',
    title: 'Rehber videosu',
    blurb:
      'Sohbetler ekranındaki bilgi düğmesinin açtığı tanıtım videosu. ' +
      'Boş bırakılırsa uygulamaya gömülü olan oynatılır.',
  },
  {
    id: 'launchPaywall',
    title: 'Açılışta paywall',
    blurb:
      'Uygulama açılırken abonelik ekranını gösterir. Abonelere ve deneme ' +
      'sürümündekilere hiçbir zaman gösterilmez.',
  },
  {
    id: 'offer',
    title: 'Süreli indirim',
    blurb:
      'Geri sayımlı indirim teklifi. Kampanya kimliğini değiştirmek tüm ' +
      'kullanıcıların sayacını sıfırlar.',
  },
  {
    id: 'ads',
    title: 'Reklamlar',
    blurb: 'Reklam gösterimi. Abonelere reklam gösterilmez.',
  },
  {
    id: 'presentation',
    title: 'Sunum modu',
    blurb:
      'Alt menüdeki sekmeleri değiştirir: Durum ve Profiller yerine yapay ' +
      'zekâ ve hikaye araçları gelir. Tek anahtar, ama etkisi uygulamanın ' +
      'tamamında görünür.',
  },
  {
    id: 'integrations',
    title: 'Kimlikler ve entegrasyonlar',
    blurb:
      'App Store kimliği ve TikTok olay takibi. Uygulama bunları okuyor ' +
      'ama şu an boşlar — TikTok bu yüzden hiç çalışmıyor.',
  },
  {
    id: 'contact',
    title: 'İletişim bağlantıları',
    blurb:
      'Ayarlar ekranındaki destek bağlantıları. Boş bırakılan bir bağlantı ' +
      'gizlenmez — kullanıcı düğmeye basınca hata görür.',
  },
  {
    id: 'legal',
    title: 'Yasal bağlantılar',
    blurb:
      'Uygulama içinde açılan adresler. Boş bırakılırsa uygulamaya gömülü ' +
      'adresler kullanılır.',
  },
  {
    id: 'paywall',
    title: 'Abonelik ekranı',
    blurb:
      'Paywall\'ın görünümü. Ürün kimlikleri App Store Connect\'tekiyle ' +
      'birebir aynı yazılmalı.',
  },
];

// ------------------------------- helpers --------------------------------

async function api(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = { error: `Sunucu yanıtı okunamadı (${res.status})` };
  }
  if (!res.ok) throw new Error(body.error || `Hata ${res.status}`);
  return body;
}

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const c of children) if (c) node.appendChild(c);
  return node;
}

// -------------------------------- login ---------------------------------

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#loginErr');
  err.hidden = true;
  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password: $('#pw').value }),
    });
    await enterApp();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

$('#logout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  location.reload();
});

$('#reload').addEventListener('click', () => loadConfig());

// --------------------------------- tabs ---------------------------------

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const want = btn.dataset.tab;
    $('#tab-edit').hidden = want !== 'edit';
    $('#tab-docs').hidden = want !== 'docs';
  });
});

// ------------------------------ rendering -------------------------------

function renderField(f, valueOverride) {
  const wrap = el('div', { class: 'field', 'data-key': f.key });

  const label = el('label', { class: 'name' });
  label.textContent = f.label + ' ';
  label.appendChild(el('span', { class: 'key', text: f.key }));
  label.setAttribute('for', `in-${f.key}`);
  wrap.appendChild(label);

  if (f.notWired) {
    wrap.appendChild(
      el('p', {
        class: 'notWired',
        text:
          'Uygulama bu anahtarı henüz okumuyor. Yayınlayabilirsin ama ' +
          'cihazlarda bir etkisi olmaz.',
      })
    );
  }

  if (f.help) wrap.appendChild(el('p', { class: 'help', text: f.help }));

  let input;
  const value =
    valueOverride !== undefined ? valueOverride : state.values[f.key] || '';

  if (f.type === 'tristate') {
    input = el('select', { id: `in-${f.key}` });
    // Three states, not a checkbox: "unset" is meaningfully different from
    // "false" -- unset means the app keeps its built-in default.
    [
      ['', `Ayarlanmamış — uygulama varsayılanı (${f.fallback})`],
      ['true', 'Açık (true)'],
      ['false', 'Kapalı (false)'],
    ].forEach(([v, t]) => {
      const o = el('option', { value: v, text: t });
      if (v === value) o.setAttribute('selected', 'selected');
      input.appendChild(o);
    });
  } else if (f.fromProducts) {
    // A list built from purchaseProductIds rather than a text box, so an id
    // that does not exist cannot be entered. Falls back to a text input when
    // the product list cannot be read.
    const store = storeProductIds();
    if (store) {
      input = el('select', { id: `in-${f.key}` });
      const options = [['', `Ayarlanmamış — ${f.fallback}`], ...[...store].map((id) => [id, id])];
      // An id published before it left the store keeps its place in the list,
      // flagged, so opening the section does not silently change it.
      if (value && !store.has(value)) options.push([value, `${value} — MAĞAZADA YOK`]);
      options.forEach(([v, t]) => {
        const o = el('option', { value: v, text: t });
        if (v === value) o.setAttribute('selected', 'selected');
        input.appendChild(o);
      });
    } else {
      input = el('input', { id: `in-${f.key}`, type: 'text', value });
    }
  } else if (f.type === 'productids') {
    input = el('input', { id: `in-${f.key}`, type: 'hidden', value });
    wrap.appendChild(input);
    wrap.appendChild(buildProductIds(f, input, value));
    input = null;
  } else if (f.planPicker) {
    // Tick to show, arrows or drag to order. The value still travels as the
    // comma-separated string the server validates and the app parses; only
    // the way it is edited changes.
    input = el('input', { id: `in-${f.key}`, type: 'hidden', value });
    wrap.appendChild(input);
    wrap.appendChild(buildPlanPicker(f, input, value));
    input = null; // already appended
  } else if (f.type === 'choice') {
    // A list, not a text box. A product id typed by hand is one letter away
    // from an offer that silently never appears -- the store returns nothing
    // for an id it does not know, and the panel cannot tell that from a
    // campaign the operator simply has not switched on yet.
    input = el('select', { id: `in-${f.key}` });
    // Mark the ids the store does not currently return. The hand-written list
    // cannot know that; purchaseProductIds can.
    const live = f.storeChecked ? storeProductIds() : null;
    [['', `Ayarlanmamış — ${f.fallback}`], ...(f.options || [])].forEach(
      (opt) => {
        const [v, t] = Array.isArray(opt) ? opt : [opt, opt];
        const missing = live && v !== '' && !live.has(v);
        const o = el('option', {
          value: v,
          text: missing ? `${t} — MAĞAZADA YOK` : t,
        });
        if (v === value) o.setAttribute('selected', 'selected');
        input.appendChild(o);
      }
    );
    if (f.storeChecked && live) {
      wrap.appendChild(
        el('p', {
          class: 'fallback',
          text:
            'Mağazada şu an olanlar: ' +
            [...live].join(', ') +
            '. "MAĞAZADA YOK" işaretli birini seçersen teklif hiç gösterilmez.',
        })
      );
    }
    // An id published before it was on the list -- or one added straight in
    // the Firebase console -- must not vanish from the form, or saving the
    // section would quietly wipe it.
    if (value && !input.querySelector(`option[value="${value}"]`)) {
      const o = el('option', {
        value,
        text: `${value} (listede yok — konsoldan gelmiş)`,
      });
      o.setAttribute('selected', 'selected');
      input.appendChild(o);
    }
  } else if (f.type === 'int') {
    input = el('input', {
      id: `in-${f.key}`,
      type: 'number',
      // Not `f.min || 1`: launchPaywallDelaySeconds has a legitimate min of 0,
      // and 0 is falsy.
      min: String(f.min === undefined ? 1 : f.min),
      value,
      placeholder: `boş = ${f.fallback}`,
    });
  } else if (f.masked) {
    // A secret, so it is not left legible on a screen someone may be
    // sharing. The value still travels: the operator has to be able to see
    // whether one is set before replacing it, and this panel is the only
    // place they can.
    // Its own binding, not `input`: that one is set to null below to say
    // "already placed", and the toggle's closure would capture the null.
    const secret = el('input', {
      id: `in-${f.key}`,
      type: 'password',
      autocapitalize: 'none',
      autocorrect: 'off',
      spellcheck: 'false',
      autocomplete: 'off',
      value,
      placeholder: `boş = ${f.fallback}`,
    });
    const reveal = el('button', {
      class: 'ghost tiny',
      type: 'button',
      text: 'Göster',
    });
    reveal.addEventListener('click', () => {
      const hidden = secret.type === 'password';
      secret.type = hidden ? 'text' : 'password';
      reveal.textContent = hidden ? 'Gizle' : 'Göster';
    });
    const row = el('div', { class: 'maskedRow' });
    row.appendChild(secret);
    row.appendChild(reveal);
    wrap.appendChild(row);
    input = null; // already placed
  } else if (f.type === 'email') {
    input = el('input', {
      id: `in-${f.key}`,
      type: 'email',
      autocapitalize: 'none',
      autocorrect: 'off',
      spellcheck: 'false',
      value,
      placeholder: 'destek@ornek.com',
    });
  } else if (f.type === 'url') {
    input = el('input', {
      id: `in-${f.key}`,
      type: 'url',
      value,
      placeholder: 'https://…',
    });
  } else if (f.type === 'version') {
    input = el('input', {
      id: `in-${f.key}`,
      type: 'text',
      inputmode: 'decimal',
      value,
      // A concrete example, not the fallback text: this field and the build
      // number below it get filled in the wrong order otherwise.
      placeholder: 'örn. 1.0.5',
    });
  } else if (f.type === 'id' || f.type === 'idlist') {
    input = el('input', {
      id: `in-${f.key}`,
      type: 'text',
      autocapitalize: 'none',
      autocorrect: 'off',
      spellcheck: 'false',
      value,
      placeholder:
        f.type === 'idlist' ? 'virgülle ayır: app_open,settings' : `boş = ${f.fallback}`,
    });
  } else if (f.type === 'jsonmap' || f.multiline) {
    input = el('textarea', {
      id: `in-${f.key}`,
      placeholder:
        f.type !== 'jsonmap'
          ? `boş = ${f.fallback}`
          : f.anyKeys
            ? '{\n  "interstitial": "ca-app-pub-…",\n  "appOpen": "ca-app-pub-…"\n}'
            : '{\n  "tr": { "title": "…", "body": "…" }\n}',
    });
    input.value = value;
  } else {
    input = el('input', {
      id: `in-${f.key}`,
      type: 'text',
      value,
      placeholder: `boş = ${f.fallback}`,
    });
  }

  if (input) wrap.appendChild(input);

  if (f.supportsCode) {
    wrap.appendChild(
      el('p', {
        class: 'fallback',
        text: '{code} yazdığın yere gerçek kod gelir. Yazmazsan kod alt satıra eklenir.',
      })
    );
  }

  wrap.appendChild(
    el('p', { class: 'fallback', text: `Boş bırakılırsa: ${f.fallback}` })
  );

  if (f.effect) {
    wrap.appendChild(el('p', { class: 'fallback', text: `Etkisi: ${f.effect}` }));
  }

  // A key the app does not read yet. Shown, but never dressed up as working:
  // a field that looks live and does nothing is worse than no field at all,
  // because the operator walks away believing they changed something.
  if (f.inert) {
    wrap.classList.add('inert');
    wrap.insertBefore(
      el('p', {
        class: 'inert-badge',
        text: `HENÜZ ÇALIŞMIYOR — ${f.inert}`,
      }),
      wrap.firstChild.nextSibling
    );
    if (input) {
      input.disabled = true;
      input.title = 'Bu anahtarı uygulama henüz okumuyor.';
    }
  }

  return wrap;
}

/**
 * Publish one group's keys, leaving every other key alone.
 *
 * The server only touches keys present in the request body, so sending just
 * this group's fields cannot disturb another group -- a blank field here
 * deletes its own key, not somebody else's.
 */
async function publishGroup(g, fields, btn, statusNode) {
  const values = {};
  for (const f of fields) {
    const node = document.getElementById(`in-${f.key}`);
    if (node) values[f.key] = node.value;
  }

  const blanks = fields.filter((f) => values[f.key] === '');
  const live = blanks.filter((f) => (state.values[f.key] || '') !== '');
  // Only warn about blanks that would actually delete something. Warning about
  // fields that are already unset would train the operator to click through.
  if (live.length) {
    const names = live.map((f) => `• ${f.label} — ${f.fallback}`).join('\n');
    const ok = confirm(
      `"${g.title}" bölümünde ${live.length} alan boş.\n\n` +
        `Yayınlarsan bu anahtarlar silinir ve uygulama şu varsayılanlara döner:\n\n` +
        names +
        '\n\nDevam edilsin mi?'
    );
    if (!ok) return;
  }

  btn.disabled = true;
  setGroupStatus(statusNode, 'Yayınlanıyor…', '');
  try {
    const res = await api('/api/config', {
      method: 'POST',
      body: JSON.stringify({ values, etag: state.etag }),
    });
    state.etag = res.etag;
    // Re-read so the form shows what is actually live -- including the keys
    // the server just deleted.
    await loadConfig();
    setGroupStatus(
      document.querySelector(`[data-groupstatus="${g.id}"]`),
      `${g.title}: yayınlandı. Kullanıcı uygulamayı tamamen kapatıp yeniden açtığında geçerli olur.`,
      'ok'
    );
  } catch (ex) {
    setGroupStatus(statusNode, ex.message, 'bad');
  } finally {
    btn.disabled = false;
  }
}

function setGroupStatus(node, text, cls) {
  if (!node) return;
  node.textContent = text;
  node.className = `status ${cls || ''}`;
}

/** Sections that actually have fields, in display order. */
function visibleGroups() {
  return GROUPS.filter((g) => state.fields.some((f) => f.group === g.id));
}

function showGroup(id) {
  state.activeGroup = id;
  document.querySelectorAll('#groups .group').forEach((box) => {
    box.hidden = box.dataset.group !== id;
  });
  document.querySelectorAll('.sideTab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.group === id);
  });
  // Remembered across the reload that follows a publish.
  try {
    location.hash = id;
  } catch (e) {
    /* hash is a convenience, not a requirement */
  }
}

function renderGroupTabs() {
  const nav = $('#groupTabs');
  nav.textContent = '';
  for (const g of visibleGroups()) {
    const count = state.fields.filter(
      (f) => f.group === g.id && (state.values[f.key] || '') !== ''
    ).length;
    const btn = el('button', {
      class: 'sideTab',
      type: 'button',
      'data-group': g.id,
    });
    btn.appendChild(el('span', { class: 'sideTabName', text: g.title }));
    // A section where nothing is wired up yet gets a marker, so the operator
    // can see it without opening the section.
    const groupFields = state.fields.filter((f) => f.group === g.id);
    if (groupFields.length && groupFields.every((f) => f.notWired)) {
      btn.appendChild(el('span', { class: 'sideTabSoon', text: 'yakında' }));
      btn.title = 'Uygulama bu bölümdeki anahtarları henüz okumuyor';
    }
    // A dot showing how many keys in this section are actually set, so the
    // operator can see what is configured without opening every section.
    if (count) {
      btn.appendChild(el('span', { class: 'sideTabCount', text: String(count) }));
    }
    btn.addEventListener('click', () => showGroup(g.id));
    nav.appendChild(btn);
  }
}

/**
 * Add/remove editor for the store product ids, per platform.
 *
 * The value is JSON, but nobody should be typing JSON: a stray bracket here
 * empties the paywall on every device, and the app has no fallback for this
 * key. So the braces are the panel's problem and the operator only ever sees
 * a list with a remove button and a box to add one.
 */
/**
 * Redraw the fields whose options come from purchaseProductIds, keeping the
 * value each one already holds.
 *
 * Cheaper and less surprising than re-rendering the section: re-rendering
 * would rebuild the product editor itself and lose the caret in its add box.
 */
function refreshProductDependents() {
  for (const f of state.fields) {
    if (!f.fromProducts && !f.planPicker) continue;
    const node = document.getElementById(`in-${f.key}`);
    if (!node) continue;
    const field = node.closest('.field');
    if (!field) continue;
    const value = node.value;
    const fresh = renderField({ ...f }, value);
    field.replaceWith(fresh);
  }
}

function buildProductIds(f, hidden, initial) {
  let data = { ios: [], android: [] };
  try {
    const parsed = JSON.parse(initial || '{}');
    for (const p of ['ios', 'android']) {
      if (Array.isArray(parsed[p])) {
        data[p] = parsed[p]
          .filter((x) => typeof x === 'string')
          .map((x) => x.trim())
          .filter((x) => x !== '');
      }
    }
  } catch (e) {
    // Unparseable is what this editor exists to prevent; start from empty
    // and let the operator rebuild rather than showing them broken JSON.
  }

  const box = el('div', { class: 'planPicker' });

  function sync() {
    hidden.value = JSON.stringify(data);
    draw();
    // The plan picker and the two product dropdowns are built from this
    // list. Leaving them stale means an id can be added and then not be
    // selectable in the field right below it.
    refreshProductDependents();
  }

  function draw() {
    box.textContent = '';
    for (const platform of ['ios', 'android']) {
      const title = platform === 'ios' ? 'iOS (App Store)' : 'Android (Google Play)';
      box.appendChild(el('div', { class: 'platformHead', text: title }));

      if (!data[platform].length) {
        box.appendChild(
          el('div', { class: 'planRow off' }, el('span', {
            class: 'planName',
            text: '(bu platformda ürün yok)',
          }))
        );
      }

      data[platform].forEach((id, i) => {
        const line = el('div', { class: 'planRow' });
        line.appendChild(el('span', { class: 'planName', text: id }));
        const up = el('button', { type: 'button', class: 'ghost tiny', text: '↑' });
        const down = el('button', { type: 'button', class: 'ghost tiny', text: '↓' });
        const del = el('button', { type: 'button', class: 'ghost tiny', text: 'Sil' });
        up.disabled = i === 0;
        down.disabled = i === data[platform].length - 1;
        up.addEventListener('click', () => {
          const l = data[platform];
          [l[i - 1], l[i]] = [l[i], l[i - 1]];
          sync();
        });
        down.addEventListener('click', () => {
          const l = data[platform];
          [l[i + 1], l[i]] = [l[i], l[i + 1]];
          sync();
        });
        del.addEventListener('click', () => {
          data[platform] = data[platform].filter((x) => x !== id);
          sync();
        });
        line.appendChild(up);
        line.appendChild(down);
        line.appendChild(del);
        box.appendChild(line);
      });

      const addRow = el('div', { class: 'planRow addRow' });
      const field = el('input', {
        type: 'text',
        placeholder: platform === 'ios' ? 'örn. yearly' : 'örn. yearly',
        autocapitalize: 'none',
        autocorrect: 'off',
        spellcheck: 'false',
      });
      const add = el('button', { type: 'button', class: 'ghost tiny', text: 'Ekle' });
      const commit = () => {
        const id = field.value.trim();
        if (!id) return;
        if (!/^[A-Za-z0-9._:-]{1,120}$/.test(id)) {
          setStatus(`"${id}" geçersiz — sadece harf, rakam ve . _ : - kullan`, 'bad');
          return;
        }
        if (data[platform].includes(id)) {
          setStatus(`"${id}" bu listede zaten var`, 'bad');
          return;
        }
        data[platform].push(id);
        field.value = '';
        sync();
      };
      add.addEventListener('click', commit);
      // Enter must not submit anything; there is no form, but a stray
      // keypress reaching the page would be surprising.
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      });
      addRow.appendChild(field);
      addRow.appendChild(add);
      box.appendChild(addRow);
    }

    const total = data.ios.length + data.android.length;
    box.appendChild(
      el('p', {
        class: total ? 'fallback' : 'notWired',
        text: total
          ? `Uygulama mağazadan bu ${total} ürünü soracak.`
          : 'HİÇ ÜRÜN YOK — bu haliyle yayınlarsan abonelik ekranı bomboş ' +
            'açılır. Sunucu bunu reddedecek.',
      })
    );
  }

  draw();
  return box;
}

/**
 * Pick-and-order editor for a list of product ids.
 *
 * Every row is a product the store returns, read from purchaseProductIds, so
 * the operator cannot name one that does not exist. Ticked rows sort to the
 * top in their chosen order; unticked ones sit below, greyed, and can be
 * pulled back in.
 *
 * Falls back to a plain text box when the store list cannot be read -- better
 * a comma-separated string than an editor with no rows in it.
 */
function buildPlanPicker(f, hidden, initial) {
  const store = storeProductIds();
  if (!store) {
    const box = el('input', {
      type: 'text',
      value: initial,
      placeholder: 'virgülle ayır: weekly,6_month',
    });
    box.addEventListener('input', () => {
      hidden.value = box.value;
    });
    return box;
  }

  const known = [...store];
  const wanted = initial
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x !== '');
  const chosen = wanted.filter((id) => store.has(id));
  // Ids the console holds that the store does not sell. They cannot be shown
  // as rows -- there is no product to tick -- but dropping them silently
  // would delete them from the config the first time the operator touched
  // anything here, with nothing on screen to say so.
  const orphans = wanted.filter((id) => !store.has(id));
  // Chosen first in their order, then the rest.
  let rows = [
    ...chosen.map((id) => ({ id, on: true })),
    ...known.filter((id) => !chosen.includes(id)).map((id) => ({ id, on: false })),
  ];

  const list = el('div', { class: 'planPicker' });

  function sync() {
    hidden.value = rows.filter((r) => r.on).map((r) => r.id).join(',');
    draw();
  }

  function move(from, to) {
    if (to < 0 || to >= rows.length) return;
    const [row] = rows.splice(from, 1);
    rows.splice(to, 0, row);
    sync();
  }

  function draw() {
    list.textContent = '';
    rows.forEach((row, i) => {
      const line = el('div', {
        class: `planRow${row.on ? '' : ' off'}`,
        draggable: 'true',
      });

      const tick = el('input', { type: 'checkbox' });
      tick.checked = row.on;
      tick.addEventListener('change', () => {
        row.on = tick.checked;
        // A row just switched on belongs at the end of the shown ones, not
        // wherever it happened to sit among the unticked.
        if (row.on) {
          rows = rows.filter((r) => r !== row);
          const lastOn = rows.map((r) => r.on).lastIndexOf(true);
          rows.splice(lastOn + 1, 0, row);
        }
        sync();
      });
      line.appendChild(tick);

      line.appendChild(el('span', { class: 'planName', text: row.id }));

      const up = el('button', { type: 'button', class: 'ghost tiny', text: '↑' });
      const down = el('button', { type: 'button', class: 'ghost tiny', text: '↓' });
      up.disabled = i === 0;
      down.disabled = i === rows.length - 1;
      up.addEventListener('click', () => move(i, i - 1));
      down.addEventListener('click', () => move(i, i + 1));
      line.appendChild(up);
      line.appendChild(down);

      // Drag to reorder, for the same job as the arrows.
      line.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(i));
        line.classList.add('dragging');
      });
      line.addEventListener('dragend', () => line.classList.remove('dragging'));
      line.addEventListener('dragover', (e) => e.preventDefault());
      line.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (!Number.isInteger(from)) return;
        move(from, i);
      });

      list.appendChild(line);
    });

    const on = rows.filter((r) => r.on);
    list.appendChild(
      el('p', {
        class: 'fallback',
        text: on.length
          ? `Ekranda bu sırayla görünecek: ${on.map((r) => r.id).join(' → ')}`
          : 'Hiçbiri işaretli değil — mağazadaki tüm planlar süreye göre sıralanır.',
      })
    );
    if (orphans.length) {
      list.appendChild(
        el('p', {
          class: 'notWired',
          text:
            `Kayıtlı değerde mağazada olmayan ${orphans.length} kimlik var: ` +
            orphans.join(', ') +
            '. Uygulama bunları zaten yok sayıyor. Burada bir şey değiştirip ' +
            'yayınlarsan kayıttan da silinirler.',
        })
      );
    }
  }

  draw();
  return list;
}

/**
 * A warning about the values as they stand, not about a single field.
 *
 * Presentation mode is the case that needs it: isFeaturesClose is an OR, so
 * a master switch left on makes the version fields do nothing at all. Filling
 * them in carefully and seeing no change is a confusing way to find that out,
 * and neither field can say it on its own -- it depends on the other key.
 */
function groupWarning(groupId) {
  if (groupId !== 'presentation') return null;
  const v = state.values || {};
  const master = (v.isAllFeatureClosed || '').trim().toLowerCase() === 'true';
  const targeted = (v.appVersion || '').trim() !== '' ||
    (v.appBuildNumber || '').trim() !== '';

  if (master && targeted) {
    return (
      'Ana anahtar AÇIK olduğu için sunum modu ŞU AN HERKESTE etkin — ' +
      'aşağıdaki hedef sürüm ve build alanlarının hiçbir etkisi yok. ' +
      'Sadece o sürümde açmak istiyorsan "Sunum modu"nu Kapalı yap; ' +
      'hedefleme ancak o zaman devreye girer.'
    );
  }
  if (master) {
    return 'Sunum modu şu an HERKESTE açık — bütün sürümlerde, bütün kullanıcılarda.';
  }
  const both = (v.appVersion || '').trim() !== '' &&
    (v.appBuildNumber || '').trim() !== '';
  if (targeted && !both) {
    return (
      'Hedef sürüm ve hedef build numarasından yalnızca biri dolu. ' +
      'İkisi birden dolu olmadan sürüm bazlı açma çalışmaz — hiçbir ' +
      'cihazda devreye girmez.'
    );
  }
  if (both) {
    return (
      `Sunum modu şu an yalnızca ${v.appVersion} (build ${v.appBuildNumber}) ` +
      'sürümünde açık. Diğer sürümler normal uygulamayı görür.'
    );
  }
  return null;
}

function renderGroups() {
  const host = $('#groups');
  host.textContent = '';
  for (const g of GROUPS) {
    const fields = state.fields.filter((f) => f.group === g.id);
    if (!fields.length) continue;
    const box = el('section', { class: 'group', 'data-group': g.id });

    const head = el('div', { class: 'groupHead' });
    head.appendChild(el('h2', { text: g.title }));
    box.appendChild(head);

    box.appendChild(el('p', { class: 'muted', text: g.blurb }));

    const liveWarning = groupWarning(g.id);
    if (liveWarning) {
      box.appendChild(el('div', { class: 'liveWarn', text: liveWarning }));
    }

    if (fields.every((f) => f.notWired)) {
      box.appendChild(
        el('div', {
          class: 'notWiredBanner',
          text:
            'Bu bölümdeki anahtarların hiçbirini uygulama henüz okumuyor. ' +
            'Değerleri şimdiden hazırlayabilirsin; uygulama tarafı yazıldığında ' +
            'devreye girerler.',
        })
      );
    }

    fields.forEach((f) => box.appendChild(renderField(f)));

    // Actions at the foot of the section, where the operator ends up after
    // reading it. Each group publishes only its own keys.
    const foot = el('div', { class: 'groupFoot' });
    const pub = el('button', {
      class: 'small',
      type: 'button',
      title: `Sadece "${g.title}" anahtarlarını yayınlar`,
      text: 'Bu bölümü yayınla',
    });
    const reset = el('button', {
      class: 'ghost small',
      type: 'button',
      title: `"${g.title}" bölümündeki alanları boşaltır`,
      text: 'Sıfırla',
    });
    const st = el('span', { class: 'status', 'data-groupstatus': g.id });

    // Say when this section holds edits that are not published. Without it a
    // change looks saved -- a product appears in a list, a box is ticked --
    // and a reload silently takes it back.
    const markDirty = () => {
      const changed = fields.filter((f) => {
        const node = document.getElementById(`in-${f.key}`);
        if (!node) return false;
        return node.value !== (state.values[f.key] || '');
      });
      st.textContent = changed.length
        ? `${changed.length} değişiklik yayınlanmadı`
        : '';
      st.className = `status ${changed.length ? 'dirty' : ''}`;
    };
    box.addEventListener('input', markDirty);
    box.addEventListener('change', markDirty);
    // The product editor and the plan picker change values from buttons,
    // which fire neither event on the section.
    box.addEventListener('click', (e) => {
      if (e.target.closest('button')) setTimeout(markDirty, 0);
    });

    pub.addEventListener('click', () => publishGroup(g, fields, pub, st));
    reset.addEventListener('click', () => {
      clearFields(fields);
      setGroupStatus(
        st,
        'Alanlar boşaltıldı. Uygulamak için yayınla, vazgeçmek için Yenile.',
        ''
      );
    });

    foot.appendChild(pub);
    foot.appendChild(reset);
    foot.appendChild(st);
    box.appendChild(foot);

    host.appendChild(box);
  }

  renderGroupTabs();

  const groups = visibleGroups();
  const wanted =
    state.activeGroup || location.hash.replace('#', '') || (groups[0] && groups[0].id);
  const exists = groups.some((g) => g.id === wanted);
  showGroup(exists ? wanted : groups[0] && groups[0].id);
}

function renderProtected(protectedState) {
  const body = $('#protectedTable').querySelector('tbody');
  body.textContent = '';
  for (const p of state.protected) {
    const tr = el('tr');
    tr.appendChild(el('td', { text: p.key }));
    tr.appendChild(el('td', { text: protectedState[p.key] || '(boş)' }));
    tr.appendChild(el('td', { text: p.why }));
    body.appendChild(tr);
  }
}

function renderDocs() {
  const host = $('#docFields');
  host.textContent = '';
  for (const g of GROUPS) {
    const fields = state.fields.filter((f) => f.group === g.id);
    if (!fields.length) continue;
    host.appendChild(el('h3', { text: g.title }));
    for (const f of fields) {
      const d = el('div', { class: 'docField' });
      const h = el('h3');
      h.appendChild(document.createTextNode(f.label + ' '));
      h.appendChild(el('code', { text: f.key }));
      if (f.notWired) h.appendChild(el('span', { class: 'soonTag', text: 'yakında' }));
      d.appendChild(h);
      if (f.help) d.appendChild(el('p', { text: f.help }));
      d.appendChild(el('p', { class: 'muted', text: `Boş bırakılırsa: ${f.fallback}` }));
      if (f.effect) d.appendChild(el('p', { class: 'muted', text: `Etkisi: ${f.effect}` }));
      host.appendChild(d);
    }
  }
}

// ------------------------------ load / save ------------------------------

async function loadConfig() {
  setStatus('Yükleniyor…', '');
  try {
    const data = await api('/api/config');
    state.values = data.values;
    state.etag = data.etag;
    // Before renderGroups: the offer product list checks purchaseProductIds
    // to mark ids the store does not return, and reads it from here.
    state.protectedState = data.protectedState || {};
    renderGroups();
    renderProtected(state.protectedState);
    const v = data.version;
    $('#versionLine').textContent = v
      ? `Son yayın: ${v.updateTime || '?'} · ${v.updateUser?.email || ''}`
      : 'Firebase Remote Config';
    setStatus('', '');
  } catch (ex) {
    setStatus(ex.message, 'bad');
  }
}

/**
 * Blank the given fields in the form. Nothing is published here: the operator
 * still has to press Yayınla, so a mis-click is undone by pressing Yenile.
 */
function clearFields(fields) {
  for (const f of fields) {
    const node = document.getElementById(`in-${f.key}`);
    if (!node) continue;
    node.value = '';
    // A <select> with no matching option would keep showing the old label.
    if (node.tagName === 'SELECT') node.selectedIndex = 0;
  }
}

$('#resetAll').addEventListener('click', () => {
  const filled = state.fields.filter((f) => {
    const node = document.getElementById(`in-${f.key}`);
    return node && node.value !== '';
  });
  if (!filled.length) {
    setStatus('Zaten hepsi boş — sıfırlanacak bir şey yok.', '');
    return;
  }
  // Only one section is on screen, so a bare count would be misleading: most
  // of what this clears is in sections the operator cannot currently see.
  // Name them.
  const byGroup = new Map();
  for (const f of filled) {
    byGroup.set(f.group, (byGroup.get(f.group) || 0) + 1);
  }
  const title = (id) => {
    const g = GROUPS.find((x) => x.id === id);
    return g ? g.title : id;
  };
  const breakdown = [...byGroup.entries()]
    .map(([id, n]) => `• ${title(id)} — ${n} alan`)
    .join('\n');

  const ok = confirm(
    `${filled.length} alan boşaltılacak, ${byGroup.size} bölümde:\n\n` +
      breakdown +
      '\n\nBunların çoğu şu an ekranda görünmeyen bölümlerde olabilir.\n\n' +
      'Bu, formu temizler — Firebase\'e hemen dokunmaz. "Hepsini yayınla"ya ' +
      'basarsan bu anahtarlar Remote Config\'ten silinir ve uygulama her biri ' +
      'için kendi varsayılanına döner.\n\n' +
      'Vazgeçersen "Yenile" ile canlı değerleri geri getirebilirsin.'
  );
  if (!ok) return;
  clearFields(state.fields);
  setStatus(
    `${filled.length} alan boşaltıldı. Uygulamak için Yayınla, vazgeçmek için Yenile.`,
    ''
  );
});

function collect() {
  const out = {};
  for (const f of state.fields) {
    const node = document.getElementById(`in-${f.key}`);
    if (node) out[f.key] = node.value;
  }
  return out;
}

function setStatus(text, cls) {
  const s = $('#status');
  s.textContent = text;
  s.className = `status ${cls || ''}`;
}

$('#save').addEventListener('click', async () => {
  const btn = $('#save');

  // Same problem as reset-all: this publishes sections that are not on
  // screen, and a blank field there deletes a live key. Say which.
  const willDelete = state.fields.filter((f) => {
    const node = document.getElementById(`in-${f.key}`);
    return node && node.value === '' && (state.values[f.key] || '') !== '';
  });
  if (willDelete.length) {
    const names = willDelete
      .map((f) => `• ${f.label} — ${f.fallback}`)
      .join('\n');
    const ok = confirm(
      `Tüm bölümler yayınlanacak. ${willDelete.length} anahtar silinecek ` +
        've uygulama şu varsayılanlara dönecek:\n\n' +
        names +
        '\n\nDevam edilsin mi?'
    );
    if (!ok) return;
  }

  btn.disabled = true;
  setStatus('Yayınlanıyor…', '');
  try {
    const res = await api('/api/config', {
      method: 'POST',
      body: JSON.stringify({ values: collect(), etag: state.etag }),
    });
    state.etag = res.etag;
    setStatus(res.note || 'Yayınlandı.', 'ok');
    // Re-read so the page shows exactly what is live, including keys the
    // server deleted because they were left blank.
    await loadConfig();
    setStatus(res.note || 'Yayınlandı.', 'ok');
  } catch (ex) {
    setStatus(ex.message, 'bad');
  } finally {
    btn.disabled = false;
  }
});

// -------------------------------- boot ----------------------------------

async function enterApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  const schema = await api('/api/schema');
  state.fields = schema.fields;
  state.protected = schema.protected;
  renderDocs();
  await loadConfig();
}

(async function boot() {
  try {
    const s = await api('/api/session');
    if (s.authed) await enterApp();
  } catch (e) {
    /* not signed in; the login gate is already showing */
  }
})();
