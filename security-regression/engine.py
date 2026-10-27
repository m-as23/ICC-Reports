"""Small fail-closed regression primitives. No cloud credentials or automatic retries."""
from __future__ import annotations
import fnmatch,hashlib,json,os,pathlib,re,signal,subprocess,time,threading

def digest(value):return hashlib.sha256(value if isinstance(value,bytes) else str(value).encode()).hexdigest()

def _safe(root,relative):
 root=pathlib.Path(root).resolve();p=pathlib.Path(relative)
 if p.is_absolute() or '..' in p.parts:raise ValueError('PATH_ESCAPE')
 target=(root/p).resolve()
 if not target.is_relative_to(root):raise ValueError('PATH_ESCAPE')
 return target

def fingerprint(root,patterns):
 root=pathlib.Path(root).resolve();files={}
 for pattern in patterns:
  _safe(root,pattern)
  for item in sorted(root.glob(pattern)):
   if item.is_file():
    if not item.resolve().is_relative_to(root):raise ValueError('SYMLINK_ESCAPE')
    files[item.relative_to(root).as_posix()]=digest(item.read_bytes())
 return {'patterns':list(patterns),'files':files,'sha256':digest(json.dumps({'patterns':list(patterns),'files':files},sort_keys=True))}

def valid_reuse(root,record,patterns,subject,definition):
 if record.get('status')!='PASS' or record.get('subject')!=subject or record.get('definition')!=definition:return False
 try:
  if fingerprint(root,patterns)!=record.get('inputs'):return False
  evidence=record.get('evidence',{})
  if not evidence.get('files'):return False
  return fingerprint(root,evidence['patterns'])==evidence
 except (OSError,ValueError,KeyError):return False

def release_decision(results):
 return 'NO-GO' if not results or not any(r.get('required') for r in results) or any(r.get('required') and r.get('status')!='PASS' for r in results) else 'GO'

def select_impacted(cases,changes):
 selected=set()
 for name in changes:
  name=name.replace('\\','/')
  if name.startswith(('docs/','evidence/','security-regression/reports/')) or name.lower().endswith(('.md','.txt')):continue
  hits={case['id'] for case in cases if any(fnmatch.fnmatchcase(name,p) for p in case.get('inputs',[]))}
  if not hits:return {c['id'] for c in cases}
  selected.update(hits)
 return selected

class RunBudget:
 def __init__(self,maximum,seconds,spacing,clock=time.monotonic):
  self.maximum=maximum;self.seconds=seconds;self.spacing=spacing;self.clock=clock;self.started=clock();self.count=0;self.last_completed=None
 def reserve(self):
  now=self.clock()
  if now-self.started>=self.seconds:raise RuntimeError('DEADLINE_EXCEEDED')
  if self.count>=self.maximum:raise RuntimeError('REQUEST_BUDGET_EXCEEDED')
  if self.last_completed is not None and now-self.last_completed<self.spacing:raise RuntimeError('MINIMUM_SPACING_NOT_MET')
  self.count+=1
 def completed(self):self.last_completed=self.clock()

class MutationJournal:
 def __init__(self,path):
  self.path=pathlib.Path(path);self.entries=json.loads(self.path.read_text()) if self.path.exists() else {}
 def status(self,key):return self.entries.get(key,{}).get('status')
 def _save(self):
  self.path.parent.mkdir(parents=True,exist_ok=True);temp=self.path.with_suffix('.new');temp.write_text(json.dumps(self.entries,indent=2)+'\n');os.replace(temp,self.path)
 def start(self,key,request_digest):
  if key in self.entries:raise RuntimeError('WRITE_ALREADY_ATTEMPTED_RECONCILE_READ_ONLY')
  self.entries[key]={'status':'AMBIGUOUS','request_sha256':request_digest};self._save()
 def finish(self,key,status):
  if status not in ('CONFIRMED','REJECTED','AMBIGUOUS'):raise ValueError('INVALID_MUTATION_STATUS')
  if key not in self.entries:raise ValueError('WRITE_NOT_STARTED')
  self.entries[key]['status']=status;self._save()

def redact(text,secrets=()):
 for value in secrets:
  if value:text=text.replace(value,'[REDACTED]')
 text=re.sub(r'(?i)Bearer\s+[A-Za-z0-9._~-]+','Bearer [REDACTED]',text)
 text=re.sub(r'(?i)((?:password|pw|old|sessionKey|capability|token|secret|apikey)["\']?\s*[:=]\s*["\']?)[^\s"\'&,}]+',r'\1[REDACTED]',text)
 return text

def execute_bounded(command,cwd,timeout):
 """Run an argv list; terminate only the owned process tree on timeout."""
 if not isinstance(command,list) or not command or not all(isinstance(x,str) for x in command):raise ValueError('ARGV_LIST_REQUIRED')
 started=time.monotonic();kwargs={'cwd':str(cwd),'stdout':subprocess.PIPE,'stderr':subprocess.STDOUT,'shell':False}
 if os.name=='nt':kwargs['creationflags']=subprocess.CREATE_NEW_PROCESS_GROUP
 else:kwargs['start_new_session']=True
 process=subprocess.Popen(command,**kwargs);timed_out=False;overflow=threading.Event();tail=bytearray();total=[0]
 def consume():
  while True:
   chunk=process.stdout.read(4096)
   if not chunk:break
   total[0]+=len(chunk);tail.extend(chunk)
   if len(tail)>8192:del tail[:-8192]
   if total[0]>1048576:overflow.set()
 reader=threading.Thread(target=consume,daemon=True);reader.start()
 while process.poll() is None and not overflow.is_set() and time.monotonic()-started<timeout:time.sleep(.025)
 if process.poll() is None:
  timed_out=not overflow.is_set()
  if os.name=='nt':
   # PID is returned by our Popen, never user-controlled; /T covers its owned descendants.
   subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'],capture_output=True,timeout=10)
  else:os.killpg(process.pid,signal.SIGKILL)
  process.wait(timeout=10)
 reader.join(timeout=2);output=bytes(tail).decode('utf-8',errors='replace')[-6000:]
 if not reader.is_alive():process.stdout.close()
 return {'status':'BLOCKED' if timed_out or overflow.is_set() else 'PASS' if process.returncode==0 else 'FAIL','exit_code':process.returncode,'timed_out':timed_out,'output_limit_exceeded':overflow.is_set(),'duration_seconds':round(time.monotonic()-started,3),'output':redact(output)}
