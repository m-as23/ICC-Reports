// Reproducible static worker: execute the identical locked search preparation off the UI thread.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'../../..'),assets=path.join(root,'web/maintrack/public');
const require=createRequire(path.join(root,'android/maintrack-app/package.json'));
const {build}=require('esbuild');
const engineStamp='inventory-v1:'+createHash('sha256').update(await fs.readFile(path.join(assets,'inventory-reference.js'))).update((await fs.readFile(path.join(assets,'inventory-reference-integration.js'),'utf8')).match(/function toReferenceItem\(x\)\{[^\n]+\}/)?.[0]||'').digest('hex');
for(const [entry,outfile,globalName] of [['inventory-ui.mjs','inventory-047.js',undefined],['inventory-loader.mjs','inventory-preparation.js','MainTrackInventoryPreparation']])await build({entryPoints:[path.join(root,'ops/maintrack/inventory/frontend',entry)],outfile:path.join(assets,outfile),bundle:true,minify:true,define:{__MT_INVENTORY_ENGINE__:JSON.stringify(engineStamp)},format:'iife',globalName,target:'es2022',logLevel:'silent'});
const source=await fs.readFile(path.join(assets,'inventory-reference.js'),'utf8'),integration=await fs.readFile(path.join(assets,'inventory-reference-integration.js'),'utf8');
const end=source.indexOf('function getFacetValues');
if(end<0)throw Error('REFERENCE_BOUNDARY_CHANGED');
const mapping=integration.match(/function toReferenceItem\(x\)\{[^\n]+\}/)?.[0];
if(!mapping)throw Error('MAPPING_BOUNDARY_CHANGED');
await fs.writeFile(path.join(assets,'inventory-reference-worker.js'),source.slice(0,end)+'\n'+mapping+'\nself.onmessage=event=>{try{mt6SetData(event.data.map(toReferenceItem));self.postMessage({ok:true,rows:INDEX});}catch{self.postMessage({ok:false});}};\n');
