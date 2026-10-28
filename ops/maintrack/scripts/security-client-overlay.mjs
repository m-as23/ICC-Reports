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
