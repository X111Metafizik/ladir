import {generatePlanet} from '../core/world.mjs';
import {readCachedWorld,saveCachedWorld} from '../io/world-cache.mjs';
self.onmessage=async({data})=>{
  const {generationId,config,importedLayout}=data;
  try{
    const cached=data.reuseCache&&!importedLayout?await readCachedWorld(config):null;
    const world=cached??await generatePlanet(config,{importedLayout,onProgress:p=>self.postMessage({generationId,type:'progress',...p})});
    const saved=cached?true:!importedLayout&&await saveCachedWorld(world);
    self.postMessage({generationId,type:'complete',world,cache:{hit:!!cached,saved}},Object.values(world.buffers).map(a=>a.buffer));
  }catch(error){self.postMessage({generationId,type:'error',message:error.message});}
};
