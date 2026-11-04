// Local-only native Keystore test. No valid server session or network capability.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..').replaceAll('\\','/'),out=root+'/evidence/final-closure-20261030/android';
const adb=(...a)=>execFileSync(root+'/tools/android-sdk/platform-tools/adb.exe',['-s','emulator-5580',...a],{encoding:'utf8',timeout:15000,stdio:['pipe','pipe','pipe']});
const records=[];let forward=false,stage='boot',ownedAvd=false,ownedApp=false;const focus=process.argv.includes('--focus-corruption');
const record=(id,ok,details={})=>{records.push({id,status:ok?'PASS':'FAIL',...details});if(!ok)throw Error(id);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitForBridge(){const until=Date.now()+20000;while(Date.now()<until){try{if(await evaluate("Boolean(globalThis.Capacitor&&typeof Capacitor.nativePromise==='function'&&Capacitor.PluginHeaders?.some(x=>x.name==='MainTrackSecureSession')&&Capacitor.PluginHeaders?.some(x=>x.name==='MainTrackQaTransport'))"))return;}catch{}await sleep(500);}throw Error('LOCAL_BRIDGE_READINESS_DEADLINE');}
async function evaluate(expression){expression=expression.replaceAll("Capacitor.Plugins.MainTrackQaTransport","plugin('MainTrackQaTransport')").replaceAll("Capacitor.Plugins.MainTrackSecureSession","plugin('MainTrackSecureSession')");expression="(async()=>{const plugin=name=>({status:()=>Capacitor.nativePromise(name,'status',{}),request:o=>Capacitor.nativePromise(name,'request',o),save:o=>Capacitor.nativePromise(name,'save',o),read:()=>Capacitor.nativePromise(name,'read',{}),clear:()=>Capacitor.nativePromise(name,'clear',{})});return await ("+expression+");})()";const pages=await(await fetch('http://127.0.0.1:9226/json/list')).json();const page=pages.find(x=>x.type==='page');if(!page)throw Error('NO_QA_PAGE');const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});try{return await new Promise((r,j)=>{const timer=setTimeout(()=>j(Error('LOCAL_CDP_TIMEOUT')),12000);ws.onmessage=e=>{const x=JSON.parse(e.data);if(x.id!==1)return;clearTimeout(timer);if(x.error||x.result?.exceptionDetails)j(Error('LOCAL_EVALUATION_FAILED'));else r(x.result.result.value);};ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});}finally{ws.close();}}
try{
 if(!adb('emu','avd','name').split(/[\r\n]+/).includes('MainTrackExternalQA'))throw Error('OWNED_QA_AVD_REQUIRED');ownedAvd=true;
 let booted=false;const bootDeadline=Date.now()+180000;while(Date.now()<bootDeadline){try{if(adb('shell','getprop sys.boot_completed').trim()==='1'){booted=true;break;}}catch{}await sleep(1500);}if(!booted)throw Error('BOOT_DEADLINE');
 stage='root-reconnect';if(adb('shell','id -u').trim()!=='0'){try{adb('root');}catch(e){if(e.code!=='ETIMEDOUT')throw e;}await sleep(2000);}
 let rooted=false;for(let i=0;i<12;i++){try{if(adb('shell','id -u').trim()==='0'){rooted=true;break;}}catch{}await sleep(1000);}if(!rooted)throw Error('ROOT_RECONNECT_DEADLINE');
 stage='guest-network-isolation';
 adb('shell','svc wifi disable; svc data disable; settings put global airplane_mode_on 1; am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true >/dev/null; iptables -P OUTPUT DROP; ip6tables -P OUTPUT DROP; iptables -I OUTPUT 1 -j DROP; ip6tables -I OUTPUT 1 -j DROP');
 const deny=s=>s.includes('-P OUTPUT DROP')&&s.split(/[\r\n]+/).filter(x=>x.startsWith('-A OUTPUT'))[0]==='-A OUTPUT -j DROP';record('guest_network_deny_before_application_launch',deny(adb('shell','iptables -S OUTPUT'))&&deny(adb('shell','ip6tables -S OUTPUT')));
 record('original_operational_package_disabled',adb('shell','pm list packages -d com.icc.maintrack').split(/\r?\n/).includes('package:com.icc.maintrack'));
 const apkPath=adb('shell','pm path com.icc.maintrack.qa').trim().replace(/^package:/,'');
 const installedHash=adb('shell','sha256sum '+apkPath).split(/\s/)[0];
 record('exact_retained_lab_apk',installedHash==='9b7a301898473b1b4d1b3cade4d7d8280cae95448d7a3819f38d0405c57cd2f6',{sha256:installedHash});
 ownedApp=true;
 adb('shell','am force-stop com.icc.maintrack.qa');adb('shell','pm clear com.icc.maintrack.qa');adb('shell','am start -n com.icc.maintrack.qa/.MainActivity');
 let socket;for(let n=0;n<20;n++){socket=adb('shell','cat /proc/net/unix').match(/@(webview_devtools_remote_\d+)/)?.[1];if(socket)break;await sleep(500);}if(!socket)throw Error('NO_QA_DEVTOOLS_SOCKET');adb('forward','tcp:9226','localabstract:'+socket);forward=true;await sleep(1200);
 stage='webview-ready';await waitForBridge();stage='channel-safety';
 record('channel_unconfigured_and_no_requests',(await evaluate('(async()=>{let s=await Capacitor.Plugins.MainTrackQaTransport.status();return !s.configured&&s.count===0;})()'))===true);
 if(!focus){const logout=await evaluate(`(async()=>{try{await Capacitor.Plugins.MainTrackQaTransport.request({url:'https://szhstrafzkxzstjdcynl.supabase.co/functions/v1/maintrack-security-qa-final/api',method:'POST',body:JSON.stringify({action:'logout'})});return 'UNEXPECTED_RESOLVE';}catch(e){return e.message||String(e);}})()`);
 record('integration_apk_logout_policy_reaches_locked_channel',logout==='QA_CHANNEL_LOCKED',{error:logout,serverRevocationTested:false});
 }
 stage='native-session-integrity';
 // Generate synthetic opaque token ONLY in the device JS context; never log it.
 if(!focus)record('native_input_boundaries',(await evaluate(`(async()=>{const p=Capacitor.Plugins.MainTrackSecureSession;let rejected=0;for(const value of [JSON.stringify({token:'invalid',code:'90000001'}),'x'.repeat(4097)]){try{await p.save({value});}catch{rejected++;}}return rejected===2;})()`))===true);
 const seeded=await evaluate(`(async()=>{const p=Capacitor.Plugins.MainTrackSecureSession;const a=new Uint8Array(32);crypto.getRandomValues(a);const token=Array.from(a,x=>x.toString(16).padStart(2,'0')).join('');window.__synthetic=JSON.stringify({token,code:'90000001',role:'engineer'});await p.save({value:window.__synthetic});const r=await p.read();return r.exists&&r.value===window.__synthetic;})()`);if(!seeded)throw Error('SYNTHETIC_SETUP_FAILED');if(!focus)record('native_save_read_roundtrip',true);
 const pref='shared_prefs/maintrack_protected_session_v1.xml';
 const original=adb('shell','run-as com.icc.maintrack.qa cat '+pref);
 const sealed=original.match(/<string name="encrypted">([^<]+)<\/string>/)?.[1];if(!sealed)throw Error('ENCRYPTED_ENTRY_REQUIRED');
 const packed=Buffer.from(sealed,'base64');if(!focus)record('native_ciphertext_not_plaintext',packed.length>29&&!packed.includes(Buffer.from('90000001'))&&!original.includes('"token"'));
 packed[packed.length-1]^=1;const modified=original.replace(sealed,packed.toString('base64'));
 // This file belongs only to the read-only owned lab AVD and synthetic app data.
 execFileSync(root+'/tools/android-sdk/platform-tools/adb.exe',['-s','emulator-5580','shell','run-as com.icc.maintrack.qa sh -c "cat > '+pref+'"'],{input:modified,encoding:'utf8',timeout:15000,stdio:['pipe','pipe','pipe']});
 // SharedPreferences cache must be discarded to inspect persistent ciphertext.
 adb('shell','am force-stop com.icc.maintrack.qa');adb('shell','am start -n com.icc.maintrack.qa/.MainActivity');let socket2;const restartDeadline=Date.now()+30000;while(Date.now()<restartDeadline){socket2=adb('shell','cat /proc/net/unix').match(/@(webview_devtools_remote_\d+)/)?.[1];if(socket2)break;await sleep(1000);}if(!socket2)throw Error('NO_RESTART_SOCKET');adb('forward','tcp:9226','localabstract:'+socket2);await sleep(1000);
 await waitForBridge();
 record('corrupted_ciphertext_rejected_after_process_restart',(await evaluate(`(async()=>{try{await Capacitor.Plugins.MainTrackSecureSession.read();return false;}catch(e){return String(e.message||e).includes('SESSION_DECRYPT_FAILED');}})()`))===true);
 record('clear_after_corruption_returns_empty',(await evaluate('(async()=>{const p=Capacitor.Plugins.MainTrackSecureSession;await p.clear();return (await p.read()).exists===false;})()'))===true);
 record('network_channel_remained_unconfigured',(await evaluate('(async()=>{let s=await Capacitor.Plugins.MainTrackQaTransport.status();return !s.configured&&s.count===0;})()'))===true);
}catch(e){records.push({id:'harness',status:'FAIL',stage,error:e.message});process.exitCode=1;}
finally{let cleanup={};for(const [name,run] of [['appCleared',()=>{if(!ownedApp)return false;adb('shell','am force-stop com.icc.maintrack.qa');return adb('shell','pm clear com.icc.maintrack.qa').trim()==='Success';}],['forwardRemoved',()=>{if(forward)adb('forward','--remove','tcp:9226');return true;}],['ownedReadOnlyAvdShutdown',()=>{if(!ownedAvd)return false;adb('emu','kill');return true;}]]){try{cleanup[name]=run();}catch{cleanup[name]=false;process.exitCode=1;}}await fs.writeFile(out+'/native-session-integrity.json',JSON.stringify({records,cleanup,focus,scope:'read-only owned QA AVD; guest IPv4/IPv6 OUTPUT deny before app launch; no valid server session or capability; no private keys read',syntheticTokenPersistedInEvidence:false},null,2));console.log(JSON.stringify({passed:records.filter(x=>x.status==='PASS').length,failed:records.filter(x=>x.status==='FAIL').length,cleanup}));}
