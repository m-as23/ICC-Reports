// Read-only GitHub repository-variable check. Does not read or use Android private keys.
import assert from 'node:assert/strict';
const installed = '07a35f17c9a7a17b24b1867e839fab2043d83f998bb604701776f3f64c807d5b';
const normalize = value => String(value||'').trim().replaceAll(':','').toLowerCase();
assert.match(installed,/^[0-9a-f]{64}$/);
const configured = normalize(process.env.MT_ANDROID_EXPECTED_CERT_SHA256);
const state = !configured ? 'NO_REPOSITORY_LEVEL_CERT_CONFIGURED' :
  !/^[0-9a-f]{64}$/.test(configured) ? 'INVALID_REPOSITORY_CERT_CONFIG' :
  configured === installed ? 'PUBLIC_CERT_MATCH_ONLY_NOT_PRIVATE_KEY_PROOF' :
  'REPOSITORY_CERT_DIFFERS_FROM_INSTALLED_APP';
const obj = {check:'PUBLIC_METADATA_ONLY',state,androidPrivateKeyRead:false,
  androidKeystoreRead:false,secretsUsed:false,noRelease:true,noProductionChanges:true,
  signingEnabledRepoFlag:process.env.MT_STAGE14_SIGNING_READY==='true'};
console.log('MAINTRACK_READONLY_ANDROID_SIGNING_METADATA '+JSON.stringify(obj));
if(process.env.GITHUB_STEP_SUMMARY) {
  const {appendFileSync}=await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    '## MainTrack Android key-readiness (repository variables only)\n\n'+
    '- Result: **'+state+'**\n'+
    '- APK private key: **not accessed**\n'+
    '- Protected environment variables/secrets: **not assessed**\n'+
    '- Release, update, deployment: **none**\n');
}
