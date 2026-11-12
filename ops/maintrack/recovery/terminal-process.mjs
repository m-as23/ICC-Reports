// Hand off the console to native tools. This module never consumes terminal input.
import {spawn} from 'node:child_process';
import {setImmediate as yieldImmediate} from 'node:timers/promises';

export async function runTerminal(executable,args,options={},dependencies={}){
 const {spawnProcess=spawn,input=process.stdin,output=process.stdout,handoff=yieldImmediate}=dependencies;
 if(input.isTTY!==true||output.isTTY!==true)throw Error('INTERACTIVE_TERMINAL_REQUIRED');
 const timeout=options.timeout;
 if(!Number.isSafeInteger(timeout)||timeout<=0)throw Error('BOUNDED_TERMINAL_TIMEOUT_REQUIRED');
 if(options.input!==undefined||options.env!==undefined||options.shell===true||options.stdio&&options.stdio!=='inherit')throw Error('UNSAFE_TERMINAL_OPTIONS');
 input.pause();
 if(input.isRaw===true)input.setRawMode(false);
 // Let the parent event loop complete pending console reads before the child reads.
 await handoff();
 return await new Promise(resolve=>{
  let child,settled=false,timedOut=false,timer;
  const finish=result=>{if(settled)return;settled=true;clearTimeout(timer);resolve(result);};
  try{child=spawnProcess(executable,args,{stdio:'inherit',windowsHide:false,shell:false});}
  catch(error){finish({status:null,signal:null,error});return;}
  child.once('error',error=>finish({status:null,signal:null,error}));
  child.once('close',(status,signal)=>finish({status:timedOut?null:status,signal,error:timedOut?Object.assign(Error('TERMINAL_PROCESS_TIMEOUT'),{code:'ETIMEDOUT'}):undefined}));
  timer=setTimeout(()=>{timedOut=true;try{child.kill('SIGTERM');}catch(error){finish({status:null,signal:null,error});}},timeout);
 });
}
