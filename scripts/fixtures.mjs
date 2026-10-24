import {generatePlanet,DEFAULT_APPEARANCE} from '../core/world.mjs';
import {typeAppearance} from '../core/ecology.mjs';
import {serializePlanet,deserializePlanet} from '../io/bundle.mjs';
import {queryStaticNavigation} from '../core/navigation.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('fixtures',{recursive:true});const reports=[];
for(const [name,config] of [
 ['pangea',{seed:'PANGEA-311',landBalance:.70,mountains:.50,plains:.72,forestDensity:.72}],
 ['pelagos',{seed:'PELAGOS-826',landBalance:.27,mountains:.52,plains:.60,forestDensity:.48}],
 ['alpina',{seed:'ALPINA-509',landBalance:.53,mountains:1,plains:.15,forestDensity:.54,temperature:16}],
 ...['desert','volcanic','mars','moon','alien'].map(worldType=>[worldType,{seed:'LUMEN-742',worldType}])
]){
 const world=await generatePlanet(config),c=world.crossings[0],s=world.straits[0];let land=null,water=null;
 if(c){land=queryStaticNavigation(world,{from:c.anchors[0],to:c.anchors[1],portalId:c.portalId});water=queryStaticNavigation(world,{from:s.entrance,to:s.exit,mode:'water',draftMeters:5});if(!land.passable||!water.passable)throw Error(`${name}: geçiş doğrulanamadı`);}
 const bundle=serializePlanet(world,{...DEFAULT_APPEARANCE,...typeAppearance(world.generationConfig.worldType)});await deserializePlanet(bundle);await writeFile(`fixtures/${name}.planet`,new Uint8Array(bundle));
 reports.push({name,...world.generationReport,worldDataHash:world.manifest.worldDataHash,fordPassable:land?.passable??null,straitPassable:water?.passable??null});console.log(name,world.manifest.worldDataHash.slice(0,16),world.generationReport.riverCount);
}
await writeFile('fixtures/validation.json',JSON.stringify(reports,null,2));
