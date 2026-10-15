import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
await fs.mkdir(path.join(root,'assets'),{recursive:true});
await sharp(path.join(root,'www/bd-512.png')).resize(1024,1024,{fit:'contain',background:'#071521'}).png().toFile(path.join(root,'assets/icon.png'));
console.log('MainTrack original icon prepared');
