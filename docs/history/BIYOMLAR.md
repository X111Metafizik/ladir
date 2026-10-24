# ATLAS v1.2 — biyomlar, akarsular ve bölgesel ormanlar

21 Ekim 2026. STARFRONT'tan ayrı yerel uygulama. Yarıçap **12.000 km**.

## Kullanım

- **Coğrafya → Dünya karakteri → Gezegen oluştur:** Terran, Sahra, Ignis, Ares, Selene veya Prizma seç.
- **İncele → Biyom ve coğrafya keşfi:** orman, kum çölü, sarp kayalık, dere, nehir, kaldera, krater ve renkli biyomlara git. Liste o dünyada bulunan alanları gösterir.
- **Görünüm → Bölgesel renk katmanı:** mor, kızıl, turkuaz veya iki renkli mozaik. Saydamlık sürgüsü yüzeyin üzerine karışan renk miktarını ayarlar. Bu ayarlar coğrafyayı değiştirmez.
- Keşif düğmeleri seçilen bölgeyi mevcut güneş yüksekliğiyle aydınlatır. Gündüz düğmesi güneşi gezilen konuma göre ayarlar.
- Sol sürükle yerküreyi kaydırır; tekerlek imlece yaklaşır; sağ sürükle eğimi/yönü değiştirir. **1 / 2 / 3** yörünge, bölge, yüzey; **N** kuzey; **Home** tüm gezegen.

## Değişiklikler

**Orman:** Eski dokuz parçalık kare yükleme sınırı kaldırıldı. Küresel koordinatlardan hesaplanan bölge ve koruluk alanları hem zemin örtüsünü hem tekil ağaçları belirler. Sıcaklık, nem, yükseklik ve kıyı uzaklığı yoğunluğu azaltır; deniz seviyesinden ilk 45 metrede ağaç yoktur, 260 metreye kadar yoğunluk yumuşak artar. Su yatakları korunur. Ağaçlar 12–31 metre aralığındadır. Geniş taçlı ve katmanlı iğne yapraklı modeller kullanılır.

Yakındaki 11×11 parça Worker önbelleğine alınır; ağaç örnekleri kameranın çevresinde elenir ve tür başına bir çizim grubunda birleştirilir. 750–2.000 m görüş uzaklığında MSAA ile yumuşak geçiş uygulanır. Yakınlık artık deniz seviyesine göre değil **zeminden yüksekliğe** göre hesaplanır. Orman örtüsü uzakta arazide görünür.

**Nehir ve dere:** Küresel Priority-Flood alıcı/akış birikimi verisinden büyük kollar çıkarılır. Kara ve kot kontrolünden geçen daha dar dereler bu kollara bağlanır. Varsayılan LUMEN-742 / Terran dünyasında 302 nehir kolu ve 80 dere bulunur; sayı seed ve ayarlara göre değişir. Ayrı su şeritleri, kanal genişliğinin arazi ızgarasından küçük olduğu uzaklıklarda suyu korur. Yakındaki kıyılara sınırlı ek LOD uygulanır. Eski göl, sığ geçit ve deniz boğazı da korunur.

**Dünya türleri:**

| Tür | Yüzey |
| --- | --- |
| Terran | Nemli ormanlar, açıklıklar, subtropikal kurak kuşaklar, kum, kayalık, kar, su |
| Sahra | Kum dalgaları, aşınmış platolar ve kayalıklar; su ve ağaç yok |
| Ignis | Bazalt, kaldera ve ışık yayan lav çatlakları; su ve ağaç yok |
| Ares | Kızıl regolit, kanyonlar, platolar ve krater izleri; su ve ağaç yok |
| Selene | Gri regolit, farklı ölçeklerde kraterler; atmosfer, bulut, su ve ağaç yok |
| Prizma | Mor/turkuaz yer örtüsü, renkli bitkiler, göl ve akarsular |

Yüzeyde metre ölçekli mikro yükseklik, kaya katmanları ve birden fazla uzaklıkta süzülen hacimsel gürültü kullanılır. Renk katmanı ek bir çakışan yüzey çizmez; mevcut malzemeye karışır. Kamera kökeni kaydırma, MSAA, fiziksel dağ yüksekliği ve 40–30 km bulut geçişi korunur.

## Kapsam ve sınırlar

Bu sürüm gerçek Dünya/Mars/Ay yüzey haritası veya fotogrametri değildir. Yüzeyler seed tabanlı prosedürel örneklerdir. Akış ağı düşük çözünürlüklü drenaj analizinin ayrıntılandırılmış görsel modelidir; tam hidrodinamik, tortu taşınımı ya da mevsimsel akış çözümü değildir. Lav ışığı yüzey emisyonudur, akışkan simülasyonu değildir. Ağaçlar tarayıcı için düşük poligonlu modellerdir. Dar su şeritleri ve arazi ayrıntıları mesafeye göre yüklenir. Bazı eğik bakışlarda ince LOD kenar izleri hâlâ görülebilir.

Paketin çekirdeği **1.2.0** olmuştur. Eski 1.0/1.1 `.planet` paketleri sessizce dönüştürülmez; eski uygulama sürümüyle açılmalıdır. Aynı eski seed yeni çekirdekte yeni bir dünya üretir. Önceki ZIP dosyaları korunur. `fixtures/` altındaki sekiz örnek paket güncel çekirdekle üretilip tekrar açılarak doğrulanmıştır.

## Doğrulama

- **28/28 otomatik test:** deterministik üretim, hidroloji, farklı küre yüzlerinde nehirler, kara üzerindeki dereler, kıyıdaki orman engeli, kuru gezegenler, krater/lav, mor/turkuaz biyomlar, dosya imzası, navigasyon, LOD ve hassasiyet.
- `evidence/v12/browser-qa.json`: altı dünya türünün gerçek Chrome WebGPU kontrolü, ilgili keşif noktaları ve hata listesi.
- `evidence/v12/final-qa.json`: son dağıtımın performans ölçümleri, renk katmanı ve indir/aç kontrolleri. Ölçümler bu makineye aittir; her cihaz için FPS garantisi değildir.
- `evidence/v12/` görüntüleri doğrudan uygulamadan alınmıştır. Eski `OPTIMIZASYON.md` v1.1 ölçümlerinin tarihsel kaydıdır.

## Açık uydu / gezegen arşivleri

Bu dağıtım uydu rasterı indirmez veya paketlemez; internet bağlantısı olmadan yerel çalışır. Gelecekte gerçek veriyle hibrit malzeme üretimi için kaynaklar:

- [NASA Visible Earth — Blue Marble](https://visibleearth.nasa.gov/images/57723/the-blue-marble)
- [USGS — Mars CTX controlled equatorial mosaics](https://astrogeology.usgs.gov/search/map/mars_ctx_controlled_equatorial_mosaics)
- [USGS — Mars THEMIS day mosaics](https://www.usgs.gov/media/images/mars-themis-day-mosaics)
- [USGS — Kaguya lunar terrain models](https://stac.astrogeology.usgs.gov/docs/data/moon/kaguyatc_dtms/)

## Son performans ölçümü

Chrome 155 / NVIDIA Turing, 1600×1000, ayrıntı 1. Yerleşmiş görünümde 2,2 saniyelik örnekler:

| Görünüm | FPS | Arazi parçası | Son Worker hazırlığı |
| --- | ---: | ---: | ---: |
| 33400m | 59.9 | 284 | 1.98 sn |
| 30000m | 59.9 | 284 | 0.00 sn |
| forest | 60.2 | 506 | 1.88 sn |
| trees | 60.0 | 590 | 2.71 sn |
| stream | 59.9 | 674 | 4.69 sn |

Worker süreleri yalnızca o istekte gereken yeni parçaları içerir; tam dünya üretim süresi değildir. Son dere ziyareti kamera geçişi ve hazırlıkla birlikte yaklaşık 8,7 saniye sürdü; bu sırada önceki arazi görünür kalır. Altı dünya türü, renk katmanı ve indirilmiş dosyanın yeniden açılması doğrulandı; JavaScript/WebGPU hata listesi boş.
