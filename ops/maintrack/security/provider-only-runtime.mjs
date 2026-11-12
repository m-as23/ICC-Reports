// QA diagnostic composition only. No Login/session/DB path or environment reads.
import {createProviderOnlyProbe} from './provider-only-probe.mjs';
import {createQaSiteverifyVerifier} from './provider-only-siteverify.mjs';
/** @param {{projectRef?:string,operatorKey?:string,secret?:string,bodySha256?:string,expires?:number,now?:()=>number,fetchImpl?:typeof fetch}} [options] */
export function createQaProviderRuntime({secret,fetchImpl,...probe}={}){
 if(probe.projectRef!=='szhstrafzkxzstjdcynl')throw Error('QA_PROVIDER_PROJECT_REQUIRED');
 return createProviderOnlyProbe({...probe,verify:createQaSiteverifyVerifier({secret,fetchImpl})});
}
