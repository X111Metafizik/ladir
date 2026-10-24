# NADİR / Planet Studio

## Güncel ad: NADİR - v1.22.3

Projenin yeni adı **NADİR**. Uygulama başlığı, marka alanı, havza inceleme ekranı, ayar/kamera dosyalarının dışa aktarma adları ve npm paket adı güncellendi. Terrain, fizik ve performans davranışı V37 temelindedir.

Dünya seed'leri, kayıt dosyaları, mevcut `atlas-config-v35` tarayıcı ayar anahtarı ve bake/cache kimlikleri korunur; isim değişikliği kayıtları sıfırlamaz. Tarihsel ölçüm raporları ve kaynak kanıtları özgün **ATLAS** adlarıyla durur.

## GitHub kurulumu ve sürüm akışı

Bu depo, ATLAS / Planet Studio **v1.22.1 / V37** çalışmasının başlangıç sürümünü içerir. Kaynak kod, kullanıcı tarafından sağlanan gemi modeli, stamp/terrain verileri, hazır bölgesel paketler, eski dünya kayıtları, testler ve V37 ölçüm kanıtları birlikte saklanır.

Gereksinim: **Node.js 24 veya üzeri**, npm ve WebGPU destekleyen güncel bir tarayıcı.

```sh
npm ci
npm test
npm run build
npm start
```

Sunucu varsayılan olarak `http://127.0.0.1:4399/` adresinde açılır. Derlenmiş uygulamada 8.000 km çaplı referans dünyayı açmak için `http://127.0.0.1:4399/?world=fixtures/lumen-v35.planet&view=reference&region=baked&v=37` kullanılır. Port doluysa mevcut sunucuyu kapat veya `PORT` ortam değişkenini değiştir. Geliştirme sunucusu için `npm run dev` kullanılabilir.

Hazır bake ve bölge dosyaları `assets/` içindedir; ilk kurulumda yeniden bake gerekmez. Terrain kaynakları değişirse aşağıda açıklanan bölgesel bake, taban bake ve build sırası izlenir. Kaynak baytları cache imzasına dahil olduğundan Git satır sonlarını otomatik dönüştürmez.

- [Tam Markdown raporu](../../output/reports/ATLAS_V37_Rapor.md)
- [PDF raporu](../../output/pdf/ATLAS_V37_Sonuc.pdf)
- [Ölçüm sonuçları](../../evidence/v37/results.json)
- [Kaydedilmiş kamera rotası](../../evidence/v37/camera-route.json)

`main` tamamlanmış ve doğrulanmış değişiklikleri tutar. Sonraki geliştirmeler ayrı dalda yapılır; ilgili testler ve üretim derlemesi geçtikten sonra birleştirilir. Her değişiklik açıklaması uygulanan işi, doğrulamayı ve kalan sınırları belirtir. Otomatik test/derleme geçişi tek başına uçuş akıcılığı veya 100 FPS doğrulaması değildir.

`node_modules`, `dist`, geçici dosyalar, eski dağıtım kopyaları ve aynı içeriği tekrarlayan ZIP arşivleri Git'e alınmaz. Yerel dosyalar silinmez. Bu özel depo, kullanıcı tarafından sağlanan varlıklara yeni bir açık kaynak lisansı vermez.


## Güncel sürüm · v1.22.1 / V37

Varsayılan dünya **8.000 km çap / 4.000 km yarıçap**, `watershed-2` yer şekilleri ve küresel stamp bantlarını kullanır. Güncel açılış: <http://127.0.0.1:4399/dist/?world=fixtures/lumen-v35.planet&view=reference&region=baked&v=37>. Gri/yoğun grid/akış karşılaştırması: <http://127.0.0.1:4399/dist/reference.html?world=new>.

V36'daki kanonik coğrafya, 32 × 32 km bölgesel paket, kalıcı GPU gridleri, Worker havuzları ve iki aşamalı warp varışı korunur. Bölgesel yüzey sorgusunda 16 geçici typed-array görünümü kaldırıldı; kıyı üçgenleri kendi su kotunda kırpılır ve kullanılmayan su vertex'leri yüklenmez. Bölgesel Worker tüketim onayıyla en fazla bir tile gönderir; iptal edilmiş işler yeni isteğe taşınmaz. Kamera ön yüklemesi aktif warp varışını iptal etmez. HUD ve görünmeyen etiketlerde gereksiz bazı metin/konum yazmaları atlanır. Altı yüzün 384 uzak taban mesh'i güncel geometri imzasıyla yenilendi. `bake:terrain` komutu imzayı kendisi günceller.

**187/187 test geçti.** Gerçek Chrome/WebGPU kontrolleri çapı, 500 m uçuşu, yörüngeyi, eski kayıtları, 1.000/12.000 km warp'ı, serbest düşüşü, frenlemeyi ve zemin çarpışmasını doğruladı. Yeni sürümün dünya kimliği `595aee80687ce1d3acf102bfd9e8bb925f9b5ee4a3bca2bdc3fca5f58b2b463d`. Eski V31 12.000 km yarıçap ve klasik V33 12.000 km çap ayrı kayıtlarda özgün biçimiyle açılır. Fizik metre, renderer gezegen yarıçapı 1.000 birim; gemi 110 m ve hızlar 700/1.800 km/sa kalır.

Aynı kayıtlı rota ve varsayılan kaliteyle 3 soğuk + 3 sıcak 60 saniyelik karşılaştırma: soğuk FPS **47,2 → 57,7**, sıcak **49,6 → 59,2**. CPU p95 soğuk **19,3 → 12,9 ms**, sıcak **9,7 → 8,3 ms**. 100 ms üstü kare toplamı **31 → 7**. Soğuk açılış medyanı **35,43 → 24,66 sn**. Bütün uzun kareler dahil; CPU/GPU süreleri toplanmaz. Önce/sonra testin iki sürümü de yeni yer şekillerini içerir; V31 yalnız tarihsel referanstır.

**100 FPS sağlanmadı.** Tam yüklenmiş orman/göl/kanyonda GPU p95 **16,6 / 20,7 / 14,2 ms**. Soğuk tepe ana JS heap **326,3 → 413,9 MiB**; bellek azalmış değildir. Worker heapleri dahil değildir. Küp yüzü geçişinde 216,5 ms kare kaldı. Kısa warp'ta ilk yüzey hazır olsa da tam detay varıştan 5,89 sn sonra tamamlandı; uzun warp'ta önceden hazırdı. Ayrı uzak statik gölge dokusu cache'i ve temporal vertex morph henüz yok; aktif/geçiş belleği sert toplam sınırla kesilmez.

İndirilebilir PDF: `output/pdf/ATLAS_V37_Sonuc.pdf`; çevrimdışı telefon uyumlu HTML: `output/reports/ATLAS_V37_Sonuc.html`. Ham ölçümler, aynı kamera görüntüleri, testler ve CPU profilleri `evidence/v37/` altında. Geri dönüş kaynağı `evidence/v37/source-v36.zip`; değişen kaynak paketi `output/regions/ATLAS_V37_Source_Changes.zip`.

Hazır 32 km paketi `output/regions/ATLAS_Reference_32km_V36.zip` olarak korunur. Sıfırdan yeniden üretmek gerekirse:

```sh
npm run bake:region -- fixtures/lumen-v35.planet --cells=64
npm run bake:terrain -- fixtures/lumen-v35.planet
npm run build
npm test
```

Bölgesel pakette yoğun akış yönü/birikim rasterı yoktur; mevcut hidroloji kayıtları ve son yüzey Worker tanısı kullanılır. Mesh çözünürlüğü ile 31,25 m paket rasterı ayrı kavramlardır. Yakın kıyı/sert kategori sınırları analitik üreticiyle korunur. Bütün gezegen tek dosyaya bake edilmez.

Aşağıdaki notlar tarihsel sürümlere aittir.

## Güncel sürüm · v1.20.2 / V34

Son gönderilen geliştirme metnindeki **8.000 km çap / 4.000 km yarıçap** hedefi varsayılandır. Yeni dünya: <http://127.0.0.1:4399/dist/?world=fixtures/lumen-v34.planet&view=reference&v=34>. Önceki **12.000 km çaplı klasik görünüm** ayrı, değişmeden yüklenir: <http://127.0.0.1:4399/dist/?world=fixtures/lumen-v33.planet&view=stamps&v=34>.

Üretici 1.7.2, açık yarıçap/model ve derleme imzası dünya kimliğindedir. V31, V32, V33 paketleri özgün coğrafyasıyla açılır. Yeni ayarlar `atlas-config-v34` anahtarındadır. 110 m gemi, 700/1.800 km/sa hızlar, 1.000–12.000 km doğrusal warp ve çarpışma değişmedi. V32'nin bağlantılı sırt/havza ve tek 32 × 32 km referans bölgesi korundu; aynı yöntem yeniden yazılmadı.

Yeni motor değişiklikleri:

- Kalıcı terrain bankasının boş slotlarını CPU'dan GPU'ya kopyalamayan, Three r186'ya sınırlı tahsis adaptörü. Kullanılan slotlar aynı kısmi aktarım yoluyla yüklenir. Bir karede en fazla bir yeni banka; ilk tahsis baytı/süresi ayrıca ölçülür.
- Opak suyun tam kıyı üçgenlerini, normallerini, sığlıklarını ve farklı göl kotlarını koruyan mekânsal gruplar. CPU meshleri korunur. Geometri havuzu ve gruplar 24 MiB; hazırlık ve aktarım kare bütçesine dahildir.
- Atmosfer+bloom için gereksiz tam çözünürlükte ara birleştirme hedefi kaldırıldı. Varsayılan DPR, MSAA, bulut adımı, gölge çözünürlüğü, ağaç yoğunluğu ve yakın detay değişmedi.
- İptal edilen mesh temizliği karelere yayılır. Görünür/hazır/geçiş/ön yükleme/temizleme belleği ayrı ve uçuş sırasında güncellenen sayaçlarla izlenir; aynı kayıt iki kez sayılmaz.
- Warp'ta kaba yüzeyin GPU aktarımıyla tam detayın CPU üretimi örtüşür. Varış su tamponları kalkış kamerasının dışında da hazırlanır. Parent yüzey hazır çocuk grubu gelene kadar kalır.

161 otomatik kontrol geçti. `evidence/v34/browser/qa.json`, 8.000 km dünyayı, 500 m uçuşu, yörüngeyi ve eski kayıtları gerçek Chrome/WebGPU ile doğrular. `scripts/benchmark-endurance.mjs` sabit kayıtlı rotayı üç soğuk/sıcak 60 saniyelik çiftle ölçer; GPU yüzdelikleri gerçek kare kimliklerinden hesaplanır. `scripts/probe-render-v34.mjs` tam yüklü sabit sahneleri ayrıca ölçer. Yeni rapor `output/v34/ATLAS_V34_Sonuc.html`, PDF `output/pdf/ATLAS_Terrain_Ucus_Performans_V34.pdf`; ham kanıtlar `evidence/v34/` içindedir.

Sınırlar: 100 FPS garanti edilmez. Aktif/geçiş/varış bellek eşikleri izlenir, atomik geçişi kesen toplam sert RAM sınırı değildir. Ayrı uzak statik gölge cache'i ve temporal vertex morph eklenmedi. Worker heapleri ana sayfa heap sayısına dahil değildir. Kısa warp'ın tam detay hazırlığı ayrıca ölçülür; önizleme hazır olması tam ayrıntı hazır sayılmaz.

Son V34 ölçümü: sabit göl kamerasında 366 → 183 çizim, CPU p95 12,6 → 10,2 ms; GPU p95 yaklaşık 23,7 ms kaldı. Yeni dünyada üç soğuk/sıcak 60 saniyelik tekrar toplamında 50,0 / 47,2 FPS; en uzun kareler 716,7 / 2.816,7 ms. Klasik dünya/yeni motor koşusunda 9,9 saniyelik duraklama dahil tüm örnekler raporda tutuldu. Aynı dönemde sistem RAM baskısı ve sayfalama ölçüldü; karşılaştırmanın tamamı kod kazancı olarak sunulmaz. Soğuk 1.000 km warp'ta tam detay varıştan 6,77 saniye sonra hazırdı; 12.000 km uzay warp'ında varıştan önce hazırdı.

Son 2×2 su gruplaması sonrasında 7 ilgili test tekrar geçti; 161 kontrollük tam paket önceki 4×4 ayarında geçti. Son tarayıcı, warp ve görsel kontrolleri 2×2 sürümündendir. Rapor `node scripts/serve-report.mjs --v34` ile yalnız <http://127.0.0.1:4403/> üzerinde açılır. PDF ve görselleri içinde taşıyan HTML indirilebilir ve telefona dosya olarak aktarılabilir. Bu V34 sunucusu LAN'a açılmaz.

Kaynak geri dönüşü: `evidence/v34/source-v33.zip`; önceki çalışan dağıtım `evidence/v34/baseline-dist/`. Aşağıdaki sürüm notları tarihsel kayıttır.

## Eski arazi görünümü / 12.000 km çap · v1.20.1 / V33

Güncel açılış: <http://127.0.0.1:4399/dist/?world=fixtures/lumen-v33.planet&view=stamps&v=33>.

Varsayılan dünya önceki GLB stamp tabanlı `legacy-1.6` arazi görünümüne döndü; **çap 12.000 km, yarıçap 6.000 km**. LUMEN-742 seed'i, önceki iklim, materyal, stamp, dağ/ova ve bitki ayarları korunur. V32'nin yönlü sırt üretimi ve özel 32 km referans havzası yeni açılış dünyasında etkin değildir. Metre cinsinden yükseklikler, gemi ölçüsü, su ve uçuş parametreleri ayrıca küçültülmez; V32'nin Worker, LOD, aktarım ve dikiş düzeltmeleri korunur.

Yeni kayıt `fixtures/lumen-v33.planet`, üretici 1.7.1 ve arayüz ayar anahtarı `atlas-config-v33` kullanır. V31 ve V32 kayıtları özgün yarıçap/üretim modeliyle açılmaya devam eder; önceki dünyaların üzerine yazılmaz. Kontrol kayıtları `evidence/v33/`, değiştirilen V32 kaynaklarının yedeği `evidence/v33/source-v32.zip` içindedir. Aşağıdaki V32 raporu önceki sürümün ölçümüdür.

## Bağlantılı yer şekilleri ve 8.000 km çap · v1.20.0 / V32

Açılış: <http://127.0.0.1:4399/dist/?world=fixtures/lumen-v32.planet&view=reference&v=32>.
Karşılaştırma aracı: <http://127.0.0.1:4399/dist/reference.html>.
Çevrimdışı, telefon uyumlu sonuç: `output/v32/ATLAS_V32_Sonuc.html`.
Telefon için yalnız raporu sunan `node scripts/serve-report.mjs --v32`, 4402 portunu kullanır. Bu oturumda aynı Wi-Fi adresi <http://192.168.1.5:4402/>; bilgisayar açık kalmalıdır. Rapor 360 / 390 / 768 / 1280 px genişliklerde ve indirilen dosya çevrimdışı açılarak doğrulandı. Fiziksel telefondan ağ erişimi test edilmedi.

Yeni dünya **4.000.000 m yarıçap / 8.000.000 m çap** kullanır. Fizik metre, renderer yarıçapı 1.000 birim olarak çalışır; metre → render dönüşümü yarıçaptan hesaplanır. Gemi 110 m, seyir 700 km/sa, boost 1.800 km/sa kalır. Atmosfer/bulut irtifaları, su, kamera, ufuk, uçuş ve çarpışma aynı fiziksel ölçeği kullanır. Bütün sahne tek bir çarpanla küçültülmedi.

`watershed-2` üretimi, küresel yönlü sırt/ova dağılımını bölgesel yer şekillerinden ve yakın yüzey ayrıntısından ayırır. Sabit LUMEN-742 seed'inin tek bir 32 × 32 km referans havzasında ana/yan sırtlar, farklı zirveler, etek ve ova, kıvrımlı vadi akarsuları, 1.380 m kotlu göl/taşma çıkışı ve ayrı karakterde kanyon bulunur. Bu bölge gezegen boyunca tekrar döşenmez. Göl ve akarsu yüzeyleri ortak hidroloji kaydını kullanır; ova ayrıntısı ana biçimi örtmez.

`reference.html` gerçek üretim renderer'ı ile eski/yeni içerik, gri yandan ışık, mevcut/yoğun grid, akış-havza ve son materyal görünümlerini açar. Metre/hücre, kamera yüksekliği, FOV ve LOD kaydedilir. Referans drenajı son yüzeyden ayrı Worker'da hesaplanır. `evidence/v32/visual/` aynı kameralardan görüntüleri içerir.

Üretici **1.7.0**, üretici derleme özeti, yarıçap ve içerik dünya/önbellek kimliğine dahildir. Eski `atlas-config` yerel kaydı değiştirilmez; yeni ayarlar `atlas-config-v32` anahtarındadır. Önceki 1.6.0 dünya paketi açıkça tanınarak yüklenir; bilinmeyen çekirdek sessizce yeniden üretilmez. Eski 12.000 km yarıçaplı dünyaya dönüş: <http://127.0.0.1:4399/dist/?world=fixtures/legacy-lumen-v31.planet&view=stamps&v=32>. Kaynak geri dönüşü `evidence/v32/source-v31.zip`, eski bağımsız dağıtım `evidence/v32/baseline-dist/` içindedir.

Terrain Worker'ları tam boyutlu typed-array ve hazır sınır küresi gönderir. Eski kamera işleri iptal edilir; teslim kredisi ve kare maliyetine bağlı yükleme bütçesi kuyruğu sınırlar. Kalıcı grid bankaları, değişmeyen ofset/HUD aktarımını atlar. Parent yüzey yeni detay hazır olana kadar korunur. Ekran hatası, kıyı/akarsu genişliği ve histerezis LOD seçimindedir; farklı çözünürlüklerin köşe ve kenar örnekleri aynı frekans bandında buluşur.

Doğrulama: **153/153 otomatik test**, üretim derlemesi, gerçek Chrome/WebGPU kabul testi. Görünür mesh üzerinde **149.244 sınır karşılaştırmasında en büyük fark 2,04 mm**, 1 cm üzeri açıklık sıfır. Ağaç kökü örnekleri görünür yüzeyin yaklaşık 25 cm içindedir. İniş, kalkış, boost, silahlar, uzaya warp, zemin çarpışması, serbest düşüş ve farklı biyomlar kontrol edildi. Drenaj tanılamasında ters akış sayısı sıfırdır; bu, gezegenin her noktasının görsel olarak onaylandığı anlamına gelmez.

**100 FPS sağlanmadı.** GTX 1660 Ti, 1440 × 1000, DPR 1, MSAA 4×, 32 bulut adımı ve 2048 gölge çözünürlüğüyle yeni içerikte uçuş senaryoları yaklaşık **33–45 FPS**; göl görünümü 28,6 FPS ve GPU medyanı 16,3 ms. 60 Hz sunum aralığı, ana iş parçacığı CPU maliyeti ve GPU timestamp ölçümü ayrı tutulur; CPU/GPU süreleri toplanmaz. Eski içerik/optimize motor koşusunda kanyon 733 ms, boost 650 ms uzun kareleri kaldı. Üç koşulun tamamı, p95/p99, kuyruk ve bellek kayıtları sonuç dosyasındadır; görüntü kalitesi azaltılmadı.

Kalan sınırlar: Kısa 1.000 km warp'ta ilk yüzey varıştan önce hazırdı, tam ayrıntı varıştan 5,62 sn sonra tamamlandı; 12.000 km koşusunda tam ayrıntı önceden hazırdı. Cache hedefi 48 MiB'dir ancak aktif/pinned yüzey için katı toplam bellek sınırı yoktur; 192 MiB hazır tampon eşiği yalnız izlenir. Temporal vertex geomorph üretim yolunda yoktur. Ortak grid + height-tile GPU prototipi 12 gerçek parçada konum taşımasını yaklaşık %50 azalttı ve <0,4 mm hata verdi; CPU yüzey üretimini ortadan kaldırmadığı için üretime geçirilmedi ve FPS kazancı sayılmadı.

Tekrar doğrulama: `npm test`, `npm run build`, `node scripts/verify-reference.mjs`, `node scripts/verify-flight-v32.mjs`. Tarayıcı komutları Chrome ve `PLAYWRIGHT_MODULE` ortam değişkeniyle belirtilen Playwright kurulumunu gerektirir. Üç rota koşusunu `scripts/benchmark-route.mjs` çalıştırır; eski motorda aynı paketi içe aktarmak için `BENCH_FIXTURE` kullanılır. Ham kanıtlar `evidence/v32/`, derlenen dosya imzaları `evidence/v32/verification.json`, değişen kaynak listesi `evidence/v32/changed-files.json` içindedir. Aşağıdaki V31 ve daha eski bölümler tarihsel kayıttır.

## Warp ön yükleme, çarpışma ve performans raporu · v1.19.0

Açılış: <http://127.0.0.1:4399/dist/?view=stamps&v=31>.

Warp mesafeleri 1.000 / 3.000 / 6.000 / 9.000 / 12.000 km. Dolum son seçimden sonra 3 saniye; yolculuk süreleri 3 / 3 / 6 / 9 / 12 saniye. Zemin üzerinden geçecek yön artık reddedilmez. Sürekli hareket taraması, yüzey temasında eğime göre darbe ve hasar uygular; yüksek hızlı çarpışma gemiyi devre dışı bırakır. Aşağı uçuşta irtifaya bağlı yerçekimi/direnç ile ek hız birikir, fren ve toparlama bunu söndürür. Düz seyir 700, motor boost hızı 1.800 km/sa kalır; dalış ek hızı bunları aşabilir.

Varış yüzeyi dolum sırasında hazırlanır; tam uçuş LOD’u da yolculuk tamamlanmadan ayrı Worker havuzunda üretilip GPU’ya aktarılır. Ana arazi kuyruğu geçici warp konumları için iş üretmez. Ortak parçalar korunur; hazır yüzey varışta atomik değiştirilir. Ayrıntı yetişmezse yüzey hemen açılır ve ayrıntılı iş devam eder. Son tarayıcı koşusunda 1.000 km için yüzey 1,20 sn, tam LOD 4,02 sn; 12.000 km için 0,36 / 1,77 sn. Her ikisi varıştan önce hazırdı; sahne değişimleri 14,5 / 3,3 ms. Soğuk önbellekte tüm kısa rotalar için anında tam ayrıntı garantisi değildir.

Komşu/dikiş geçiş gruplaması ana iş parçacığından LOD Worker’a taşındı. Uzayda görünmeyen bitkiler artık ana iş parçacığında yüzey/nehir/stamp sorgusu yapmıyor. 144 KiB/kare grid örnek aktarım sınırı sürüyor; yeni banka ilk tahsisi ve diğer GPU aktarımları bu sınırın dışındadır.

81 hedefli regresyon kontrolü, üretim derlemesi ve klavye/tekerlekle gerçek Chrome/WebGPU kabul testi geçti. `evidence/v31/final-benchmark/` son 10 senaryolu ölçüm; `ablation/` ayrı GPU maliyet deneyi; `final-browser/` warp/çarpışma/serbest düşüş; `report-qa/` mobil düzen ve dosya indirme kanıtı. Önceki koşular tanı kaydı olarak tutuldu.

Son uçuş ölçümleri yaklaşık 42–53 FPS; su görünümü 37 FPS. Boost bırakma en uzun kare aralığı iki kısa karşılaştırma koşusunda 817 → 150 ms oldu. Yakın orman geçişindeki 417 ms kare aralığı ve 424 ms uzun görev devam eden risklerdir. 100 FPS henüz sağlanmadı; rapor ölçülen değerleri, olası nedenleri ve henüz uygulanmamış A/B/C seçeneklerini ayırır.

11 sayfalık telefon uyumlu PDF: `output/pdf/ATLAS_Terrain_Ucus_Performans_V31.pdf`. Bağımsız mobil HTML: `output/mobile-report/index.html`. Yalnız raporları sunan `node scripts/serve-report.mjs`, 4401 portunda çalışır; aynı Wi-Fi bağlantısı <http://192.168.1.5:4401/>. IP değişirse bağlantı/QR güncellenmelidir. Mobil rapor 360 / 390 / 768 / 1280 px’de ve PDF indirmesi dosya özetiyle doğrulandı. Telefonun kendisinden erişim testi yapılmadı.

## Yörünge arazi çözünürlüğü · v1.18.2

Açılış: <http://127.0.0.1:4399/dist/?view=stamps&v=30>.

400–450 km irtifada ekranın bir bölümünün iri renk hücrelerine düşmesinin nedeni, ayrıntılı geometriyi **kameradan 480 km uzaklıkta aniden kesen** LOD koşuluydu. Bu sınır kaldırıldı. Yüzey ağı görünür alanın tamamında mesafe ve bakış açısına göre kademeli sadeleşir; küp yüzünün izdüşümü ve ufuktaki daralan görünür alan hesaba katılır. Böylece aynı görüntüde detaylı dağların yanında kaba hücrelerden oluşan keskin bir bant kalmaz.

Yalnızca arazi çizim planı değişti; yükseklik üretimi, yakın yüzey hedefleri, dikişler ve 144 KiB kare başına aktarım sınırı korunur. Eski sınırın ötesindeki yüzey artık daha fazla geometri kullanır; bu düzeltme anında tam yüklenme veya 100 FPS garantisi değildir. 400 / 446 / 479 / 481 / 520 / 800 / 2.000 km irtifaları için görünür yüzeye ışın örnekleriyle kapsama, hücre boyutu ve toplam geometri bütçesi kontrol edilir. Ölçümler ve test kayıtları `evidence/v30/` içindedir.

37 farklı arazi/LOD testi geçti. Güncel dağıtım Chrome/WebGPU'da yeniden açılarak, paylaşılan konumda 446 km ve 520 km uçuş görüntüleri kontrol edildi; taktik görünüm kapalı, yükleme kuyruğu tamamlanmış ve hata kaydı boştu. Kare başına en yüksek geometri aktarımı 146.496 bayt ile mevcut 147.456 bayt sınırının altında kaldı. Tarayıcı kaydı `evidence/v30/browser.json`, görüntüler `after-446km.png` ve `after-520km.png`, imzalar `verification.json` içindedir.

## Warp mesafeleri · v1.18.1

Açılış: <http://127.0.0.1:4399/dist/?view=stamps&v=29>.

**1 → fare tekerleği:** mesafeler **3.000 / 6.000 / 9.000 / 12.000 km** olarak düzeltildi. Simülasyon bunları 3.000.000–12.000.000 metre olarak işler. Arayüz, bildirimler ve hedef konumu aynı ölçeği kullanır. Yolculuk süreleri sırasıyla **3 / 6 / 9 / 12 saniye**; son seçimden sonra üç saniye dolum, son bölümde yumuşak yavaşlama ve varıştan sonra 20 saniye bekleme vardır. Gemi hangi yöne bakıyorsa o yönde ilerler; uzaya çıkış desteklenir.

v1.18'deki uçuş hazırlığı optimizasyonları ve uçuşta doğal gezegen LOD'u korunur. Uçuş sırasında taktik görünüm açılmaz. Aşağıdaki v1.18 ölçümleri eski 3–12 km seçeneğiyle alınmış tarihsel kayıtlardır; güncel mesafeler bu bölümdekilerdir.

73 hedefli test geçti. Chrome/WebGPU'da gerçek tuş ve tekerlek girdileriyle dört seçim, dolumda duraklatma, 6.000 km / 6 sn ve 12.000 km / 12 sn yolculuk, uzaya çıkış, kamera takibi, 700 km/sa çıkış hızı, onarım ve doğal görünüm doğrulandı. JavaScript/WebGPU hatası kaydedilmedi. Test kaydı, tarayıcı sonuçları, ekran görüntüleri ve dağıtım imzası `evidence/v29/` içindedir.

## Seçilebilir warp ve hızlı uçuş açılışı · v1.18

Açılış: <http://127.0.0.1:4399/dist/?view=stamps&v=28>.

**1 → fare tekerleği:** 3 / 6 / 9 / 12 **km** arasından seç. Yukarı çevirme mesafeyi artırır, aşağı çevirme azaltır; dört mesafe kutusuna tıklamak da mümkündür. Son değişiklikten üç saniye sonra hareket başlar. Dolum sırasında tekerlek takip kamerasını değiştirmez. Seçim duraklatmada donar, hareket başladıktan sonra kilitlenir ve sonraki kullanımda hatırlanır. Yolculuk mesafeyle orantılı 3 / 6 / 9 / 12 saniye sürer; son üçte birlik bölümde 700 km/sa seyir hızına iner. Varıştan sonra 20 saniye bekleme, uzaya yönelme ve arazi çarpışması denetimi korunur. Warp tünelinin renk hesabı çevresel UV dikişinde kesintisiz tekrar eder.

Uçuşta hiçbir irtifada taktik renklendirme, bölge çizgileri veya taktik etiketi gösterilmez. Gezegen doğal malzemesi ve normal mesafe LOD'u ile çizilir. Editörde seçilmiş analiz katmanı uçuşa taşınmaz; editöre dönüşte geri yüklenir. Bulutların 30–38 km aralığında dağılması sürer; atmosfer yoğunluğu görünüm ayarını korur.

Gemi dosyası ve itki dokusu birlikte yüklenir. Model çözme ve uçuş shader/GPU hazırlığı, gezegenin Worker üretimi sürerken yapılır. Aynı görünümde sonraki uçuş girişleri bu kaynakları yeniden kullanır. Hazır yerel yüzey korunur; hiç yakın yüzey yoksa dikişleri tamamlanmış ilk yüzey beklenir. En yüksek arazi ayrıntısı ve bitki üretiminin tamamı artık kokpitin açılmasını engellemez. Tam ayrıntı aynı geometri hedefiyle arkada devam eder; kare başına 144 KiB yükleme sınırı değişmez. İlk ayrıntılı üretimin normal seyirde sürekli iptal edilmesini önlemek için başlangıç işine 2,5 km hareket payı verilir. Sonraki işler normal yeniden hedefleme politikasına döner.

1440×1000 Chrome/WebGPU karşılaştırmasında uçuş düğmesinden oynanabilir duruma ilk giriş **13,25 → 3,38 sn**, tekrar giriş **6,56 → 0,19 sn** ölçüldü. Gezegenin ilk hazırlığı **21,01 → 25,30 sn** oldu: uçuş hazırlığının bir kısmı bu aşamayla örtüşür. Gezegen hazırlığı + ilk uçuş toplamı **34,26 → 28,67 sn**. Bunlar tek karşılaştırma koşusunun süreleridir; cihaz ve tarayıcı yüküyle değişir. FPS garantisi veya her bölgede anında en yüksek ayrıntı iddiası değildir. Ölçümler `evidence/v28/baseline-fixed/startup.json` ve `evidence/v28/prewarmed/startup.json` içindedir.

73 hedefli test geçti; dört mesafe, farklı kare hızlarında doğru varış, süre, yumuşak çıkış, bekleme, duraklatma, onarım ve arazi akışı test edildi. Test kaydı `evidence/v28/targeted-tests.txt` içindedir. Önceki sürüm notları tarihsel davranışı anlatır; güncel mesafeler yukarıdaki kilometre değerleridir.

Son dağıtımın tarayıcı kabul kaydı `evidence/v28/release/browser.json`, ekran görüntüleri aynı klasörde, kaynak/dağıtım imzaları `evidence/v28/verification.json` içindedir. Gerçek tuş ve tekerlek girdileriyle 6.000 m / 6 sn ve 12.000 m / 12 sn varışlar; 38 km üzerindeki doğal görünüm, editörde taktik görünümün geri gelmesi ve siyasi katmandan uçuşa dönüş doğrulandı. JavaScript/WebGPU hatası kaydedilmedi. Bu son koşuda ilk uçuş 3,36 sn, yüksek editör konumundan ikinci giriş 1,56 sn sürdü. Hareket hâlinde ilk ayrıntılı LOD 21,41 sn sonra görüldü; önceki kontrol koşusunda 7,79 sn idi. Bu kalan Worker/aktarım gecikmesi kokpiti bekletmez, ancak yakın yüzeyin tamamının ilk anda hazır olduğu anlamına gelmez.

## Sinematik uzay yolculuğu · v1.17

Açılış: <http://127.0.0.1:4399/dist/?view=stamps&v=27>.

**1 / Warp Drive:** gemiyi istediğin yöne çevirip 1'e bas. Üç saniye boyunca gövdenin çevresinde saydam bir dalga ve genişleyen halkalar oluşur. Ardından gemi, baktığı üç boyutlu yönde **12.000 km'yi 12 saniyede** kat eder. Burnu yukarı çevirmek uzaya çıkmayı sağlar. Eski yüzey boyunca büyük çember üzerinde anlık taşıma kaldırılmıştır. Bu sinematik süre kullanıcı tarafından seçilmiştir; seyir hızının 50 katı olarak hesaplanmaz.

Hız ilk iki saniyede artar, altı saniye yüksek kalır ve son dört saniyede yumuşakça **700 km/sa** seyir hızına iner. Saydam, açık uçlu solucan deliği, arkaya kayan ışık çizgileri ve görüş açısındaki geçiş yolculuğu görünür kılar. Tünel yavaşlama sırasında söner. Kamera dünya konumunu gecikmeli takip etmek yerine gemiyle birlikte taşınır ve yalnız göreli mesafesini yumuşatır. Mesafe ve süre HUD'da gösterilir; warp sırasında hız km/s, yüksek irtifa km birimine geçer.

Rota dolumda kilitlenir; C ile inişe geçmek dolumu iptal eder. Gezegenin içinden geçen veya başlangıçta araziye çok yakın rotalar reddedilir. Hareket sırasında yüzeye yakın kesimlerde ek çarpışma örnekleri alınır; yeni bir engelde son güvenli konumda çıkılır. Tamamlanan veya güvenlik nedeniyle sonlandırılan yolculuktan sonra 20 saniye bekleme vardır. Esc hem uçuşu hem beceri saatlerini durdurur. Onarım değişmez: 2 tuşuyla beş saniyede 50 gövde puanı ve etkinleştirmeden itibaren 30 saniye bekleme.

Warp efekti dört sabit çizim ve önceden ayrılmış tampon kullanır; her kare yeni parçacık/mesh oluşturmaz. Varış yüzeyi dolum sırasında ayrı çalışanlarla hazırlanır. Uzayda ilk kez görülebilecek su, yıldız, bölge ve arazi malzemeleri de uçuş başlangıcında derlenir. Warp dalgası ve tüneli yükleme sırasında bir kez ekran dışına çizilir; GPU'nun ilk kullanım hazırlığı 1 tuşuna basılmadan tamamlanır. 60 km üzerinde uçuş fiziği ayrıntılı arazi sorgulamaz; HUD deniz seviyesinden irtifayı gösterir. 60 km altına dönüşte yüzey sorgusu ve çarpışma yeniden devreye girer. Yakın arazi, bulut ve gölge ayarları korunur. Önceki sürümlerin ölçümleri aşağıda tarihsel kayıt olarak tutulur.

56 hedefli regresyon testi geçti. Son Chrome/WebGPU kontrolünde tam 12.000.000 m mesafe, 12 saniyelik simülasyon süresi, 700 km/sa çıkış, bekleme, duraklatma, eşzamanlı onarım ve kamera takibi doğrulandı; JavaScript/WebGPU hatası kaydedilmedi. Varış yüzeyi 0,819 saniyede hazırlandı. Son kanıtlar: `evidence/v27/optimized/`, test kaydı: `evidence/v27/targeted-tests.txt`, dağıtım ve kaynak imzaları: `evidence/v27/verification.json`.

1440×1000 koşusunda warp uçuşu yaklaşık 54,8 FPS verdi; 100 FPS hedefi karşılanmadı. Ayrıntılı yer sorgularının uzay fiziğinden çıkarılmasıyla son koşuda 15 ms üstü bir uçuş güncellemesi kaydedilmedi. Buna rağmen tekil çizim çağrısında 321,9 ms ve varıştaki arazi işleme adımında 183,1 ms görüldü. Dolayısıyla her koşulda takılmasız çizim garantisi yoktur. Hız eğrisinin dört saniyelik yavaşlaması, çizim ve arazi aktarımındaki bu tekil gecikmelerden ayrıdır. Önceki `first/`, `verified/`, `warmed/` ve `final/` klasörleri geliştirme sırasındaki tanı koşularıdır; son dağıtımı `optimized/` temsil eder.

## Bulut, gölge ve gemi becerileri · v1.16

Açılış: <http://127.0.0.1:4399/dist/?view=stamps&v=26>.

Bulutların sabit ekran gürültüsü kaldırıldı; yarım çözünürlüklü hacim geçişi 24 kararlı orta nokta örneği kullanır. Derinlik denetimi, kamera reprojection'ı, beş aşamalı geçmiş kullanımı ve yoğun bulut içi şimşek korunur. Gölge ızgarası mutlak gezegen koordinatlarında ışığın XY eksenlerine oturtulur. Uçuşta gemi gölgesi her çizilen karede yenilenir; arazi gölgesi görünür yüzeyin aynı üçgenlerini ve birleşim kenarlarını kullanır. Seyrek gölge geometrisinin yüzeyle kesişmesinden kaynaklanan lekeler kaldırılır. Bunlar gölge kararlılığı için daha fazla GPU işi gerektirir.

En yüksek yakın ayrıntı profili yerden 4.000 metreye uzatıldı. 4–8 km yaklaşma bandı, görünür alan ve hareket yönü ön yüklemesiyle hazırlanır. 4 km yakın ayak izindeki geometri, 2 km profilinin yoğunluğunu korur; ölçülen küp ızgara aralığı 11,44 m'dir. Kaya, mineral, kar ve zemin ayrıntısı 4 km'ye kadar tam malzeme ağırlığındadır. Mipmap ve ekran türevleri pikselden küçük ayrıntıları süzmeyi sürdürür; kaynak heightmap'in ölçüm çözünürlüğü değişmez. GPU örnek aktarımı kare başına 144 KiB ile sınırlıdır.

Alt beceri çubuğu sekiz yuvadan oluşur; 3–8 boştur. **1 / Warp Drive:** üç saniye dolum, gezegen üzerindeki mevcut yön boyunca büyük çember üzerinde 12.000 km sıçrama, sıçramadan sonra 20 saniye bekleme. Dolum sırasında rota kilitlenir; inişe geçmek dolumu iptal eder. Varış yüksekliği araziye göre güvenlidir; kamera ve simülasyon geçmişi yeni konuma doğrudan taşınır. Eski mermiler temizlenir, düşman devriyeleri eski bölgelerinde kalır. İlk varış yüzeyi ayrı bir çalışan havuzunda önceden hazırlanıp tek parça olarak devreye alınır; ardından normal ayrıntılı akış devam eder. **2 / Onarım:** beş saniyede toplam 50 gövde puanı, en fazla %100; 30 saniyelik bekleme etkinleştirmeden itibaren sayılır. Duraklatma beceri sürelerini de durdurur. Tuşlar ve tıklanabilir yuvalar aynı işlevi kullanır; HUD 20 Hz kalır.

120 regresyon testi geçti. Tarayıcıda onarım miktarı/süresi, gölgenin 140 çizilen karede 140 kez yenilenmesi, sekiz yuva ve 4 km ayrıntısı doğrulandı; JavaScript/WebGPU hatası kaydedilmedi. İlk warp varış yüzeyi 1,70 saniyede, 1.800 km/sa boost sırasındaki ikinci varış 1,12 saniyede hazırlandı; iki sıçramada da arazi dolum bitmeden hazırdı. Son warp kanıtı `evidence/v26/warp-final/`, birleştirilmiş doğrulama `evidence/v26/verification.json` içindedir. Grafik/onarım/gölge ölçümlerini içeren `verified/` koşusunda yakalanan soğuk warp gecikmesi, çalışanlar uçuş başlangıcında ısıtılarak giderildi ve ayrı tekrar test edildi. Önceki denemeler tanı kaydı olarak tutulur.

1440×1000 ölçümlerinde 4 km görünümü 40,4 FPS, bulutlu uçuş 41,5 FPS, hareketli gölge sahnesi 38,5 FPS verdi. **100 FPS hedefi karşılanmış değildir.** Ayrıntılı arazi soğuk bir konuma geçişte hâlâ birkaç saniye sürebilir; warp için hazır ilk yüzey bunun önünde kalır.

## Yakın yüzey ayrıntısı ve küçük itki · v1.15

Açılış: <http://127.0.0.1:4399/dist/?view=stamps&v=25>.

İyon itkileri her eksende önceki boyutunun %25'ine küçültülür; gemi boyutu, parlaklık ve boost tepkisi korunur. Çıkış noktaları GLB'nin gerçek arka yüzeyinden ölçülür; kısalan efekt gövdenin içinde kalmaz. Yüzeyden 0–2.000 m yüksekliğe en yüksek yakın ayrıntı profili uygulanır; 2–6 km yaklaşma bandı ayrıntıyı önceden hazırlar. Yakın ızgaralar 32×32 hücre kullanır, görünen arazi ayrıca bölünür. Örnek konumlarda 2 km yüksekliğindeki geometri aralığı 45,78 m'den 5,72–11,44 m'ye; 1 km'de 11,44 m'den 2,86–5,72 m'ye; 20 m'de 2,86 m'den 0,72 m'ye iner. Küre izdüşümü ve bakış açısı hesaba katılır; bu aralıklar küp ızgarası üzerindedir ve yüzey üzerindeki gerçek aralık daha küçüktür. Kaynak heightmap'e yeni ölçüm verisi eklenmez.

İnce malzemelerin 200 m'de kapanması kaldırılır. Kaya, zemin ve kar ayrıntısı 2 km'ye kadar tam malzeme ağırlığını korur; mipmap ve ekran türevleri pikselden küçük ayrıntıları süzer. Kare başına en fazla 144 KiB örnek verisi aktarılır; bu, iki yoğun parçanın aynı karede hazırlanmasını sağlar. GPU ızgaraları en fazla 8 MiB'lik bloklarla ayrılır, fazladan boş bloklar bırakılmaz. Ekran dışı 16 hücreli arka plan ile görünür 32 hücreli parçaların ortak kenarları kaynaklanır; gölge için aynı örnekleri kullanan seyrek indeks ızgarası vardır. Yüksek ayrıntı daha fazla GPU işi gerektirir. Sayısal ve görsel karşılaştırmalar: `evidence/v25/final/` ve `evidence/v25/optimized/`; ilk ağır deneme `evidence/v25/after/` içindedir ve son sürümü temsil etmez.

49 farklı hedefli test geçti. 1440×1000 tarayıcı kontrolünde WebGPU/JavaScript hatası görülmedi; itki geometrisi öncekinin tam dörtte biri, gemi 110 m ve gövde ışıkları 8 adet olarak doğrulandı. Son uçuş sahneleri 37,7–50,0 FPS, 2 km yüzey görünümü 45,3 FPS, 20 m görünümü 60 FPS ölçüldü. 100 FPS hedefi karşılanmış değildir. Soğuk bir kamera atlamasından sonra en yoğun araziyi hazırlamak hâlâ birkaç saniye sürebilir; mevcut yüzey tamamlanmış komşu gruplarıyla değiştirilir. Kayıt: `evidence/v25/verification.json`.

## Taktik harita, bulut içi şimşek ve gemi kamerası · v1.14

Açılış: <http://127.0.0.1:4399/dist/?view=stamps&v=24>. [Görseller ve doğrulama kaydı](UCUS_V24.html).

Keşif kamerası deniz seviyesinden 38 km üzerinde tepeden taktik görünüme geçer; eş yükselti çizgileri ve bölge sınırları görünür. Geçişin eşikte gidip gelmesini önlemek için çıkış eşiği 36 km'dir. Bulutlar 30–38 km arasında dağılır, aşağı inerken yeniden görünür. Taktik görünümde boş atmosfer ışın yürütmesi atlanır. Uçuş fiziği ve pilotun bakış kontrolü korunur; yüksek irtifada aynı temiz topografya katmanı kullanılır.

Şimşek kaynakları gerçek prosedürel bulut yoğunluğundan seçilir. Parlama yumuşak bir hacim içinde ve yalnız yoğun bulutta oluşur; sert hücre sınırları kaldırılmıştır. Parlama sırasında eski bulut karelerinin yeniden kullanımı durdurulur. Yakındaki yoğun kaynaklar ses açıkken gök gürültüsü üretir.

Uçuşta **Ctrl + sağ fareyi basılı tutup sürükle**: geminin çevresinde orbital kamera. Sağ tuş veya Ctrl bırakılınca takip kamerasına yumuşakça döner. Hareket gemiyi döndürmez ve füze atmaz; normal sağ fare füze işlevini korur. Tekerlek yaklaşır/uzaklaşır. Duraklatma ve odak kaybı kamera sürüklemesini iptal eder.

Gövdeye oturtulmuş küçük emissive ışıklar ve yeni alfa kanallı iyon itki PNG'si eklenmiştir. İki motorun üçer kesişen yüzeyi tek instanced çizimde, gövde ışıkları ayrı bir instanced çizimde çalışır. Boost sırasında itki uzar ve parlaklaşır; inişte kapanır. PNG yereldir: `assets/fx/ion-thruster-v24.png`; image_gen üretim promptu `assets/fx/provenance.json` içinde kayıtlıdır.

17 hedefli kontrol geçti; tarayıcıda 38 km geçişi, geri dönüş, yoğun/açık bulut ayrımı, Ctrl + sağ sürükleme, füze girişinin geri gelmesi ve duraklatma doğrulandı. İlk tarayıcı koşusunda uçuş sahneleri 28–36 FPS ölçüldü. Test tarayıcısı kapalıyken de GPU kullanımı %95–98 olduğundan V1.13 ile yalıtılmış performans karşılaştırması yapılamadı. Ham kayıt: `evidence/v24/browser.json`. Mevcut 128 KiB aktarım bütçesi ve coğrafya üreticisi korunur.

## Kalıcı arazi ızgaraları ve hacim geçmişi · v1.13

Açılış: <http://127.0.0.1:4399/dist/?view=stamps&v=23>. [V1.13 ölçüm raporu](PERFORMANS_V23.html) · [Çevrimdışı rapor](ATLAS_PERFORMANS_V23_INDIR.html).

Arazi ve gölgeler artık ortak instanced ızgaralardan, yeniden kullanılan GPU storage yuvalarıyla çizilir. CPU çarpışma geometrisi ve mevcut quadtree dikişleri korunur; bu, tamamen toroidal bir height-only clipmap değildir. Aktarım çalışan görünümde kareye bağlıdır; en çok 128 KiB örnek verisi / sekiz yeni parça ve sınırlı hazırlama süresi kullanılır. Gidiş yönünde 2,4 saniye / 1.500 m ön yükleme eklenmiştir. İnce kaya bump/doku okumaları 100–200 m arasında söner; uzak noise/doku katmanları gerçekten atlanır.

Hacim geçişi yarı en/boy çözünürlüğünde kalır; beş aşamalı kamera reprojection'ı, derinlik reddi, en fazla dört kare geçmiş ve kesim/yeniden boyutlandırma sıfırlaması eklenmiştir. HUD 20 Hz zamanlayıcı kullanır. 128 mermi / 16 patlama havuzları korunur ve arazi temas sorguları dört fizik adımına dağıtılır.

95 testlik tam süit ve son aktarım değişikliğine ait 10 hedefli kontrol geçti. Son karlı rota testinde çizim sayısı en çok 94, uçuş ortalamaları 59,5–60 FPS; önceki geniş benchmarkta çizim sayısı en çok 72 ve yoğun efekt stresi yaklaşık 60 FPS. Tekil uzun kareler de görüldü; her koşulda 60 veya 100 FPS garantisi yoktur. Sabit bulut sahnesinde geçmiş kullanımı %78,3 olarak GPU verisinden doğrulandı, ancak bu sahnede belirgin GPU süre kazancı doğrulanmadı. GPU/CPU süreleri doğrudan toplanmaz. Üretici 1.6.0 ve coğrafya imzası değişmedi. Ayrıntılı sınırlar ve ham kayıtlar rapordadır. GPU aktarım adaptörü Three r186 için doğrulanmıştır.

## 100 FPS incelemesi · v1.12

Açılış: <http://127.0.0.1:4399/dist/?view=stamps&v=22>. [Ölçümler, maliyet sırası ve teknoloji planı](PERFORMANS_V22.html). **100 FPS hedefine ulaşılmadı.** Windows ekranı 60 Hz bildiriyor; GPU/CPU ve streaming yükü ayrıca sınır oluşturuyor. Kısa oturumlar arasında ciddi fark görüldü ve bir stres testi başarısız oldu; rapor bütün bu sınırları içerir.

Yarı çözünürlükte hacim ışığı, derinliğe göre birleştirme, kayan uçuş çizgileri, prosedürel bulut / iç şimşek, daha az tekrar örnekleyen yüzey normali ve gizli sekmede çizimi durdurma eklendi. GPU clipmap, temporal reprojection ve dinamik çözünürlük sonraki mimari işlerdir. Coğrafya üreticisi 1.6.0 değişmedi.


STARFRONT'tan ayrı çalışan, seed tabanlı gezegen üreticisi ve 3B keşif stüdyosu.
21 Ekim 2026, v1.11 arazi akışı, malzeme ve sınırlı takip sürümü.

## Arazi ve uçuş · v1.11

Güncel açılış: <http://127.0.0.1:4399/dist/?view=stamps&v=21>. Seyir 700 km/sa; boost 1.800 km/sa. Düşmanlar en fazla 22 saniye takip edip sabit devriye alanına döner. 1–3 arazi işçisi, sınırlı iş kuyruğu, filtreli mikro LOD, sürekli kar/nem malzemesi, geometri tamponlarının küçük gruplarda aktarılması ve doğrulanan IndexedDB dünya önbelleği eklendi. Çekirdek üretici 1.6.0 ve dünya hash'i değişmedi.

[Ölçümler, araştırılan depolar ve kalan takılma noktaları](PERFORMANS_V21.html). 85 ana test ve son hedefli kontroller geçti; gerçek tarayıcı görüntüleri ve ham kayıtlar evidence/v21 altında. GPU tampon adaptörü Three r186 ile sınırlıdır; bağımlılık yükseltmesinde gözden geçirilmelidir.

## Uçuş döngüsü ve efektler · v1.10

Fizik 60 Hz sabit adım ve en fazla altı adımlık telafi kullanır; gemi, düşmanlar ve mermiler kareler arasında yumuşatılır. 128 mermi / 16 patlama için simülasyon nesneleri yeniden kullanılır. Patlama kimlikleri sesin tekrar çalmasını ve kıvılcım yönlerinin korunmasını sağlar. Fare nişanı ateşten önce alınır; merkezdeki boost blur örnekleri atlanır.

V1.10 açılış kaydı: <http://127.0.0.1:4399/dist/?view=stamps&v=20>. Yalnızca dist sunan npm start için <http://127.0.0.1:4399/?view=stamps&v=20>. **76 test geçti**; sonuçlar ve kalan yükleme / uzun kare sınırları: [Uçuş 1.10 raporu](UCUS_V20.html). Dünya üreticisi 1.6.0 ve coğrafya imzası korunur.

## Çok ölçekli arazi · v1.9

Dört GLB'den çıkarılan yükseklik haritaları gezegenin tamamına deterministik, döndürülmüş ve yumuşak birleşen üç ölçekte dağıtılır. 12.000 km yarıçapta damga çapları yaklaşık **475 km, 47,5 km ve 1,5 km**'dir. Küçük katman da fiziksel yüksekliktir; kamera yaklaşınca yalnızca çizim ağı sıklaşır. Kamera, gemi ve ağaçlar aynı sabit yüzeye dayanır. C2 ağırlıklar ve kübik örnekleme kare kenarlarını gizler.

LOD değişiminde kenarları birbirine bağlı parçalar birlikte değiştirilir. Kamera, henüz daha kaba çizilen yüzeyin altında kalamaz; çok eğik açıda yakın kırpma düzlemi zemini kesmez. Hızlı hareket eski Worker işini iptal edip yeni konuma öncelik verir. Yakın arazi, üçgenleri ve malzeme kanallarını değiştirmeden yerel koordinatlı ortak çizimlerde birleştirilir.

v1.9 açılış kaydı: <http://127.0.0.1:4399/dist/?view=stamps&v=19> (kaynak kökünden sunulan mevcut sunucu). `npm start` ile yalnızca dağıtımı sunarken <http://127.0.0.1:4399/?view=stamps&v=19> kullanılır. [V1.9 ölçüm raporu](ARAZI_V19.html): 67 test geçti; 1.373 yakın kamera karesinde yeraltına geçiş yok. Bu oturumda uçuş/boost 35–39 FPS; uzak bir bölgenin bütün ayrıntısının hazırlanması 11–17 saniye. Ayrıntılı kayıtlar: `evidence/v19/`.

Yeni üretici **1.6.0**. İmzalı 1.4.0 ve 1.5.0 paketleri kendi coğrafyalarını korur; eski paketlere yeni katmanlar sessizce eklenmez. `fixtures/` önceki 1.5.0 örneklerini içerir; üç ölçekli arazi için arayüzden yeni dünya üret.

## GLB arazileri · v1.8

Dört kullanıcı modelinin gerçek geometrisinden 16 bit yükseklik haritaları çıkarıldı. Malzeme renkleri veya gölgeleri yükseklik olarak yorumlanmadı. Kaynaklar ve indirilebilir haritalar: [Arazi kaynakları](../../assets/terrain-stamps/sources.html).

`?view=stamps` ile açıldığında yeni dağ bölgesine gidilir. Coğrafya bölümündeki **GLB arazi etkisi** sürgüsü ve **Gezegen oluştur** ile etki ayarlanır. Dört kaynak İncele → Biyom ve coğrafya keşfi listesinde seçilebilir. Dairesel C2 geçiş, küresel deterministik yerleşim, kübik yükseklik örnekleme ve LOD kenarlarında eşleşen konum/normal/renk, kare sınırlarını yumuşatır. Atlas 3,5 MiB; özgün GLB'ler çizim sahnesine yüklenmez.

v1.8'in üreticisi 1.5.0'dır; kıta tohumları 1.4.0 ad alanını korur. Önceki doğrulanmış 1.4.0 paketleri aynı coğrafyayla açılır; damgalar sessizce eklenmez. Damgalı bir dünya için GLB etkisini açıp yeniden üret. Örnek paketler damgaları ve yükseklik verisinin imzasını içerir.

61 test, dört arazi bölgesi ve yakın uçuş ölçümleri: [V1.8 doğrulama raporu](ARAZI_V18.html). Yerden 6 km üzerindeki bölge görünümü ek ara LOD kullanır; yakın uçuşta uzak parçalar daha düşük yoğunlukta tutulur.

## Aç

Windows'ta **BASLAT.cmd** dosyasına çift tıkla. Kurulu Node.js 24 veya üzerini kullanır;
hazır `dist/` paketi için bağımlılık indirmek gerekmez. Yerel adres:
<http://127.0.0.1:4399>

Komut satırından:

```powershell
npm start
```

3B görünüm WebGPU sunan Chrome/Edge ve uygun GPU/sürücü gerektirir. WebGPU bulunamazsa
uygulama bunu açıkça bildirir; çekirdek dünya üretimi ve paket kaydı kullanılabilir.
HTML'yi `file://` ile açma; ES modules ve Worker için yerel sunucu gerekir.
Sunucuyu kapatmak için çalıştığı terminalde Ctrl+C kullan.

## Uçuş modu

Üst çubukta **Editör** yanındaki **Uçuş modu** ile Starlight Voyager gemisine geç.
AirRivals düzenindeki fare/klavye kontrolleri sağ paneldedir. **C** iniş/kalkış,
**Space** boost, **Shift** hedef değiştirir; sol/sağ fare top ve füzedir.
Altı uçan düşman, radar, gövde/boost göstergeleri ve açılan iniş ayakları vardır.
**Esc** duraklatır. Sağ panelde fare hassasiyeti ve ses ayarı vardır. 110 m gemi, kademeli arazi yükleme, zemine oturan ağaçlar, boost blur ve yeni silah efektleri: [UCUS_V16.md](UCUS_V16.md).

Benchmark sonuçları, sahne yükleri ve kalan takılma riskleri: [PERFORMANS_V17.html](PERFORMANS_V17.html). Tekrar ölçmek için `npm run benchmark` (yerel Playwright kurulumu gerekir).

## Gez

- **1 / 2 / 3 / 4:** Yörünge, eğik bölge, yüzey, üstten harita.
- **Sol sürükle:** Yüzeyi tutup yerkürenin her yerinde kaydır.
- **Sağ sürükle** veya **Shift + sol sürükle:** Eğimi ve yönü değiştir.
- **Tekerlek:** Her irtifada imlecin altındaki noktaya yaklaş/uzaklaş. **Çift tık:** O noktaya odaklanıp yakınlaş.
- **W A S D** veya oklar: Kaydır. **Q / E:** Yaklaş/uzaklaş. **Shift:** Hızlan.
- **N:** Kuzey yukarı. **Home:** Tüm gezegen.
- **H:** Panelleri gizle/göster. Üst çubuktan tam ekran, zamanı durdurma ve fotoğraf kaydı.
- Sağ alttaki kartlar ve İncele → Biyom ve coğrafya keşfi listesi gerçek keşif noktalarına gider.
- **İncele → Yüzeye in** seçili geçidin kıyısından başlatır.
- **İncele → Geçişi canlandır** sığ geçitte kara birimini veya seçili boğazda tekneyi gösterir.
  Uygulanan her hareket parçası adaptörün sabit navigasyon denetiminden geçer.

Yüzey kamerası serbest keşif kamerasıdır; asker hareketi kurallarına bağlı değildir.
Rota canlandırması ise sabit su engelleri, geçit portalı ve gemi su çekimi kurallarını kullanır.

## v1.4 arazi ve ölçek

Yarıçap **12.000 km**. Dağ, göl, nehir ve ağaç boyutları metre cinsindedir; dikey abartı yoktur. Arazi/su ve yakın bitkiler Worker üzerinden yüklenir. Bulutlar 40–30 km arasında söner, 30 km ve altında kapanır.

Eski v1.0/v1.1/v1.2/v1.3 `.planet` dosyaları çekirdek değiştiği için reddedilir. Eski seed/üretim ayarlarıyla yeniden üretip güncel sürümle kaydet. Tarayıcıdaki üretim tercihleri korunur; başlangıçta yarıçap 12.000 km yapılır.

Terran, çöl, volkanik, Mars, Ay ve mor/turkuaz dünya türleri, küresel nehir/dere ağı ve bölgesel ormanlar eklendi. Görünüm panelinden saydam bölgesel renkler uygulanabilir.

Güncel değişiklikler, doğrulama ve sınırlar için **ARAZI_V14.md** dosyasına bak. **BIYOMLAR.md** v1.2, **OPTIMIZASYON.md** v1.1 tarihsel kaydıdır.

## Üret, kaydet, tekrar aç

**Coğrafya** bölümünde seed ve arazi ayarlarını seçip **Gezegen oluştur** düğmesine bas.
Yeni dünya hazırlanırken eski dünya korunur. İptal edilen veya eski bir Worker sonucu
yeni dünyayı değiştiremez.

**Görünüm** ayarları güneşi, atmosferi, bulutları, sisi, suyu ve rüzgârı değiştirir;
gezegenin coğrafi imzasını değiştirmez. Ayrıntı ayarları kullanıcı kontrolündedir.

**Gezegeni kaydet** doğrulanmış sayısal veriyi ve görünüm ayarlarını `.planet` paketine yazar.
**Paket aç** aynı veriyi tekrar yükler. Paket çekirdek sürümü ve SHA-256 imzasıyla doğrulanır.
Farklı çekirdek sürümüyle sessiz yeniden üretim yapılmaz.

**İklim ve üretim ayarları** altındaki ayar kaydı JSON olarak üç ayar grubunu saklar.
Geri yüklenen görsel ayarlar hemen uygulanır; üretim ayarları için tekrar oluştur gerekir.
Fotoğraf düğmesi mevcut piksel örneklemesinin iki katında PNG indirir.

## V35 — küresel stamp ve terrain bake

Varsayılan açılış `fixtures/lumen-v35.planet` paketini kullanır. Dört GLB'den
çıkarılan gerçek yükseklik atlası, 220 km / 22 km / 700 m fiziksel aralıklı
katmanlarda küre boyunca dağıtılır. Yön ve örnekler kameraya bağlı değildir;
dağ/ova maskeleri ve sonradan yapılan nehir-göl şekillendirmesi korunur.
V34 ve daha eski desteklenen kayıtların coğrafyası aynı kalır.

```powershell
npm run stamp
node scripts/generate-v35.mjs
npm run bake:terrain
npm test
npm run build
```

- Altı yüzün tümünde 384 uzak taban parçası çevrimdışı bake edilir (yaklaşık 4,7 MiB).
  Bu, bütün gezegenin yakın mesh'ini önceden üretmek değildir. Yakın LOD'ler aynı
  yoğunlukta Worker üzerinde üretilir ve sonrasında IndexedDB'den yeniden kullanılır.
- Diskteki ikili terrain verisinin toplamı 128 MiB ile sınırlıdır. Ucuz geçici
  parent parçalar mevcut RAM önbelleğinde kalır; disk en az LOD 10 / 16 hücre
  olan pahalı ayrıntı parçalarına ayrılır. Yeniden üretilebilen bake yazımları
  relaxed durability kullanır; her küçük batch için zorunlu fsync yapılmaz. Her Worker'ın
  bekleyen yazma kuyruğu 2 MiB, tutulan statik yüz paketleri 4 MiB ile sınırlıdır.
  Aktif GPU mesh'leri bu disk kotasına dahil değildir.
- Bake; konum, normal, renk, su, yüzey kanalları ve sınır geometrisini saklar.
  Dünya hash'i, yarıçap, mesh üretim kaynaklarının imzası, LOD/grid, materyal ve
  dikiş/köşe bilgisi cache anahtarındadır. `stamp` ve `build`, mesh imzasını
  otomatik günceller. Geometri kodu değişirse `bake:terrain` tekrar çalıştırılır;
  eski bake eşleşmezse prosedürel üretim kullanılır.
- Worker'lar 64 KiB üyelik filtresi ve BroadcastChannel ile yeni disk kayıtlarını
  paylaşır; henüz bake edilmemiş her parça için boş disk okuması yapılmaz.
- İlk kez görülen yakın bölgeler, cache dışına düşen parçalar ve farklı komşu
  dikişleri tekrar hesaplanabilir. Disk/kota/geçici IO hatası görüntüyü durdurmaz.
- Varsayılan dünya dışındaki seed'ler de disk bake'ini kullanır. İstenirse
  `node scripts/bake-terrain.mjs fixtures/istenen.planet` ile bir kayıt için
  küresel taban paketi üretilebilir; betik o kaydı statik bake kataloğuna yazar.
- `planetStudio.stampDiagnostics` ve `planetStudio.view.terrain.stats.bake`
  üzerinden önbellek sayıları görülebilir. `bakeDiskBytes` ortak disk verisinin
  en son gözlenen boyutudur; Worker başına toplanmaz.

Doğrulama verileri `evidence/v35/` içindedir. CPU parça hazırlama/okuma ölçümleri
GPU kare süresi veya FPS kazancı olarak yorumlanmamalıdır. DPR, yakın geometri
yoğunluğu, gölge çözünürlüğü ve bulut ayarları bu değişiklikte azaltılmadı.

## Hazır dünyalar

`fixtures/` klasöründeki paketleri **Paket aç** ile yükle:

| Paket | Seed | Su oranı | Karakter |
|---|---|---:|---|
| `pangea.planet` | PANGEA-311 | %33,87 | Geniş kıtalar |
| `pelagos.planet` | PELAGOS-826 | %53,58 | Kıyılar ve su alanları |
| `alpina.planet` | ALPINA-509 | %35,56 | Dağlar ve vadiler |

Üçünde de bir göl, ana nehir ve kolu, doğal sığ geçit ve deniz boğazı doğrulandı.
İmzalar ve rota sonuçları `fixtures/validation.json` içinde.
Uygulamadan alınan görüntüler ve tarayıcı kabul kaydı `evidence/` içinde.

## Geliştir

```powershell
npm ci
npm run dev
npm test
npm run build
```

Çekirdek algoritmayı değiştirdiğinde **önce** `npm run stamp`, ardından `npm test`,
`npm run fixtures` ve `npm run build` çalıştır. `stamp`, `core/` kaynaklarından gerçek
derleme imzasını üretir. Eski paketlerin yeni çekirdekte açılmaması bilinçli bir sözleşmedir.

`npm run dev` kaynak modülleri, `npm start` hazır dağıtımı sunar.
Farklı port için PowerShell'de `$env:PORT=4400` ayarla.

| Dizin | Sorumluluk |
|---|---|
| `core/` | DOM/Three.js bağımsız üretim, hidroloji, iklim, bölgeler, navigasyon |
| `workers/` | Tarayıcı Worker ve Node worker_threads adaptörü |
| `render/` | WebGPU arazi, su/FFT, atmosfer, bitki, kamera, rota görünümü |
| `studio/` | Türkçe düzenleyici ve kullanıcı etkileşimi |
| `adapters/` | STARFRONT koordinat, bölge, seçim ve hareket sınırı |
| `io/` | Sürümlü ikili paket, hash ve içe/dışa aktarma |
| `tests/` | Çekirdek ve adaptör doğruluk testleri |

Kapsamın tam karşılığı ve kalan somut işler için **TESLIM_RAPORU.md** dosyasını oku.
Bu sürüm, plandaki bütün ileri grafik ve canlı oyun entegrasyonu ölçütlerini tamamlamış
olarak sunulmuyor.


## V36 — bölgesel bake / streaming prototipi

Çalışan referans: `dist/?world=fixtures/lumen-v35.planet&view=reference&region=baked&v=36`.
Gezegen **8.000 km çap / 4.000 km yarıçap**, referans alan yaklaşık **32 × 32 km**.
Kaynak dünya V35'in imzalı LUMEN-742 kaydıdır; dünya hash'i ve eski kayıtlar korunur.
Çalışma motoru 1.22.0 / çekirdek 1.8.1; eski dünya açık uyumluluk listesiyle okunur.

```powershell
npm.cmd run bake:region -- fixtures/lumen-v35.planet --cells=64
npm.cmd run build
node scripts/validate-region.mjs
npm.cmd test
```

Baker 256 ayrı 2 × 2 km tile üretir. 64 hücre/tile = 31,25 m yükseklik örnek aralığı;
`--cells=128` 15,625 m üretir ve ayrı paket kimliği kullanır. Mesh quadtree LOD'u bundan
bağımsızdır; yakın grid, DPR, görüş mesafesi, ağaçlar ve efektler azaltılmaz.
Normaller, mikro ayrıntı öncesi/sonrası yükseklikler, biyom, kar, orman, nem, koruma,
lav, albedo, akış ve su kotu kanalları kaydedilir. Yalnız mevcut nehir/göl bağlantıları
paketlenir. Bölgesel yoğun akış yönü / birikim rasteri üretilmiş değildir.

### Yüzey sözleşmesi

`core/surface-source.mjs` çalışma anındaki kanonik örnekleyiciyi dünya nesnesine bağlar;
dünya kaydına fonksiyon veya geçici koordinat eklemez. GPU patch üretimi, CPU çarpışması,
iniş, bitki örnekleri ve su aynı genel `sampleTerrain` API'sini kullanır.
Yeni tile beklenirken mevcut parent yüzey kalır. Dikişler ve mesh normal hesabı korunur.

Paketli ve prosedürel geri dönüş aynı Float32 düğümlerden aynı kübik alanı oluşturur.
Residency, kamera sırası veya ziyaret sayısı coğrafyayı değiştirmez. Kıyı/biyom karar
sınırları ve keskin ikinci fark içeren yerler analitik üreticiyle çözülür; dış kenarda
iki hücrelik geçiş alanı vardır. Bu sonlu raster sürekli fonksiyonun matematiksel olarak
kayıpsız kopyası değildir: 10.240 kontrolde p99 yükseklik farkı 0,184 m, en yüksek fark
0,508 m. Bunlar örneklenmiş hatalardır, tüm alan için kanıtlanmış üst sınır değildir.

### Akış ve sınırlar

- CPU'da ağır üretim Worker'dadır. Kamera/hedef ve hız yönünde üç saniyelik konum;
  warp varışı ayrıca ön yüklenir. Eski istekler AbortController ile iptal edilir.
- Bir loader'da aynı anda bir dosya okuma/açma; ham tile en fazla 2 MiB,
  sıkıştırılmış tile en fazla 1 MiB. Normal tile 359.152 bayttır. Açma Worker'da,
  ana sayfaya teslim en fazla bir tile / 16 ms; kurulum sıfır kopyalı typed-array görünümüdür.
- Her tüketici decoded tile RAM'i en fazla 12 MiB, düğüm geri dönüş verisi 2 MiB.
  Bunlar typed-array yük bütçeleridir; Map/JS nesne gideri ayrıca vardır.
  Ana, planlama, üç patch ve bitki tüketicileri ayrı kopyalar taşır; warp havuzu iki patch
  ve bir planlama tüketicisi daha ekleyebilir. Toplam tepeyi yalnız tek Worker bütçesi gibi
  raporlamayın.
- Ortak IndexedDB sıkıştırılmış dosya bütçesi 96 MiB. Seed, dünya hash'i, üretici,
  yarıçap, alan sürümü ve dosya SHA-256 farklı dünyaları ayırır. Eski kayıtlar bayt
  sınırında en eski yazılma sırasıyla atılır; işlem sayacı ve dosya kaydı aynı transaction'dadır.
  Kota/erişim hatasında yazı geri çekilir, yüzey üreticisi kullanılabilir kalır.
- Mevcut GPU örnek aktarımı 72–288 KiB/kare; yeni grid bankası en fazla bir adet/kare
  ve yaklaşık 4 MiB. Boş GPU banka önbelleği 16 MiB ile sınırlanır.
  Görünür/parent/transition geometrisinin toplamı bu boş cache sınırı değildir.
- Veri imzaları açılmadan ve açıldıktan sonra doğrulanır. Bozuk kayıt silinir,
  dosya yeniden denenir; dosya yoksa kanonik prosedürel örnekleyici çalışır.
  Kimliği/sürümü geçersiz bir katalog eski üreticiye döner.
- Önceki tam mesh bake önbelleği korunur. Yeni yüzey profilinin mesh cache anahtarı
  ayrıdır; eski mesh başka yüzey profiline karışmaz.

### Karşılaştırma ve geri dönüş

`region=baked`: bölgesel paket + IndexedDB. `region=procedural`: aynı kanonik alan,
düğümleri mevcut üreticiden hesapla. `region=legacy` veya `region=off`: önceki sürekli
üretici. Üç eş içerik karşılaştırması procedural / cold / warm'dır; legacy ayrıca
eski yöntemle dürüst kontrol içindir. Test sırasında `meshBake=off` bütün koşullarda
aynı tam mesh disk cache'ini kapatarak bölgesel etkinin ayrı ölçülmesini sağlar.

`scripts/benchmark-region-browser.mjs` aynı kayıtlı beş kamera istasyonunu çalıştırır;
`PLAYWRIGHT_MODULE` yerel Playwright modül yolu olmalıdır. `BENCH_OUT` çıktı klasörü,
`REGION_MODES` koşul listesidir. Gerçek uçuş/boost kontrolü ayrı tarayıcı QA kaydındadır.
Ana JS heap Worker heap'lerini içermez. GPU sayıları Three/WebGPU tahsis takibidir,
fiziksel VRAM ölçümü değildir. Upload ms CPU gönderim maliyetidir; izole GPU DMA ölçümü değildir.

Son karşılaştırma: `output/reports/ATLAS_Regional_Bake_V36.html` ve
`evidence/v36/final-browser/comparison.json`. Her koşulda bütün arazi bir anda
hızlanmadığı ve GPU süresi azalmadığı için küresel yayılım otomatik yapılmadı.
Geri alınabilir kaynak yedeği: `evidence/v36/source-v35.zip`.
