// QA-only local browser fixture from the exact checked-out MainTrack source.
// It never deploys anything, contacts Supabase, modifies Web source or signs OTA.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';

const root=path.resolve(import.meta.dirname,'../../..');
const app=path.join(root,'android/maintrack-app');
const require=createRequire(path.join(app,'package.json'));
const {build}=require('esbuild');
const source=path.join(app,'www');
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(sha))throw Error('UNTRUSTED_CHECKOUT');
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
