// Local loopback HTTP entry. Real Deno and PostgreSQL; never a cloud connection.
import pg from './pg-loopback.mjs';
const corePort=Number(Deno.env.get('CORE_PORT')),inventoryPort=Number(Deno.env.get('INVENTORY_PORT'));
const nativeServe=Deno.serve;
Deno.serve=handler=>nativeServe({hostname:'127.0.0.1',port:corePort},handler);
await import('./index.ts');
console.log('LOCAL_CORE_READY');
