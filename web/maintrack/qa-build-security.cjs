'use strict';
// QA PREVIEW ONLY. Never use this script for OTA artifact signing or production release.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.html'),client=read('secure-assets/index-inline-1.js');
assert.match(html,/Content-Security-Policy/,'CSP required');
assert.ok(!html.includes('<script>'),'inline JS not permitted');
assert.match(client,/maintrack-unified-four-qa\/api/,'must target isolated QA API');
assert.ok(!client.includes("const API = 'https://tdnkeskczcsukcujwinu.supabase.co/functions/v1/maintrack-stage9-security-api/api'"),'must not target live stage9 API');
assert.doesNotThrow(()=>new Function(client));
assert.match(client,/setDashboardRoleView/);
assert.match(client,/refreshOvertime/);
assert.match(client,/adminSubHours/);
assert.match(html,/id="leaveDuration"/);
assert.match(html,/id="adminBalanceReason"/);
const assets=['index.html','v6.js','v6-core.js','v6.css','v6-core.css','manifest.webmanifest','bd-192.png','bd-512.png','secure-assets/index-inline-1.js','secure-assets/index-inline-2.js','secure-assets/index-inline-1.css'];
for(const name of assets){
 assert.ok(!name.includes('..'));
 if(!fs.existsSync(name))throw Error('MISSING_ASSET: '+name);
 const to=path.join('src',name);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(name,to);
}
console.log('PASS QA preview build: '+assets.length+' static resources, CSP and separate API intact.');
