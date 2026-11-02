"""Extract the reviewed QA build inputs only. No keys, cloud, signing or devices."""
import pathlib, json, hashlib, zipfile, stat, argparse
ROOT=pathlib.Path(__file__).resolve().parents[3]
INPUTS=ROOT/'ops/maintrack/security/qa-native-build-inputs'
def prepare(output,inputs=INPUTS):
 output=pathlib.Path(output).absolute();inputs=pathlib.Path(inputs)
 if output.exists() or not output.is_relative_to(ROOT/'audit-output'):raise ValueError('OWNED_NEW_QA_OUTPUT_REQUIRED')
 for parent in [output,*output.parents]:
  if parent.is_symlink():raise ValueError('OUTPUT_SYMLINK_DENIED')
 manifest=json.loads((inputs/'manifest.json').read_text());raw=(inputs/'registered-qa-source.zip').read_bytes()
 if hashlib.sha256(raw).hexdigest()!=manifest['archiveSha256']:raise ValueError('ARCHIVE_SHA256_MISMATCH')
 if manifest['package']!='com.icc.maintrack.qa' or manifest['projectRef']!='szhstrafzkxzstjdcynl' or manifest['apkSigning']!='UNSIGNED_ONLY':raise ValueError('QA_IDENTITY_REQUIRED')
 import io
 with zipfile.ZipFile(io.BytesIO(raw)) as z:
  expected={x['path']:x for x in manifest['files']}
  if len(expected)>200 or len(z.infolist())!=len(expected) or sum(x.file_size for x in z.infolist())>10000000:raise ValueError('SOURCE_BUDGET')
  content={}
  for entry in z.infolist():
   p=pathlib.PurePosixPath(entry.filename)
   if p.is_absolute() or '..' in p.parts or '\\' in entry.filename or stat.S_ISLNK(entry.external_attr>>16) or entry.filename not in expected or entry.filename in content:raise ValueError('ARCHIVE_PATH_DENIED')
   data=z.read(entry);row=expected[entry.filename]
   if len(data)!=row['bytes'] or hashlib.sha256(data).hexdigest()!=row['sha256']:raise ValueError('ENTRY_HASH_MISMATCH')
   content[entry.filename]=data
  if set(content)!=set(expected):raise ValueError('FILESET_MISMATCH')
 output.mkdir(parents=True)
 for name,data in content.items():
  p=output/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
 (output/'gradlew').chmod(0o755)
 return {'package':manifest['package'],'sourceFiles':len(content),'archiveSha256':manifest['archiveSha256'],'signingAuthorized':False,'physicalAcceptance':'DEFERRED_BY_OWNER'}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--output',required=True);a=p.parse_args();print(json.dumps(prepare(a.output)))
