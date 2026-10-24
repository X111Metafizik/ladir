# ATLAS / V37

## 8.000 km çap, yeni yer şekilleri ve bölgesel streaming

**Tarih:** 24 Ekim 2026  
**Uygulama:** 1.22.1  
**Dünya seed'i:** LUMEN-742  
**Kalite:** Varsayılan

Bu dosya, sekiz sayfalık V37 PDF raporunun tam yazılı içeriğidir. Tekrarlanan sayfa üstbilgileri çıkarılmıştır. PDF'deki ekran görüntülerinin açıklamaları korunmuştur; görüntü dosyaları bu Markdown dosyasına gömülü değildir. Ölçümler rapor tarihine aittir; bu biçim dönüşümü sırasında yeni benchmark çalıştırılmamıştır.

Çalışan proje 4.000.000 m yarıçapı kullanıyor. Bağlantılı sırt, ova, göl, vadi ve kanyon sistemi mevcut V36 temelinde korundu. Bu adımda kıyı geometrisi, bölgesel örnekleme ve ön yükleme kuyruğu düzeltildi; eski dünyalar yeniden ölçeklenmedi.

## 1. Ölçülen sonuçlar

Her koşul için 3 × 60 saniye ölçüm yapıldı.

| Ölçüm | Önce: V36 | Sonra: V37 |
|---|---:|---:|
| Soğuk FPS | 47,2 | 57,7 |
| Soğuk CPU p95 / p99 | 19,3 / 28,8 ms | 12,9 / 17,2 ms |
| Soğuk kare p95 / p99 | 33,4 / 50,0 ms | 16,9 / 33,4 ms |
| Soğuk en uzun kare | 683,4 ms | 216,5 ms |
| Soğuk 100 ms üstü kare | 23 | 5 |
| Sıcak FPS | 49,6 | 59,2 |
| Sıcak CPU p95 / p99 | 9,7 / 14,3 ms | 8,3 / 10,4 ms |
| Sıcak kare p95 / p99 | 33,4 / 33,6 ms | 16,8 / 16,9 ms |
| Sıcak en uzun kare | 366,7 ms | 116,6 ms |
| Sıcak 100 ms üstü kare | 8 | 2 |

**100 FPS sağlanmış değildir.** Akış rotasında takılmalar azaldı; tam yüklenmiş yüzey sahnelerinde GPU p95 ormanda 16,6 ms, gölde 20,7 ms, kanyonda 14,2 ms. Bunlar 100 FPS için gereken 10 ms bütçesini aşıyor.

Ölçüm ortamı: GTX 1660 Ti, Chrome/WebGPU, 1440 × 1000, DPR 1, MSAA 4×, 32 hacim adımı, 2048 gölge.

Çözünürlük, yakın detay, ağaç yoğunluğu ve efektler düşürülmedi. CPU ve GPU süreleri örtüşür; toplanmaz. 60 Hz/headless sunum 100 FPS kanıtı değildir.

Soğuk koşul yeni tarayıcı depolamasıdır; işletim sistemi ve HTTP önbelleği temizlenmedi. Sıcak koşul aynı sayfadaki tekrar rotasıdır. Sabit senaryo konumlarına kamera atlamaları ve bunların uzun kareleri ölçüme dahildir.

## 2. Kaynak kodunda uygulanan değişiklikler

Dosya adları, raporda yer aldığı biçimiyle aşağıdadır.

- **`io/regional-field.mjs`:** 4 × 4 örnekleme stencil'i yeniden kullanılır. Sorgu başına 16 typed-array görünümü kaldırıldı; kanonik yükseklik değişmedi.
- **`render/terrain-data.mjs`; `water-clip.mjs`:** Kıyı üçgenleri kendi su kotunda zeminle kesilir. Farklı göl kotları birbirine eğimli bağlanmaz. Kullanılmayan su vertex'leri GPU tamponundan çıkarılır.
- **`io/regional-runtime.mjs`; `workers/regions.mjs`:** Yeni istek iptal edilmiş Promise'i devralmaz. Eksik tile aynı kamerada yeniden denenir. Worker, önceki tile tüketilmeden ikinci tile'ı göndermez; eski epoch onayı yeni işi açamaz.
- **`render/view.mjs`:** Periyodik kamera ön yüklemesi, aktif warp varış ön yüklemesini iptal etmez.
- **`studio/flight-ui.mjs`; `main.mjs`:** Sağlık/boost, işaretçi ve düşman etiketi metin/stillerinde tekrar yazma azaltıldı. Görünmeyen etiket konumları atlanır.
- **`scripts/bake-terrain.mjs`; `terrain-bake-signature.mjs`:** Bake komutu güncel kaynak imzasını önce üretir. Altı yüzün 384 taban parçası yeniden paketlendi. Eski geometri cache'i geçerli sayılmaz.

Kalıcı GPU gridleri, 3 üretim + 2 ön yükleme Worker'ı, iki aşamalı warp varışı, ortak CPU yüzeyi, instancing/havuzlar, parent LOD koruması ve mevcut su gruplaması korunur. Bu eski özellikler yeni kazanım olarak sayılmadı.

**Mikro ölçüm:** 12.000 yüzey sorgusunun beş tekrar medyanı 55,85 → 46,31 ms; %17,1 daha kısa.

33 kıyı parçasında su tamponu 462.564 → 296.628 bayt; %35,9 azalma. Terrain konum ve normalleri bire bir aynı. **Bu oranlar FPS kazancı değildir.**

**Ölçek ve kimlik:** Fizik metre, renderer gezegen yarıçapı 1.000 birimdir; dönüşüm 1.000 / 4.000.000. Gemi 110 m, seyir 700 km/sa, boost 1.800 km/sa.

Yarıçap/üretici dünya kimliğinde, geometri derleme imzası bake anahtarında kalır. Yeni görünümlü dünya ile eski kayıtlar ayrı tutulur.

## 3. Aynı kamerada önce / sonra

32 × 32 km referans bölge:

- Seed: LUMEN-742.
- Kamera yüksekliği: 22.727,45 m.
- FOV: 48°.
- Aynı konum ve bakış.

Önceki V36 zaten yeni yer şekillerini içeriyordu; bu karşılaştırma V37 optimizasyonunun coğrafyayı koruduğunu gösterir.

**ÖNCE / V36 - görsel açıklaması:** Gri materyal, yandan ışık. LOD 11-16; grid minimum / medyan / maksimum: 7,53 / 15,07 / 241,17 m/hücre.

**SONRA / V37 - görsel açıklaması:** Aynı metre/hücre ve kamera. Ana/yan sırtlar, ova, göl, birleşen vadiler ve sağdaki kanyon korunur.

## 4. Biçim, grid ve drenaj ayrı incelendi

**Yoğun referans grid - görsel açıklaması:** 1,88 / 3,77 / 120,62 m/hücre; LOD 10-16; aynı 22.727,45 m kamera, FOV 48°. Daha yoğun mesh ana silueti değiştirmez; yerel kıyı ve detay örneklemesi sıklaşır.

**Akış / havza görünümü - görsel açıklaması:** Göl ve taşma kotu 1.380 m. Akarsular ortak kayıttan gelir. Sağ alttaki analiz son yüzeyden Worker'da hesaplanan tanıdır; pakette yeni bir yoğun akış/birikim rasterı varmış gibi sunulmaz.

## 5. Son görünüm ve gerçek GPU sınırı

**Son materyal ve açık hava - görsel açıklaması:** Aynı kamera. Referans havza bir kez kullanılır; gezegen bu bölgenin kopyalarıyla kaplanmaz.

Tam yüklenmiş sahnelerde:

| Sahne | CPU p50 / p95 | GPU p50 / p95 | Çizim p50 |
|---|---:|---:|---:|
| Orman | 3,5 / 5,1 ms | 14,2 / 16,6 ms | 37 |
| Göl | 5,0 / 7,2 ms | 17,1 / 20,7 ms | 96 |
| Kanyon | 3,4 / 4,8 ms | 12,0 / 14,2 ms | 25 |

Her sahnede görünür geometri ve su grupları hazır olduktan sonra 8 saniye ölçüldü; CPU profiler etkisi bu sabit sahne kontrolüne dahildir.

Göl: 471 aktif su parçası, mekânsal gruplama ile 96 medyan toplam çizim. Çizim sayısının azalması piksel/ışık maliyetini tek başına kaldırmıyor.

### Tepe bellek - MiB

| Bellek türü | Önce soğuk / sıcak | Sonra soğuk / sıcak |
|---|---:|---:|
| Ana JS heap | 326,3 / 362,7 | 413,9 / 384,4 |
| İzlenen CPU tamponları | 130,6 / 150,2 | 207,3 / 136,3 |
| Kalıcı grid bankaları | 66,0 / 73,9 | 101,8 / 69,9 |
| Canlı GPU API buffer'ları | 84,9 / 99,8 | 119,8 / 94,6 |

**Soğuk tepe bellek arttı; bellek kazanımı iddia edilmiyor.** Geçiş/varışta daha fazla hazır yüzey birlikte tutuldu. Worker heap'leri ana heap ölçümüne dahil değildir; API buffer baytı fiziksel VRAM ölçümü değildir.

## 6. Tekrarlar ve senaryo karşılaştırması

Aşağıdaki tabloda S = soğuk, I = sıcak. FPS dışındaki süreler milisaniyedir. Telefonda daha rahat okunması için CPU/GPU değerleri ve kare süreleri aynı hücrelerde birleştirilmiştir.

| Koşu | FPS | CPU / GPU p95 | Kare p95 / p99 / maks. |
|---|---:|---:|---:|
| Önce 1 S | 46,2 | 18,2 / 7,2 | 33,4 / 50,1 / 683,4 |
| Önce 1 I | 48,5 | 9,7 / 4,9 | 33,4 / 33,6 / 166,8 |
| Önce 2 S | 47,4 | 18,8 / 7,4 | 33,4 / 49,9 / 150,0 |
| Önce 2 I | 58,4 | 10,1 / 4,6 | 16,9 / 33,3 / 149,9 |
| Önce 3 S | 48,1 | 20,2 / 7,6 | 33,4 / 50,1 / 583,3 |
| Önce 3 I | 41,7 | 8,6 / 5,6 | 33,4 / 50,1 / 366,7 |
| Sonra 1 S | 57,9 | 12,4 / 7,6 | 16,9 / 33,4 / 183,3 |
| Sonra 1 I | 59,3 | 8,2 / 5,9 | 16,8 / 16,9 / 83,3 |
| Sonra 2 S | 57,5 | 13,2 / 7,7 | 16,9 / 33,4 / 216,5 |
| Sonra 2 I | 58,9 | 8,4 / 5,8 | 16,8 / 17,0 / 116,6 |
| Sonra 3 S | 57,7 | 13,1 / 7,9 | 16,9 / 33,4 / 199,9 |
| Sonra 3 I | 59,3 | 8,3 / 5,8 | 16,8 / 16,9 / 83,3 |

Toplamlar kare kayıtları birleştirilerek hesaplandı, yüzdeliklerin ortalaması alınmadı.

Üç soğuk açılış:

- Önce: 34,06 / 35,43 / 39,74 sn.
- Sonra: 24,66 / 25,99 / 24,33 sn.
- Medyan: **35,43 → 24,66 sn**.

Sıcak rota için ikinci bir sayfa açılışı ölçülmedi.

### Senaryolar - altı koşu birleşik

Değerler **önce → sonra**, süreler milisaniyedir.

| Senaryo | CPU p95 | GPU p95 | En uzun kare |
|---|---:|---:|---:|
| Orman / alçak | 17,1 → 11,6 | 5,7 → 7,2 | 583,3 → 116,4 |
| Göl | 25,2 → 16,4 | 8,7 → 9,2 | 83,5 → 66,6 |
| Akarsu | 19,3 → 12,5 | 8,6 → 8,8 | 66,4 → 33,4 |
| Kanyon dönüşü | 13,8 → 9,8 | 6,1 → 5,4 | 100,0 → 33,4 |
| Boost | 19,1 → 12,8 | 7,6 → 7,3 | 150,0 → 66,6 |
| Boost bırakma | 17,9 → 12,3 | 7,3 → 6,7 | 50,0 → 33,4 |
| Çatışma | 19,1 → 14,0 | 7,2 → 6,8 | 183,3 → 50,0 |
| 1.000 km warp | 17,3 → 12,2 | 6,6 → 5,9 | 683,4 → 100,1 |
| 12.000 km warp | 7,3 → 5,7 | 3,6 → 3,4 | 83,3 → 33,5 |
| Küp yüzü | 9,8 → 8,2 | 4,5 → 4,2 | 216,6 → 216,5 |
| Kutup | 7,9 → 7,2 | 3,9 → 6,2 | 116,6 → 116,6 |

**Küp yüzü geçişindeki uzun kare kaldı.** Ayrı CPU profilinde grid slot paketleme, HUD güncellemesi, efekt güncellemesi ve GPU gönderimi öne çıktı.

GC toplam 102 ms / yaklaşık 8 sn profildir; 216 ms tek karenin tamamı GC'ye yüklenemez.

## 7. Doğrulama, paket ve kalan işler

**187/187 otomatik kontrol geçti.** İlk tam koşuda 185 geçiş / 1 eski bake imzası hatası görüldü. Paketler güncellendi, son tam koşu sıfır hatayla tamamlandı.

Yeni Worker teslim testi iptal, eski epoch onayı ve tek tile sınırını gerçek Worker mesajlarıyla denetler.

Chrome kontrolleri:

- Varsayılan ve kayıtlı dünya: 8.000.000 m çap.
- 500 m uçuş.
- Yörünge.
- Doğal uçuş katmanı.
- Eski V31'in 12.000 km yarıçapı.
- Eski klasik dünyanın 12.000 km çapı.

Bunlar doğrulandı. Sayfa/JavaScript hatası yok. Sayısal dikiş, hidroloji, ağaç kökü, iniş ve warp kontrolleri tam paketin içindedir.

### Warp kabulü

| Warp | İlk yüzey | Tam ayrıntı |
|---|---|---|
| 1.000 km / 3 sn | Varıştan önce hazır | 11,66 sn hazırlık; varıştan 5,89 sn sonra hazır |
| 12.000 km / 12 sn | Varıştan önce hazır | 5,41 sn; varıştan önce hazır |

Doğrusal warp rotası değişmedi. Hatalı aşağı rota yaklaşık 274,9 km sonra zeminle çarpıştı; gemi hasar/çarpışma durumuna geçti.

Serbest düşüş hızlanması ve frenleme kontrol edildi. **Kısa warp için "beklemesiz tam detay" iddia edilmiyor.**

### Bölgesel paket

Mevcut V36 kanonik paket korunur:

- 256 adet 2 × 2 km tile.
- 64 hücre/tile.
- 31,25 m raster.
- Halo ve SHA-256 bütünlük kontrolü.

Mesh LOD'si ayrı kalır. Kıyı/ince keskin ayrıntılar analitik üreticiye döner; yüklenen ve eksik paket yolu aynı kanonik yüzeyi kullanır. 32 km dışı üretici devam eder.

**Yeni tam gezegen bake'i yapılmadı.** Yenilenen 384 parça yalnız uzak taban LOD'sidir: 4.545.224 bayt.

Komutlar:

```bash
npm run bake:region -- fixtures/lumen-v35.planet --cells=64
npm run bake:terrain -- fixtures/lumen-v35.planet
npm run build
npm test
```

İlk komut yalnız bölgesel paketi yeniden üretmek istendiğinde gerekir; hazır paket dağıtımda bulunur.

İmzaları eşlemek için bölgesel bake, taban bake ve build sırasını koru.

Önceki kaynak yedeği, rapordaki proje içi adıyla: `evidence/v37/source-v36.zip`.

## 8. Kalan darboğazlar ve teslim

**500 m uçuş kabul kontrolü - görsel açıklaması:** Doğal yüzey katmanı, 4.000 km fizik yarıçapı, gemi ölçeği ve beceri arayüzü korunur.

### Tam yüzey GPU p95: 14,2-20,7 ms

Sonraki ölçülü adım: Su/terrain piksel ve shader maliyetini ayrı GPU geçişlerinde ayırmak; yakın kaliteyi düşürmeden maliyeti azaltmak.

### Kısa warp ince ayrıntısı geç kalıyor

Sonraki ölçülü adım: Varış üretim planı ve GPU slot paketlemeyi daha erken kademelendirmek. Kaba yüzeyi tam detay diye işaretlememek.

### Soğuk geçiş belleği ve küp yüzü uzun karesi

Sonraki ölçülü adım: Aktif/geçiş bankaları için yüzeyi bozmayan tahliye ve slot paketleme bütçesi. Mevcut toplam aktif sınır yumuşaktır.

### Henüz eklenmeyen mimari işler

Ayrı uzak statik gölge dokusu cache'i ve temporal vertex morph yoktur. Hareketli gölgeler dondurulmadı.

### Kanıt dosyaları

Raporda şu proje içi dosyalar belirtilmiştir:

- `evidence/v37/results.json`
- `before-endurance/benchmark.json`
- `after-endurance/benchmark.json`
- `probe/probe.json`
- `navigation/browser.json`
- `world/qa.json`
- `final-tests-verified.txt`

Değişen kaynak listesi `changed-files.json` içindedir. Önceki V31 sayıları bu yeni ölçümün yerine kullanılmadı.
