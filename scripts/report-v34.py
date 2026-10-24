"""Build the phone/offline HTML and a readable Turkish PDF from measured data."""
import base64, hashlib, html, json, math, re, statistics, zipfile
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_LEFT

ROOT=Path(__file__).resolve().parent.parent
E=ROOT/'evidence/v34'; OUT=ROOT/'output/v34'; OUT.mkdir(parents=True,exist_ok=True)
PDF=ROOT/'output/pdf/ATLAS_Terrain_Ucus_Performans_V34.pdf'
def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def quant(values):
 a=sorted(x for x in values if isinstance(x,(float,int)) and math.isfinite(x))
 return {k:a[min(len(a)-1,int(len(a)*v))] if a else None for k,v in [('p50',.5),('p95',.95),('p99',.99),('max',1)]}
def fmt(v): return '-' if v is None else f'{v:,.1f}'.replace(',','X').replace('.',',').replace('X','.')
def summarize(data,cache=None,phase=None):
 runs=[r for r in data['runs'] if cache is None or r['cache']==cache]
 frames=[f for r in runs for f in r['frames'] if phase is None or f['phase']==phase]
 intervals=[r['frames'][i]['time']-r['frames'][i-1]['time'] for r in runs for i in range(1,len(r['frames'])) if phase is None or r['frames'][i]['phase']==phase]
 samples=[s for r in runs for s in r['samples']]
 return {'fps':len(frames)*1000/sum(r['duration'] for r in runs) if not phase else None,'cpu':quant([f['cpu'] for f in frames]),'gpu':quant([f.get('gpu',{}).get('render') for f in frames]),'frame':quant(intervals),'draws':quant([f['draws'] for f in frames]),'passes':quant([f['passes'] for f in frames]),'over50':sum(t>50 for t in intervals),'over100':sum(t>100 for t in intervals),'heapMiB':max(s.get('heap',0) or 0 for s in samples)/1048576,'gridMiB':max(s['grids']['allocatedBytes'] for s in samples)/1048576,'gpuMiB':max(s.get('drawMemory',{}).get('total',0) for s in samples)/1048576,'startupMs':[r['startupMs'] for r in runs if r['cache']=='cold'],'flightStartupMs':[r['flightStartupMs'] for r in runs if r['cache']=='cold']}
cases={k:read(E/v/'benchmark.json') for k,v in [('before','before'),('optimized','final-old-optimized'),('new','final-new-optimized')]}
for name,data in cases.items():
 assert len(data['runs'])==6 and not data.get('failure') and not data['errors'],name
 assert all(r['duration']>=60000 and r['gpuTimestampAvailable'] for r in data['runs'])
assert cases['before']['runs'][0]['environment']['world']['worldDataHash']==cases['optimized']['runs'][0]['environment']['world']['worldDataHash']
for case in cases.values():
 for run in case['runs']:
  assert run['environment']['settings']==cases['before']['runs'][0]['environment']['settings']
  assert run['environment']['route']==cases['before']['runs'][0]['environment']['route']
summary={k:{cache:summarize(v,cache) for cache in ['cold','warm']} for k,v in cases.items()}
for k,data in cases.items():
 for cache in ['cold','warm']:
  summary[k][cache]['compute']=quant([f.get('gpu',{}).get('compute') for r in data['runs'] if r['cache']==cache for f in r['frames']])
qa=read(E/'browser/qa.json'); assert qa['passed'] and qa['saved']['diameter']==8000000
tests=(E/'tests.txt').read_text(encoding='utf-8-sig'); count=int(re.search(r'pass (\d+)',tests).group(1));assert re.search(r'fail 0',tests)
focused_tests=(E/'final-water-tests.txt').read_text(encoding='utf-8-sig');assert re.search(r'pass 7',focused_tests) and re.search(r'fail 0',focused_tests)
test_note=f'{count} kontrollük regresyon paketi geçti; son su gruplama ayarından sonra ilgili 7 kontrol yeniden geçti. Bunlar 168 farklı test değildir. Tam paket su grubu 4×4 iken, hedefli tekrar son 2×2 ayarında çalıştırıldı; son tarayıcı ölçümleri 2×2 sürümündendir.'
flight=read(E/'flight/browser.json');assert flight['result']=='passed'
visual=read(E/'visual/cameras.json');assert not visual['errors']
profiles=read(E/'profiles.json')
profile_rows=[[p['scene'],r['function'],r['file'].replace('../../','')+':'+str(r['line']),fmt(r['milliseconds'])] for p in profiles if p['variant']=='after' and p['phase']=='steady' for r in p['application'][:3]]
drainage=next(r['analysis'] for r in visual['results'] if r['world']=='new')
assert drainage['downhillErrors']==0
drainage_note=f"125 m örnekli, 32 × 32 km son yüzey drenaj kontrolünde ters akış {drainage['downhillErrors']}, göreli birikim korunumu hatası {drainage['massError']:.2e}. Göl ve taşma kotu 1.380 m. Bu bölgesel örnekleme tüm gezegendeki her yatağın kanıtı değildir. Üretim grid medyanı 15,1 m/hücre, yoğun tanı grid medyanı 3,8 m/hücre; kamera 22,7 km, FOV 48°."
probes={k:read(E/v/'probe.json') for k,v in [('before','probe-before'),('after','probe-after')]}
for v in probes.values(): assert not v.get('failure') and not v['errors']
labels={'before':'Eski içerik / eski motor','optimized':'Eski içerik / yeni motor','new':'Yeni 8.000 km içerik / yeni motor'}
rows=[]
for k in cases:
 for cache in ['cold','warm']:
  s=summary[k][cache];rows.append([labels[k], 'Soğuk' if cache=='cold' else 'Sıcak',fmt(s['fps']),fmt(s['cpu']['p95']),fmt(s['cpu']['p99']),fmt(s['gpu']['p50']),fmt(s['gpu']['p95']),fmt(s['gpu']['p99']),fmt(s['frame']['p95'])+' / '+fmt(s['frame']['p99']),fmt(s['frame']['max']),str(s['over100'])])
phase_rows=[]
for phase in cases['new']['runs'][0]['scenarios']:
 a=summarize(cases['before'],phase=phase);b=summarize(cases['optimized'],phase=phase);c=summarize(cases['new'],phase=phase)
 phase_rows.append([phase,fmt(a['cpu']['p95']),fmt(b['cpu']['p95']),fmt(c['cpu']['p95']),fmt(c['gpu']['p95']),fmt(c['frame']['max'])])
probe_rows=[]
for i,scene in enumerate(probes['before']['scenes']):
 other=probes['after']['scenes'][i]
 assert scene['camera']==other['camera'],scene['name']+' camera differs'
 assert scene['terrain']['keys']==other['terrain']['keys'],scene['name']+' geometry footprint differs'
 probe_rows.append([scene['name'],fmt(scene['draws']['p50']),fmt(other['draws']['p50']),fmt(scene['gpu']['p95']),fmt(other['gpu']['p95']),fmt(scene['cpu']['p95']),fmt(other['cpu']['p95'])])
memory_rows=[];budget_rows=[]
for k,data in cases.items():
 samples=[s for r in data['runs'] for s in r['samples']]
 peak=lambda obj,key:max((s.get(obj,{}).get(key,0) or 0 for s in samples),default=0)
 memory_rows.append([labels[k],fmt(max(s['heapMiB'] for s in summary[k].values())),fmt(max(s['gridMiB'] for s in summary[k].values())),fmt(max(s['gpuMiB'] for s in summary[k].values())),str(peak('terrain','ready')),str(peak('terrain','inbox')),str(peak('terrain','warm'))])
 if k!='before':
  budget_rows.append([labels[k]]+[fmt(peak('terrain',key)/1048576) for key in ['activeBytes','readyBytes','transitionBytes','prefetchBytes','cacheBytes','retiringBytes']]+[fmt(peak('grids','maxAllocationMilliseconds')),fmt(peak('grids','avoidedInitialCopyBytes')/1048576)])
changes=[]
with zipfile.ZipFile(E/'source-v33.zip') as archive:
 for name in archive.namelist():
  if name.endswith('/'): continue
  p=ROOT/name
  if p.exists() and p.read_bytes()!=archive.read(name): changes.append(name)
for name in ['render/water-batches.mjs','tests/streaming-v34.test.mjs','scripts/benchmark-endurance.mjs','scripts/probe-render-v34.mjs','scripts/profile-report-v34.mjs','scripts/generate-v34.mjs','scripts/verify-world-v34.mjs','scripts/verify-reference-v34.mjs','scripts/verify-flight-v34.mjs','scripts/verify-report-v34.mjs','scripts/report-v34.py','fixtures/lumen-v34.planet']:
 if name not in changes: changes.append(name)
result={'version':'1.20.2','diameter':8000000,'radius':4000000,'summary':summary,'phaseRows':phase_rows,'probeRows':probe_rows,'memoryRows':memory_rows,'budgetRows':budget_rows,'tests':count,'world':qa['saved'],'changes':changes,'warp':{'short':flight['warps'][0],'shortSettled':flight['shortSettled'],'long':flight['warps'][1]}}
(E/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')

intro='Kaynak kodu güncellendi. Son gönderilen metindeki hedef esas alınarak varsayılan çap 8.000 km, yarıçap 4.000 km oldu. Önceki 12.000 km çaplı klasik dünya ayrı paket olarak korunuyor. Metre cinsinden dağ, vadi, su, gemi ve uçuş ölçüleri korunur.'
method='GTX 1660 Ti, Chrome/WebGPU, 1440 × 1000 pencere, DPR 1, MSAA 4×, 32 bulut adımı, 2048 gölge. Her koşulda üç yeni tarayıcı bağlamı ve her birinde soğuk/sıcak 60 saniyelik tekrar: toplam 18 × 60 saniye. Kaydedilmiş coğrafi konumlar, FOV ve AGL komutları aynı. Senaryolar arasındaki konum sıçramaları zamanlamaya dahildir; bu rota kesintisiz bir dünya turu değildir. Sıcak tekrar sınırlı önbellekle yeniden ziyaret anlamına gelir; tüm dünya bellekte değildir. İşletim sistemi ve GPU sürücüsü cache’leri temizlenmedi.'
caution='GPU p50/p95/p99, gerçek animasyon kare kimliğindeki timestamp toplamlarından hesaplandı. CPU ve GPU süreleri toplanmadı. 60 Hz/headless sunumda 100 FPS doğrulanmadı. Rota sırasında bazı bölgelerde parent yüzey hâlâ görünür; tam yüklenmiş sabit sahneler ayrıca ölçüldü. V31’in farklı rotadaki ölçümleriyle doğrudan yüzde karşılaştırması yapılmadı.'
probe_note='Sabit göl kamerasında çizimler 366’dan 183’e, CPU p95 12,6’dan 10,2 ms’ye indi; GPU p95 23,7 ms civarında kaldı. Gruplama piksel maliyetini düşürmüyor. Kamera ve aktif arazi anahtarları iki koşulda birebir eşit. Konservatif grup elemesi gölde gönderilen üçgenleri yaklaşık %4 artırdı. Yeni gruplar hazırlanırken özgün su zaten görünür; batch hazırlığı yüzeyin açılma beklemesi değildir.'
pressure=read(E/'system-pressure.json')
pressure_note=f"Son rota tekrarları sırasında sistemde en az {min(s['availableMiB'] for s in pressure)} MiB boş RAM, saniyede en fazla {max(s['pagesPerSecond'] for s in pressure)} sayfa aktarımı ve %{max(s['cpuPercent'] for s in pressure)} toplam CPU kullanımı kaydedildi. Diğer uygulamalar kapatılmadı. İlk yeni motor tekrarındaki uzun duraklamalar sonuçlara dahildir; eski/yeni rota farkının tamamını kod değişikliğine bağlamak doğru olmaz. Sayfalama ile aynı döneme denk gelmesi tek başına nedensellik kanıtı değildir. Ham sayaçlar system-pressure.json içindedir."
implemented=[
 'Boş GPU grid bankaları mapped-at-creation kopyası olmadan ayrılır; yalnız kullanılan slot yazılır. Kare başına en fazla bir yeni banka; ilk tahsis baytı ve süresi ayrı sayaçta.',
 'Aynı materyalli opak su parçaları küçük mekânsal gruplarda, yerel koordinatlarla birleştirilir. Kıyı üçgenleri, sığlık verisi ve farklı göl kotları aynen taşınır; orijinal CPU meshleri tutulur. Gruplama ve yükleme bütçeli; havuz ve görünür gruplar toplamı 24 MiB.',
 'Atmosfer + bloom birleşimi için kullanılan ek tam çözünürlüklü ara hedef kaldırıldı. Boost örneklemesi iki mevcut dokuyu toplar; bloom, bulut ve çözünürlük ayarları korunur.',
 'İptal edilen geometri temizliği karelere dağıtılır. Bellek sayaçları uçuş sırasında yenilenir; aynı kayıt cache ve warp listesinde iki kez sayılmaz. Aktif, hazır, geçiş, ön yükleme, temizlenecek veri ve grid belleği ayrıdır.',
 'Warp ayrıntısının CPU üretimi, kaba yüzeyin GPU aktarımı sürerken başlar. Varıştaki su tamponları kalkış kamerası dışında da önceden yüklenir. İki Worker havuzu ve doğrusal warp/çarpışma korunur.',
 'V32’de mevcut olan yönlü sırtlar, ortak havza/hidrografya, tek 32 km referans bölge, SSE/histerezis, parent koruması, dikişler, HUD ve efekt havuzları korundu. Bunlar V34’te sıfırdan yapılmış kazanç olarak sayılmadı.'
]
limits=[
 '100 FPS garanti edilmiyor. Yakın sahnelerin gerçek GPU maliyeti sabit sahne tablosunda; CPU uzun kareleri de sürüyor. Yeni dünyanın alanının küçülmesi FPS kazancı olarak sayılmadı.',
 '32 km referans bölgesinde sırt, ova, akarsu birleşimi, göl çıkışı ve kanyon ayrı okunur. Ana sırt ve kanyon profilleri hâlâ fazla düzenlidir; doğal aşınma ve yan kol çeşitliliği için üreticide daha fazla çalışma gerekir. Daha yoğun grid tek başına bu estetik sorunu çözmez. Bu tek referans bölge tüm gezegene kopyalanmaz.',
 'Aktif, geçiş ve ön yükleme eşikleri izleme bütçeleridir; zorunlu atomik parent/child değişimini kesen sert bir toplam RAM sınırı uygulanmadı. Uygulanan ayrı sınırlar: 48 MiB boş cache hedefi, havuz başına 8 MiB transfer geri basıncı, en fazla 4 MiB grid bankası ve 24 MiB su grubu. Karelere yayılan temizlik ve bölünemeyen tek parça nedeniyle anlık eşik aşımı mümkündür. Bu kapsamlar birbirinin yerine geçmez.',
 'Gölge yolu hareketli gemi ve ağaçları güncel tutar. Ayrı uzak statik gölge cache’i bu sürümde uygulanmadı; bütün gölgeler dondurulmadı veya uçuş gölgesi 20 Hz’e düşürülmedi.',
 'Worker heap toplamı ölçülmedi; rapordaki JS heap ana sayfanındır. Worker sayısı artırılmadı. Kaynak bekleme/üretim süreleri toplam CPU süresi değildir.',
 'Temporal vertex morph, tam küresel GPU clipmap veya GPU çarpışma readback eklenmedi. Önceki küçük height-tile prototipi üretim yoluna alınmadı; gerçek FPS kazancı olarak sunulmadı.'
]
short=flight['shortSettled']['terrain'];long=flight['warps'][1]['terrain']
warp_text=f"1.000 km soğuk warp: kaba yüzey {fmt(short.get('arrivalPreparedMilliseconds'))} ms; tam ayrıntı {fmt(short.get('arrivalDetailMilliseconds'))} ms. Varış sonrası tam ayrıntı beklemesi {fmt(short.get('arrivalDetailWaitMilliseconds'))} ms; varış anında tam ayrıntı hazır: {'evet' if short.get('arrivalDetailReadyBeforeJump') else 'hayır'}. 12.000 km warp tam ayrıntı {fmt(long.get('arrivalDetailMilliseconds'))} ms; varışta hazır: {'evet' if long.get('arrivalDetailReadyBeforeJump') else 'hayır'}. Hazır olmayan ayrıntı hazır diye işaretlenmedi."
if flight.get('commits'):
 worst=max(flight['commits'],key=lambda x:x['ms'])
 warp_text+=f" Büyük yüzey değişimi {fmt(worst['ms'])} ms; bunun {fmt(worst.get('groupRemove',0))} ms'si eski sahne nesnelerini kaldırma işinde ölçüldü. Başlangıçtaki {worst['before']} parçadan {worst['after']} parçaya atomik geçiş, kalan CPU sıcak noktasıdır."
options=[['1 - CPU akışını sürdür','Öncelikli','Sık yeniden hedeflemede büyük atomik geçiş grupları ve soğuk yüzey üretimi daha ayrıntılı profillenecek. Tamamlanmış CPU verisini yeniden kullanma ve bütçeli disk cache prototipi en yakın aday.'],['2 - Su shader maliyeti','GPU su sahnesi baskınsa','Gruplama piksel maliyetini azaltmaz. Aynı kıyı görüntüsüyle FFT/noise okumaları ve ekran türevleri ayrı sabit sahnede ölçülmeli.'],['3 - Ayrı statik gölge','Orta kapsam','İki frustum/iki gölge kaynağı ve doğru invalidation gerekir. Gemi gölgesini dondurmadan denenecek; kazancı ölçülmeden varsayılmadı.'],['4 - Height tile / GPU detay','Büyük kapsam','CPU çarpışması, ağaç kökleri ve suyla milimetre hata sınırını koruyan küçük bölge deneyi. Mevcut kalıcı gridler kaldırılmayacak.'],['5 - İsteğe bağlı çözünürlük profili','Son seçenek','Varsayılan kalite bu çalışmada düşürülmedi. 0,75-1,0 ayrı Performans profili ancak kullanıcı tarafından seçilirse; aynı kalite kazancı diye sunulmayacak.']]
headers=['Koşul','Cache','FPS','CPU p95','CPU p99','GPU p50','GPU p95','GPU p99','Kare p95 / p99','En uzun','>100 ms']
def table(head,body): return '<div class="table"><table><thead><tr>'+''.join('<th>'+html.escape(str(c))+'</th>' for c in head)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+html.escape(str(c))+'</td>' for c in row)+'</tr>' for row in body)+'</tbody></table></div>'
def picture(path,caption):
 b=(E/path).read_bytes();return '<figure><img loading="lazy" src="data:image/png;base64,'+base64.b64encode(b).decode()+'"><figcaption>'+html.escape(caption)+'</figcaption></figure>'
sections='<h2>Uygulanan değişiklikler</h2><ul>'+''.join('<li>'+x+'</li>' for x in implemented)+'</ul>'
sections+='<h2>Üç koşul / aynı kayıtlı rota</h2><p>'+method+'</p><p>'+caution+'</p><p class="callout">'+pressure_note+'</p>'+table(headers,rows)
sections+='<h2>Senaryo ayrımı</h2>'+table(['Senaryo','Eski CPU p95','Yeni motor CPU p95','Yeni içerik CPU p95','Yeni içerik GPU p95','Yeni içerik en uzun kare'],phase_rows)
sections+='<h2>CPU profilindeki kalan işler</h2><p>Sabit sahnelerin sekiz saniyelik Chrome örnekleme profilindeki toplam öz süreler; kare süresi değildir. Worker hesapları bu ana sayfa profilinde yoktur. Büyük duraklamaların tamamı GC’ye bağlanmadı; rota sırasındaki 9,9 saniyelik duraklamanın çağrı ağacı bu ayrı profilde bulunmuyor.</p>'+table(['Sahne','Fonksiyon','Kaynak','8 sn içinde örneklenen ms'],profile_rows)
sections+='<h2>Tam yüklenmiş sabit sahneler</h2><p>Aynı klasik dünya ve kameralar, sekiz saniyelik ayrı tanı koşusu. Bu kısa koşular 60 saniyelik tekrarların yerine geçmez.</p>'+table(['Sahne','Eski çizim','Yeni çizim','Eski GPU p95','Yeni GPU p95','Eski CPU p95','Yeni CPU p95'],probe_rows)
sections+='<p>'+probe_note+'</p><h2>Bellek, kuyruk ve ilk tahsis</h2><p>500 ms aralıklı örneklerin tepeleri. Ana JS heap Worker heaplerini içermez; renderer GPU sayacı sürücünün gerçek VRAM ölçümü değildir. Birbirini içeren sayaçlar toplanmamalı.</p>'+table(['Koşul','Ana heap MiB','Grid MiB','Renderer GPU MiB','Hazır parça','Teslim kuyruğu','GPU bekleyen'],memory_rows)+table(['Koşul','Aktif MiB','Hazır MiB','Geçiş MiB','Ön yükleme MiB','Cache MiB','Temizlik MiB','En uzun banka tahsisi ms','Atlanan boş kopya MiB'],budget_rows)
sections+='<p>Ayrı kategori tepeleri farklı anlarda oluşur; toplam RAM değildir. Atlanan boş kopya sayacı tarayıcı bağlamı ömrü boyunca kümülatiftir. GPU aktarımında bölünemeyen tek öznitelik kare byte hedefini aşabilir; tam upload sınırı garantisi verilmez.</p>'
sections+='<h2>İlk açılış / uçuşa giriş</h2><p>Yeni tarayıcı bağlamındaki üç tekrar, milisaniye. Paket okuma ve shader hazırlığı dahil; sabit uçuş FPS hesabından ayrıdır.</p>'+table(['Koşul','Dünya açılışı ms','Uçuşa giriş ms'],[[labels[k],' / '.join(fmt(x) for x in summary[k]['cold']['startupMs']),' / '.join(fmt(x) for x in summary[k]['cold']['flightStartupMs'])] for k in cases])
sections+='<p>GPU tablosu render geçişlerini gösterir. Ayrı compute timestamp ölçümü:</p>'+table(['Koşul / cache','Compute p50','Compute p95','Compute p99'],[[labels[k]+' / '+c]+[fmt(summary[k][c]['compute'][p]) for p in ['p50','p95','p99']] for k in cases for c in ['cold','warm']])
sections+='<h2>Warp, kayıtlar ve testler</h2><p>'+warp_text+f'</p><p>{count} otomatik kontrol geçti. 8.000 km yeni dünya, 12.000 km klasik kayıt, eski V31 kaydı, uçuş ve yörünge tarayıcıda açıldı. Warp seçenekleri, uzaya çıkış, serbest düşüş, zemin çarpışması ayrıca test edildi.</p>'
sections+='<p>'+test_note+'</p>'
sections+='<h2>Aynı kameralardan görüntüler</h2>'+picture('probe-before/lake.png','Önce: klasik kayıt / tam yüklü göl')+picture('probe-after/lake.png','Sonra: aynı kayıt ve kamera / su gruplama ve post optimizasyonu')
sections+=picture('visual/old-gray.png','İçerik referansı: V31 korunmuş yer şekilleri. Aşağıdaki yeni havzayla aynı yerel kamera mesafesi ve FOV; dünyaların yarıçapları farklıdır.')
for name,label in [('new-gray','Gri materyal ve yandan ışık'),('new-gray-dense','Aynı kamera, yoğun referans grid'),('new-flow','Ortak akış yönleri, göl kotu ve havzalar'),('new-final','Son materyal ve atmosfer; tanı için açık hava')]: sections+=picture('visual/'+name+'.png',label)
sections+='<h2>Referans kameraların ölçüleri</h2>'+table(['Görünüm','Çap km','Kamera km','FOV','m/hücre min/medyan/max','LOD'],[[r['world']+' '+r['mode']+(' yoğun' if r['dense'] else ''),r['diameterMeters']/1000,fmt(r['altitudeMeters']/1000),r['fov'],' / '.join(fmt(r['spacing'][k]) for k in ['min','median','max']),' / '.join(map(str,r['levels']))] for r in visual['results']])
sections+='<p>'+drainage_note+'</p>'
sections+='<h2>Kalan sınırlar ve seçenekler</h2><ul>'+''.join('<li>'+x+'</li>' for x in limits)+'</ul>'+table(['Seçenek','Öncelik','Neden / kapsam'],options)
sections+='<h2>Değişen dosyalar</h2><pre>'+html.escape('\n'.join(changes))+'</pre><p>Ham ölçümler: evidence/v34/{before,final-old-optimized,final-new-optimized,probe-before,probe-after,flight,visual}. Dünya imzası: '+qa['saved']['hash']+'. Kaynak geri dönüşü: evidence/v34/source-v33.zip.</p>'
document='''<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ATLAS V34 - Arazi ve uçuş</title><style>body{margin:0;background:#edf2f3;color:#172b34;font:16px/1.65 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:24px;overflow-wrap:anywhere}h1{font-size:clamp(30px,6vw,46px);line-height:1.15}h2{margin-top:40px;color:#155c65}p,li{max-width:900px}li{margin:12px 0}.badge{color:#387c7a;letter-spacing:2px;font-weight:700}nav{display:flex;flex-wrap:wrap;gap:10px}a,button{background:#155c65;color:white;border:0;border-radius:8px;padding:12px 16px;text-decoration:none;font:inherit;cursor:pointer}.table{overflow:auto;margin:20px 0;background:white;border-radius:10px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:10px;border-bottom:1px solid #d9e4e6}th{background:#d8e8e9}figure{margin:26px 0}img{width:100%;height:auto;border-radius:10px}figcaption{font-size:14px;color:#47636d}pre{white-space:pre-wrap;word-break:break-word;font-size:13px}footer{margin-top:30px;font-size:13px}.callout{padding:20px;background:#fff3d7;border-left:5px solid #ac8128}@media(max-width:500px){main{padding:16px}table{min-width:600px}}@media print{nav{display:none}body{background:white}main{padding:0}}</style><main><div class="badge">ATLAS / PLANET STUDIO · V34 · 23 EKİM 2026</div><h1>8.000 km dünya.<br>Ölçülmüş uçuş ve arazi değişiklikleri.</h1><p>'''+intro+'''</p><nav><a href="ATLAS_Terrain_Ucus_Performans_V34.pdf" download>PDF indir</a><button id="download">Çevrimdışı HTML indir</button></nav><p class="callout">100 FPS doğrulanmadı. Kalite ayarları korunarak ölçülen değişiklikler ve kalan uzun kareler aşağıda ayrı gösteriliyor.</p>'''+sections+'''<footer>CPU/GPU/kare süreleri ms. Belirtilmeyen bellekler MiB. Sunucu yalnız bu raporu sunar; indirilen HTML görselleri kendi içinde taşır.</footer></main><script>document.querySelector('#download').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['<!doctype html>'+document.documentElement.outerHTML],{type:'text/html;charset=utf-8'}));a.download='ATLAS_V34_Sonuc.html';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};</script></html>'''
(OUT/'ATLAS_V34_Sonuc.html').write_text(document,encoding='utf-8');(OUT/'index.html').write_text(document,encoding='utf-8')

# PDF: explicit pages keep tables and evidence readable, with embedded Turkish fonts.
pdfmetrics.registerFont(TTFont('Segoe','C:/Windows/Fonts/segoeui.ttf'));pdfmetrics.registerFont(TTFont('SegoeBold','C:/Windows/Fonts/segoeuib.ttf'))
styles=getSampleStyleSheet();styles.add(ParagraphStyle(name='BodyTR',fontName='Segoe',fontSize=9,leading=14,spaceAfter=8));styles.add(ParagraphStyle(name='TitleTR',fontName='SegoeBold',fontSize=25,leading=30,textColor=colors.HexColor('#155c65'),spaceAfter=16));styles.add(ParagraphStyle(name='HeadTR',fontName='SegoeBold',fontSize=15,leading=20,textColor=colors.HexColor('#155c65'),spaceAfter=12));styles.add(ParagraphStyle(name='CellTR',fontName='Segoe',fontSize=7,leading=10))
story=[]
def pdftext(value): return html.escape(str(value).replace('\u2013','-').replace('\u2014','-').replace('\u2011','-'))
def para(text,style='BodyTR'): story.append(Paragraph(pdftext(text),styles[style]))
def heading(text): para(text,'HeadTR')
def ptable(head,body,widths):
 data=[[Paragraph(pdftext(c),styles['CellTR']) for c in row] for row in [head]+body];t=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT');t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#d8e8e9')),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,-1),.4,colors.HexColor('#d2dde0')),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]));story.extend([t,Spacer(1,12)])
def page(): story.append(PageBreak())
def photo(file,caption,width=510):
 image=Image(str(E/file));ratio=image.imageHeight/image.imageWidth;image.drawWidth=width;image.drawHeight=width*ratio;story.append(image);para(caption)
para('ATLAS V34','TitleTR');heading('Arazi ve uçuş - uygulama sonucu');para(intro);para('Uygulama 1.20.2 | Üretici 1.7.2 | LUMEN-742');para(test_note);para('100 FPS hedefi doğrulanmadı. Varsayılan görüntü kalitesi düşürülmedi.');heading('Kaynak kodunda değişenler')
for i,x in enumerate(implemented,1): para(f'{i}. {x}')
page();heading('60 saniyelik rota: üç soğuk / üç sıcak tekrar');para(method);para(caution)
ptable(['Koşul / cache','FPS','CPU p95 / p99','GPU p50 / p95 / p99','Kare p95 / p99 / max','>100 ms'],[[r[0]+' / '+r[1],r[2],r[3]+' / '+r[4],r[5]+' / '+r[6]+' / '+r[7],r[8]+' / '+r[9],r[10]] for r in rows],[126,40,82,105,102,55])
heading('Senaryo başına - yeni içerik');ptable(['Senaryo','CPU p95','GPU p95','En uzun kare'],[[r[0],r[3],r[4],r[5]] for r in phase_rows],[185,105,105,115])
page();heading('Sabit sahne ve varış');para('Tam yüklenmiş aynı klasik dünya / aynı kameralar. Her sabit sahne 8 saniye; rota FPS sonuçlarından ayrı tanı ölçümü.');ptable(['Sahne','Çizim eski / yeni','GPU p95 eski / yeni','CPU p95 eski / yeni'],[[r[0],r[1]+' / '+r[2],r[3]+' / '+r[4],r[5]+' / '+r[6]] for r in probe_rows],[100,130,140,140]);para(probe_note);para(warp_text);heading('Ölçüm ortamı');para(pressure_note);heading('Doğrulama sınırı');para('Dikiş, hidroloji ve iniş/warp kontrolleri test edilen örnekler içindir; gezegenin tüm noktalarının görsel onayı değildir. Orijinal su geometrisi ve CPU yüzeyi korunur. Eski paketler sessizce yeniden üretilmez.')
page();heading('Bellek, kuyruk ve ilk açılış');ptable(['Koşul','Ana heap tepe MiB','Grid GPU tepe MiB','İlk açılış ms (3 koşu)','Uçuşa giriş ms'],[[labels[k],fmt(max(s['heapMiB'] for s in summary[k].values())),fmt(max(s['gridMiB'] for s in summary[k].values())),' / '.join(fmt(x) for x in summary[k]['cold']['startupMs']),' / '.join(fmt(x) for x in summary[k]['cold']['flightStartupMs'])] for k in cases],[125,70,70,130,115]);para('Ana heap Worker heaplerini içermez. Yeni sayaçlarda CPU grid kopyaları ayrıca sayıldığı için eski tek sayaçla doğrudan RAM azalma oranı hesaplanmadı.');ptable(['Koşul','Hazır parça','Teslim kuyruğu','GPU bekleyen'],[[r[0],r[4],r[5],r[6]] for r in memory_rows],[210,100,100,100]);ptable(['Koşul','Aktif MiB','Hazır MiB','Geçiş MiB','Ön yükleme MiB','Cache MiB'],[r[:6] for r in budget_rows],[170,68,68,68,68,68]);para('500 ms aralıklı örneklerin tepeleri farklı anlarda oluşur; toplam RAM değildir. Aktif ve geçiş belleği izleme eşikleridir. GPU aktarımında bölünemeyen tek öznitelik kare byte hedefini aşabilir. İlk banka tahsisi ve temizlenecek veri sayaçlarının tamamı telefon raporu ve results.json içindedir.')
page();heading('Aynı göl kamerası: önce / sonra');photo('probe-before/lake.png','Önce: eski motor / klasik kayıt',480);photo('probe-after/lake.png','Sonra: yeni motor / aynı klasik kayıt. Kameralar ham probe.json içinde.',480)
for pair in [[('new-gray','Gri materyal / üretim grid'),('new-gray-dense','Aynı kamera / yoğun referans grid')],[('new-flow','Akış yönü / havza / göl kotu'),('new-final','Son materyal / atmosfer, açık hava tanısı')]]:
 page();heading('32 × 32 km referans havza')
 for name,label in pair:
  photo('visual/'+name+'.png',label,420)
  mode='gray' if 'gray' in name else 'flow' if 'flow' in name else 'final';dense='dense' in name
  r=next(r for r in visual['results'] if r['world']=='new' and r['mode']==mode and r['dense']==dense)
  para(f"Kamera {fmt(r['altitudeMeters']/1000)} km | FOV {r['fov']}° | LOD {'/'.join(map(str,r['levels']))} | m/hücre min/medyan/max: {' / '.join(fmt(r['spacing'][k]) for k in ['min','median','max'])}")
page();heading('Kalan darboğazlar ve seçenekler')
for x in limits: para(x)
ptable(['Seçenek','Neden / kapsam'],[[r[0],r[2]] for r in options],[130,380]);para('Kaynaklar: evidence/v34/ altındaki ham ölçümler, test çıktısı, kamera JSON’ları ve Chrome CPU profilleri. Eski V31 sayıları tarihsel referanstır. Değişen dosyaların tam listesi results.json ve telefon raporundadır.')
def footer(c,doc):
 c.setFont('Segoe',8);c.setFillColor(colors.HexColor('#47636d'));c.drawString(42,24,'ATLAS V34 - 23.10.2026 - ölçülen sonuçlar');c.drawRightString(553,24,str(doc.page))
doc=SimpleDocTemplate(str(PDF),pagesize=(595.28,841.89),rightMargin=42,leftMargin=42,topMargin=40,bottomMargin=44,title='ATLAS V34 Arazi ve Uçuş Performansı',author='ATLAS / Planet Studio');doc.build(story,onFirstPage=footer,onLaterPages=footer)
(OUT/PDF.name).write_bytes(PDF.read_bytes())
print(json.dumps({'html':str(OUT/'ATLAS_V34_Sonuc.html'),'pdf':str(PDF),'tests':count,'changes':len(changes),'summary':summary},ensure_ascii=False))
