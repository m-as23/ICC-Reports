// OTA must retain the existing q array: no migration, replacement, or clearing.
// Both a new bundle and its fallback must speak this same storage contract.
export const LOCAL_DATA_CONTRACT = Object.freeze({reportQueue: 1, writesReportQueue: 1, migration: 'none'});

export function acceptsLocalDataContract(contract) {
  return !!contract && Object.keys(contract).length === 3
    && Object.entries(LOCAL_DATA_CONTRACT).every(([key, value]) => contract[key] === value);
}

export function inspectQueueData(storage) {
  try {
    const raw = storage.getItem('q');
    const rows = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(rows)) return {unsentReports: 0, unknownQueue: true};
    const ids = new Set();
    const unknownQueue = rows.some(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row)
        || typeof row.cid !== 'string' || !row.cid.trim()
        || typeof row.u !== 'string' || !row.u.trim()) return true;
      // Unknown future fields are preserved, never stripped.
      for (const key of ['section','machine','comp','desc','solution','date','t1','t2','t3','status','cat','spare','err']) {
        if (key in row && typeof row[key] !== 'string') return true;
      }
      const identity = JSON.stringify([row.u, row.cid]);
      if (ids.has(identity)) return true;
      ids.add(identity);
      return false;
    });
    return {unsentReports: rows.length, unknownQueue};
  } catch { return {unsentReports: 0, unknownQueue: true}; }
}
