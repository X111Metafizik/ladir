# Arazi düzeltmeleri — v1.4

21 Ekim 2026. Bağımsız ATLAS stüdyosu; STARFRONT kaynakları değiştirilmedi.

## Ne değişti?

- Önceki aşınma filtresinde eğim yönünün aniden dönmesi iğne tepeler üretiyordu. Yerine fiziksel dalga boylarına göre sınırlanmış, yuvarlatılmış sırtlar ve tabana doğru inen vadiler geldi. 12.000 km yarıçap ve gerçek metre ölçeği korunuyor.
- Ana nehirlerde 18–32 km dalga boyunda yinelenen menderesler var. Kollarda daha kısa kıvrımlar bulunuyor. Su kotu aşağı akışta artmıyor; birleşim kotları eşleşiyor. Bu bir akış ağına dayanan prosedürel yatak modeli, tam hidrolik aşınma simülasyonu değil.
- Kıvrımlı kıyılarda en yakın parça araması bütün vadi genişliğini kapsıyor. Görünebilir nehirlerin çevresinde ek LOD, su şeridinin kaba zeminin altında kalmasını azaltıyor.
- Dengeli Terran ikliminde kar, düşük enlemlerde yaklaşık 2,3–2,5 km kotunda başlar. Yaklaşık 400 m boyunca kademeli artar; enlem, sıcaklık ve bölgesel iklim sınırı değiştirir. Kuru gezegenler karla kaplanmaz.
- Büyük yarık, kıvrılan ana vadi ve ona katılan yan vadi içerir. Hedef oyulma 1.950 m; çevredeki doğal rölyefe göre kıyı–taban farkı değişir. “1–2 km” çevre platoya göre derinlik olarak uygulanmıştır; deniz seviyesinin mutlaka −2 km altına inme anlamına gelmez. Kuru vadi tabanı korunur.
- 170 km'de görünen dağlar yaklaşık 586 m veya daha sık geometri örnekleriyle korunur. Ekran dışındaki gezegene aynı ayrıntı uygulanmaz. Yakın yüzeyde 8 m taban aralığına kadar mevcut LOD devam eder.
- Tek yerel gölge haritasının uzakta oluşturduğu büyük koyu sınır, 6–16 km kamera mesafesinde gölge katkısı kademeli kapatılarak giderildi. Yamaçların normal tabanlı ışıklandırması her mesafede sürer; yakın ağaç/zemin gölgeleri kalır.

## Keşif

Açık tarayıcıda **V 1.4** görünür. **Büyük yarık · 1–2 km**, **Ayrık dağ sırtları** ve **Derin vadiler** kartları kullanılabilir. İncele listesinden Aurora Nehri ve küresel nehir ağına gidilebilir. 4: üstten harita, sağ sürükle: eğim, tekerlek: yakınlaşma.

## Doğrulama

Kabul görüntüleri ve donanım/kare hızı kayıtları: [evidence/v14/index.html](evidence/v14/index.html), [acceptance.json](evidence/v14/acceptance.json).

37 otomatik kontrol; dört tohumda 10.000 dağ kesiti, dengeli iklimde kar geçişi, derin vadi kesiti, akarsu kıvrımlılığı ve aşağı akış kotu, 170 km geometri bütçesi, 33,4 km–yüzey LOD sınırı, geçit/boğaz ve paket imzası kontrollerini kapsar. Sekiz örnek paket tekrar üretildi ve açılıp doğrulandı. Ayrıntı yeni bölgelerde Worker tamamlanınca yüklenir; bu süre FPS ölçümünden ayrıdır.

Görünüm tamamen prosedüreldir; uydu fotoğrafı veya gerçek sayısal yükseklik haritası değildir. Eski v1.3 ve önceki .planet paketleri kendi Studio sürümlerinde açılır; yeni çekirdekle aynı ayarları yeniden üretmek gerekir. Önceki ZIP'ler korunmuştur.
