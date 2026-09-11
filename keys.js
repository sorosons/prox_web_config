'use strict';

/**
 * The Remote Config keys this panel is allowed to write, and what each one
 * does.
 *
 * This list is also the safety boundary. The panel refuses to write any key
 * not named here, which is what keeps it away from the version-targeted
 * kill switch (appVersion / appBuildNumber) and the secrets
 * (geminiApiKey, oneSignalRestApiKey, purchaseProductIds). Those stay in the
 * Firebase console where they belong -- an operator changing notification
 * copy has no business being one mis-click from disabling the whole app.
 *
 * `notWired: true` marks a key the app does not read yet. The panel will
 * happily publish it -- Remote Config accepts anything -- but nothing on a
 * device will change, so the UI says so rather than letting an operator set
 * a value and then hunt for why it had no effect. Remove the flag from a key
 * once configs_helper.dart has a getter for it.
 *
 * `fallback` documents what the APP does when the key is absent or blank.
 * That is not the same as a default value: the panel never writes a key just
 * because it has a fallback, because "absent" is a meaningful state the app
 * reads as "keep today's behaviour".
 */

const TRISTATE = 'tristate';
const TEXT = 'text';
const INT = 'int';
const JSON_MAP = 'jsonmap';
const LANG = 'lang';
// Added for the feature-flag keys. Each exists because the plain TEXT type
// would happily accept a value the app cannot parse, and a config panel that
// lets you publish an unparseable value is a panel that breaks production.
const VERSION = 'version';   // "1.4.2" -- compared against the running build
const URL = 'url';           // https:// only; these are opened in a webview
const ID = 'id';             // a single store product id
const ID_LIST = 'idlist';    // comma-separated ids, order is meaningful
const CHOICE = 'choice';     // one of field.options
const EMAIL = 'email';       // mailto: target for the support link
const PRODUCT_IDS = 'productids'; // {"ios": [...], "android": [...]}
// Free-form JSON object. JSON_MAP is not usable for these: it requires either
// language-code keys or (with anyKeys) flat string values, and a demo-chat
// payload is neither -- it nests an array of message objects. TEXT would take
// an unparseable value and the app would throw on jsonDecode at startup.
const JSON_OBJ = 'jsonobj';

const FIELDS = [
  // ------------------------- Pairing-code notification -------------------------
  {
    key: 'linkCodeNotifEnabled',
    type: TRISTATE,
    group: 'link',
    label: 'Eşleşme kodu bildirimi',
    fallback: 'açık',
    help:
      'WhatsApp eşleşme kodunu kilit ekranına koyan bildirim; kullanıcı ' +
      'WhatsApp’ın içindeyken kodu buradan okuyor. Boş bırakırsan açık kalır. ' +
      'false yaparsan gizlenir ve o an ekranda duran kopya da kaldırılır.',
    effect:
      'false → yeni kod üretildiğinde bildirim gösterilmez ve ekrandaki eski ' +
      'kopya kaldırılır. HEMEN kaybolmaz: o an kilit ekranında duran bir kod, ' +
      'kullanıcı uygulamayı kapatıp yeni kod isteyene kadar orada kalır. ' +
      'Kod her hâlükârda uygulamada görünür ve panoya kopyalanır.',
  },
  {
    key: 'linkCodeNotifTitle',
    type: TEXT,
    group: 'link',
    label: 'Başlık',
    fallback: 'her kullanıcının kendi dilinde “Bağlantı kodun”',
    help:
      'Boş bırakırsan uygulamayla gelen çeviri kullanılır ve herkes kendi ' +
      'dilinde görür. Buraya yazdığın metin TÜM dillere gider.',
  },
  {
    key: 'linkCodeNotifBody',
    type: TEXT,
    group: 'link',
    multiline: true,
    supportsCode: true,
    fallback: 'kod, ardından uygulamanın “Bu kodu WhatsApp’a girin” metni',
    label: 'Gövde',
    help:
      'Eşleşme kodunun görüneceği yere {code} yaz, örneğin ' +
      '“Lütfen {code} girin”. {code} yazmazsan kod yine de alt satıra ' +
      'eklenir — bu bildirimin tek işi kodu taşımak.',
  },
  {
    key: 'linkCodeNotifLocalized',
    type: JSON_MAP,
    group: 'link',
    supportsCode: true,
    label: 'Dile göre metin',
    fallback: 'yok — yukarıdaki tek başlık/gövde her dil için kullanılır',
    help:
      'Belirli diller için yukarıdaki başlık/gövdeyi ezer. Bölge etiketleri ' +
      'temel dile eşleşir, yani "pt" girdisi pt_BR cihazları da kapsar. ' +
      'Biçim: {"tr": {"title": "...", "body": "..."}, "en": {...}}',
    effect:
      'Bu alan elle yazılan JSON\'dur. Tek bir virgül veya tırnak hatasında ' +
      'uygulama TÜM listeyi sessizce yok sayar ve herkes yukarıdaki tek ' +
      'başlık/gövdeyi görür — cihazda hiçbir hata mesajı çıkmaz. ' +
      'Yayınladıktan sonra kendi telefonunda mutlaka kontrol et.',
  },

  // ---------------------------- Shared ----------------------------
  {
    key: 'notifLanguage',
    type: LANG,
    group: 'shared',
    label: 'Bildirim dilini sabitle (dikkat)',
    fallback: 'cihazın / uygulamanın dili — normalde bunu istersin',
    help:
      'İki bildirimi de etkiler. Boş bırakırsan herkes kendi dilinde görür — ' +
      'normalde istediğin budur.',
    effect:
      'Doldurursan DÜNYADAKİ HERKES bu dili görür: Almanya\'daki kullanıcı da, ' +
      'Hindistan\'daki de. Sadece o dili okuyamayan kullanıcın olmadığından ' +
      'eminsen doldur.',
  },

  // --------------------------- Free-user reminder ---------------------------
  {
    key: 'freeNotifEnabled',
    type: TRISTATE,
    group: 'free',
    label: 'Ücretsiz kullanıcı hatırlatıcısı',
    fallback: 'kapalı',
    help:
      'Sadece abone olmayan ve deneme sürümünde olmayan kullanıcılara gösterilir. ' +
      'Sen açmadıkça kapalıdır.',
    effect:
      'true → ücretsiz kullanıcılar aşağıdaki takvime göre hatırlatma almaya ' +
      'başlar. Abonelere ve deneme kullanıcılarına asla gitmez; biri abone ' +
      'olduğu anda durur.',
  },
  {
    key: 'freeNotifTitle',
    type: TEXT,
    group: 'free',
    label: 'Başlık',
    fallback: 'her kullanıcının kendi dilinde “Her şeyin kilidini aç”',
    help:
      'Boş bırakırsan uygulamayla gelen çeviri kullanılır ve herkes kendi ' +
      'dilinde görür. Buraya bir şey yazarsan o metin TÜM dillerdeki ' +
      'kullanıcılara gider — Türkçe yazarsan İngiliz kullanıcın da Türkçe ' +
      'görür. Dile göre farklı metin için aşağıdaki "Dile göre metin"i kullan.',
  },
  {
    key: 'freeNotifBody',
    type: TEXT,
    group: 'free',
    multiline: true,
    label: 'Gövde',
    fallback:
      'her kullanıcının kendi dilinde “Silinen mesajları, düzenlemeleri ve tek görüntülük medyayı görmek için premium’a geç.”',
    help:
      'Boş bırakırsan uygulamayla gelen çeviri kullanılır. Buraya yazdığın ' +
      'metin TÜM dillere gider.',
  },
  {
    key: 'freeNotifLocalized',
    type: JSON_MAP,
    group: 'free',
    label: 'Dile göre metin',
    fallback: 'yok — yukarıdaki tek başlık/gövde her dil için kullanılır',
    help:
      'Eşleşme kodundaki "Dile göre metin" ile aynı biçim: ' +
      '{"tr": {"title": "...", "body": "..."}, "en": {...}}',
    effect:
      'Elle yazılan JSON. Tek bir yazım hatasında uygulama TÜM listeyi ' +
      'sessizce yok sayar; cihazda hata görünmez.',
  },
  {
    key: 'freeNotifInitialDelayHours',
    type: INT,
    group: 'free',
    label: 'İlk hatırlatmadan önce beklenecek süre (saat)',
    fallback: '24',
    min: 1,
    help:
      'Kullanıcının uygulamayı SON açtığı andan itibaren sayılır. Uygulamayı ' +
      'her açışında alarm sıfırlanıp yeniden kurulur, yani bildirim ancak ' +
      'kullanıcı bu kadar süre uğramazsa gider.',
    effect:
      'Uygulamayı kullanmayı sürdüren birine hiç gitmez — amaç bırakanı geri ' +
      'çağırmak. Test ederken kısa bir değer yaz, uygulamayı kapat ve bekle; ' +
      'açık tutarsan hiçbir zaman gelmez.',
  },
  {
    key: 'freeNotifIntervalHours',
    type: INT,
    group: 'free',
    label: 'Hatırlatmalar arası süre (saat)',
    fallback: '48',
    min: 1,
    help: 'Bir hatırlatma ile bir sonraki arasındaki en kısa süre.',
  },
  {
    key: 'freeNotifMaxCount',
    type: INT,
    group: 'free',
    label: 'Kullanıcı başına toplam hatırlatma',
    fallback: '3',
    min: 1,
    help:
      'Ömür boyu geçerli kesin sınır. Bir kullanıcı bu sayıya ulaştıysa ' +
      'kampanyayı uzatsan bile bir daha hatırlatma almaz.',
  },
  {
    key: 'freeNotifCampaignDays',
    type: INT,
    group: 'free',
    label: 'Kampanya penceresi (gün)',
    fallback: '14',
    min: 1,
    help:
      'Her kullanıcının KENDİ ilk açılışından itibaren sayılır. Bu kadar gün ' +
      'geçtikten sonra kaç tane gönderilmiş olursa olsun hatırlatma durur.',
    effect:
      'DİKKAT — en sık yaşanan yanılgı bu: kampanyayı bugün açarsan, ' +
      'uygulamayı 14 günden önce kurmuş kullanıcılara HİÇ gitmez, çünkü ' +
      'onların penceresi çoktan kapandı. Sadece son 14 gün içinde kurmuş ' +
      'olanlar ve yeni kullanıcılar alır. Eski kullanıcılara da ulaşmak ' +
      'istiyorsan bu sayıyı büyüt (örneğin 3650 = ~10 yıl).',
  },

  // --------------------------- Forced update ---------------------------
  // Deliberately separate from the appVersion/appBuildNumber kill switch.
  // That one closes a specific build; this one asks the user to move forward.
  {
    key: 'minSupportedVersion',
    type: VERSION,
    group: 'update',
    label: 'En düşük desteklenen sürüm',
    fallback: 'yok — hiçbir sürüm eski sayılmaz',
    help:
      'Uygulamanın sürümü bundan düşükse kullanıcı güncelleme ekranını görür. ' +
      '"1.4.2" biçiminde yaz. Boş bırakırsan kimseye güncelleme sorulmaz.',
    effect:
      'Bu değeri mağazadaki güncel sürümün ÜSTÜNE yazarsan herkes kilitlenir — ' +
      'indirilecek sürüm yok, çıkış da yok. Her zaman yayında olan bir sürüm yaz.',
  },
  {
    key: 'forceUpdate',
    type: TRISTATE,
    group: 'update',
    label: 'Güncelleme zorunlu olsun',
    fallback: 'kapalı — ekran kapatılabilir',
    help:
      'Kapalıyken güncelleme ekranı "sonra" ile geçilebilir. Açıkken ' +
      'geçilemez; kullanıcı güncellemeden uygulamayı kullanamaz.',
    effect:
      'true → sadece sürümü minSupportedVersion altında kalanlar kilitlenir. ' +
      'minSupportedVersion boşsa bu ayarın tek başına bir etkisi yoktur.',
  },
  {
    key: 'updateMessage',
    type: TEXT,
    group: 'update',
    multiline: true,
    label: 'Güncelleme ekranı metni',
    fallback: 'uygulamanın kendi çevirisi',
    help:
      'Bu sürümde neyin düzeldiğini yazmak istersen kullan. Boş bırakırsan ' +
      'uygulamayla gelen çeviri görünür — genel bir metin için doldurma.',
  },

  // ------------------------- Feature kill switches -------------------------
  {
    key: 'featureDualChatEnabled',
    notWired: true,
    inert:
      'prox bu isi kendi anahtariyla yapiyor: showWebviewAndStatus. Ikinci bir kapi onunla cakisirdi.',
    type: TRISTATE,
    group: 'features',
    label: 'İkili sohbet',
    fallback: 'açık',
    help:
      'Uygulamanın ana özelliği. Sadece bir aksaklıkta geçici olarak ' +
      'kapatmak için var.',
    effect: 'false → özellik menüde görünmez veya bakım metni gösterir.',
  },
  {
    key: 'featureStatusEnabled',
    notWired: true,
    inert:
      'prox bu isi kendi anahtariyla yapiyor: showWebviewAndStatus. Ikinci bir kapi onunla cakisirdi.',
    type: TRISTATE,
    group: 'features',
    label: 'Durum (status) özelliği',
    fallback: 'açık',
    help: 'Durum görüntüleme/kaydetme özelliğini kapatır.',
    effect:
      "false → Durum sekmesi yerinde kalır ama içinde 'kullanılamıyor' " +
      'ekranı görünür. Kayıtlı durumlar silinmez, true yapınca geri gelir.',
  },
  {
    key: 'featureAiChatEnabled',
    notWired: true,
    inert:
      'prox\'ta yapay zeka sohbeti diye bir ozellik yok; kapatilacak bir sey de yok.',
    type: TRISTATE,
    group: 'features',
    label: 'Yapay zekâ sohbeti',
    fallback: 'açık',
    help:
      'Gemini tarafı pahalı veya kotası dolduysa buradan kapatabilirsin. ' +
      'Kapatmak fatura kesmenin en hızlı yolu.',
    effect:
      "false → Yapay zekâ sekmesi yerinde kalır ama içinde 'kullanılamıyor' " +
      'ekranı görünür. Gemini maliyeti aniden artarsa faturayı kesmenin ' +
      'en hızlı yolu budur.',
  },
  {
    key: 'aiChatDailyLimit',
    notWired: true,
    inert:
      'prox\'ta yapay zeka sohbeti diye bir ozellik yok; sinirlanacak bir sey de yok.',
    type: INT,
    group: 'features',
    label: 'Günlük yapay zekâ mesaj hakkı',
    fallback: '1',
    min: 1,
    help:
      'Kullanıcı başına günlük mesaj sayısı. Boş bırakırsan sınır yoktur — ' +
      'maliyet kontrolü istiyorsan bir sayı gir.',
    effect:
      'Sınıra ulaşan kullanıcı ertesi güne kadar bekler. Aboneler için de ' +
      'geçerlidir, düşük bir sayı şikâyet getirir.',
  },

  // --------------------- Free-user access to screens ---------------------
  //
  // Whether a non-subscriber may use a screen, or gets the "go premium"
  // overlay on top of it. All four default to closed, which is what the app
  // ships: opening one is a deliberate experiment, not something a missing
  // key should do by itself.
  {
    key: 'freeUserDualChatEnabled',
    type: TRISTATE,
    group: 'freeAccess',
    label: 'İkili sohbet (WhatsApp Web)',
    fallback: 'kapalı — ücretsiz kullanıcı premium ekranını görür',
    help:
      'Uygulamanın ana ekranı. Açarsan ücretsiz kullanıcı WhatsApp Web sayfasını doğrudan kullanabilir. Kapalıyken ekranın üstünde ' +
      'premium kaplaması durur ve içerik kullanılamaz.',
    effect:
      'true → ücretsiz kullanıcı bu ekranı serbestçe kullanır. Abonelik ' +
      'satışını doğrudan etkiler: kullanıcı kazanmak için açılır, dönüşüm ' +
      'için kapatılır. Abonelere ve deneme kullanıcılarına zaten açık, ' +
      'bu ayar onları etkilemez.',
  },
  {
    key: 'freeUserChatsEnabled',
    type: TRISTATE,
    group: 'freeAccess',
    label: 'Sohbetler',
    fallback: 'kapalı — ücretsiz kullanıcı premium ekranını görür',
    help:
      'Yakalanan sohbet geçmişi ekranı. Kapalıyken ekranın üstünde ' +
      'premium kaplaması durur ve içerik kullanılamaz.',
    effect:
      'true → ücretsiz kullanıcı bu ekranı serbestçe kullanır. Abonelik ' +
      'satışını doğrudan etkiler: kullanıcı kazanmak için açılır, dönüşüm ' +
      'için kapatılır. Abonelere ve deneme kullanıcılarına zaten açık, ' +
      'bu ayar onları etkilemez.',
  },
  {
    key: 'freeUserStatusEnabled',
    type: TRISTATE,
    group: 'freeAccess',
    label: 'Durum',
    fallback: 'kapalı — ücretsiz kullanıcı premium ekranını görür',
    help:
      'Durum görüntüleme ve kaydetme ekranı. Kapalıyken ekranın üstünde ' +
      'premium kaplaması durur ve içerik kullanılamaz.',
    effect:
      'true → ücretsiz kullanıcı bu ekranı serbestçe kullanır. Abonelik ' +
      'satışını doğrudan etkiler: kullanıcı kazanmak için açılır, dönüşüm ' +
      'için kapatılır. Abonelere ve deneme kullanıcılarına zaten açık, ' +
      'bu ayar onları etkilemez.',
  },
  {
    key: 'freeUserProfilesEnabled',
    type: TRISTATE,
    group: 'freeAccess',
    label: 'Profiller',
    fallback: 'kapalı — ücretsiz kullanıcı premium ekranını görür',
    help:
      'Profil resmi geçmişi ekranı. Kapalıyken ekranın üstünde ' +
      'premium kaplaması durur ve içerik kullanılamaz.',
    effect:
      'true → ücretsiz kullanıcı bu ekranı serbestçe kullanır. Abonelik ' +
      'satışını doğrudan etkiler: kullanıcı kazanmak için açılır, dönüşüm ' +
      'için kapatılır. Abonelere ve deneme kullanıcılarına zaten açık, ' +
      'bu ayar onları etkilemez.',
  },

  // ------------------------------ Gemini -------------------------------
  {
    key: 'geminiApiKey',
    notWired: true,
    inert:
      'prox\'ta yapay zeka sohbeti diye bir ozellik yok. Zaten panelin yazamadigi bir sir.',
    type: TEXT,
    masked: true,
    group: 'ai',
    label: 'Gemini API anahtarı',
    fallback: 'uygulamaya gömülü anahtar',
    help:
      'Yapay zekâ sohbetinin kullandığı Google API anahtarı. Boş ' +
      'bırakırsan uygulamayla gelen anahtar kullanılır. Burası anahtarı ' +
      'sürüm göndermeden değiştirmek için var.',
    effect:
      'Yanlış bir anahtar yazarsan yapay zekâ sohbeti çalışmaz ve Google ' +
      '"invalid API key" döner. Alanı boşaltmak güvenlidir: uygulama kendi ' +
      'gömülü anahtarına döner.',
  },
  {
    key: 'geminiModel',
    notWired: true,
    inert:
      'prox\'ta yapay zeka sohbeti diye bir ozellik yok.',
    type: TEXT,
    group: 'ai',
    label: 'Gemini model adı',
    fallback: 'gemini-3.6-flash',
    help:
      'Kullanılacak model, örneğin "gemini-3.6-flash". Boş bırakırsan ' +
      'uygulamadaki varsayılan kullanılır.',
    effect:
      'Google eski modelleri kapatıyor — "gemini-2.5-flash artık yeni ' +
      'kullanıcılara açık değil" gibi. Kapanan bir model adı her mesajda ' +
      '404 demektir. Yapay zekâ sohbeti aniden çalışmayı bırakırsa ilk ' +
      'buraya güncel model adını yaz; sürüm beklemeden düzelir.',
  },

  // --------------------------- Guide content ---------------------------
  {
    key: 'viewOnceGuideUrl',
    notWired: true,
    inert:
      'prox ayni isi kendi anahtariyla yapiyor: viewOnceVideoLink. Kilavuz videosunu oradan degistir.',
    type: URL,
    group: 'guide',
    label: 'Tek görüntülük rehber videosu',
    fallback: 'uygulamaya gömülü video',
    help:
      'Sohbetler ekranındaki bilgi düğmesinin açtığı rehber videosu. ' +
      'Boş bırakırsan uygulamayla gelen video oynatılır. Buraya bir adres ' +
      'yazarsan onun yerine o oynatılır; https:// ile başlamalı ve doğrudan ' +
      'video dosyasına işaret etmeli.',
    effect:
      'Adres açılamazsa uygulama gömülü videoya döner — yani yanlış bir ' +
      'adres videoyu kaybettirmez, sadece değişiklik görünmez. Böylece ' +
      'çevrimdışı kullanıcı da rehberi izleyebilir.',
  },

  // -------------------------- Launch paywall ---------------------------
  {
    key: 'launchPaywallEnabled',
    type: TRISTATE,
    group: 'launchPaywall',
    label: 'Açılışta paywall göster',
    fallback: 'açık — uygulamanın bugünkü davranışı',
    help:
      'Uygulama açılırken abonelik ekranını otomatik açar. Abonelere ve ' +
      'deneme sürümündekilere hiçbir zaman gösterilmez.',
    effect:
      'true → ücretsiz kullanıcılar açılışta paywall görür. Agresif bir ' +
      'davranış; aşağıdaki sınırlarla birlikte kullan.',
  },
  {
    key: 'launchPaywallDelaySeconds',
    type: INT,
    group: 'launchPaywall',
    label: 'Açılıştan kaç saniye sonra',
    fallback: '0 — yani uygulamanın kendi gecikmesi, yarım saniye',
    min: 1,
    help:
      'Uygulama açıldıktan sonra beklenecek süre. Boş bırakırsan uygulamanın ' +
      'kendi gecikmesi geçerli olur: yarım saniye. Anahtar tam saniye ' +
      'tuttuğu için yarım saniyeyi ifade edemez, o yüzden 0 "ayarlanmamış" ' +
      'demektir — anında açmak için 1 yaz.',
    effect: 'boş → yarım saniye (bugünkü hâli). 1 ve üzeri → o kadar saniye.',
  },
  {
    key: 'launchPaywallMaxPerDay',
    type: INT,
    group: 'launchPaywall',
    label: 'Günde en fazla kaç kez',
    fallback: '0 — sınır yok, her açılışta',
    min: 1,
    help:
      'Aynı kullanıcıya bir günde en fazla kaç kez gösterileceği. Uygulamayı ' +
      'gün içinde çok açan biri için bu sayı önemlidir.',
  },
  {
    key: 'launchPaywallSkipFirstRun',
    type: TRISTATE,
    group: 'launchPaywall',
    label: 'İlk açılışta gösterme',
    fallback: 'kapalı — ilk açılışta da gösterilir',
    help:
      'Uygulamayı ilk kez açan kullanıcı önce ürünü görsün diye varsayılan ' +
      'olarak atlanır. false yaparsan daha indirir indirmez paywall görür.',
    effect:
      'true → uygulamayı ilk kez açan kullanıcı paywall görmez, önce ürünü ' +
      'tanır. false (bugünkü davranış) → indirir indirmez paywall görür.',
  },

  // --------------------------- Limited offer ---------------------------
  {
    key: 'offerEnabled',
    type: TRISTATE,
    group: 'offer',
    label: 'Süreli indirim kampanyası',
    fallback: 'açık',
    help:
      'Geri sayımlı indirim teklifini açar. Aşağıdaki alanları boş ' +
      'bırakabilirsin — kampanya kimliği "default" olur, ürün de mağazadaki ' +
      'en uzun süreli plan olur. Tek şart mağaza ürünlerinin yüklenmiş ' +
      'olması; henüz gelmedilerse teklif o an gösterilmez.',
    effect:
      'true → kullanıcı abonelik ekranını satın almadan kapattığında teklif ' +
      'çıkar. Abonelere ve deneme kullanıcılarına asla gösterilmez.',
  },
  {
    key: 'offerCampaignId',
    type: ID,
    group: 'offer',
    label: 'Kampanya kimliği',
    fallback: 'uygulamayla gelen "default" kampanyası',
    help:
      'Kampanyayı ayırt eden serbest bir etiket, örneğin "kasim2026". ' +
      'Boş bırakabilirsin; o zaman "default" kullanılır. Asıl işi ' +
      'sayaçları sıfırlamak — aşağıdaki uyarıya bak.',
    effect:
      'Bu değeri DEĞİŞTİRMEK her kullanıcının sayacını sıfırlar: daha önce ' +
      'teklifi görmüş ve reddetmiş herkes yeniden görmeye başlar. Yeni bir ' +
      'kampanya başlatırken değiştir, mevcut kampanyayı düzeltirken dokunma.',
  },
  {
    key: 'offerProductId',
    type: CHOICE,
    group: 'offer',
    // Listed rather than typed. A product id is one letter away from an
    // offer that never appears: the store returns nothing for an id it does
    // not recognise, and from the panel that looks identical to a campaign
    // nobody switched on.
    //
    // Ids not yet created in App Store Connect are listed too, deliberately.
    // Selecting one is harmless until the product exists -- the offer simply
    // does not show -- and it means the list does not need editing on the
    // day a new plan goes live.
    // Which of these the store actually returns is checked at render time
    // against purchaseProductIds, and the ones missing are labelled. A
    // hand-written "(henüz oluşturulmadı)" note went stale the moment a
    // product was created or removed -- and did worse than nothing when it
    // was absent: 3_month was listed as though it were live, and choosing it
    // produced an offer that never appeared with nothing to explain why.
    storeChecked: true,
    options: [
      ['weekly', 'Haftalık — weekly'],
      ['monthly', 'Aylık — monthly'],
      ['3_month', '3 Aylık — 3_month'],
      ['6_month', '6 Aylık — 6_month'],
      ['6_month_offer', '6 Aylık İNDİRİMLİ — 6_month_offer'],
      ['yearly', 'Yıllık — yearly'],
      ['yearly_offer', 'Yıllık İNDİRİMLİ — yearly_offer'],
      ['lifetime', 'Ömür Boyu — lifetime'],
      ['lifetime_offer', 'Ömür Boyu İNDİRİMLİ — lifetime_offer'],
    ],
    label: 'İndirimli ürün kimliği',
    fallback: '"std_oneyear" — uygulamaya gomulu yillik plan',
    help:
      'Teklif ekranında satılacak ürün. Boş bırakırsan uygulama mağazadaki ' +
      'en uzun süreli planı kullanır — yani indirim OLMAZ, sadece geri ' +
      'sayım ve rozet görünür.\n\n' +
      'GERÇEK indirim için App Store Connect\'te ikinci bir ürün açman ' +
      'gerekir: aynı abonelik grubunda, daha ucuz fiyatla. Listedeki ' +
      '"İNDİRİMLİ" seçenekler bunun için. Örnek: 6_month 599 TL ise ' +
      '6_month_offer 399 TL olur.',
    effect:
      'Mağazada olmayan bir ürün seçersen teklif HİÇ gösterilmez — hata ' +
      'da vermez, sadece görünmez. "henüz oluşturulmadı" yazanlar App ' +
      'Store Connect\'te açılana kadar bu durumdadır.',
    effect:
      'Boş bırakırsan teklif yine çıkar, sadece indirimsiz olur. Mağazada ' +
      'olmayan bir kimlik yazarsan teklif hiç gösterilmez — kimliği App ' +
      'Store Connect\'teki yazımıyla birebir gir.',
  },
  {
    key: 'offerDiscountText',
    type: TEXT,
    group: 'offer',
    label: 'İndirim yazısı',
    fallback: 'uygulamanın kendi çevirisi',
    help:
      'Rozette görünen kısa metin, örneğin "%60 indirim". Kampanyaya özel ' +
      'olduğu için burada; boş bırakırsan uygulamanın genel metni kullanılır.',
  },
  {
    key: 'offerDurationMinutes',
    type: INT,
    group: 'offer',
    label: 'Geri sayım süresi (dakika)',
    fallback: '60',
    min: 1,
    help:
      'Teklif görüldükten sonra ne kadar geçerli kalacağı. Süre kullanıcı ' +
      'başına sayılır, herkes için aynı anda bitmez.',
  },
  {
    key: 'offerMaxShowsPerUser',
    type: INT,
    group: 'offer',
    label: 'Kullanıcı başına en fazla gösterim',
    fallback: '4',
    min: 1,
    help:
      'Aynı kampanyada bir kullanıcıya en fazla kaç kez gösterileceği. ' +
      'Sayaç kampanya kimliği başına tutulur.',
    effect:
      'DİKKAT — bu sayıyı DÜŞÜRMEK, teklifi zaten bu sayı kadar görmüş ' +
      'kullanıcıları anında kapsam dışı bırakır. Örnek: biri 2 kez görmüşken ' +
      'sen 1 yazarsan o kişiye bir daha hiç gösterilmez. Kendi cihazında ' +
      'test ederken bu en sık takılınan yer: sayacı sıfırlamak için ' +
      '"Kampanya kimliği"ne yeni bir değer yaz.',
  },
  {
    key: 'offerShowAfterSessions',
    type: INT,
    group: 'offer',
    label: 'Kaç oturum sonra göster',
    fallback: '1 — ilk oturumdan itibaren',
    min: 1,
    help:
      'Kullanıcı uygulamayı bu kadar kez açmadan teklif gösterilmez. Yeni ' +
      'kullanıcıya ilk saniyede indirim göstermemek için var.',
    effect:
      'Bu sayaç kullanıcının TÜM geçmişini sayar ve kampanya kimliğini ' +
      'değiştirsen bile sıfırlanmaz. Yani uygulamayı zaten çok açmış eski ' +
      'kullanıcılar bu şartı hep sağlar; bu alan pratikte sadece yeni ' +
      'kurulumları etkiler.',
  },
  {
    key: 'offerCooldownHours',
    type: INT,
    group: 'offer',
    label: 'Gösterimler arası bekleme (saat)',
    fallback: '12',
    // 0 means "no wait": the offer may reappear the next time it is
    // triggered, which is the only way to watch it more than once while
    // testing. Allowed here because the app reads this with _nonNegInt --
    // a test in test-defaults.js refuses to let the two drift apart.
    min: 0,
    help:
      'Bir gösterimle sonraki arasındaki en kısa süre. 12 saat, normal ' +
      'kullanımda oturum başına en fazla bir tane demek. 0 yazarsan bekleme ' +
      'olmaz: teklif her tetiklendiğinde yeniden çıkar.',
    effect:
      '0 yalnızca test için — gerçek kullanıcıda abonelik ekranını her ' +
      'kapatışta teklif çıkar ve rahatsız edici olur. Test bittiğinde alanı ' +
      'boşalt, 12 saate döner.',
  },
  {
    key: 'offerTriggerPoints',
    type: ID_LIST,
    group: 'offer',
    label: 'Nerelerde tetiklensin',
    fallback: 'paywall_dismissed — abonelik ekranı kapatıldığında',
    help:
      'Uygulamanın şu an tanıdığı TEK değer: paywall_dismissed ' +
      '(kullanıcı abonelik ekranını satın almadan kapattığında). ' +
      'Başka bir şey yazarsan teklif hiç gösterilmez. ' +
      'Bu alanı boş bırakman en doğrusu.',
    effect:
      'Tanınmayan bir ad yazmak kampanyayı sessizce kapatır.',
  },

  {
    key: 'offerDismissAdEnabled',
    type: TRISTATE,
    group: 'offer',
    label: 'Teklif kapatılınca reklam göster',
    fallback: 'açık',
    help:
      'Kullanıcı indirim teklifini satın almadan kapattığında tam ekran ' +
      'geçiş reklamı gösterilir.',
    effect:
      'Abonelere ve deneme kullanıcılarına gösterilmez. "Teklifi kullan"a ' +
      'basıp ödeme ekranına gidene de gösterilmez — o an satın alma ' +
      'sürüyor. Sadece vazgeçenlere çıkar.',
  },

  // ------------------------------- Ads --------------------------------
  {
    key: 'adsEnabled',
    type: TRISTATE,
    group: 'ads',
    label: 'Reklamlar',
    fallback: 'açık',
    help:
      'Reklamların ana anahtarı. Kapalıyken aşağıdaki ayarların hiçbirinin ' +
      'etkisi yoktur. Abonelere reklam gösterilmez.',
    effect:
      'false → hiçbir reklam yüklenmez, sadece gösterilmemekle kalmaz: SDK ' +
      'istekleri de durur. İnceleme sürecinde reklamları susturmanın yolu ' +
      'budur. Abonelere zaten reklam gösterilmiyor.',
  },
  {
    key: 'adUnitIds',
    type: JSON_MAP,
    group: 'ads',
    label: 'Reklam birimi kimlikleri',
    fallback: 'uygulamaya gömülü kimlikler',
    help:
      'Yerleşim adından AdMob birim kimliğine eşleme, örneğin ' +
      '{"interstitial": "ca-app-pub-…", "appOpen": "ca-app-pub-…"}. ' +
      'Boş bırakırsan uygulamadaki kimlikler kullanılır.',
    anyKeys: true,
  },
  {
    key: 'interstitialFrequency',
    type: INT,
    group: 'ads',
    label: 'Geçiş reklamı sıklığı',
    fallback: '1 — her uygun çağrıda reklam',
    min: 1,
    help:
      'Kaç ekran geçişinde bir tam ekran reklam gösterileceği. 1 yazarsan ' +
      'her geçişte reklam çıkar; uygulama kullanılmaz hale gelir.',
  },
  {
    key: 'appOpenAdEnabled',
    type: TRISTATE,
    group: 'ads',
    label: 'Açılış reklamı',
    fallback: 'açık',
    help:
      'Uygulama açılırken/öne gelirken gösterilen reklam. Açılış paywall\'ı ' +
      'da açıksa kullanıcı arka arkaya iki tam ekran görür.',
    effect:
      'false → uygulama açılırken/öne gelirken tam ekran reklam çıkmaz. ' +
      'Açılış paywall\'ı da açıksa kullanıcı arka arkaya iki tam ekran ' +
      'görür — ikisini birden açık bırakma.',
  },

  // ------------------------- Identifiers / SDKs -------------------------
  {
    key: 'iosAppId',
    type: ID,
    group: 'integrations',
    label: 'App Store uygulama kimliği',
    fallback: '6739641253 — uygulamaya gömülü gerçek kimlik',
    help:
      'App Store\'daki sayısal kimlik. Uygulama sayfasının adresinde ' +
      '"id" harflerinden sonra gelen rakamlar: ' +
      'apps.apple.com/app/id6478901234 → 6478901234. Başındaki "id" ile ' +
      'yazarsan da kabul edilir.',
    effect:
      'İKİ YERDE kullanılır: zorunlu güncelleme ekranındaki "Güncelle" ' +
      'düğmesi ve TikTok olay takibi. Boş bırakmak güvenli — uygulama ' +
      'kendi gömülü kimliğini kullanır. Buraya yanlış bir sayı yazmak ise ' +
      'güncelle düğmesini başka bir uygulamaya götürür.',
  },
  {
    key: 'tiktokIosId',
    type: ID,
    group: 'integrations',
    label: 'TikTok uygulama kimliği (iOS)',
    fallback: '7682137123276718098 — uygulamaya gömülü gerçek kimlik',
    help:
      'TikTok Events Manager\'daki uygulama kimliği. Yukarıdaki App Store ' +
      'kimliğiyle birlikte TikTok SDK\'sını başlatır.',
    effect:
      'Boş bırakmak güvenli — uygulama kendi gömülü kimliğini kullanır. ' +
      'Buraya yanlış bir değer yazarsan SDK hiç başlamaz ve tek belirti ' +
      'cihaz kaydındaki "Failed to initialize TikTok SDK" satırı olur. ' +
      'Android tarafı uygulamada kapalı; oraya kimlik koymak sürüm ' +
      'göndermeyi gerektirir.',
  },

  // --------------------------- Contact links ---------------------------
  //
  // Opened from the settings screen. An empty value is not neutral here:
  // the app hands it straight to launchUrl, which fails and shows the user
  // "Could not open URL" -- so a blank is a broken button, not a hidden one.

  {
    key: 'linkEmail',
    type: EMAIL,
    group: 'contact',
    label: 'Destek e-posta adresi',
    fallback: 'yok — e-posta gönderme çalışmaz',
    help:
      'Ayarlar ekranındaki "Bize ulaşın" e-posta adresi. Kullanıcının ' +
      'e-posta uygulaması bu adrese açılır.',
    effect:
      'Boş bırakırsan e-posta seçeneği hata verir. Adres değiştirmek ' +
      'anında geçerli olur; sürüm göndermek gerekmez.',
  },
  {
    key: 'linkInstagram',
    type: URL,
    group: 'contact',
    label: 'Instagram adresi',
    fallback: 'yok — bağlantı hata verir',
    help: 'https:// ile başlamalı. Ayarlar ekranından açılır.',
  },
  {
    key: 'linkTelegram',
    type: URL,
    group: 'contact',
    label: 'Telegram adresi',
    fallback: 'yok — bağlantı hata verir',
    help: 'https:// ile başlamalı, örneğin https://t.me/kanaladi',
  },
  {
    key: 'linkWhatsapp',
    type: URL,
    group: 'contact',
    label: 'WhatsApp kanalı adresi',
    fallback: 'yok — bağlantı hata verir',
    help:
      'https:// ile başlamalı. WhatsApp kanal adresi ya da wa.me ' +
      'bağlantısı olabilir.',
  },

  // ---------------------------- Legal links ----------------------------
  {
    key: 'termsUrl',
    // prox (waforall-2024) bu anahtari okumuyor: konsolda bir getter'i yok,
    // yayinlamak cihazda hicbir sey degistirmez. Pio'da kullaniliyor.
    type: URL,
    group: 'legal',
    label: 'Kullanım koşulları bağlantısı',
    fallback: 'uygulamaya gömülü adres',
    help: 'https:// ile başlamalı. Boş bırakırsan uygulamadaki adres kullanılır.',
  },
  {
    key: 'privacyUrl',
    // prox (waforall-2024) bu anahtari okumuyor: konsolda bir getter'i yok,
    // yayinlamak cihazda hicbir sey degistirmez. Pio'da kullaniliyor.
    type: URL,
    group: 'legal',
    label: 'Gizlilik politikası bağlantısı',
    fallback: 'uygulamaya gömülü adres',
    help: 'https:// ile başlamalı.',
  },
  {
    key: 'eulaUrl',
    // prox (waforall-2024) bu anahtari okumuyor: konsolda bir getter'i yok,
    // yayinlamak cihazda hicbir sey degistirmez. Pio'da kullaniliyor.
    type: URL,
    group: 'legal',
    label: 'Lisans sözleşmesi (EULA) bağlantısı',
    fallback: 'uygulamaya gömülü adres',
    help:
      'https:// ile başlamalı. Apple abonelik satan uygulamalarda bu ' +
      'bağlantının çalışmasını şart koşuyor.',
  },

  // ---------------------------- Sunum modu -----------------------------
  // The one key here already existed and already works; it was read-only in
  // this panel until now. Its wording is deliberately heavy: it is the only
  // switch that changes what the whole app looks like.
  {
    key: 'isAllFeatureClosed',
    type: TRISTATE,
    group: 'presentation',
    label: 'Sunum modu (sekmeleri değiştirir)',
    fallback: 'kapalı — normal uygulama',
    help:
      'Alt menüdeki sekmeleri değiştirir. Uygulama KAPANMAZ ve hiçbir veri ' +
      'silinmez; sadece farklı bir uygulamaya benzer. false yapınca her şey ' +
      'aynen geri gelir.',
    effect:
      'Sekmeler şöyle değişir — kapalıyken (normal): Durum · Sohbetler · ' +
      'İkili sohbet · Profiller · Ses editörü. Açıkken: Yapay zekâ · ' +
      'Hikaye oluşturucu · Ses editörü · İkili sohbet · Ayarlar. ' +
      'Yani Durum ve Profiller sekmeleri kalkar, yerlerine Yapay zekâ ve ' +
      'Hikaye oluşturucu gelir. İkili sohbet (WhatsApp Web) HER İKİ MODDA ' +
      'da durur — sadece içindeki ayarlar düğmesi ve premium kaplaması ' +
      'gizlenir. Abonelik ekranındaki özellik listesi de değişir. ' +
      'Hiçbir veri silinmez, false yapınca her şey aynen geri gelir. ' +
      'İnceleme sürecinde kullanmak için var; günlük kullanımda açma.',
  },

  // ------------------------------ Paywall ------------------------------
  {
    key: 'appVersion',
    type: VERSION,
    group: 'presentation',
    label: 'Sunum modu: hedef sürüm (1.0.5 gibi)',
    fallback: 'yok — sürüm bazlı açma çalışmaz',
    help:
      'Sunum modunu SADECE belirli bir sürümde açmak için. Uygulamanın ' +
      'sürümüyle birebir eşleşirse (ve aşağıdaki build numarası da ' +
      'eşleşirse) o sürümdeki herkeste sunum modu açılır.\n\n' +
      'İki alanı karıştırma: buraya NOKTALI sürüm gelir ("1.0.5"), ' +
      'aşağıya tek sayı ("2"). Cihaz kaydındaki "version: ..." değeri budur.',
    effect:
      'TEK BAŞINA HİÇBİR ŞEY YAPMAZ — aşağıdaki "hedef build numarası" da ' +
      'dolu ve doğru olmalı. İkisinden biri eksik ya da yanlışsa hiçbir ' +
      'cihazda açılmaz, ve panelden bunu anlamanın yolu yoktur: yanlış ' +
      'yazmış olmakla hiçbir şey olmaması aynı görünür. Değerleri App Store ' +
      'Connect\'teki build\'den kopyala.',
  },
  {
    key: 'appBuildNumber',
    type: INT,
    group: 'presentation',
    label: 'Sunum modu: hedef build numarası (tek sayı)',
    fallback: 'yok — sürüm bazlı açma çalışmaz',
    min: 1,
    help:
      'Yukarıdaki sürümün build numarası — noktasız, tek sayı. İkisi ' +
      'birlikte tek bir build\'i hedefler.\n\n' +
      'Cihaz kaydındaki "build number: ..." değeri budur. Kendi telefonunda ' +
      'test ediyorsan oradaki sayıyı yaz; App Store\'a göndereceğin ' +
      'build\'i hedefliyorsan onun numarasını. İkisi genelde farklıdır ve ' +
      'aynı anda ikisini birden hedefleyemezsin.',
    effect:
      'Yukarıdaki "hedef sürüm" ile İKİSİ BİRDEN eşleşmeli. Bu ikisini ' +
      'doldurmak, o build\'i kullanan HERKESTE sunum modunu açar — sadece ' +
      'sende değil. İnceleme için gönderdiğin build\'i hedeflemek dışında ' +
      'kullanma; iş bitince iki alanı da boşalt.',
  },
  {
    key: 'purchaseProductIds',
    type: PRODUCT_IDS,
    group: 'paywall',
    label: 'Mağazadan sorulacak ürünler',
    fallback: 'yok — paywall boş açılır',
    help:
      'Uygulamanın App Store / Google Play\'e soracağı abonelik ürünleri. ' +
      'Buraya eklemediğin bir ürün uygulamada hiçbir yerde görünmez; ' +
      'aşağıdaki plan listesi de bu listeden beslenir.\n\n' +
      'Yeni bir plan eklemek için önce App Store Connect\'te ürünü oluştur, ' +
      'sonra kimliğini buraya yaz. Kimlik oradaki yazımıyla birebir aynı ' +
      'olmalı — büyük/küçük harf dahil.',
    effect:
      'DİKKAT — bu listeyi boşaltırsan abonelik ekranı BOMBOŞ açılır ve ' +
      'hiçbir şey satılamaz. Uygulamada bu anahtar için yedek yok: ' +
      'sorulacak ürün yoksa mağazadan cevap da gelmez. Bir ürünü listeden ' +
      'çıkarmak onu satıştan kaldırır; sadece ekranda gizlemek istiyorsan ' +
      'aşağıdaki "Gösterilecek planlar" listesini kullan.',
  },
  {
    key: 'paywallPlanIds',
    type: ID_LIST,
    // Drawn as a pick-and-order list rather than a text box. Typing ids by
    // hand is how you get a plan that silently never appears -- the same
    // failure as a mistyped product id -- and the order matters here, which
    // a comma-separated string expresses badly.
    planPicker: true,
    group: 'paywall',
    label: 'Gösterilecek planlar ve sırası',
    fallback: 'mağazadan gelen tüm planlar, süreye göre kısadan uzuna',
    help:
      'Kutucukları işaretleyerek hangi planların görüneceğini, okları ' +
      'kullanarak da hangi sırayla görüneceğini seç. Hiçbirini ' +
      'işaretlemezsen mağazadan gelen bütün planlar süreye göre kısadan ' +
      'uzuna sıralanır — bugünkü davranış budur.',
    effect:
      'Buraya yazdığın ama mağazada olmayan kimlikler yok sayılır. Hiçbiri ' +
      'eşleşmezse uygulama listeyi görmezden gelir ve tüm planları ' +
      'gösterir — paywall boş kalmaz. Kimlikleri App Store Connect\'teki ' +
      'yazımıyla birebir gir.',
  },
  {
    key: 'paywallHeadline',
    type: TEXT,
    group: 'paywall',
    label: 'Paywall başlığı',
    fallback: 'uygulamanın kendi çevirisi',
    help:
      'Abonelik ekranının en üstündeki metin. Boş bırakırsan uygulamayla ' +
      'gelen çeviri kullanılır ve herkes kendi dilinde görür. Buraya bir şey ' +
      'yazarsan o metin TÜM dillerdeki kullanıcılara aynen gider — Türkçe ' +
      'yazarsan İngiliz kullanıcın da Türkçe görür.',
    effect:
      'Kampanyaya özel başlık denemek için var. Kalıcı bir metin değişikliği ' +
      'istiyorsan uygulamanın çevirisini güncelletmek daha doğru.',
  },
  {
    key: 'paywallBestValueId',
    type: ID,
    // Chosen from the products above, not typed. An id that names nothing
    // the store sells is ignored by the app, which means the setting looks
    // applied and does nothing -- the failure this panel keeps running into.
    fromProducts: true,
    group: 'paywall',
    label: '"En avantajlı" rozetli ürün',
    fallback: 'en uzun süreli plan — uygulama kendisi seçiyor',
    help:
      'Rozetin görüneceği ürünün kimliği. Mağazadan gelen ürünler arasında ' +
      'olmayan bir kimlik yazarsan uygulama bunu yok sayar ve rozeti yine ' +
      'en uzun süreli plana verir — rozetsiz kalmaz.',
    effect:
      'Tek plan varsa rozet zaten hiç gösterilmez; neye göre daha avantajlı ' +
      'olduğu belli olmaz.',
  },
  {
    key: 'paywallPreselectId',
    type: ID,
    // Chosen from the products above, not typed. An id that names nothing
    // the store sells is ignored by the app, which means the setting looks
    // applied and does nothing -- the failure this panel keeps running into.
    fromProducts: true,
    group: 'paywall',
    label: 'Önceden seçili ürün',
    fallback: 'uygulamanın kendi seçimi',
    help:
      'Ekran açıldığında işaretli gelecek ürünün kimliği. Genelde rozetli ' +
      'ürünle aynı olur ama olmak zorunda değil. Mağazada olmayan bir kimlik ' +
      'yazarsan uygulama yok sayar ve en pahalı planı seçer — seçimsiz kalmaz.',
    effect:
      'Sadece ekran ilk açıldığındaki seçimi belirler. Kullanıcı bir plana ' +
      'dokunduktan sonra bu ayarın etkisi kalmaz.',
  },

  // ---------------------------------------------------------------------
  // prox (waforall-2024) tarafinda okunan, Pio'da bulunmayan anahtarlar.
  // ---------------------------------------------------------------------
  {
    key: 'showWebviewAndStatus',
    type: TRISTATE,
    group: 'presentation',
    label: 'WhatsApp Web sekmesini goster',
    fallback: 'kapali — sekme yerine Ayarlar acilir',
    help:
      'prox\'un kendi surum bazli inceleme kapisi. Acikken WhatsApp Web '
      + 'sekmesi gorunur, kapaliyken o sekmede Ayarlar acilir.',
    effect:
      'TEK BASINA YETMEZ — yukaridaki "hedef surum" ve "hedef build '
      + 'numarasi" calisan surumle ESLESMEMELI. Ikisi de eslesirse sekme '
      + 'yine gizlenir. Inceleme icin gonderilen build\'i hedefleyip diger '
      + 'herkese acik birakmak icin var.',
  },
  {
    key: 'limitShowingAds',
    type: TRISTATE,
    group: 'ads',
    label: 'Reklam gosterimini sinirla',
    fallback: 'kapali — reklamlar normal sikliginda',
    help: 'Acikken uygulama reklamlari daha seyrek gosterir.',
    effect: 'Reklamlari tamamen kapatmaz; sadece sikligi azaltir.',
  },
  {
    key: 'adsDemoList',
    type: JSON_OBJ,
    group: 'ads',
    multiline: true,
    label: 'Reklam demo sohbeti',
    fallback: 'yok — demo ekrani bos acilir',
    help:
      'Reklam tanitim ekranindaki ornek sohbet. Sekli: '
      + '{"name":"...","profileUrl":"...","lastSeen":"...","number":"...",'
      + '"messages":[...]}. Uygulama bunu jsonDecode ile okur.',
    effect:
      'Gecersiz JSON yazarsan uygulama bu ekrani acarken hata verir — '
      + 'panel bu yuzden yazmadan once JSON\'i dogrular.',
  },
  {
    key: 'subscriptionBenefitText1',
    type: TEXT,
    group: 'paywall',
    label: 'Abonelik faydasi 1',
    fallback: '"Unlock Figlet Fonts"',
    help: 'Abonelik ekranindaki birinci madde.',
    effect:
      'Sadece sunum modu KAPALIYKEN gecerli. Sunum modu acikken uygulama '
      + 'kendi sabit metnini kullanir ve buraya yazdigin gorunmez.',
  },
  {
    key: 'subscriptionBenefitText2',
    type: TEXT,
    group: 'paywall',
    label: 'Abonelik faydasi 2',
    fallback: '"Unlock Video Editor"',
    help: 'Abonelik ekranindaki ikinci madde.',
    effect: 'Sadece sunum modu KAPALIYKEN gecerli.',
  },
  {
    key: 'subscriptionBenefitText3',
    type: TEXT,
    group: 'paywall',
    label: 'Abonelik faydasi 3',
    fallback: '"Unlimited Access to all Features"',
    help: 'Abonelik ekranindaki ucuncu madde.',
    effect: 'Sadece sunum modu KAPALIYKEN gecerli.',
  },
  {
    key: 'viewOnceVideoLink',
    type: URL,
    group: 'guide',
    label: 'Tek seferlik medya rehber videosu (prox)',
    fallback: 'yok — rehber videosu acilmaz',
    help:
      'prox\'un okudugu anahtar bu. Ayni gruptaki viewOnceGuideUrl Pio\'nun '
      + 'anahtari; prox onu OKUMUYOR, degistirmek prox\'ta hicbir sey yapmaz.',
    effect: 'Bos birakirsan rehber videosu acilmaz.',
  },
  {
    key: 'youtubeVideoUrl',
    type: URL,
    group: 'guide',
    label: 'YouTube tanitim videosu',
    fallback: 'yok — video gosterilmez',
    help: 'Uygulama icinde acilan YouTube baglantisi.',
    effect: 'Bos birakirsan video alani gosterilmez.',
  },
  {
    key: 'activeWebDetails',
    inert: 'proxta yalnizca varsayilanlar listesinde duruyor; hicbir getter okumuyor.',
    type: TRISTATE,
    group: 'presentation',
    notWired: true,
    label: 'Web detaylari (kullanilmiyor)',
    fallback: 'yok',
    help:
      'prox\'ta sabiti tanimli ama configs_helper.dart icinde bir getter\'i '
      + 'yok — hicbir yerde okunmuyor. Yayinlamak cihazda hicbir sey '
      + 'degistirmez. Kod tarafinda okunur hale gelirse bu isaret kalkmali.',
    effect: 'Su an hicbir etkisi yok.',
  },
];

/** Keys this panel must never touch, with the reason. Used for the UI notice. */
const PROTECTED = [
  // `secret: true` masks the value in the UI. It used to be inferred by
  // matching the Turkish text of `why`, which would have silently started
  // leaking a key the moment someone reworded it.
  { key: 'oneSignalRestApiKey', why: 'Gizli anahtar.', secret: true },

  // Keys the app reads that this panel does not manage. Listed so the
  // read-only table shows the whole picture: without them an operator sees
  // a panel that appears to cover everything, and has no way to tell that
  // the app is also reading eight keys it cannot see here.
  //
  // Publishing leaves every one of these untouched -- asserted in
  // test-server.js against these exact key names.
  { key: 'verification_code', why: 'Doğrulama kodu ekranı. Konsoldan yönetiliyor.' },
  { key: 'externalId', why: 'OneSignal dış kimliği. Cihaz başına, elle değiştirilmez.' },
];

const BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

module.exports = {
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
  JSON_OBJ,
};
