# ATLAS v1.5 — Starlight Voyager uçuş modu

21 Ekim 2026. Bağımsız Planet Studio üzerinde çalışan yerel arcade uçuş ve hava çatışması.

## Başlat

`BASLAT.cmd` ile stüdyoyu aç. Üst çubukta **Editör** yanındaki **Uçuş modu** düğmesine bas.
Gemi, editörde baktığın konumun yaklaşık 320 m üzerinde başlar. Açık denize bakılıyorsa
bilinen yakın bir kara bölgesi seçilir. Aynı gezegen ve ışık ayarları kullanılır.
İlk girişte yerel GLB ve yakın arazi hazırlanır; sonraki girişlerde model tekrar indirilmez.
**Editöre dön** önceki kamera konumunu geri getirir.

## Kontroller

| Girdi | Davranış |
|---|---|
| Fare | İmleç yönünde dönüş, tırmanış ve dalış; ortaya getirince dönüş kesilir |
| A / D | Sola / sağa kayma |
| A veya D'ye çift basış | Kaçış taklası |
| Space | Enerji tüketen hızlandırıcı |
| S | Fren |
| B | Havada durma |
| W | Seyir hızına dönme |
| Sol fare | Hafif silah; basılı tutunca seri atış |
| Sağ fare | Kilitli hedefe güdümlü füze; yeniden dolum 1,4 saniye |
| Shift | Yaşayan hedefler arasında geçiş |
| C | İniş yardımı / inişi iptal / yerdeyken kalkış |
| Delete | Pilot / dış takip kamerası |
| Tekerlek | Takip kamerası mesafesi |
| Esc | Duraklat / devam et |

AirRivals'ın temel giriş düzeni için [2009 tarihli Türkçe oyuncu rehberi](https://forum.donanimhaber.com/air-rivals-rehberi-ana-konu-guncel-yeni-server--29792730)
ve [ACE Online kontrol anlatımı](https://mmos.com/review/ace-online) karşılaştırıldı.
Resmî eski kontrol rehberine erişilemedi. Tuş düzeni bu kaynaklardaki uçuş/çatışma
girdilerini izler; özgün oyunun motor istatistikleri ve uçuş hissinin birebir kopyası değildir.
C ile doğal araziye yardımlı iniş/kalkış, duraklatma ve yeniden başlama bu prototipe uyarlanmıştır.
RPG beceri barı, pistte taksi, çok oyunculu sunucu ve görev ekonomisi bu sürümde yoktur.

## İniş, kalkış ve çatışma

- C, 1.200 m içinde su kaplamayan, yoğun orman olmayan ve eğimi yaklaşık 14° altında
  kalan bir alan arar. Bulamazsa nedeni gösterilir. Pilot uçuşa devam edebilir.
- İniş yardımı yatay yaklaşmayı, arazi üzerindeki açıklığı ve yavaş alçalmayı yönetir.
  İniş ayakları açılır ve zemine göre uzar. Yerdeyken gövde onarılır.
- C ile yaklaşık 125 m dikey kalkışın ardından ileri uçuşa geçilir.
- Altı Raider devriye gezer, yaklaşır, kaçar ve ateş eder. İlk 12 saniye hazırlık payı vardır.
  İnişte ve yerde oyuncuya ateş edilmez. Düşürülen düşmanlar 18 saniye sonra döner.
- Füzeler 2,6 km içinde, öndeki hedefe 0,8 saniye kilitlenme ister. Toplar küçük
  nişan toleransı kullanır. Mermiler arazi tarafından engellenir.
- Sert yüzey çarpışması veya gövdenin tükenmesi gemiyi devre dışı bırakır.
  **Yeniden uç** yeni sorti başlatır. Sekme gizlenince / odak kaybolunca uçuş durur.
- Sağ panel bütün kontrolleri; ekran hız, yerden yükseklik, deniz seviyesine göre irtifa,
  pusula, radar, gövde, boost, hedef kilidi ve düşürülen hedef sayısını gösterir.

## Model ve teknik kapsam

Kullanıcının sağladığı `Meshy_AI_Starlight_Voyager_1020235536_texture.glb`,
`assets/starlight-voyager.glb` olarak yerel pakete kopyalandı. Orijinal dosya değiştirilmedi.
8.377 köşe, 6.458 üçgen; doku ve normal haritaları korunur. -X burun yönü -Z'ye çevrilir,
gemi uzunluğu 32 m olarak ayarlanır. Gezegen ışığı altında okunması için malzeme yansıtıcılığı
ayarlanır; itici ve iniş ayağı geometrileri ayrı eklenir. Düşmanlar aynı geometri ve
dokuları paylaşan renk varyantlarıdır. Modelin sahiplik/lisans hakları kullanıcı kaynağına aittir;
bu paket ayrıca bir açık kaynak lisansı verdiği iddiasında değildir.

Simülasyon metre cinsinden çift hassasiyetli koordinat kullanır. Görselleştirme gezegenin
12.000 km yarıçap ölçeğine ve kameraya yakın koordinatlara dönüştürür. Fizik en fazla
1/60 saniye alt adımlarla ilerler; mermi çarpışmaları hareket çizgisi boyunca sınanır.
Mermi sayısı 128, düşman sayısı 6, eşzamanlı patlama sayısı 16 ile sınırlıdır.
Arazi ayrıntısı mevcut Worker LOD sisteminden gelir; otomatik kalite düşürme eklenmedi.

Üretim çekirdeği **1.4.0** olarak kaldı. Uygulama **1.5.0** oldu. v1.4 `.planet`
paketleri uyumludur. Uçuş oturumu / düşman durumları `.planet` dosyasına yazılmaz.
STARFRONT oyun dosyaları değiştirilmedi.

## Doğrulama

- `npm test`: **47/47 geçti** (37 mevcut + 10 uçuş testi), yaklaşık 111 saniye.
- `npm run build`: başarılı. Hazır dağıtım gemi GLB'sini ve uçuş stilini içeriyor.
- Chrome / WebGPU: klavye ve fareyle başlatma, boost, fren, takla, havada bekleme,
  iniş, kalkış, hedef değiştirme, hafif silah, füze, pilot kamerası, duraklatma ve
  editör kamerasının aynen geri gelmesi kontrol edildi.
- Gerçek sağ fare girdisiyle 4 füze ateşlendi, 2 hareketli hedef düşürüldü. Düşman
  atışlarının oyuncuya hasar verdiği gözlendi. Terran ve çöl üzerinde iniş/kalkış yapıldı.
- 1.440 × 1.000 ve 1.137 × 930 görünümleri incelendi. Kısa örneklem ölçümleri
  **yaklaşık 58–60 FPS**, tarayıcı hata kaydı 0. Bu değerler test GPU'suna aittir;
  tüm donanımlar için hız garantisi değildir.

Kanıtlar: `evidence/v15/acceptance.json`, `combat-acceptance.json`, `test-output.txt`
ve aynı klasördeki ekran görüntüleri. `evidence/v15/index.html` görsel inceleme sayfasıdır.
