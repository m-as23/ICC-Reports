// PR #27 client fix, applied AFTER the accepted source locks have been verified.
import assert from 'node:assert/strict';
export function applyLogoutClient(source) {
  assert.ok(!source.includes('async function logoutCurrentSession('), 'LOGOUT_OVERLAY_ALREADY_PRESENT');
  const anchor='async function post(b){';
  const old="$('out').onclick=()=>{if(getQ().length&&!confirm('فيه بلاغات في الانتظار لم تُرسل. هتفضل محفوظة لحد ما تدخل بنفس الكود. تكمل؟'))return;logout();};";
  assert.equal(source.split(anchor).length,2,'POST_ANCHOR_CHANGED');
  assert.equal(source.split(old).length,2,'LOGOUT_HANDLER_CHANGED');
  const addition=`async function logoutCurrentSession(){
 const token=S&&S.token;
 if(!token)return {confirmed:false};
 logout();const localClear=mtSessionWrites;
 let confirmed=false;
 try{const r=await post({action:'logout',token});confirmed=r.ok===true&&r.revoked===true;}
 catch(e){/* Unknown network outcome is not server-side confirmation. Never retry here. */}
 await localClear;
 if(!S)note(confirmed?'تم تسجيل الخروج وإبطال الجلسة على الخادم.':'تم الخروج محليًا، لكن لم يتأكد إبطال الجلسة على الخادم.',confirmed?'ok':'err');
 return {confirmed};
}
`;
  return source.replace(anchor,addition+anchor).replace(old,"$('out').onclick=async()=>{if($('out').disabled)return;if(getQ().length&&!confirm('فيه بلاغات في الانتظار لم تُرسل. هتفضل محفوظة لحد ما تدخل بنفس الكود. تكمل؟'))return;$('out').disabled=true;try{await logoutCurrentSession();}finally{$('out').disabled=false;}};");
}
export function frameHeaders(html) {
  const match=html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
  assert.ok(match,'ORIGINAL_CSP_REQUIRED');
  assert.ok(!/frame-ancestors/i.test(match[1]),'UNREVIEWED_EXISTING_FRAME_POLICY');
  return {'Content-Security-Policy':match[1].trim().replace(/;?$/,"; frame-ancestors 'self';"),'X-Frame-Options':'SAMEORIGIN'};
}

// Preserve every original page policy and cover fallback/error responses with XFO.
export function frameHeaderRules(pages) {
 const rules=[{source:'/(.*)',headers:[{key:'X-Frame-Options',value:'SAMEORIGIN'}]}];
 for(const {name,html} of pages){
  assert.ok(/^[A-Za-z0-9_/-]+\.html$/.test(name)&&!name.split('/').includes('..')&&!name.startsWith('/'),'INVALID_HTML_PATH');
  const policy=/<meta\s+http-equiv="Content-Security-Policy"/i.test(html)?frameHeaders(html):{'Content-Security-Policy':"frame-ancestors 'self';",'X-Frame-Options':'SAMEORIGIN'};
  const headers=Object.entries(policy).map(([key,value])=>({key,value}));
  const routes=new Set(['/'+name,'/'+name.replace(/\.html$/,'')]);
  if(name==='index.html')routes.add('/');
  if(name.endsWith('/index.html'))routes.add('/'+name.slice(0,-10));
  for(const source of routes)rules.push({source,headers});
 }
 return rules;
}

// Header rules do not create routes: explicitly serve the same HTML at aliases.
export function frameHostingConfig(pages) {
 const headers=frameHeaderRules(pages); // Also validates every destination path.
 return {headers,rewrites:pages.map(({name})=>({source:'/'+name.replace(/\.html$/,''),destination:'/'+name}))};
}
