# Prox · Bildirim Ayarları Paneli

Uygulamanın bildirimle ilgili Firebase Remote Config anahtarlarını tarayıcıdan
düzenleyip yayınlar.

## Neden bir sunucu var?

Remote Config'e yazmak Firebase Admin yetkisi ister. Tarayıcıya konulan her
anahtar okunabilir — o anahtar da tüm projeyi yönetme yetkisi verir. Bu yüzden
kimlik bilgisi bu süreçte durur; tarayıcı sadece bu sunucunun `/api`'siyle
konuşur.

## Bu panel neye dokunamaz

Sunucu, `keys.js` içindeki listenin dışındaki hiçbir anahtarı yazmaz. Yani
şunlar bu panelden **erişilemez** ve Firebase konsolunda kalır:

| Anahtar | Neden dışarıda |
|---|---|
| `isAllFeatureClosed` | Tüm özellikleri kapatan ana anahtar |
| `appVersion` | Sürüm bazlı kapatmanın yarısı |
| `appBuildNumber` | Sürüm bazlı kapatmanın yarısı |
| `purchaseProductIds` | Abonelik ürün kimlikleri |
| `geminiApiKey` | Gizli anahtar |
| `oneSignalRestApiKey` | Gizli anahtar |

Bildirim metni değiştiren birinin yanlış tıkla tüm uygulamayı kapatabilmesi
istenmeyecek bir şey. Panel bu anahtarları sadece **okur** ve durumlarını
gösterir; yazma isteği gelirse 400 ile reddeder.

Ayrıca yayınlama sırasında panel, canlı şablonu okuyup **sadece kendi
anahtarlarını** değiştirir. Firebase konsolundan elle eklediğin bir anahtar
buradan yayın yapınca silinmez.

## Kurulum

### 1. Servis hesabı anahtarı

Firebase Console → Proje ayarları → Hizmet hesapları → **Yeni özel anahtar
oluştur**. İnen JSON dosyasını sunucuda güvenli bir yere koy.

> Bu dosya projeyi yönetme yetkisi verir. Git'e koyma, kimseye gönderme.

### 2. Bağımlılıklar

```bash
cd remote-config-panel && npm install
```

### 3. Ortam değişkenleri

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/güvenli/yol/service-account.json
export PANEL_PASSWORD='en-az-12-karakterlik-güçlü-bir-şifre'
export SESSION_SECRET="$(openssl rand -hex 32)"
export PORT=8080
```

Sunucu bunlardan biri eksikse **başlamaz**. Şifresiz açılıp production
config'ini herkese açmasındansa hiç çalışmaması daha iyi.

### 4. Çalıştır

```bash
cd remote-config-panel && npm start
```

## HTTPS zorunlu

Oturum çerezi `secure` işaretli, yani panel **https** üzerinden sunulmalı.
Sadece kendi makinende `http://localhost` ile denemek için:

```bash
PANEL_INSECURE=1 npm start
```

Bunu sunucuda kullanma — şifre düz metin olarak ağdan geçer.

Yayına alırken önüne bir ters vekil (nginx / Caddy) koyup TLS'i orada sonlandır.

## Testler

```bash
cd remote-config-panel && node test-server.js
```

Gerçek sunucunun istek işleyicilerini sahte bir Firebase ile çalıştırır:
giriş kontrolü, korumalı anahtarların reddi, doğrulama kuralları, boş değerin
anahtarı silmesi, eşzamanlı düzenleme çakışması ve yönetilmeyen anahtarların
yayında hayatta kalması.

```bash
cd remote-config-panel && node test-validate.js
```

Anahtar listesinin sınırlarını doğrular.

## Uygulama tarafı

Bu anahtarları okuyan kod:

- `lib/features/data/helpers/configs_helper.dart` — okuma ve varsayılanlar
- `lib/features/data/helpers/notif_text.dart` — metin/dil/`{code}` çözümlemesi
- `lib/features/data/helpers/link_code_notifier.dart` — eşleşme kodu bildirimi
- `lib/features/data/helpers/free_user_notifier.dart` — ücretsiz kullanıcı hatırlatıcısı
- `lib/features/data/helpers/offer_gate.dart` — süreli indirim kararı
- `lib/features/presentation/widgets/limited_offer_dialog.dart` — indirim ekranı

### Sunum modu

`isAllFeatureClosed` bu panelden yazılabilir. Adı "kapalı" dese de uygulamayı
kapatmaz: WhatsApp ile ilgili sekmeleri gizler ve Yapay Zekâ Sohbeti, Hikaye
Oluşturucu, Ses Editörü öne çıkar. Kayıtlı veri silinmez, `false` yapınca her
şey geri gelir.

Sürüme göre kapatan `appVersion` / `appBuildNumber` ikilisi panele **açılmadı**
ve Firebase konsolunda kalıyor. O ikisi tek bir sürümü tamamen kapatır ve
yalnızca ikisi birden eşleşince çalışır — birini yanlış girmek ya hiç kimseyi
ya da herkesi etkiler, ve panelden hangisi olduğu anlaşılmaz.

Testleri:
`flutter test test/notif_config_test.dart test/free_notif_schedule_test.dart test/offer_gate_test.dart test/legal_links_test.dart test/remote_config_defaults_test.dart`

### Panelde olup uygulamada olmayan anahtarlar

Panel, uygulamanın **henüz okumadığı** 18 anahtar da taşıyor: zorunlu
güncelleme, özellik kapatma, açılış paywall'ı, reklamlar ve paywall metinleri.
Bunlar arayüzde turuncu **HENÜZ ÇALIŞMIYOR** etiketiyle işaretli ve yazılamaz
durumda — çünkü daha önce normal görünüyorlardı ve bir operatörün "reklamları
kapattım" sanıp reklamların açık kalması mümkündü.

Bunların yerine şu an geçerli olanlar:

| Panel anahtarı | Şu an ne geçerli |
|---|---|
| `featureDualChatEnabled` vb. | Panelin **Sunum modu** bölümündeki `isAllFeatureClosed` (WhatsApp yüzünü gizler) |
| `aiChatDailyLimit` | Kodda sabit: ücretsiz kullanıcı günde 1 sohbet, abonede sınır yok |
| `launchPaywall*` | Kodda sabit (`main_controller.dart`) |
| `paywallHeadline`, `paywallBestValueId`, `paywallPreselectId` | Uygulamanın kendi çevirileri; plan metinleri ve "en iyi teklif" rozeti mağazadan gelen ürünlere göre otomatik oluşuyor |
| `minSupportedVersion`, `forceUpdate`, `updateMessage` | Karşılığı yok; sürüme göre kapatmak için konsoldaki `appVersion`/`appBuildNumber` |
| `adsEnabled` vb. | Karşılığı yok |

`node test-honesty.js` bu tabloyu Flutter kaynağına karşı doğrular: bir anahtar
uygulamaya bağlandığında etiketi kaldırılmazsa test kırılır.

## Önemli kural: boş = uygulamanın kendi varsayılanı

Bir alanı boş bırakırsan panel o anahtarı Remote Config'ten **siler** ve
uygulama kendi varsayılanını kullanır. Yani boş, "kapalı" demek değil,
"bugünkü davranış aynen sürsün" demek.

Bu bilinçli: Remote Config'te olmayan bir anahtar için `getBool` `false`
döner. Kod bunu ham okusaydı, bu değişiklik yayına çıktığı anda eşleşme kodu
bildirimi **her cihazda** sessizce kapanırdı. Bu yüzden açık/kapalı bayrakları
bool değil, üç durumlu metin olarak okunuyor.

---

## Docker ile kurulum (diğer sitelere dokunmadan)

Panel kendi konteynerinde çalışır ve **sadece `127.0.0.1:8080`** üzerinde
dinler. Sunucudaki 80/443 portlarına, mevcut nginx/Apache yapılandırmana veya
diğer sitelerine dokunmaz. Dışarıya açılması, zaten çalışan web sunucuna
ekleyeceğin tek bir vhost bloğuyla olur.

> **Neden `127.0.0.1:` öneki önemli:** Docker, port yayınlarken doğrudan
> iptables kuralı yazar ve bu kural **ufw'yi atlar**. Önek olmadan panel,
> güvenlik duvarı kapalı olsa bile 8080 portundan herkese açık hale gelir.

### 1. Kodu sunucuya al

```bash
sudo mkdir -p /opt/prox-panel && sudo chown "$USER" /opt/prox-panel
git clone https://github.com/sorosons/prox_remote_config.git /opt/prox-panel
cd /opt/prox-panel
```

### 2. Servis hesabı anahtarını yerleştir

Firebase Console → Proje ayarları → Hizmet hesapları → **Yeni özel anahtar
oluştur**. İnen JSON'u kendi bilgisayarından sunucuya gönder:

```bash
scp ~/Downloads/service-account.json kullanici@sunucu:/tmp/sa.json
```

Sonra sunucuda, proje klasörünün **dışına** taşı ve kilitle:

```bash
sudo mkdir -p /etc/prox-panel
sudo mv /tmp/sa.json /etc/prox-panel/service-account.json
sudo chown 1000:1000 /etc/prox-panel/service-account.json
sudo chmod 600 /etc/prox-panel/service-account.json
sudo chmod 755 /etc/prox-panel
```

> Bu dosya tüm Firebase projesini yönetir. Git'e koyma, kimseye gönderme,
> imaja gömme. Konteynere çalışma anında salt-okunur bağlanır.

Sahibi neden `root` değil: konteyner root olarak çalışmaz, imajdaki `node`
kullanıcısı olarak çalışır ve o kullanıcı uid 1000'dir. `root:root` + `600`
yaparsan dosya bağlanır ama okunamaz ve panel "Could not read config" ile
açılmaz. Dosya yine sadece sahibine okunabilir; sahibi root yerine uid 1000.

Sunucudaki kendi kullanıcın da uid 1000 ise (`id` ile bak) dosya sana da
okunabilir olur. Bu bilinçli: aksi halde konteyner okuyamaz.

### 3. Şifreleri üret

```bash
cp .env.example .env
printf 'PANEL_PASSWORD=%s\n' "$(openssl rand -base64 18)" >> .env
printf 'SESSION_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
sed -i '/^PANEL_PASSWORD=$/d; /^SESSION_SECRET=$/d' .env
chmod 600 .env
```

Panel şifreni okumak için:

```bash
grep PANEL_PASSWORD /opt/prox-panel/.env
```

### 4. Başlat

```bash
cd /opt/prox-panel && docker compose up -d --build
docker compose logs --tail 20
```

`Remote config panel on http://localhost:8080` görüyorsan çalışıyor.

### 5. Alan adını bağla

**Caddy kullanıyorsan** (`/etc/caddy/Caddyfile` sonuna ekle) — TLS otomatik:

```
panel.alanadin.com {
    reverse_proxy 127.0.0.1:8080
}
```

```bash
sudo systemctl reload caddy
```

**nginx kullanıyorsan** — önce vhost:

```bash
sudo tee /etc/nginx/sites-available/prox-panel > /dev/null <<'EOF'
server {
    listen 80;
    server_name panel.alanadin.com;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        # Oturum çerezi `secure` işaretli; bu başlık olmadan panel giriş
        # yaptıktan sonra sürekli giriş sayfasına döner.
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
sudo ln -s /etc/nginx/sites-available/prox-panel /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Sonra sertifika (diğer sitelerine dokunmaz):

```bash
sudo certbot --nginx -d panel.alanadin.com
```

### 6. Güncelleme

```bash
cd /opt/prox-panel && git pull && docker compose up -d --build
```

### Bilinmesi gerekenler

* Oturumlar bellekte tutulur: konteyner yeniden başlarsa tekrar giriş
  yapman gerekir. Tek yöneticili bir panelde sorun değil.
* `docker compose down` sadece bu konteyneri durdurur, diğer sitelerine
  dokunmaz.
* Panel yalnızca `keys.js`'teki anahtarları yazar; kill-switch anahtarları ve
  gizli anahtarlar bu panelden değiştirilemez.
