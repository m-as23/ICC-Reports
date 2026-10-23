'use strict';
// Presentation only: the approved compact layout keeps the original matching/facet engine.
const referenceRenderResults=renderResults;
const partSymbol='<svg class="item-symbol" aria-hidden="true" viewBox="0 0 40 52" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 8 13 3h23v41l-7 5H6zM6 8h23v41M29 8l7-5M11 13h13v15H11zM15 17h5v6h-5zM12 34h11M12 39h11"/></svg>';
renderResults=function(){
 const rows=state.filtered.slice(0,state.visible);
 if(!rows.length){referenceRenderResults();return;}
 $('results').innerHTML=rows.map(x=>'<article class="part-card"><div class="item-header"><div class="item-heading">'+partSymbol+'<div class="item-copy"><span class="item-category">'+esc(CATS[x.kind])+'</span><h3 dir="auto">'+esc(displayName(x))+'</h3><span class="item-id" dir="ltr">'+esc(x.c)+'</span></div></div><div class="qty-stack '+(x.q===null?'na':x.q===0?'zero':'')+'"><span class="big">'+(x.q===null?'—':nf.format(x.q))+'</span><span class="unit">الرصيد</span></div></div><div class="compact-location">'+I.pin+'<span>الموقع: <b>'+esc(x.l||'غير مدون')+'</b></span></div><div class="part-bottom"><div class="code-actions"><button class="soft-btn" data-copy="'+esc(x.c)+'">'+I.copy+' نسخ الكود</button><button class="soft-btn detail-btn" data-detail="'+esc(x.c)+'">تفاصيل الصنف '+I.arrow+'</button></div></div></article>').join('');
 $('moreBtn').hidden=state.visible>=state.filtered.length;
 $('results').querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copy(b.dataset.copy));
 $('results').querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>openDetail(b.dataset.detail));
};
for(const button of document.querySelectorAll('[data-example]'))button.onclick=()=>{if($('query').disabled)return;$('query').value=button.dataset.example;search();$('query').focus();};

// Technical limit-switch aliases use a dedicated family, avoiding irrelevant sensor filters.
CATS.limits='ليمت سويتش';ALIASES.limits=['ليمت سويتش','ليمت سوتش','ليمت سويتشات','limit switch','limit sw'];
const categorizeReference=categorize;
categorize=function(x){return /\blimit[\s-]*(?:switch|sw)\b|ليمت سويتش|ليمت سوتش/i.test(x.d||'')?'limits':categorizeReference(x);};
FACETS.limits=[['brand','الشركة',x=>getBrand(x.d)],['contact','NO / NC',x=>contact(x.d)]];
