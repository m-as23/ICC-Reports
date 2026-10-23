// Menu regression only; detailed reference-page flows live in test_047_inventory_live_ui.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const root=new URL('../../../',import.meta.url);
test('Inventory remains the last MainTrack menu item and embeds the supplied page',async()=>{
 const html=await fs.readFile(new URL('web/maintrack/public/index.html',root),'utf8');
 const menu=html.match(/<div id="tabs">([\s\S]*?)<\/div>/)[1];
 assert.equal([...menu.matchAll(/<button id="([^"]+)"/g)].at(-1)[1],'tabInventory');
 assert.match(html,/<iframe id="inv47Frame" title="البحث عن قطع الغيار"/);
});
