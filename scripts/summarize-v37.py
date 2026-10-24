import json, math, statistics
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
E=ROOT/'evidence/v37'
def read(path): return json.loads(path.read_text(encoding='utf-8'))
def stats(values):
 a=sorted(v for v in values if isinstance(v,(int,float)) and math.isfinite(v))
 return {k:(a[min(len(a)-1,int(len(a)*q))] if a else None) for k,q in [('p50',.5),('p95',.95),('p99',.99),('max',1)]}|{'n':len(a)}
def aggregate(runs):
 frames=[f for r in runs for f in r['frames']]
 samples=[s for r in runs for s in r['samples']]
 intervals=[b['time']-a['time'] for r in runs for a,b in zip(r['frames'],r['frames'][1:])]
 maximum=lambda fn:max((fn(s) or 0 for s in samples),default=0)
 return {'runs':len(runs),'seconds':sum(r['duration'] for r in runs)/1000,
  'fps':len(frames)*1000/sum(r['duration'] for r in runs),
  'frameMs':stats(intervals),'cpuMs':stats([f['cpu'] for f in frames]),
  'gpuRenderMs':stats([f.get('gpu',{}).get('render') for f in frames]),
  'framesOver50':sum(t>50 for t in intervals),'framesOver100':sum(t>100 for t in intervals),
  'cpuOver10':sum(f['cpu']>10 for f in frames),
  'longTasks':sum(len(r['longTasks']) for r in runs),
  'longTaskMs':stats([t['ms'] for r in runs for t in r['longTasks']]),
  'draws':stats([f['draws'] for f in frames]),
  'bufferAllocationMs':stats([f['bufferAllocMs'] for f in frames]),
  'bufferAllocationBytes':stats([f['bufferAllocBytes'] for f in frames]),
  'writeBytes':stats([f['writeBytes'] for f in frames]),
  'maxMainHeapBytes':maximum(lambda s:s.get('heap')),
  'maxApiGpuBufferBytes':maximum(lambda s:s['buffers']['live']),
  'maxCpuBuffersBytes':maximum(lambda s:s['terrain'].get('cpuTotalBufferBytes')),
  'maxGridBankBytes':maximum(lambda s:s['grids'].get('allocatedBytes')),
  'maxInboxCount':maximum(lambda s:s['terrain'].get('inbox')),
  'maxInboxBytes':maximum(lambda s:s['terrain'].get('inboxBytes')),
  'maxReadyBytes':maximum(lambda s:s['terrain'].get('readyBytes')),
  'maxActiveBytes':maximum(lambda s:s['terrain'].get('activeBytes')),
  'maxTransitionBytes':maximum(lambda s:s['terrain'].get('transitionBytes')),
  'maxPrefetchBytes':maximum(lambda s:s['terrain'].get('prefetchBytes')),
  'maxArrivalBytes':maximum(lambda s:s['terrain'].get('arrivalBytes')),
  'hottestCpuFrames':sorted([dict(f,repeat=r['repeat'],cache=r['cache']) for r in runs for f in r['frames']],key=lambda f:f['cpu'],reverse=True)[:8]}
def phase_stats(runs,phase):
 frames=[f for r in runs for f in r['frames'] if f['phase']==phase]
 intervals=[b['time']-a['time'] for r in runs for a,b in zip(r['frames'],r['frames'][1:]) if a['phase']==phase and b['phase']==phase]
 return {'cpuMs':stats([f['cpu'] for f in frames]),'gpuMs':stats([f.get('gpu',{}).get('render') for f in frames]),'frameMs':stats(intervals),'over50':sum(t>50 for t in intervals),'over100':sum(t>100 for t in intervals)}
result={'version':'V37 / app 1.22.1','scope':'Same canonical geography, default quality, current V36 vs V37 implementation; V31 is historical only.','runs':{},'comparison':{},'phases':{},'cameras':{}}
reports={}
for stage in ['before','after']:
 p=E/(stage+'-endurance')/'benchmark.json'
 report=read(p);reports[stage]=report
 result['runs'][stage]=[{'repeat':r['repeat'],'cache':r['cache'],'fps':r['renderFps'],'startupMs':r['startupMs'] if r['cache']=='cold' else None,'flightStartupMs':r['flightStartupMs'] if r['cache']=='cold' else None,'summary':r['summary']} for r in report['runs']]
 result['comparison'][stage]={cache:aggregate([r for r in report['runs'] if r['cache']==cache]) for cache in ['cold','warm']}
 phases=list(dict.fromkeys(f['phase'] for r in report['runs'] for f in r['frames']))
 result['phases'][stage]={p:phase_stats(report['runs'],p) for p in phases}
 result[stage+'Errors']=report['errors']
 result['cameras'][stage]=[{k:r.get(k) for k in ['world','seed','worldHash','generator','radiusMeters','diameterMeters','regionMeters','mode','dense','altitudeMeters','fov','camera','spacing','levels']} for r in read(E/(stage+'-visual')/'cameras.json')['results']]
result['identicalRoute']=all(r['environment']['route']==reports['before']['runs'][0]['environment']['route'] for rep in reports.values() for r in rep['runs'])
result['identicalSettings']=all(r['environment']['settings']==reports['before']['runs'][0]['environment']['settings'] for rep in reports.values() for r in rep['runs'])
result['settings']=reports['after']['runs'][0]['environment']['settings']
result['hardware']=reports['after']['hardware']
result['radiusMeters']=reports['after']['runs'][0]['environment']['radius']
result['sampling']=read(E/'sampling.json');result['water']=read(E/'water.json')
result['limitations']=['Headless Chrome at 60 Hz cannot certify 100 FPS presentation.','Main JS heap excludes Worker heaps; API buffer allocation is not measured physical VRAM.','Camera jumps between saved scenarios remain in the frame measurements.','Cold starts use fresh browser storage; OS and HTTP cache are not purged. Warm repeats keep the page and Worker pools alive.','CPU and GPU timings overlap and are not added.','Local reference region uses a canonical cubic profile; sharp hydro/biome boundaries intentionally fall back to the generator.','Separate far static-shadow texture cache and temporal vertex morph are not implemented. Active transition memory limits remain soft to retain valid surface.']
(E/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
for stage in ['before','after']:
 for cache,v in result['comparison'][stage].items():
  print(stage,cache,json.dumps({k:v[k] for k in ['fps','frameMs','cpuMs','gpuRenderMs','framesOver50','framesOver100','maxMainHeapBytes','maxApiGpuBufferBytes','maxInboxCount']}))
print('identical route/settings',result['identicalRoute'],result['identicalSettings'])
