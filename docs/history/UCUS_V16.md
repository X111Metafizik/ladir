# ATLAS v1.6 — Alçak uçuş ve akış optimizasyonu

21 Ekim 2026. Mevcut bağımsız Planet Studio güncellemesi. Dünya üreticisi 1.4.0 ve gezegen kimlikleri korunur; eski `.planet` dosyaları açılır.

## Gemi ve kontrol

- Starlight Voyager uzunluğu 110 m. Mevcut ağaçların yüksekliği 12–31 m; ortalama ağacın yaklaşık beş katı.
- Takip kamerası, düşman gemileri, iniş alanı, iniş ayakları, yer açıklığı ve çarpışma zarfı yeni ölçeğe uyarlandı.
- Fare dönüş hızı yaklaşık iki katına çıktı. Ölü bölge küçültüldü; sağ panelde 0,5–2× hassasiyet ayarı bulunuyor.
- Space sırasında merkezde gemiyi okunur tutan çevresel radyal blur ve yumuşak görüş açısı geçişi var.
- Enerjisi tükenen boost, Space bırakılmadan tekrar tekrar açılıp kapanmaz. Enerji yenilendikten sonra Space'i tekrar bas.
- İkiz top namluları sırayla ateş eder. Parlak çekirdek ve iz, namlu flaşı, hafif kamera tepmesi, isabet parlaması, patlama halkası ve saçılan parçalar eklendi.
- Top, füze ve patlamalar için yerel sentez sesleri var. Sağ paneldeki Ses düğmesi kapatır.

## Gecikmenin nedenleri ve değişiklik

Önceki uygulama bütün arazi paketini bitirdikten sonra görüntüyü değiştiriyordu. Çalışan üretim isteği sırasında yeni konumlar gecikebiliyor, geçişte yüzlerce GPU geometrisi bir arada ekleniyordu. Orman tarafı 121 kareyi tarıyor ve tür başına 32.768 kapasiteli tamponları yeniden kuruyordu. Hedef etiketleri de DOM yazımları arasında ekran ölçüsü okuyarak tekrar yerleşim hesabına yol açıyordu.

Yeni sürüm:

- Uzak konum sıçramasında 8×8 ara ızgara; yakında 16×16, çevrede 8×8 ve yüksek irtifadaki bölgesel görünümde 20×20 ızgara kullanır. Yakın alt bölünmeler yaklaşık 3 m nominal örnek aralığına kadar iner. Gerçek aralık kamera uzaklığı ve küp yüzündeki konuma bağlıdır.
- İşçi parçaları yakınlık sırasıyla hemen gönderir. Ana iş parçacığı küçük zaman bütçelerinde işler. Bir üst parça, onu kaplayan alt parçalar hazır olunca değiştirilir; yükleme sırasında mevcut yüzey gösterilmeye devam eder.
- Terrain örnekleri ve 450 pasif GPU parçası önbellekte tutulur. Sınırlandırılmış orman önbelleği, kare/tür başına sabit 576 kapasiteli küçük tampon ve yalnızca mevcut ağaç sayısı kadar çizim kullanılır. Sabit kapasite, her yeni ağaç sayısında farklı bir WebGPU uniform dizisi ve shader derlenmesini önler.
- Uçuşta görüş alanı boost için baştan pay bırakır. Boost bırakıldığında yeni bir shader veya efekt hattı oluşturulmaz.
- Hedef etiketleri için tekrar eden ekran ölçümü kaldırıldı; sayısal HUD 20 Hz yenilenirken fare işareti her kare güncellenir.

## Ağaçlar ve yakın zemin

Uzaktaki ağaçlarda da gövdeler çizilir. Kökler teorik yükseklik alanı yerine ekranda görünen arazi üçgenine oturur; LOD değişince yeniden hizalanır. Kökler 25 cm zemine gömülür. Rüzgâr salınımı nesne koordinatına göre metre ölçeğinde sınırlıdır. Gölgeler alçak irtifa için daraltıldı. Yakın yüzeyde toprak/mineral dokusu ve mesafeye göre süzülen küçük yüzey kabartısı bulunur.

## Doğrulama

Otomatik test çıktısı: `evidence/v16/test-output.txt` (53/53). Son uyarlamalı LOD değişikliğinden sonra ilgili 17 test tekrar geçti: `evidence/v16/final-lod-tests.txt`.
İşlevsel tarayıcı testleri ve önceki sürüm referansı: `evidence/v16/performance.json`. Bu koşunun ilk kare ölçümü, arka plan/odak kısıtlaması nedeniyle kullanılmaz. Nihai soğuk yükleme: `evidence/v16/cold-load-final.json`; ayrı odaklı boost ölçümü: `evidence/v16/boost-profile.json`.
Görsel kanıtlar: `evidence/v16/index.html`.

Soğuk açılıştaki WebGPU shader ve GLB hazırlığı ile uçuş sırasındaki parça yükleme süreleri farklıdır. Sonuçlar bu bilgisayarın test oturumuna aittir; sıfır gecikme veya her donanımda sabit FPS garantisi değildir.



## Son ölçüm

Aynı orman ziyaretinde eski sürümün toplu yüzey geçişi 9.526,7 ms idi. Son odaklı tarayıcı koşusunda toplam 5.249,4 ms ölçüldü (yaklaşık %45 daha kısa). Ara katman 1.464,9 ms içinde tamamlandı; yakın yüksek ayrıntı 2.837,9 ms içinde görünür oldu. Tam çevre hazır olmadan görüntü ilerlemeli olarak gösteriliyor. Uçuşta önbellekli yakın ayrıntı geçişleri ayrı koşuda çoğunlukla 30–150 ms içinde görünür oldu.

Odaklı boost testinde boost bırakıldıktan sonraki karelerin ortancası 16,7 ms, %95 sınırı 33,2 ms, en uzun kare 216,5 ms idi. Bu tek bir yerel örneklemdir; yoğun yükleme sırasında tekil takılmaların tamamen ortadan kalktığı iddia edilmez. Bu boost ölçümünden sonra uzak yüzey ızgarası ayrıca hafifletildi.

Ağaç kökleri 23 ayrı yerde gerçek çizilen üçgenlere raycast ile karşılaştırıldı: -0,250085 ile -0,249923 m. Havada kalan kök yok; tasarlanan 25 cm gömme korunuyor. Tarayıcı testinde hata kaydı yok. 110 m gemi iniş yaptı, tekrar kalktı; ses ve fare hassasiyeti ayarları çalıştı.

