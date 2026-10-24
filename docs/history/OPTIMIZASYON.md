# v1.1 — ölçek, gezinme ve performans

20 Ekim 2026. Gezegen yarıçapı **12.000.000 metre (12.000 km)**. STARFRONT'tan bağımsız uygulama.

## Değişiklikler

- Eski 33,6 km eşiğinde bütün makro ağaç gruplarını aynı anda açan davranış kaldırıldı. Artık 8 km üzerinde ağaç geometrisi çizilmez; 1,8–8 km arasında basit taçlar, daha yakında gövdeli ağaçlar kullanılır. Yakın bitki adresleri fiziksel ölçekte (~0,7–1,4 km yüzey parçaları) hesaplanır; en fazla dokuz parça tutulur.
- Arazi/su LOD seçimi ve geometri hesabı ayrı Worker'a taşındı. Önceki O(n²) komşu araması kaldırıldı. Ufuk elemesi ve mesafeye göre ara seviyeler kullanılır. Yeni ayrıntı hesaplanırken önceki geometri görünür kalır.
- Su yüzeyi araziyle aynı LOD parçalarını kullanır; büyük yarıçapta sabit düşük çözünürlüklü kürenin deniz yüzeyinin altına gömülmesi giderildi. FFT dalga normalleri uzaklığa göre süzülür.
- Kamera tüm irtifalarda yüzeyi tutup kaydırır. Tekerlek imleci esas alır. Sağ sürükle veya Shift + sol sürükle eğimi/yönü değiştirir. W/A/S/D ve oklar kaydırır, Q/E yaklaşır/uzaklaşır, N kuzeyi üste alır, Home gezegenin tamamını gösterir. Kamera kısayolları son gezilen konumu korur.
- Dağlar metre ölçeğinde ve dikey abartısız üretilir. Ana yükselti yumuşak bir 6 km sınırına yaklaşır; yerel sırtlar gerçek metre dalga boylarıyla eklenir. Göl yarıçapı 2.450 m ve boğazın en dar açıklığı 5.760 m olarak kaldı; gezegenle birlikte 100 kat büyütülmedi.
- Mesh köşeleri parça merkezine göre saklanır, kamera CPU tarafında çift hassasiyetle taşınır. Temporal AA kaldırılıp 4× MSAA kullanıldı. Eski çizgisel yüzey katmanı kaldırıldı; doku ayrıntısı mesafeye göre filtrelenir. Gölge boyutu metreye göre sabitlendi.
- Atmosfer 100 km, bulutlar 2–12 km fiziksel kabukta hesaplanır. Bulut katmanı ayrı aralıkta örneklenir; yüksek frekanslı yörünge dokusunun aliasing izleri giderildi. Bulut ve bulut gölgeleri kamera irtifası 40 km'den 30 km'ye inerken söner; 30 km ve altında hesaplama erken çıkar.
- İlk shader derlemelerinin bir bölümü yükleme sırasında asenkron hazırlanır. Eski sekmenin üretim tercihleri korunur, yarıçap yeni istek doğrultusunda 12.000 km olur.

## Doğrulama

- **21/21** Node testi: deterministik üretim, hidroloji, paket imzası, adaptör, gerçek ölçüler, sınırlı LOD parça sayısı ve yakın köşe hassasiyeti.
- **13/13** tarayıcı kabul kontrolü: üç hazır dünya, aç/kaydet, üretim iptali, kara/deniz rota canlandırması, kamera, güneş, siyasi katman, üç ekran boyutu, 2× PNG ve WebGPU olmayan veri modu.
- Chrome 155.0.8059.41, NVIDIA Turing WebGPU, 1600×1000, varsayılan ayrıntı, 32 hacim örneği, 1× piksel oranı. Her irtifada yerleşmiş görünüm 2,5 saniye ölçüldü:

| Deniz seviyesine göre irtifa | Yaklaşık FPS | Yüklü arazi parçası | Bulut katsayısı |
|---|---:|---:|---:|
| 100 km | 60,0 | 243 | 0,22 |
| 40 km | 60,3 | 279 | 0,22 |
| **33,4 km** | **60,3** | **288** | **0,059** |
| 30 km | 60,0 | 294 | 0 |
| 20 km | 60,0 | 306 | 0 |
| 5 km | 60,0 | 363 | 0 |
| 1 km | 59,9 | 507 | 0 |

33,4 km geçişinde donma veya WebGPU hatası görülmedi. Test boyunca GPU kaynak hesabı yaklaşık 67–120 MiB arasında kaldı. Bunlar bu bilgisayardaki kısa ölçümlerdir; her GPU/çözünürlük için FPS garantisi değildir. İlk yakın LOD yüklemesinde en uzun ana iş parçacığı görevi **238 ms** ölçüldü; tamamen takılmasız ilk yükleme iddiası yoktur. Yeni geometri hesapları Worker'da yaklaşık 86–1.752 ms sürdü; bu süre ana iş parçacığını bloke etmez.

- Yörüngede tek fare sürüklemesi: **5.372 km** odak değişimi. Yakın imleç odaklı zoom testindeki hedef sapması yaklaşık **1,5 mm**.
- Zaman durdurulmuş sabit yüzey kareleri aynı SHA-256 PNG imzasını verdi. Kamerayı taşıyıp koordinat merkezini değiştirerek aynı noktaya dönmek de **piksel piksel aynı** sonucu verdi.
- Kuzey/güney kutbu ve farklı küre yüzlerinde kamera koordinatları sonlu kaldı. Testlerin JavaScript/WebGPU hata listesi boş.

Ham kayıtlar: `evidence/optimization-qa.json`, `evidence/navigation-stability.json`, `evidence/browser-acceptance.json`. Uygulama görüntüleri `evidence/index.html` içinde.

## Sürüm uyumu

Çekirdek v1.1.0 ve kaynak imzası değişmiştir. v1.0 `.planet` paketleri açık sürüm hatasıyla reddedilir; eski dosyalar değiştirilmez. Eski seed ve üretim tercihleriyle yeni gezegen üretip tekrar kaydetmek gerekir. Üç hazır dünya yeni çekirdekle yeniden üretildi. Önceki teslim ZIP'i korunur; güncel paket `planet-studio-v1.1.zip` dosyasıdır.

Bu güncelleme prosedürel görünümü ve fiziksel oranları düzeltir; gerçek Dünya'nın uydu görüntüsü veya bire bir coğrafi verisi değildir. Önceki plandaki diğer açıklar TESLIM_RAPORU.md içinde belirtilmiştir.
