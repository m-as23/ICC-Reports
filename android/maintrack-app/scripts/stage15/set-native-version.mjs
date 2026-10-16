import fs from 'node:fs';
const [version,code] = process.argv.slice(2);
if (!/^0\.3\.(0|2)$/.test(version || '') || !['300','302'].includes(code)
  || (version === '0.3.0') !== (code === '300')) throw Error('LAB_VERSION_PAIR_REQUIRED');
const file = 'android/app/build.gradle';
let gradle = fs.readFileSync(file,'utf8');
if (!/applicationId "com\.icc\.maintrack"/.test(gradle)) throw Error('UNEXPECTED_BASE_APP_ID');
if (!gradle.includes('applicationIdSuffix ".updatelab"')) {
  if (!/buildTypes\s*\{/.test(gradle)) throw Error('MISSING_BUILD_TYPES');
  gradle = gradle.replace(/buildTypes\s*\{/, 'buildTypes {\n        debug { applicationIdSuffix ".updatelab" }');
}
if (!/versionCode\s+\d+/.test(gradle) || !/versionName\s+"[^"]+"/.test(gradle)) throw Error('UNEXPECTED_VERSION_SOURCE');
gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode '+code).replace(/versionName\s+"[^"]+"/, 'versionName "'+version+'"');
fs.writeFileSync(file,gradle);
console.log('Configured isolated Debug application com.icc.maintrack.updatelab '+version+' ('+code+')');
