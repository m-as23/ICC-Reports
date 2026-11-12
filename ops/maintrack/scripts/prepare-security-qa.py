"""Instrument the generated RC using an existing QA shell; never installs tools."""
import argparse,pathlib,json,hashlib,re,shutil
p=argparse.ArgumentParser();p.add_argument('--qa-shell',required=True);a=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[3];rc=root/'audit-output/security-rc';shell=pathlib.Path(a.qa_shell).resolve();out=rc/'qa-www'
assert (shell/'www/secure-assets/qa-network-guard.js').is_file(),'EXISTING_QA_SHELL_REQUIRED'
assert not out.exists(),'QA_OUTPUT_ALREADY_EXISTS'
shutil.copytree(shell/'www',out);policy=json.loads((root/'ops/maintrack/security/owner-047-preview-source.json').read_text());records=[]
for entry in policy['assets']:
 name=entry['path'];raw=(rc/'web'/name).read_bytes();content=raw
 if pathlib.Path(name).suffix in ('.html','.js','.css','.json','.webmanifest'):
  text=raw.decode();text=text.replace('tdnkeskczcsukcujwinu','szhstrafzkxzstjdcynl').replace('maintrack-inventory-final-047','maintrack-security-qa-inventory').replace('maintrack-final-047','maintrack-security-qa-final')
  if name.endswith('.html'):
   text=re.sub(r'<link\b[^>]*href=["\']https?://[^>]+>','',text,flags=re.I)
   text=re.sub(r'\b(src|href)=["\']https?://[^"\']+["\']',r'\1="about:blank"',text,flags=re.I)
   text=text.replace("style-src 'self' https://fonts.googleapis.com;","style-src 'self';").replace("font-src 'self' https://fonts.gstatic.com data:;","font-src 'self' data:;").replace("img-src 'self' data: blob: https:;","img-src 'self' data: blob:;")
   if name=='index.html':
    text=re.sub(r'connect-src[^;]+;',"connect-src 'self';",text)
    text=re.sub(r'(<meta http-equiv="Content-Security-Policy"[^>]+>)',r'\1\n<script src="secure-assets/qa-network-guard.js"></script>\n<script src="secure-assets/qa-native-session.js"></script>',text,count=1)
    text=re.sub(r'<title>.*?</title>','<title>MainTrack Security Integration QA</title>',text)
  elif name.endswith('.css'):text=re.sub(r'url\(["\']?https?://[^)]+\)','none',text,flags=re.I)
  content=text.encode()
 (out/name).write_bytes(content);records.append({'path':name,'rcSha256':hashlib.sha256(raw).hexdigest(),'qaSha256':hashlib.sha256(content).hexdigest(),'instrumented':raw!=content})
for file in out.rglob('*'):
 if file.is_file():
  raw=file.read_bytes();assert b'tdnkeskczcsukcujwinu' not in raw and b'raw.githubusercontent.com' not in raw,'OPERATIONAL_ENDPOINT_FOUND'
report={'schema':1,'scope':'QA_INSTRUMENTED_VARIANT_NOT_OPERATIONAL_BINARY','sourceCommit':json.loads((rc/'security-provenance.json').read_text())['sourceCommit'],'qaProject':'szhstrafzkxzstjdcynl','otaEnabled':False,'webResponseHeadersApplyTo':'Vercel Web; native QA retains its separate navigation/transport guards','assets':records}
(rc/'qa-variant.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'status':'PASS','assets':len(records),'qaProject':report['qaProject'],'networkOpened':False}))
