[CmdletBinding()]
param(
 [ValidateSet('Preflight','DryRun','Restore')][string]$Mode='Preflight',
 [string]$Manifest,[string]$ManifestSha256,[string]$Approval,
 [string]$Service,[string]$Psql='psql',[string]$Supabase='supabase',
 [ValidateSet('direct','qa-session-pooler')][string]$Transport='direct',
 [string]$Output,[switch]$ExecuteApprovedRestore
)
$ErrorActionPreference='Stop'
$ref='szhstrafzkxzstjdcynl'
$result=[ordered]@{schema=1;mode=$Mode;projectRef=$ref;startedUtc=[DateTime]::UtcNow.ToString('o');snapshot='NOT TESTED';sqlAccess='BLOCKED';edgeRead='BLOCKED';sqlRestore='NOT TESTED';edgeRestore='NOT TESTED';mutations=0;phases=@();errors=@();dependency='Same Windows machine, user credentials and network; independent of Codex/MCP process only';restoreAuthorized=$false}
function Digest([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function SafeFile([string]$root,[string]$relative){
 if([IO.Path]::IsPathRooted($relative) -or $relative -match '(^|[\\/])\.\.([\\/]|$)'){throw 'SNAPSHOT_PATH_ESCAPE'}
 $file=[IO.Path]::GetFullPath((Join-Path $root $relative));$prefix=$root.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar
 if(-not $file.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $file -PathType Leaf)){throw 'SNAPSHOT_FILE_INVALID'}
 # Refuse symlinks/reparse points anywhere in the snapshot path.
 $item=Get-Item -LiteralPath $file
 while($item.FullName -ne $root){if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'SNAPSHOT_REPARSE_POINT'};$item=if($item.PSIsContainer){$item.Parent}else{$item.Directory};if(-not $item){throw 'SNAPSHOT_PATH_ESCAPE'}}
 return $file
}
function RunTool([string]$command,[string[]]$arguments){
 # Capture all CLI output: never relay raw stderr which could contain credentials.
 try{$lines=& $command @arguments 2>&1;$code=$LASTEXITCODE;if($code -ne 0){throw 'TOOL_FAILED'};return ($lines -join "`n")}catch{throw 'TOOL_FAILED_NO_SECRET_OUTPUT'}
}
try{
 $result.tools=@{psql=[bool](Get-Command $Psql -ErrorAction SilentlyContinue);supabase=[bool](Get-Command $Supabase -ErrorAction SilentlyContinue)}
 $root=$null;$m=$null
 if($Manifest){
  if($ManifestSha256 -notmatch '^[a-fA-F0-9]{64}$'){throw 'PINNED_MANIFEST_SHA_REQUIRED'}
  $mf=(Resolve-Path -LiteralPath $Manifest).Path;if((Digest $mf) -ne $ManifestSha256.ToLowerInvariant()){throw 'MANIFEST_HASH_MISMATCH'}
  $root=Split-Path -Parent $mf;$m=Get-Content -LiteralPath $mf -Raw|ConvertFrom-Json
  if($m.schema -ne 1 -or $m.projectRef -ne $ref -or $m.sourceCommit -notmatch '^[a-f0-9]{40}$'){throw 'SNAPSHOT_IDENTITY_INVALID'}
  if(-not $m.files -or -not $m.phases){throw 'INCOMPLETE_SNAPSHOT'}
  foreach($entry in $m.files){$file=SafeFile $root $entry.path;if($entry.sha256 -notmatch '^[a-f0-9]{64}$' -or (Digest $file) -ne $entry.sha256){throw 'SNAPSHOT_FILE_HASH_MISMATCH'}}
  $allowed=@('close-admission','restore-sessions-counters','restore-edge-core','restore-edge-inventory','stop-owned-job','restore-database-catalog','verify-baseline')
  if(@($m.phases).Count -ne $allowed.Count){throw 'PHASE_ORDER_INVALID'}
  for($i=0;$i -lt $allowed.Count;$i++){if($m.phases[$i].id -ne $allowed[$i]){throw 'PHASE_ORDER_INVALID'}}
  foreach($phase in $m.phases){if($phase.id.StartsWith('restore-edge-') -ne ($phase.kind -eq 'edge')){throw 'PHASE_KIND_INVALID'};if($phase.kind -notin @('sql','edge')){throw 'PHASE_KIND_INVALID'};if($phase.kind -eq 'sql'){if($phase.file -notin @($m.files.path)){throw 'UNPINNED_SQL'}}else{if($phase.function -notin @('maintrack-security-qa-final','maintrack-security-qa-inventory') -or $phase.entrypoint -notin @($m.files.path)){throw 'UNPINNED_EDGE'}}}
  if(-not $m.edgeWorkdir -or ($m.edgeWorkdir.Replace('\','/')+'/supabase/config.toml') -notin @($m.files.path)){throw 'PINNED_EDGE_CONFIG_REQUIRED'}
  $result.snapshot='VERIFIED';$result.phases=@($m.phases|ForEach-Object {$_.id})
 }
 if($Mode -eq 'DryRun'){
  if(-not $m){throw 'MANIFEST_REQUIRED'}
  $result.sqlAccess='NOT TESTED';$result.edgeRead='NOT TESTED'
 }else{
  if($Service){
   if($Service -notmatch '^[A-Za-z0-9_.-]{1,80}$'){throw 'INVALID_SERVICE_NAME'}
   $target=if($Transport -eq 'qa-session-pooler'){"host=aws-1-eu-central-1.pooler.supabase.com port=5432 user=postgres.$ref"}else{"host=db.$ref.supabase.co port=5432"}
   $connection="service=$Service $target dbname=postgres sslmode=verify-full connect_timeout=8"
   $result.transport=$Transport
   $query="BEGIN READ ONLY;SELECT json_build_object('projectRef',(SELECT project_ref FROM qa_security_final_20261025.qa_scope WHERE singleton),'role',current_user,'createRole',(SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user),'schemaCreate',has_schema_privilege(current_user,'qa_security_final_20261025','CREATE'),'cleanupMember',pg_has_role(current_user,'maintrack_qa_cleanup_worker','MEMBER'));ROLLBACK;"
   try{$db=RunTool $Psql @('-X','-q','-t','-A','--no-password','--set','ON_ERROR_STOP=1','--dbname',$connection,'--command',$query)|ConvertFrom-Json;if($db.projectRef -ne $ref){throw 'WRONG_PROJECT'};$result.sqlAccess='VERIFIED_READ_ONLY';$result.sqlCapabilities=@{createRole=$db.createRole;schemaCreate=$db.schemaCreate;cleanupMember=$db.cleanupMember}}catch{$result.errors+= 'SQL_READ_ACCESS_NOT_VERIFIED'}
  }else{$result.errors+='QA_NAMED_SERVICE_REQUIRED'}
  if($result.tools.supabase){try{$edge=RunTool $Supabase @('functions','list','--project-ref',$ref,'--output','json')|ConvertFrom-Json;$names=@($edge|ForEach-Object {$_.slug});if('maintrack-security-qa-final' -notin $names -or 'maintrack-security-qa-inventory' -notin $names){throw 'FUNCTION_IDENTITY_MISMATCH'};$result.edgeRead='VERIFIED_METADATA_ONLY'}catch{$result.errors+='EDGE_READ_ACCESS_NOT_VERIFIED'}}else{$result.errors+='SUPABASE_CLI_REQUIRED'}
 }
 if($Mode -eq 'Restore'){
  if(-not $m -or -not $Approval){throw 'EXPLICIT_APPROVAL_REQUIRED'}
  $a=Get-Content -LiteralPath $Approval -Raw|ConvertFrom-Json
  if($a.projectRef -ne $ref -or $a.manifestSha256 -ne $ManifestSha256.ToLowerInvariant() -or $a.action -ne 'RESTORE_QA_SNAPSHOT' -or $a.ownerApproval -ne $true -or $a.phases.Count -ne $result.phases.Count -or ([DateTimeOffset]::Parse($a.expiresUtc)).UtcDateTime -le [DateTime]::UtcNow){throw 'APPROVAL_SCOPE_INVALID'}
  for($i=0;$i -lt $result.phases.Count;$i++){if($a.phases[$i] -ne $result.phases[$i]){throw 'APPROVAL_SCOPE_INVALID'}}
  # The file records the human's separately granted scope; it cannot create
  # independent GitHub/platform approval or prove untested restore permissions.
  if(-not $ExecuteApprovedRestore -or $a.independentRehearsalVerified -ne $true){throw 'RESTORE_EXECUTION_BLOCKED_PENDING_INDEPENDENT_CLOUD_REHEARSAL'}
  if($result.sqlAccess -ne 'VERIFIED_READ_ONLY' -or $result.edgeRead -ne 'VERIFIED_METADATA_ONLY'){throw 'LIVE_ACCESS_REQUIRED'}
  $result.restoreAuthorized=$true
  foreach($phase in $m.phases){
   # Mark attempted BEFORE dispatch. Any failure is ambiguous: stop, no retry.
   try{
    foreach($entry in $m.files){if((Digest (SafeFile $root $entry.path)) -ne $entry.sha256){throw 'SNAPSHOT_CHANGED_BEFORE_RESTORE'}}
    $result.mutations++
    if($phase.kind -eq 'sql'){$file=SafeFile $root $phase.file;$null=RunTool $Psql @('-X','--no-password','--set','ON_ERROR_STOP=1','--dbname',$connection,'--file',$file);$result.sqlRestore='EXECUTED_PENDING_INDEPENDENT_VERIFICATION'}
    else{
     if(-not $m.edgeWorkdir){throw 'EDGE_WORKDIR_REQUIRED'}
     $entry=SafeFile $root $phase.entrypoint
     $work=[IO.Path]::GetFullPath((Join-Path $root $m.edgeWorkdir));$expected=Join-Path $work ('supabase/functions/'+$phase.function+'/index.ts')
     if($entry -ne $expected){throw 'EDGE_ENTRYPOINT_MISMATCH'}
     $all=@(Get-ChildItem -LiteralPath $work -File -Recurse)
     foreach($f in $all){$relative=$f.FullName.Substring($root.Length+1).Replace('\','/');if($relative -notin @($m.files.path)) {throw 'UNPINNED_EDGE_FILE'}}
     $null=RunTool $Supabase @('functions','deploy',$phase.function,'--project-ref',$ref,'--workdir',$work,'--use-api');$result.edgeRestore='EXECUTED_PENDING_INDEPENDENT_VERIFICATION'
    }
   }catch{$result.errors+='AMBIGUOUS_RESTORE_STOP_NO_RETRY';break}
  }
  # Even successful CLI exits do not prove end-to-end baseline equivalence.
  $result.independentVerification='REQUIRED'

 }
}catch{$code=$_.Exception.Message;if($code -notmatch '^[A-Z_]+$'){$code='RECOVERY_VALIDATION_FAILED'};$result.errors+=$code}
$result.finishedUtc=[DateTime]::UtcNow.ToString('o')
if($Output){$result|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $Output -Encoding utf8}
$result|ConvertTo-Json -Depth 12
if($result.errors.Count){exit 2}
