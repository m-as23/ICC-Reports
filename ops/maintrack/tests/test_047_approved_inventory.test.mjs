import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const html=()=>fs.readFileSync('web/maintrack/public/inventory-reference.html','utf8');
test('Approved inventory has specific freshness and limit-switch empty-search example',()=>{
 assert.match(html(),/آخر تحديث لرصيد قطع الغيار/);assert.match(html(),/data-example="ليمت سويتش"/);assert.match(html(),/ابدأ البحث عن قطعة غيار/);assert.doesNotMatch(html(),/SMART PARTS DISCOVERY|المصدر: ملف الجرد المعتمد|مش محتاج تختار القسم الأول/);
});
test('Original search-engine DOM dependencies remain present behind approved presentation',()=>{assert.ok(html().includes('id="totalCount"'),'The retained search engine requires totalCount during startup');});
