export const EMBEDDING_MODEL='text-embedding-3-small';
export const EMBEDDING_DIMENSIONS=256;
export function normalizedVector(value){
 if(!Array.isArray(value)||value.length!==EMBEDDING_DIMENSIONS||!value.every(Number.isFinite))throw Error('INVALID_EMBEDDING');
 const norm=Math.hypot(...value);if(!Number.isFinite(norm)||norm<1e-12)throw Error('INVALID_EMBEDDING');
 return value.map(n=>n/norm);
}
export function createEmbeddingProvider({apiKey,fetchImpl=globalThis.fetch}={}){
 if(!apiKey)return undefined;
 const embed=async texts=>{
  if(!Array.isArray(texts)||!texts.length||texts.length>64||texts.some(t=>typeof t!=='string'||!t.trim()||t.length>4000))throw Error('INVALID_EMBEDDING_INPUT');
  const response=await fetchImpl('https://api.openai.com/v1/embeddings',{method:'POST',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:EMBEDDING_MODEL,dimensions:EMBEDDING_DIMENSIONS,encoding_format:'float',input:texts})});
  if(!response.ok)throw Error('EMBEDDING_PROVIDER_UNAVAILABLE');
  const data=(await response.json()).data;if(!Array.isArray(data)||data.length!==texts.length)throw Error('INVALID_EMBEDDING');
  const vectors=new Array(texts.length),seen=new Set();
  for(const row of data){if(!Number.isInteger(row.index)||row.index<0||row.index>=texts.length||seen.has(row.index))throw Error('INVALID_EMBEDDING');seen.add(row.index);vectors[row.index]=normalizedVector(row.embedding);}
  return vectors;
 };
 return Object.assign(embed,{model:EMBEDDING_MODEL,dimensions:EMBEDDING_DIMENSIONS});
}
