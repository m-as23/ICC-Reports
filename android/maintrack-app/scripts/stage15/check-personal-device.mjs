// Real delivered APKs + public signed fixture, one fresh emulator, synthetic data.
import {_android} from '../../tests-browser/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const pkg = 'com.icc.maintrack.updatelab';
const phase = process.argv[2];
assert(['ota','apk','offline'].includes(phase));
const folder = '.device-pilot/evidence'; await fs.mkdir(folder,{recursive:true});
const raw = JSON.stringify([{u:'LAB-NO-LOGIN',cid:'stage15-native-upgrade',desc:'Synthetic local report',err:'TEST_RETAINED',extra:{keep:true}}]);
const marker = 'stage15-no-account-synthetic-sentinel';
const [device] = await _android.devices(); assert(device, 'ANDROID_DEVICE_REQUIRED');
device.setDefaultTimeout(30000);
const watchdog = setTimeout(() => {console.error('DEVICE_LAB_TIMEOUT');process.exit(1);},120000);
try {
  const webview = await device.webView({pkg}); const page = await webview.page();
  page.setDefaultTimeout(20000);
  await page.route('**/*', route => {
    const origin = new URL(route.request().url()).origin;
    return ['https://localhost','https://raw.githubusercontent.com'].includes(origin)
      ? route.continue() : route.abort('blockedbyclient');
  });
  await page.waitForFunction(() => globalThis.MainTrackLocalWork && document.getElementById('mt-pilot-open')
    && globalThis.Capacitor?.Plugins?.CapacitorUpdater);
  const current = () => page.evaluate(() => Capacitor.Plugins.CapacitorUpdater.current());
  if (phase === 'ota') {
    assert.equal((await current()).native,'0.3.0');
    assert.equal((await current()).bundle.id,'builtin');
    let requests = 0;
    page.on('request', request => {if (request.url().endsWith('/qa/stage15-device/release.json')) requests++;});
    await page.locator('#mt-pilot-open').click(); assert.equal(requests,0);
    await page.locator('#mt-pilot-check').click();
    await page.locator('#mt-pilot-download').waitFor({state:'visible'});
    assert.equal(requests,1);
    await page.evaluate(raw => localStorage.setItem('q',raw),raw);
    await page.locator('#mt-pilot-download').click();
    await page.waitForFunction(() => document.getElementById('mt-pilot-status').textContent.includes('مؤجل'));
    assert.equal(await page.evaluate(() => localStorage.getItem('q')),raw);
    await page.evaluate(marker => {localStorage.setItem('q','[]');localStorage.setItem('stage15-device-sentinel',marker);},marker);
    await page.locator('#mt-pilot-download').click();
    await page.locator('#mt-pilot-activate').waitFor({state:'visible'});
    assert.equal(await page.evaluate(async () => await Capacitor.Plugins.CapacitorUpdater.getNextBundle() == null),true);
    assert.equal((await current()).bundle.id,'builtin');
    await page.screenshot({path:folder+'/before-ota.png'});
    await page.locator('#mt-pilot-activate').click();
    await page.waitForFunction(async () => {
      const plugin = globalThis.Capacitor?.Plugins?.CapacitorUpdater;
      if (!plugin || !document.getElementById('mt-pilot-open')) return false;
      const data = await plugin.current();
      return data.bundle.version === '0.3.1' && data.bundle.status === 'success';
    },null,{timeout:40000});
    assert.equal(await page.evaluate(() => localStorage.getItem('stage15-device-sentinel')),marker);
    await page.locator('#mt-pilot-open').click(); await page.locator('#mt-pilot-check').click();
    await page.waitForFunction(() => document.getElementById('mt-pilot-status').textContent.includes('لا يوجد إصدار أحدث'));
    assert((await page.locator('#mt-pilot-status').innerText()).includes('0.3.1'));
    await page.screenshot({path:folder+'/after-ota.png'});
    // Queue preservation through APK upgrade, not an OTA guard bypass.
    await page.evaluate(raw => localStorage.setItem('q',raw),raw);
    console.log('MT_DEVICE_LAB_OTA_030_TO_031_PASS');
  } else {
    assert.equal((await current()).native,'0.3.2');
    assert.equal((await current()).bundle.id,'builtin');
    assert.equal(await page.evaluate(() => localStorage.getItem('stage15-device-sentinel')),marker);
    assert.equal(await page.evaluate(() => localStorage.getItem('q')),raw);
    if (phase === 'apk') {
      await page.locator('#mt-pilot-open').click(); await page.locator('#mt-pilot-check').click();
      await page.waitForFunction(() => document.getElementById('mt-pilot-status').textContent.includes('لا يوجد إصدار أحدث'));
      assert((await page.locator('#mt-pilot-status').innerText()).includes('0.3.2'));
      await page.screenshot({path:folder+'/after-apk-upgrade.png'});
      console.log('MT_DEVICE_LAB_APK_032_UPGRADE_AND_QUEUE_PASS');
    } else console.log('MT_DEVICE_LAB_OFFLINE_RESTART_AND_QUEUE_PASS');
  }
  await fs.writeFile(folder+'/'+phase+'.json',JSON.stringify({phase,result:'passed',packageId:pkg,current:await current(),syntheticOnly:true},null,2)+'\n');
} finally {clearTimeout(watchdog); await device.close();}
