# ATLAS v1.3 — sırtlar, vadiler ve kaya yüzeyleri

21 Ekim 2026. STARFRONT'tan ayrı uygulama. Yarıçap 12.000 km; yükseklikler metre cinsinde ve dikey abartı uygulanmıyor.

## Görmek için

- **Alpin / sıradağlar** seçip gezegen oluştur. **Ayrık dağ sırtları** ve **Derin vadiler** keşif noktalarını kullan. `fixtures/alpina.planet`, ekran görüntülerindeki ALPINA-509 dünyasıdır.
- **Harita / 4** üstten bakar. **Bölge / 2** eğik bakar; sağ sürükleme ile açıyı değiştirebilirsin. Sol sürükleme yerküreyi taşır, tekerlek imlece yaklaşır.
- **Ignis** dünyasında **Ateş Kalderası** alçak lav tabanına ve aşınmış çeperlere gider.
- **Sahra** ve **Ares** dünyalarında **Derin vadiler** / **Kızıl Kanyon** ayrılmış kaya kütlelerini gösterir.

## Değişiklikler

Yumuşak yerel tepeciklerin yerine keskin sırt alanı ve dört ölçekte eğimi izleyen aşınma olukları eklendi. Aynı fiziksel koordinat her LOD'da aynı yüksekliği üretir. Ana sırtlar, yamaç olukları ve vadi tabanları birbirinden ayrılır. Küresel nehir/dere yatakları bu yükseltinin içine oyulmaya devam eder.

Volkanik alanlar bölgesel çöküntüler içinde üretilir. Örnek kalderanın tabanı dış araziden aşağıdadır; çeperin şekli ve yüksekliği çevresi boyunca değişir. Lavın bulunduğu taban düzleştirilir. Çöl ve Mars profillerinde ek yarıntılar ve kayalık yükseltiler bulunur.

Dik yamaçlar kürenin merkezinden gelen yerel düşeyle karşılaştırılır. Eğime göre zemin, kaya ve kar görünümü karışır. Kaya kaplaması üç eksenden yansıtılır; yamaçlarda UV uzaması yapmaz. Mineral renkleri, çatlaklar, mikro kabartı ve pürüzlülük kodla üretilir. Uzakta ince doku söner; kaya dokusu mipmap ve anizotropik süzme kullanır. Alpin hazır ayarının sıcaklığı kar hattını görünür kılacak şekilde 16 °C olarak ayarlandı.

LOD sınırlarında ince kenar, komşu kaba kenarın gerçek doğru parçasına oturtulur. Yakın arazide eski uzun örtü etekleri kaldırıldı. Yakın yüzeyin parça bütçesi ayrı tutulur. Örnek başına bütün küresel nehir listesini dolaşmak yerine yerel nehirler önbelleğe alınır. Arazi üretimi Worker'da sürer; yeni parça grubu hazır olana kadar önceki görünüm korunur.

Dağlar vadilerine gölge düşürür. Gölge alanı kamera mesafesine uyar; gölge derinlik payı da fiziksel ölçeğe göre değişerek yüzey taramalarını azaltır. 30 km ve altında bulutların kapanması korunur.

## Araştırılan kaynaklar ve seçim

- [Three.js resmî WebGPU arazi örneği](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_tsl_procedural_terrain.html): TSL içinde arazi normali ve eğime göre kaya/kar karışımı için referans. Uygulamadaki küresel LOD yapısına uygun malzeme yaklaşımı kullanıldı.
- [Three.js forumu — komşu nesnelerde doku sürekliliği](https://discourse.threejs.org/t/how-to-make-textures-align-across-adjacent-objects/66193): dünya koordinatlarıyla triplanar kaplama. Burada kamera yeniden merkezlense de metre cinsindeki doku fazı korunuyor.
- [IceCreamYou/THREE.Terrain](https://github.com/IceCreamYou/THREE.Terrain): yükseklik haritaları, prosedürel üretim ve eğim/yükseklik tabanlı malzeme araçları incelendi. Belgelenen Lambert/GLSL malzeme yolunu bu WebGPU küreye doğrudan eklenti olarak bağlamak yerine mevcut TSL hattı geliştirildi. Yeni bağımlılık eklenmedi.
- [Rune Skovbo Johansen — Fast and Gorgeous Erosion Filter](https://blog.runevision.com/2026/03/fast-and-gorgeous-erosion-filter.html): eğimi takip eden, küçük ölçeklerde dallanan oluk fikri için referans. Çekirdekteki `relief.mjs` bu kavram ailesinden esinlenen ayrı, üç boyutlu analitik uygulamadır; makaledeki gelişmiş filtrenin birebir portu değildir.
- [Estqes/3D-Erosion-Filter-Unity](https://github.com/Estqes/3D-Erosion-Filter-Unity): üç boyutlu uygulama seçeneği incelendi. Unity/C#/HLSL ve MPL-2.0 tabanlı bu proje pakete eklenmedi; kodu kopyalanmadı.

## Doğrulama ve sınırlar

Otomatik kontroller; deterministik üretim, paket imzası ve tekrar açma, nehir eğimleri, geçitler, yarıçap, sınırlı LOD sayısı, analitik türevler, kaldera kotları ve farklı LOD kenarlarının birleşmesini kapsar. Tarayıcı kanıtları ve son performans ölçümleri `evidence/v13/acceptance.json` ve `evidence/v13/index.html` içindedir.

Bu sürüm prosedürel bir arazi görünümüdür; gerçek uydu fotoğrafı veya gerçek Dünya yükseklik verisi kullanılmaz. Oluk filtresi tam hidrolik erozyon simülasyonu değildir. Çok uzak sırtlar performans için sadeleşir; hareket sırasında ayrıntı seviyesi değişimleri hâlâ fark edilebilir. Büyük bir kamera sıçramasından sonra ayrıntının Worker'da yüklenmesi birkaç saniye sürebilir. Ölçülen kare hızı bütün cihazlar için garanti değildir.

Çekirdek değiştiği için v1.2 ve önceki `.planet` paketleri v1.3'te açılmaz. Eski sürüm ZIP'leri korundu. Aynı üretim ayarlarıyla yeni dünyayı üretip yeniden kaydet; v1.3 ile verilen sekiz örnek paket bu sürümle doğrulandı.

## Son ölçüm

32/32 otomatik test ve sekiz örnek paketin doğrulaması geçti. Chrome / WebGPU, NVIDIA Turing, 1600 × 1000, ayrıntı 1 ile ölçüldü. Tarayıcı hata kaydı boş; paket kaydet/aç imzası aynı. Duraklatılmış ve sabit kameralı Alpin görünümünün 300 ms aralıklı iki ekran görüntüsü byte olarak aynı çıktı.

| Görünüm | FPS | Arazi parçası | Son Worker üretimi |
|---|---:|---:|---:|
| 33400m | 60.0 | 364 | 2.46 s |
| 30000m | 60.0 | 384 | 0.44 s |
| terran-ridges | 60.0 | 662 | 2.93 s |
| terrain-map | 60.4 | 515 | 0.01 s |
| forest-180m | 60.0 | 882 | 5.42 s |
| stream-1800m | 60.0 | 994 | 6.55 s |
| alpina | 60.0 | 692 | 3.31 s |
| desert | 60.0 | 560 | 1.39 s |
| volcanic | 60.4 | 623 | 2.18 s |
| caldera-near | 60.0 | 718 | 2.68 s |
| mars | 60.0 | 503 | 0.89 s |
| moon | 59.9 | 521 | 1.15 s |
| alien | 59.9 | 647 | 2.86 s |

Worker süresi, ziyaretin toplam süresi veya her karede ödenen süre değildir. Kamera sıçramasında önce kaba görünüm, ardından yakın ayrıntı hazırlanabilir. 30 km ölçümünde bulut yoğunluğu sıfırdır. Son malzeme süzmesi ayrıca üç jeolojik görünümde kontrol edildi; `material-smoke.json` bu denetimi kaydeder.
