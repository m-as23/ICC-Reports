// QA-only local browser fixture from the exact checked-out MainTrack source.
// It never deploys anything, contacts Supabase, modifies Web source or signs OTA.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {prepareQaBundle} from './prepare-full-qa-bundle.mjs';

const root=path.resolve(import.meta.dirname,'../../..');
const app=path.join(root,'android/maintrack-app');
const require=createRequire(path.join(app,'package.json'));
const {build}=require('esbuild');
const source=path.join(app,'www');
const web=path.join(root,'audit-output/maintrack-qa-bundle');
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(sha))throw Error('UNTRUSTED_CHECKOUT');
// QA browser fixtures are generated from the checked-out review commit.
// Do not call snapshot.mjs here: its immutable *native-release* index lock is
// intentionally distinct from the current canonical Web index. Production
// packaging remains blocked by its own signature, lock and owner gates.
await fs.rm(source,{recursive:true,force:true});
await prepareQaBundle();
await fs.cp(web,source,{recursive:true});
await build({
  entryPoints:[path.join(app,'update-system/startup.mjs')],
  outfile:path.join(source,'secure-assets/stage13-native-ready.js'),
  bundle:true,format:'iife',platform:'browser',target:'es2022',logLevel:'silent'
});
await build({
  entryPoints:[path.join(app,'update-system/local-work-startup.mjs')],
  outfile:path.join(source,'secure-assets/stage14-local-work.js'),
  bundle:true,format:'iife',platform:'browser',target:'es2022',logLevel:'silent'
});
const nativeHtmlPath=path.join(source,'index.html');
let nativeHtml=await fs.readFile(nativeHtmlPath,'utf8');
if(!nativeHtml.includes('<head>')||!nativeHtml.includes('</body>'))throw Error('INVALID_REVIEW_SOURCE_HTML');
nativeHtml=nativeHtml.replace('<head>','<head>\\n<script src="secure-assets/stage13-native-ready.js"></script>')
  .replace('</body>','<script src="secure-assets/stage14-local-work.js"></script></body>');
await fs.writeFile(nativeHtmlPath,nativeHtml);
const output=path.join(app,'web-pilot');
const staticRoot=path.join(output,'.vercel/output/static');
const releasePath='/releases/'+sha+'/';
const target=path.join(staticRoot,'releases',sha);
await fs.rm(output,{recursive:true,force:true});
await fs.mkdir(target,{recursive:true});
await fs.cp(source,target,{recursive:true});
await build({
  entryPoints:[path.join(app,'update-system/web-entry.mjs')],
  outfile:path.join(target,'secure-assets/web-update.js'),
  bundle:true,format:'iife',platform:'browser',target:'es2022',logLevel:'silent',
  define:{__MAINTRACK_WEB_CONFIG__:JSON.stringify({commit:sha})}
});
await fs.copyFile(path.join(app,'update-system/web-panel.css'),
  path.join(target,'secure-assets/web-update.css'));
const index=path.join(target,'index.html');
let html=await fs.readFile(index,'utf8');
if(!html.includes('</head>')||!html.includes('</body>')||!html.includes('stage14-local-work.js'))throw Error('INVALID_LOCAL_WEB_FIXTURE');
html=html.replace('</head>','<link rel="stylesheet" href="secure-assets/web-update.css"></head>')
         .replace('</body>','<script src="secure-assets/web-update.js"></script></body>');
await fs.writeFile(index,html);
const metadata={schema:1,appId:'com.icc.maintrack',channel:'web-pilot',
  commit:sha,path:releasePath,expiresAt:Date.now()+86400000};
await fs.writeFile(path.join(staticRoot,'maintrack-release.json'),JSON.stringify(metadata));
console.log('PASS generated isolated browser fixtures from commit '+sha+'; no deploy or live backend');
