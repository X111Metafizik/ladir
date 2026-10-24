> v1.5 uçuş güncellemesi: [UCUS_V15.md](UCUS_V15.md). 47 test geçti; yerel tarayıcı uçuş, iniş/kalkış ve çatışma doğrulandı. Aşağıdaki rapor arazi sürümlerinin geçmiş kapsamıdır.

# v1.4 güncellemesi

21 Ekim 2026: Sivri tepe üretimi kaldırıldı; menderesler, kademeli kar sınırı, 170 km için sınırlı görünüm LOD'u ve yaklaşık 1–2 km derin yarık vadileri eklendi. Güncel ayrıntılar [ARAZI_V14.md](ARAZI_V14.md), ekran görüntüleri evidence/v14/ içindedir.

---

# v1.3 güncellemesi

21 Ekim 2026: Ayrılmış sırt ve vadiler, çökük kaldera havzaları, eğime göre triplanar kaya malzemesi ve Harita görünümü eklendi. Güncel rapor [ARAZI_V13.md](ARAZI_V13.md), kanıtlar evidence/v13/ içindedir. Aşağıdaki bölümler önceki sürümlerin tarihsel kaydıdır.

---

# v1.2 güncellemesi

21 Ekim 2026: Altı dünya türü, küresel nehir/dere ağı, bölgesel orman, yakın ağaç LOD ve renk katmanları eklendi. Güncel teslim ayrıntıları ve sınırlar için [BIYOMLAR.md](BIYOMLAR.md), güncel ölçümler için `evidence/v12/` kullanılır. Aşağıdaki rapor v1.1 tesliminin tarihsel kaydıdır.

---

# Planet Studio — teslim durumu

**Sürüm:** 1.1.0 — 12.000 km ve serbest gezinme optimizasyonu  
**Tarih:** 20 Ekim 2026  
**İstek:** Verilen gezegen üretici planını uygulamak, STARFRONT'tan ayrı açmak ve içinde gezebilmek.

Bağımsız, çalışan bir WebGPU stüdyosu, üretim çekirdeği, kayıt biçimi, adaptör,
üç doğrulanmış dünya ve uygulama görüntüleri teslim edildi. Planın aşağıda belirtilen
ileri algoritma ve entegrasyon bölümleri kısmi uygulamadır; tam kapsam tamamlandı iddiası yoktur.

## Çalışan işlevler

| Alan | Gerçek uygulama |
|---|---|
| Bağımsızlık | Oyun sunucusu/oturumu gerektirmeyen ayrı ESM uygulaması, geliştirme ve hazır dağıtım girişi |
| Üretim | NFC seed, adlandırılmış PRNG akışları, sabit sayısal bake, tarayıcı ve Node Worker |
| Kimlik | Kaynak koddan çekirdek build hash, canonical JSON, little-endian sayılar, SHA-256 dünya imzası |
| Arazi | Kenarları kaynaklanmış cube-sphere, sürekli 3B örnekleme, kıta/sıradağ/ova alanları, termal aşınma |
| Yaklaşma | Worker quadtree, ufuk elemesi, arazi/su kenar etekleri, yerel mesh merkezleri, floating origin ve reversed depth |
| Su verisi | Ayrı zemin/drenaj/su kotları, okyanus bağlantısı, küresel Priority-Flood, alan ağırlıklı yağış birikimi |
| Görünür coğrafya | Oyulmuş ana kanal ve kol, radyal göl çanağı, korunan sığ geçit, iki su alanını bağlayan boğaz |
| Hareket | Yerel örneklenen kara/su engelleri, portal denetimi, su çekimi, bağımsız host üzerinde rota canlandırması |
| Bitki | İklimden dağılım, 8 km altında yerel canopy/ağaç LOD, sabit kimlikli ~1 km bitki parçaları; makro dağılım veri olarak korunur |
| Görüntü | Gerçek WebGPU, node PBR, spektral 64×64 GPU inverse FFT, atmosfer ve hacimsel bulut/sis |
| Işık | Rayleigh/Mie tek saçılma, transmittance LUT, ortak 3B bulut alanından hacim ve yüzey gölgeleri |
| Son görüntü | HDR/ACES, bloom, uzamsal 4× MSAA; temporal geçmiş kullanılmaz |
| Düzenleyici | Seed, coğrafya/iklim/görünüm/ayrıntı kontrolleri, ortak serbest kamera ve üç irtifa kısayolu, picking, katmanlar, siyasi sınırlar |
| Dosyalar | `.planet` doğrulamalı aç/kaydet, JSON ayarları, 2× PNG fotoğraf, üç hazır dünya |
| Yaşam döngüsü | generationId ile eski işin reddi, Worker iptali, eski görünüm kaynaklarını dispose, GPU hata bildirimi |

Siyasi bölgeler doğal yüzeyden bağımsız çizgi katmanıdır. Bölge sayısı değişirken fiziksel
arazi ve geçiş verisi aynı kalır. Kamera ve geçici görsel animasyon dünya hash'ine girmez.

## v1.1 optimizasyon doğrulaması

33,4 km dahil 100–1 km irtifa dizisi, imleç odaklı yakınlaşma, küresel kaydırma, kutuplar ve sabit görüntü kararlılığı test edildi. Ölçümler ve ilk LOD yüklemesinin sınırları **OPTIMIZASYON.md** içinde. Yarıçap 12.000 km; yüksekliklerde dikey abartı yoktur.

## Doğrulama

- `npm test`: **21/21** çekirdek/adaptör testi geçti.
- `npm run fixtures`: üç dünyanın fiziksel doğrulaması, dosya roundtrip'i, geçit ve boğaz rotaları geçti.
- Node Worker sonucu çekirdek üretimiyle aynı dünya hash'ini verdi; Worker iptali denetlendi.
- Bozuk/kesik paketler ve hash kapsamındaki değiştirilmiş arazi ayarları reddedildi.
- Hazır `dist/` dağıtımı Chrome **155.0.8059.41**, NVIDIA Turing WebGPU ile kontrol edildi:
  **13 tarayıcı kabul kontrolü geçti; JavaScript/WebGPU hata listesi boş.**
  WebGPU kapalıyken ikinci seed üretimi ve paket kaydı da doğrulandı.
  Ayrıntılar: `evidence/browser-acceptance.json`.
- Görsel kanıtlar: her dünya için yörünge, eğik bölge ve yakın nehir/geçit; ayrıca gün batımı,
  bulut altı, siyasi sınırlar, kara/deniz rota canlandırması ve fotoğraf çıktısı.
  `evidence/index.html` dosyası bu görüntüleri bir galeride açar.

Görseller çalışan uygulamadan alınmıştır. Konsept görsel veya dışarıdan alınmış gezegen
fotoğrafı kullanılmadı. Bir testin geçmesi aşağıdaki açık işlerin tamamlandığı anlamına gelmez.

## Kaynak kodda doğrulanan STARFRONT sözleşmesi

İncelenen mevcut depo:
`C:\Users\MUSTAFA\Documents\Codex\2026-09-28\referenced-chatgpt-conversation-this-is-an\outputs\starfront-mvp`.

`spherical.mjs` içindeki `geometryVersion: 3` dönüşümü kontrol edildi:
`lon = cx/cols * 2π − π`, `y = 2*cy/rows − 1`,
`direction = [sqrt(1−y²)*sin(lon), y, sqrt(1−y²)*cos(lon)]`.
`cx/cy` yoksa hücre merkezleri kullanılır.

`adapters/starfront.mjs` hücre kimliklerini, seçim/görünürlük callback'lerini,
metre/birim-küre dönüşümünü ve hareketin uygulanmasından önceki sabit coğrafya
denetimini sağlar. Bağımsız Studio'nun seçili bölgesi ve rota birimi bu adaptörü kullanır.
Mevcut oyunun dosyaları ve sunucu çalışma akışı değiştirilmedi.

## Planla arasındaki somut açıklar

1. **Nehir ağı ve aday araması:** Küresel drenaj/akış hesabı gerçektir. Görünen ana nehir,
   kol, göl ve boğaz, seed ile değişen yönlendirilmiş bir coğrafya şablonundan kurulur.
   Nehir kaynakları tümüyle akış birikiminden seçilmez; genişlik/debi henüz küresel birikimden
   türetilmez. Hidrolik erozyon ve sonlu çok adaylı düzeltme döngüsü tamamlanmadı.
   Bu sürüm yalnızca `generationAttempt: 0` kullanır; başarısız coğrafyada açık hata verir.
2. **İklim:** Enlem, rakım, nem gürültüsü, yağış ve nehir yakınlığı etkindir.
   Rüzgâr yönüne göre tam yağış gölgesi ve okyanusa mesafe alanı uygulanmadı.
3. **Atmosfer:** Transmittance LUT ve küresel hacim integrasyonu çalışır.
   Hillaire'ın ayrı multiple-scattering, sky-view ve aerial-perspective LUT zinciri
   tamamlanmadı; çoklu saçılma aydınlığı yaklaşık ortam terimiyle temsil edilir.
4. **Su:** Tessendorf/Phillips tabanlı GPU inverse FFT çalışır.
   Çok ölçekli yerel tangent-patch FFT, kıyıya göre değişen dalga dispersiyonu,
   gerçek kırılmalı deniz tabanı, sahne yansıması ve su/atmosfer sınırından geçen birleşik
   hacim çözümü tamamlanmadı. Renk ve yansıma PBR/derinlik yaklaşımıdır.
5. **Yakın geometri:** Arazi ve su birlikte LOD kullanır; kenar etekleri açıklıkları örter.
   Çok uzakta dar nehirler pikselden küçük kalır ve yakınlaşınca ayrıntı kazanır.
   Bütün açılarda kusursuz LOD geçişi iddiası yoktur; fiziksel kıyı çözünürlüğü ayara bağlıdır.
6. **Mevcut düzen modu:** İçe aktarılan hücre kimlikleri ve poligon verisi korunur;
   korunan su/kara örneği çatışmasında açık hata verilir. Keyfî mevcut kıyı/bina/yol/portal
   kısıtlarını koruyarak yeni arazi üreten genel kısıt çözücü tamamlanmadı.
   Bu seçenek Studio'da tamamlanmış bir kullanıcı akışı olarak sunulmaz.
7. **Canlı oyun entegrasyonu:** Gerçek koordinatlar doğrulandı ve adaptör bağımsız
   önizlemede çalışır. STARFRONT sunucusunun yol yumuşatma, yerel kaçınma, rota yeniden
   planlama ve kayıt hattı bu pakete bağlanmadı; canlı oyunda uçtan uca hareket doğrulanmadı.
8. **Uzun süreli GPU yaşam döngüsü:** Tekrarlanan açma/üretme, dispose ve hata yolları
   uygulanmıştır. Uzun süreli bellek sızıntısı, fiziksel GPU kaybı ve farklı GPU'lar üzerinde
   kapsamlı kabul yapılmadı. Mesafeye bağlı LOD vardır; FPS hedefi uğruna kullanıcı ayarlarını değiştiren otomatik kalite düşürme yoktur.

Bu açıklar nedeniyle dosyadaki “tam görsel görünüm” ve tüm canlı entegrasyon kabul
ölçütleri henüz kapanmış değildir. Paket, ayrı tarayıcıda kullanılabilir mevcut uygulamayı
ve devam edilebilecek kaynak kodu içerir.
