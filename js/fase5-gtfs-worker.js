import {readGTFSZip} from './fase5-gtfs-zip.js';
import {normalizeGTFS,searchTransit} from './fase5-gtfs-modelo.js?v=4';
let feed=null;
self.onmessage=async({data})=>{const {id,kind}=data;try{if(kind==='load'){feed=null;const buffer=data.buffer,bytes=new Uint8Array(buffer);
 // Hash del archivo binario, no del nombre ni de la fecha de descarga.
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
 const decoded=await readGTFSZip(bytes);feed=normalizeGTFS(decoded.files,{...data.source,fileHash:hash,loadedAt:Date.now()});if(decoded.ignored.length)feed.summary.warnings.unshift(`Tablas/entradas no utilizadas: ${decoded.ignored.length}. No se calculan tarifas ni trazados reales con ellas.`);self.postMessage({id,ok:true,value:feed.summary});}else if(kind==='search'){if(!feed)throw Error('Incorpora y confirma una fuente GTFS antes de buscar.');self.postMessage({id,ok:true,value:searchTransit(feed,data.query)});}else throw Error('Acción de transporte desconocida.');}catch(e){if(kind==='load')feed=null;self.postMessage({id,ok:false,error:e.message||'No se pudo procesar GTFS.'});}};
