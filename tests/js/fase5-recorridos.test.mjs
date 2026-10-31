import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeGTFS,searchTransit,makeTransitPlan,verifyTransit,validateTransit,itineraryGeoJSON} from '../../js/fase5-gtfs-modelo.js';
import {PATHWAY_DEMO_TABLES,PATHWAY_DEMO_SOURCE,DEMO_TABLES,demoGTFSZip} from '../../js/fase5-gtfs-ejemplo.js';
import {readGTFSZip} from '../../js/fase5-gtfs-zip.js';
import {pathwayConnections} from '../../js/fase5-gtfs-recorridos.js';
import {validar,vacio} from '../../js/fase4-modelo.js';
const source={...PATHWAY_DEMO_SOURCE,loadedAt:Date.now(),fileHash:'d'.repeat(64)};
const q={origin:'A1',destination:'B1',date:'20261031',departure:28800,windowHours:3,maxTransfers:1,minTransferMinutes:5,routeType:null,connectionMode:'pathways'};
const base=()=>structuredClone(PATHWAY_DEMO_TABLES),feed=f=>normalizeGTFS(f,source),run=(files,query=q)=>searchTransit(feed(files),query);
const paths=rows=>'pathway_id,from_stop_id,to_stop_id,pathway_mode,is_bidirectional,traversal_time\n'+rows.join('\n')+'\n';
const transfers=rows=>'from_stop_id,to_stop_id,transfer_type,min_transfer_time\n'+rows.join('\n')+'\n';
test('5F: ZIP real, recorrido completo de menor tiempo, nodos sin coordenadas y mínimo aplicado',async()=>{
 const decoded=await readGTFSZip(demoGTFSZip(PATHWAY_DEMO_TABLES));assert.deepEqual(decoded.files,PATHWAY_DEMO_TABLES);assert.equal(decoded.ignored.length,0);
 const r=run(decoded.files);assert.equal(r.total,1);const c=r.itineraries[0].connection;assert.equal(c.kind,'pathway-platforms');assert.equal(c.minimumSeconds,420);assert.equal(c.rule,null);assert.equal(c.pathway.totalSeconds,420);assert.deepEqual(c.pathway.edges.map(e=>e.id),['STAIR','HALL']);assert.deepEqual(c.pathway.nodes.map(n=>n.id),['P1','N1','Q1']);assert.equal(c.pathway.nodes[1].coordinates,null);
 assert.equal(run(base(),{...q,minTransferMinutes:11}).total,0);assert.equal(run(base(),{...q,connectionMode:'same-stop'}).total,0);assert.equal(run(base(),{...q,connectionMode:'documented'}).total,0);
});
test('5F: no infiere pasos por cercanía/estación ni tiempos cuando faltan; modo estricto no usa solo transfers',()=>{
 const f=base();delete f['pathways.txt'];assert.equal(run(f).total,0);f['transfers.txt']=transfers(['P1,Q1,2,60']);assert.equal(run(f).total,0);assert.equal(run(f,{...q,connectionMode:'documented'}).total,1);
 const gap=base();gap['pathways.txt']=paths(['STAIR,P1,N1,2,0,90','HALL,N1,Q1,1,0,']);const normalized=feed(gap);assert.equal(normalized.pathways.missingTime,1);assert.equal(searchTransit(normalized,q).total,0);assert.match(normalized.summary.warnings.join(' '),/1 sin traversal_time excluidos/);
});
test('5F: dirección, inversión permitida y puertas de salida',()=>{
 const f=base();f['pathways.txt']=paths(['A,N1,P1,1,0,90','B,N1,Q1,1,0,330']);assert.equal(run(f).total,0);f['pathways.txt']=paths(['A,N1,P1,1,1,90','B,N1,Q1,7,0,330']);const r=run(f);assert.equal(r.total,1);assert.equal(r.itineraries[0].connection.pathway.edges[0].reversed,true);
 f['pathways.txt']=paths(['A,P1,Q1,7,1,420']);assert.throws(()=>feed(f),/puerta de salida/);
});
test('5F: prohibiciones y mínimos de transfers se respetan sobre el recorrido',()=>{
 const f=base();f['transfers.txt']=transfers(['P1,Q1,3,']);assert.equal(run(f).total,0);f['transfers.txt']=transfers(['P1,Q1,2,601']);assert.equal(run(f).total,0);f['transfers.txt']=transfers(['P1,Q1,2,480']);assert.equal(run(f).itineraries[0].connection.minimumSeconds,480);f['transfers.txt']=transfers(['P1,Q1,0,']);assert.equal(run(f).itineraries[0].connection.minimumSeconds,420);
});
test('5F: referencias, IDs duplicados, estaciones diferentes e intervalos inválidos se rechazan',()=>{
 for(const row of ['A,P1,MISSING,1,0,60','A,ST1,Q1,1,0,60','A,P1,P1,1,0,60','A,P1,Q1,0,0,60','A,P1,Q1,1,2,60','A,P1,Q1,1,0,0','A,P1,Q1,1,0,-1','A,P1,Q1,1,0,1.5']){const f=base();f['pathways.txt']=paths([row]);assert.throws(()=>feed(f));}
 const dup=base();dup['pathways.txt']=paths(['A,P1,Q1,1,0,60','A,Q1,P1,1,0,60']);assert.throws(()=>feed(dup),/duplicado/);
 const cross=base();cross['stops.txt']+='ST2,Otra estación,,,1,\n';cross['stops.txt']=cross['stops.txt'].replace('Q1,Plataforma ficticia B,19.0105,-99.0105,0,ST1','Q1,Plataforma ficticia B,19.0105,-99.0105,0,ST2');assert.throws(()=>feed(cross),/misma estación/);
});
test('5F: ciclos no duplican enlaces, solo se usan tiempos hasta dos horas; límite de trabajo explícito',()=>{
 const f=base();f['pathways.txt']=paths(['A,P1,N1,1,1,60','B,N1,Q1,1,1,60','C,P1,Q1,1,0,500']);const x=feed(f),map=pathwayConnections(x,'P1');assert.equal(map.get('Q1').totalSeconds,120);assert.deepEqual(map.get('Q1').nodes.map(n=>n.id),['P1','N1','Q1']);let calls=0;assert.throws(()=>pathwayConnections(x,'P1',()=>{if(++calls>2)throw Error('Límite QA');}),/Límite QA/);
 const slow=base();slow['pathways.txt']=paths(['A,P1,Q1,1,0,7201']);assert.equal(run(slow).total,0);
});
test('5F: límite de 100 enlaces aborta sin resultado parcial',()=>{
 const f=base(),rows=[];for(let i=0;i<101;i++)f['stops.txt']+=`N${i+2},Nodo ${i+2},,,3,ST1\n`;
 let from='P1';for(let i=0;i<101;i++){const to='N'+(i+2);rows.push(`E${i},${from},${to},1,0,1`);from=to;}rows.push(`LAST,${from},Q1,1,0,1`);f['pathways.txt']=paths(rows);assert.throws(()=>run(f),/100 enlaces/);
});
test('5F: copia congelada, integridad, continuidad, GeoJSON y compatibilidad con planes 5D',async()=>{
 const f=feed(base()),it=searchTransit(f,q).itineraries[0],p=await makeTransitPlan(f.summary,q,it,'Recorrido');await verifyTransit({version:1,plans:[p]});validar({fase4:vacio(),transit:{version:1,plans:[p]}});const geo=itineraryGeoJSON(p);assert.equal(geo.features[2].properties.kind,'station-pathway-connection');assert.equal(geo.features[2].properties.pathway.totalSeconds,420);assert.equal(geo.features[2].geometry.coordinates.length,2);assert.match(geo.features[2].properties.representation,/esquemático/);
 for(const mutate of [x=>x.itinerary.connection.pathway.edges[0].reversed=true,x=>x.itinerary.connection.pathway.totalSeconds++,x=>x.itinerary.connection.pathway.nodes[1].stationId='OTRA',x=>x.itinerary.connection.pathway.nodes[1].id='Q1',x=>x.itinerary.connection.minimumSeconds=300,x=>x.itinerary.connection.pathway.nodes.pop(),x=>x.query.connectionMode='documented']){const x=structuredClone(p);mutate(x);assert.throws(()=>validateTransit({version:1,plans:[x]}));}
 const edited=structuredClone(p);edited.title+='x';await assert.rejects(()=>verifyTransit({version:1,plans:[edited]}),/alterado/);
 const legacy=feed(DEMO_TABLES),oldQ={...q,connectionMode:'documented'},old=await makeTransitPlan(legacy.summary,oldQ,searchTransit(legacy,oldQ).itineraries[0],'Anterior');assert.equal('pathway' in old.itinerary.connection,false);await verifyTransit({version:1,plans:[old,p]});
});
