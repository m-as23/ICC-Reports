// MainTrack v0.4.7 — review-only, platform-neutral Owner diff pagination.
// Collects the COMPLETE immutable review receipt before a future UI may
// enable its separate confirmation checkbox. Does not publish or contact APIs.
export async function collectOwnerDiff({fetchPage,draftId,limit=250,maxDetails=30000}={}){
  if(typeof fetchPage!=='function')throw Error('DIFF_PAGE_FETCHER_REQUIRED');
  if(typeof draftId!=='string'||!/^\d+$/.test(draftId))throw Error('VALID_DRAFT_ID_REQUIRED');
  if(!Number.isInteger(limit)||limit<1||limit>500)throw Error('INVALID_LIMIT');
  if(!Number.isInteger(maxDetails)||maxDetails<1||maxDetails>30000)throw Error('INVALID_MAX_DETAILS');
  let offset=0,expected=null;
  const details=[],codes=new Set();
  for(let i=0;i<=Math.ceil(maxDetails/limit);i++){
    const page=await fetchPage({draftId,limit,offset});
    if(!page||page.draftId!==draftId||page.isStale!==false)
      throw Error('DIFF_STALE_OR_INVALID');
    if(!Number.isInteger(page.detailsTotal)||page.detailsTotal<0||page.detailsTotal>maxDetails)
      throw Error('DIFF_SIZE_INVALID');
    if(!Array.isArray(page.details)||page.details.length>limit||page.offset!==offset)
      throw Error('DIFF_PAGE_INVALID');
    if(typeof page.reviewReceipt!=='string'||!/^[a-f0-9]{64}$/.test(page.reviewReceipt))
      throw Error('DIFF_RECEIPT_INVALID');
    const marker=[page.reviewReceipt,page.baseVersionId,page.currentVersionId,page.detailsTotal];
    if(!expected)expected=marker;
    else if(marker.some((v,j)=>v!==expected[j]))throw Error('DIFF_CHANGED_DURING_REVIEW');
    for(const item of page.details){
      if(!item||typeof item.code!=='string'||!item.code.trim()||codes.has(item.code))
        throw Error('DIFF_DUPLICATE_OR_INVALID_CODE');
      codes.add(item.code);
      details.push(item);
    }
    const next=offset+page.details.length,more=next<page.detailsTotal;
    if(page.hasMore!==more||page.nextOffset!==(more?next:null))
      throw Error('DIFF_PAGE_MISSING_OR_OUT_OF_ORDER');
    if(!more){
      if(details.length!==page.detailsTotal)throw Error('DIFF_INCOMPLETE');
      return Object.freeze({
        draftId,baseVersionId:expected[1],currentVersionId:expected[2],
        reviewReceipt:expected[0],detailsTotal:details.length,
        details:Object.freeze(details),complete:true
      });
    }
    if(next<=offset)throw Error('DIFF_PAGE_NO_PROGRESS');
    offset=next;
  }
  throw Error('DIFF_TOO_MANY_PAGES');
}
