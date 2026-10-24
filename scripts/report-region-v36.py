import json,pathlib,zipfile,hashlib,base64,csv,io,html
root=pathlib.Path('.'); ev=root/'evidence/v36'
data=json.loads((ev/'final-browser/comparison.json').read_text(encoding='utf-8'))
validation=json.loads((ev/'region-validation.json').read_text())
storage=json.loads((ev/'storage-browser.json').read_text())
manifest_path=next((root/'assets/regions').glob('*/manifest.json')); manifest=json.loads(manifest_path.read_text())
out=root/'output/reports';out.mkdir(parents=True,exist_ok=True)
packages=root/'output/regions';packages.mkdir(parents=True,exist_ok=True)
source=zipfile.ZipFile(ev/'source-v35.zip')
changes=[]
for folder in ['core','render','io','workers','studio','scripts','tests']:
 for p in (root/folder).rglob('*'):
  if not p.is_file():continue
  key=p.as_posix()
  if key not in source.namelist() or source.read(key)!=p.read_bytes():changes.append(key)
for name in ['package.json','package-lock.json','README.md','index.html']:
 if source.read(name)!=(root/name).read_bytes():changes.append(name)
source.close()
archive=packages/'ATLAS_Reference_32km_V36.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_STORED) as z:
 for p in manifest_path.parent.iterdir():
  if p.is_file():z.write(p,p.name)
 z.writestr('KULLANIM.txt','ATLAS V36 bölgesel paket. 256 tile, 32x32 km.\nManifest ve dosya SHA-256 imzaları proje io/regional-catalog.mjs kaydına bağlıdır.\nÇalıştırma: npm.cmd run bake:region -- fixtures/lumen-v35.planet --cells=64\nArdından npm.cmd run build. Mevcut kod paketi otomatik tanır.\nGezegen: 8000 km çap / 4000 km yarıçap.\n')
with zipfile.ZipFile(packages/'ATLAS_V36_Source_Changes.zip','w',zipfile.ZIP_DEFLATED) as z:
 for name in changes:z.write(root/name,name)
(root/'output/regions/ATLAS_Reference_32km_V36.sha256').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+archive.name+'\n')
modes={'legacy':'Eski sürekli üretici','procedural':'Eş içerik / prosedürel','cold':'Bake / ilk okuma','warm':'Bake / sıcak cache'}
scenes={'mountain':'Dağ','plain':'Ova','lake':'Göl','river':'Nehir','canyon':'Kanyon'}
num=lambda n,d=1:('—' if n is None else f'{n:.{d}f}')
mib=lambda n:num((n or 0)/1048576)
rows=[];summary=[]
def regions(s):
 return [s.get('region') or {},s['terrain'].get('plannerRegion') or {},*(s['terrain'].get('regions') or []),s.get('vegetation',{}).get('regional') or {}]
for c in data['conditions']:
 duration=sum(s['fullDetailMs'] for s in c['scenes'])
 steady_frames=sum(s['steady']['frames']-1 for s in c['scenes'])
 steady_time=sum((s['steady']['frames']-1)/max(.001,s['steady']['fps']) for s in c['scenes'])
 last=c['scenes'][-1]['steady'];parts=regions(last)
 summary.append({'mode':c['mode'],'startupMs':c['startupMs'],'routeLoadMs':duration,'steadyFps':steady_frames/steady_time,'sampleCpuMs':last['terrain'].get('production',{}).get('samplingMs'),'patchBuildCpuMs':last['terrain'].get('production',{}).get('buildMs'),'readWaitMs':sum(s.get('readMs',0) for s in parts),'decodeWallMs':sum(s.get('decodeMs',0) for s in parts),'verifyMs':sum(s.get('verifyMs',0) for s in parts),'networkBytes':sum(s.get('networkBytes',0) for s in parts),'diskBytes':max((s.get('diskBytes',0) for s in parts),default=0),'regionRamBytes':sum(s.get('ramBytes',0)+s.get('nodeBytes',0) for s in parts),'uploadSubmitMs':last['grids'].get('uploadMilliseconds',0),'allocationMs':last['grids'].get('initialAllocationMilliseconds',0),'maxAllocationMs':last['grids'].get('maxAllocationMilliseconds',0),'longFrames50':sum(s['loading']['longFrames50'] for s in c['scenes']),'maxFrameMs':max(s['loading']['frame'].get('max',0) for s in c['scenes']),'gpuBytes':max(s['steady']['gpuMemory'].get('total',0) for s in c['scenes']),'peakMainHeap':max(s['loading']['peakMainHeap'] for s in c['scenes'])})
 for s in c['scenes']:
  l=s['loading'];p=s['steady'];before=s['before'].get('production') or {};prod=l['terrain'].get('production') or {}
  rows.append({'Koşul':modes[c['mode']],'Sahne':scenes[s['name']],'İlk yüzey ms':l['terrain'].get('firstVisibleMilliseconds'),'Tam ayrıntı ms':s['fullDetailMs'],'Worker örnekleme CPU ms':prod.get('samplingMs',0)-before.get('samplingMs',0),'Worker mesh CPU ms':prod.get('buildMs',0)-before.get('buildMs',0),'Yükleme p95 ms':l['frame'].get('p95'),'Yükleme p99 ms':l['frame'].get('p99'),'En uzun kare ms':l['frame'].get('max'),'>50ms kare':l['longFrames50'],'Sabit kamera FPS':p['fps'],'CPU p95 ms':p['cpu'].get('p95'),'GPU medyan ms':p['gpu'].get('p50'),'GPU p95 ms':p['gpu'].get('p95'),'GPU tahsis MiB':p['gpuMemory'].get('total',0)/1048576,'Ana heap MiB':l['peakMainHeap']/1048576})
csvbuf=io.StringIO();writer=csv.DictWriter(csvbuf,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
csvtext=csvbuf.getvalue();(out/'ATLAS_Regional_Bake_V36.csv').write_text(csvtext,encoding='utf-8-sig')
results={'manifest':manifest_path.as_posix(),'world':manifest['identity'],'packageBytes':archive.stat().st_size,'rawTileBytes':manifest['disk']['rawBytes'],'downloadBytes':manifest['disk']['downloadBytes'],'validation':validation,'summary':summary,'rows':rows,'changedFiles':changes,'errors':data['errors'],'limitations':['Five recorded camera stations, not a statistically repeated 60-second continuous flight.','A separate functional flight/boost/arrival QA is provided.','System free RAM was observed at 576 MiB during the second run; 8.6 s baseline outlier retained.','No global rollout or 100 FPS claim.']}
(ev/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
table=lambda heads,rs:'<div class="scroll"><table><thead><tr>'+''.join('<th>'+html.escape(str(h))+'</th>' for h in heads)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+html.escape(str(v))+'</td>' for v in r)+'</tr>' for r in rs)+'</tbody></table></div>'
overview=table(['Koşul','Açılış sn','5 geçiş toplamı sn','Sabit FPS','>50 ms kare','En uzun ms'],[[modes[s['mode']],num(s['startupMs']/1000),num(s['routeLoadMs']/1000),num(s['steadyFps']),s['longFrames50'],num(s['maxFrameMs'])] for s in summary])
phases=table(['Koşul','Örnekleme CPU ms','Mesh CPU ms','Okuma bekleme ms','Açma ms','Upload gönderim ms','İlk GPU tahsis ms'],[[modes[s['mode']],num(s['sampleCpuMs']),num(s['patchBuildCpuMs']),num(s['readWaitMs']),num(s['decodeWallMs']),num(s['uploadSubmitMs']),num(s['allocationMs'])] for s in summary])
memory=table(['Koşul','Bölge RAM MiB','Ana heap tepe MiB','GPU tahsis MiB','Bölge ağ MiB','Disk cache MiB'],[[modes[s['mode']],mib(s['regionRamBytes']),mib(s['peakMainHeap']),mib(s['gpuBytes']),mib(s['networkBytes']),mib(s['diskBytes'])] for s in summary])
detail=table(['Koşul','Sahne','İlk yüzey sn','Tam ayrıntı sn','p95 ms','p99 ms','En uzun ms','FPS','GPU medyan ms'],[[r['Koşul'],r['Sahne'],num((r['İlk yüzey ms'] or 0)/1000),num(r['Tam ayrıntı ms']/1000),num(r['Yükleme p95 ms']),num(r['Yükleme p99 ms']),num(r['En uzun kare ms']),num(r['Sabit kamera FPS']),num(r['GPU medyan ms'])] for r in rows])
pics=''
for mode in ['legacy','warm']:
 p=ev/'final-browser'/f'{mode}-mountain.png';b=base64.b64encode(p.read_bytes()).decode();pics+='<figure><img src="data:image/png;base64,'+b+'"><figcaption>'+modes[mode]+' — aynı dağ kamerası, FOV 48°</figcaption></figure>'
changed='<ul>'+''.join('<li><code>'+html.escape(n)+'</code></li>' for n in changes)+'</ul>'
download='data:text/csv;charset=utf-8;base64,'+base64.b64encode(('\ufeff'+csvtext).encode()).decode()
text=f'''<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ATLAS V36 · Bölgesel bake</title>
<style>body{{margin:0;background:#0d1820;color:#e9f0ee;font:16px/1.6 system-ui}}main{{max-width:1120px;margin:auto;padding:26px}}h1{{font-size:clamp(30px,5vw,54px);line-height:1.1}}h2{{margin-top:40px;color:#9fe1ca}}p{{max-width:90ch}}a{{color:#bce8ff}}.tag{{letter-spacing:.15em;color:#d8b479}}.note{{border-left:4px solid #d8b479;padding:16px;background:#182730}}.scroll{{overflow:auto}}table{{border-collapse:collapse;font-size:14px;width:100%}}td,th{{padding:10px;border-bottom:1px solid #31434b;white-space:nowrap;text-align:right}}th:first-child,td:first-child{{text-align:left}}figure{{margin:20px 0}}img{{width:100%;border-radius:8px}}code{{overflow-wrap:anywhere}}pre{{white-space:pre-wrap;overflow-wrap:anywhere}}.button{{display:inline-block;padding:10px 16px;border:1px solid #72b39f;border-radius:6px;margin:4px}}@media print{{body{{background:white;color:#15232b}}main{{padding:0}}h2{{color:#154e44}}.note{{background:#eef3f2}}a{{color:#154e44}}}}</style>
<main><div class="tag">ATLAS / V36 / 23 EKİM 2026</div><h1>Bölgesel bake ve streaming<br>Çalışan prototip</h1>
<p><b>8.000 km çap · 4.000 km yarıçap · 32 × 32 km referans havza.</b> 256 ayrı tile üretildi ve oyunun Worker akışına bağlandı. Mevcut LOD, parent geçişleri, kalıcı GPU gridleri, warp ön yüklemesi ve çarpışma sistemi korundu.</p>
<p class="note"><b>Karar: şimdilik yalnız referans bölge.</b> Aynı kanonik alanı yeniden hesaplama maliyeti azalıyor; eski sürekli üreticiye karşı her sahnede yükleme veya FPS kazancı doğrulanmadı. Soğuk yükleme bazı koşullarda daha yavaş. 100 FPS hedefi sağlanmadı. Tam gezegene yayılım yapılmadı.</p>
<a class="button" href="/dist/?world=fixtures/lumen-v35.planet&amp;view=reference&amp;region=baked&amp;v=36">Prototipi aç</a><a class="button" download="ATLAS_Regional_Bake_V36.csv" href="{download}">Tüm ölçümleri CSV indir</a><a class="button" download href="../regions/ATLAS_Reference_32km_V36.zip">Bölge paketini indir · {mib(archive.stat().st_size)} MiB</a>
<button class="button" onclick="const b=new Blob(['&lt;!doctype html&gt;'+document.documentElement.outerHTML],{{type:'text/html'}}),a=document.createElement('a');a.href=window.URL.createObjectURL(b);a.download='ATLAS_Regional_Bake_V36.html';a.click();">Raporu çevrimdışı indir</button>
<h2>Karşılaştırma</h2><p>Önceki sürekli üretici ayrıca kontrol olarak ölçüldü. Üç eş içerik koşulu: kanonik örnekleri çalışma anında üretme, aynı örnekleri ilk kez dosyadan okuma ve aynı dosyaları IndexedDB'den okuma. Sonlu raster, sürekli matematiksel fonksiyonun kayıpsız kopyası değildir; fark aşağıda açıklandı.</p>{overview}
<p>Beş kayıtlı kamera istasyonu: dağ, ova, göl, nehir, kanyon. Her istasyonda yükleme ve 4 sn sabit görünüm ayrı ölçüldü. Viewport 1440×1000; DPR 1, detail 1, volume 32, gölge 2048, MSAA 4×, FOV 48°. Tam mesh disk cache'i bütün koşullarda kapalı tutuldu. Her koşulda aynı rota ve ayarlar kullanıldı. Bunlar 60 saniyelik sürekli uçuş kabul testi değildir.</p>
<p class="note">İkinci koşuda serbest sistem RAM'i yaklaşık 576 MiB ölçüldü. Eski üretici de 8,6 sn uzun kare yaşadı. Bu değer korunmuştur. Bellek baskısı ile örtüşme görüldü; kesin GC/sürücü/paging ayrımı yapılmadı. İlk koşunun ham sonuçları <code>evidence/v36/browser/</code>, son sayaçlı koşu <code>evidence/v36/final-browser/</code> altında duruyor.</p>
<h2>Üretim, okuma, açma ve GPU aktarımı</h2>{phases}
<p>Tablo, açılıştan rota sonuna kadar bileşen sayaçlarını verir. Örnekleme CPU süresi mesh CPU süresinin içindedir. Dosya okuma/açma beklemeleri Worker'lar arasında örtüşür; sütunlar toplanamaz. Upload süresi CPU'nun GPU kuyruğuna veri gönderme maliyetidir; izole DMA süresi değildir. Kare GPU süreleri gerçek asenkron WebGPU zaman damgalarıyla ayrıca ölçülmüştür.</p>
<h2>Bellek ve paket boyutu</h2>{memory}
<p>Ham tile verisi {mib(manifest['disk']['rawBytes'])} MiB; sıkıştırılmış dosyalar ve mevcut hidroloji {mib(manifest['disk']['downloadBytes'])} MiB. Ağ sayısı farklı Worker'ların aynı dosyayı istemesini de içerir. Bölge RAM sütunu son anda tüm izlenen tüketicilerin typed-array yüküdür; JS Map/nesne ek yükü ve Worker heap'leri ana heap sayısına dahil değildir. GPU toplamı API tahsis takibidir, fiziksel VRAM değildir.</p>
<p>Her tüketicide 12 MiB decoded tile + 2 MiB düğüm cache'i; ortak disk cache'i 96 MiB. Dosyalar tek tek okunur/açılır, render döngüsünde gzip açılmaz. GPU örnek aktarımları 72–288 KiB/kare, yeni banka yaklaşık 4 MiB ve en fazla bir/kare; boş GPU banka cache'i 16 MiB. Aktif/parent geçiş geometrisi bu boş cache sınırından ayrıdır.</p>
<h2>Doğruluk ve mevcut hidroloji</h2>
<p>180 regresyon testi geçti. Ortak kenarlarda {validation['edgeChecks']:,} kontrol; {validation['exactChecks']:,} farklı mikro/LOD örneğinde kanonik üretim–paket eşitliği; {validation['hydroChecks']} nehir noktası doğrulandı. Ek mesh testleri pozisyon, normal, biyom, su ve dikiş tamponlarını birebir karşılaştırır. Warp sweep testi paketli ve paketsiz yüzeyde aynı temas noktası ve normalini bulur.</p>
<p>Yükseklik örnek aralığı 31,25 m; mesh LOD çözünürlüğü bundan bağımsızdır. 10.240 örnekte eski sürekli üreticiye göre p99 fark {validation['error']['p99']:.3f} m, en yüksek gözlenen fark {validation['error']['max']:.3f} m. Bu, tüm alan için kanıtlanmış hata üst sınırı değildir. Keskin sırtlar ve kıyı karar sınırlarında orijinal analitik hesap korunur. Komşu tile'lar aynı küresel düğüm adreslerinden ve ortak halo örneklerinden gelir.</p>
<p>Mevcut göl, kot, taşma eşiği, bağlı üç bölgesel nehir ve sınır alıcısı pakette var. Yoğun bölgesel akış yönü ve akış birikimi rasterleri <b>yok</b>; üretildi diye işaretlenmedi. Su yüzeyi mevcut kanonik kotları kullanır. Göl–nehir birleşimindeki eski düz şerit izi önce/sonra görüntülerinde sürüyor; bu çalışma hidrolojiyi veya su shader'ını yeniden tasarlamadı.</p>
<p>Gerçek tarayıcıda bozuk dosya yeniden okuma, cache silinmesi, disk bayt sınırı ve yarıçap ayrımı geçti. Kota hatasının transaction geri çekilmesi birim testinde enjekte edilerek doğrulandı. CDP'nin kota zorlama denemesi bu tarayıcıda gerçek QuotaExceededError üretmedi; fiziksel disk doluluğu denenmiş sayılmıyor.</p>
<h2>Aynı kamera görüntüleri</h2>{pics}
<h2>Sahne ayrıntıları</h2>{detail}
<h2>Kalan darboğazlar ve seçenekler</h2>
<ol><li><b>GPU bütçesi:</b> su/atmosfer/gölge sahneleri 10 ms sınırını aşıyor. Bake bunların piksel işini azaltmıyor. DPR veya görüntü kalitesi düşürülmedi. 60 Hz zamanlayıcı da 100 FPS'i doğrulayamaz.</li>
<li><b>Worker kopyaları ve cache:</b> her tüketici aynı tile'ı ayrı açabiliyor. Bir sonraki ölçülebilir seçenek, ortak IO broker'ı ve tek decoded tile havuzu; bunun iletişim/kopya bedeli ayrıca profillenmeli.</li>
<li><b>Mesh üretimi ve aktarım:</b> bake yükseklik sorgusunu azaltır, mevcut XYZ/normal/su mesh hazırlığı ve grid bankası tahsisi devam eder. Ortak height tile + GPU displacement ikinci prototip olabilir; şu sürümde uygulanmış değildir.</li>
<li><b>Soğuk veya eksik paket:</b> kanonik prosedürel geri dönüş çok sayıda düğüm üretmek zorunda kalabilir. Eski parent görünür kalır fakat tam ayrıntı gecikebilir. Gecikme “sıfır” diye sunulmaz.</li>
<li><b>Uzun kareler:</b> düşük boş RAM ve ilk GPU banka maliyetleriyle birlikte büyük sıçramalar görüldü. Daha geniş yayılımdan önce boş belleği yeterli bir oturumda tekrarlı rota ve ayrıntılı CPU/GC/sürücü izi gerekli.</li></ol>
<h2>Çalıştırma ve değişiklikler</h2><pre>npm.cmd run bake:region -- fixtures/lumen-v35.planet --cells=64
npm.cmd run build
node scripts/validate-region.mjs
npm.cmd test</pre>
<p><code>region=baked</code> paketi açar; <code>region=procedural</code> eşdeğer kanonik kontrol; <code>region=legacy</code> eski sürekli üreticidir. Kaynak dünya hash'i: <code>{manifest['identity']['worldHash']}</code>. Paket kaynak üreticisi {manifest['identity']['generatorVersion']}; motor 1.22.0 / çekirdek 1.8.1. Eski kayıt sessizce yeniden üretilmez. Yeni seed/yarıçap/sürüm eşleşmezse paketten veri alınmaz.</p>
<details><summary>Değiştirilen kaynak dosyaları</summary>{changed}</details>
<p>Kanıtlar: <code>evidence/v36/final-tests.txt</code>, <code>region-validation.json</code>, <code>storage-browser.json</code>, <code>flight/qa.json</code>, <code>final-browser/comparison.json</code>. V31 raporu tarihsel referans olarak okundu; eski ölçümler yeni kazanç diye kullanılmadı.</p></main></html>'''
(out/'ATLAS_Regional_Bake_V36.html').write_text(text,encoding='utf-8')
print(json.dumps({'summary':summary,'report':str(out/'ATLAS_Regional_Bake_V36.html'),'package':str(archive),'changed':len(changes)},ensure_ascii=False))
