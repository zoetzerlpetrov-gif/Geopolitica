import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeGTFS,searchTransit,makeTransitPlan,validateTransit,verifyTransit,itineraryGeoJSON} from '../../js/fase5-gtfs-modelo.js';
import {FREQUENCY_DEMO_SOURCE,FREQUENCY_DEMO_TABLES,demoGTFSZip,DEMO_TABLES} from '../../js/fase5-gtfs-ejemplo.js';
import {readGTFSZip} from '../../js/fase5-gtfs-zip.js';
import {validar,vacio} from '../../js/fase4-modelo.js';
const source={...FREQUENCY_DEMO_SOURCE,loadedAt:Date.now(),fileHash:'c'.repeat(64)};
const base=()=>structuredClone(FREQUENCY_DEMO_TABLES),feed=files=>normalizeGTFS(files,source);
const q={origin:'A1',destination:'B1',date:'20261031',departure:8*3600+300,windowHours:3,maxTransfers:0,minTransferMinutes:5,routeType:null,connectionMode:'same-stop'};
const frows=(rows)=>'trip_id,start_time,end_time,headway_secs,exact_times\n'+rows.join('\n')+'\n';
test('5E: ZIP sintético real, cuatro salidas exactas y final exclusivo; la plantilla no es una salida',async()=>{
 const z=await readGTFSZip(demoGTFSZip(FREQUENCY_DEMO_TABLES));assert.deepEqual(z.files,FREQUENCY_DEMO_TABLES);const f=feed(z.files),r=searchTransit(f,q);
 assert.equal(f.summary.totalTrips,1);assert.equal(f.summary.frequencyInstances,4);assert.equal(f.summary.usableTrips,4);assert.equal(r.total,3);
 assert.deepEqual(r.itineraries.map(it=>it.legs[0].stops[0].departure),[29700,30600,31500]);
 assert.deepEqual(r.itineraries.map(it=>it.legs[0].stops.at(-1).arrival),[31200,32100,33000]);
 assert.equal(searchTransit(f,{...q,departure:31560}).total,0);assert.equal(searchTransit(f,{...q,departure:0,windowHours:1}).total,0);
});
test('5E: embarque intermedio conserva salida de cabecera anterior a la consulta y dwell publicado',()=>{
 const files=base();files['stop_times.txt']=files['stop_times.txt'].replace('00:10:00,00:10:00','00:10:00,00:12:00');const r=searchTransit(feed(files),{...q,origin:'P1'});
 assert.equal(r.total,4);const l=r.itineraries[0].legs[0];assert.equal(l.stops[0].departure,29520);assert.equal(l.frequency.instanceStart,28800);assert.deepEqual(l.frequency.stopOffsets[0],{arrival:600,departure:720});
});
test('5E: exact_times=0 o vacío no fabrica salidas; referencias y enteros inválidos se rechazan',()=>{
 for(const exact of ['0','']){const files=base();files['frequencies.txt']=frows([`T_BUS,08:00:00,09:00:00,900,${exact}`]);const f=feed(files);assert.equal(searchTransit(f,q).total,0);assert.equal(f.summary.excluded.frequency,1);}
 for(const row of ['NO,08:00:00,09:00:00,900,1','T_BUS,08:00:00,09:00:00,0,1','T_BUS,08:00:00,09:00:00,1.5,1','T_BUS,09:00:00,08:00:00,900,1','T_BUS,08:00:00,09:00:00,900,2','T_BUS,08:00:00,09:00:00,,1']){const files=base();files['frequencies.txt']=frows([row]);assert.throws(()=>feed(files));}
});
test('5E: intervalos contiguos admitidos; solapados, duplicados y exactitud mezclada fallan sin truncar',()=>{
 const files=base();files['frequencies.txt']=frows(['T_BUS,08:00:00,08:30:00,900,1','T_BUS,08:30:00,09:00:00,600,1']);assert.equal(searchTransit(feed(files),{...q,departure:28800}).total,5);
 for(const row of ['T_BUS,08:00:00,09:00:00,900,1','T_BUS,08:45:00,09:30:00,900,1','T_BUS,09:00:00,10:00:00,900,0']){const b=base();b['frequencies.txt']=frows(['T_BUS,08:00:00,09:00:00,900,1',row]);assert.throws(()=>feed(b),/solapados|mezclar/);}
});
test('5E: horas GTFS posteriores a 24, calendario y extremos fuera de alcance',()=>{
 const files=base();files['frequencies.txt']=frows(['T_BUS,25:00:00,26:00:00,900,1']);const f=feed(files);const r=searchTransit(f,{...q,departure:90000});assert.equal(r.total,4);assert.equal(r.itineraries[0].legs[0].stops.at(-1).arrival,91500);assert.equal(searchTransit(f,{...q,date:'21100101',departure:90000}).total,0);
 const bad=base();bad['frequencies.txt']=frows(['T_BUS,99:45:00,99:59:59,900,1']);assert.throws(()=>feed(bad),/horas admitidas/);
});
test('5E: plantillas incompletas no se expanden; frecuencias enormes fallan antes de activar el feed',()=>{
 const files=base();files['stop_times.txt']=files['stop_times.txt'].replace('00:10:00,00:10:00',',');const f=feed(files);assert.equal(f.summary.frequencyInstances,0);assert.equal(f.summary.excluded.incomplete,1);assert.equal(searchTransit(f,q).total,0);
 const huge=base();huge['frequencies.txt']=frows(['T_BUS,00:00:00,23:00:00,1,1']);assert.throws(()=>feed(huge),/expansión/);
 const dwell=base();dwell['stop_times.txt']=dwell['stop_times.txt'].replace('00:00:00,00:00:00','00:00:00,00:00:01');assert.throws(()=>feed(dwell),/primera parada/);
});
test('5E: transbordos conservan selectores del trip_id plantilla y prohíben los aplicables',()=>{
 const files=structuredClone(DEMO_TABLES);files['frequencies.txt']=frows(['T_BUS,08:00:00,09:00:00,900,1']);let f=feed(files),r=searchTransit(f,{...q,departure:28800,maxTransfers:1,connectionMode:'documented'});assert.equal(r.total,1);assert.equal(r.itineraries[0].connection.rule.fromTripId,'T_BUS');assert.equal(r.itineraries[0].legs[0].frequency.instanceStart,28800);
 files['transfers.txt']=files['transfers.txt'].replace('2,480','3,');r=searchTransit(feed(files),{...q,departure:28800,maxTransfers:1,connectionMode:'documented'});assert.equal(r.total,0);
});
test('5E: procedencia congelada, GeoJSON, integridad y expediente compartido',async()=>{
 const f=feed(base()),it=searchTransit(f,q).itineraries[0],p=await makeTransitPlan(f.summary,q,it,'Práctica');await verifyTransit({version:1,plans:[p]});validar({fase4:vacio(),transit:{version:1,plans:[p]}});
 assert.match(p.title,/SIMULACIÓN/);assert.equal(itineraryGeoJSON(p).features[0].properties.frequency.instanceStart,29700);
 for(const mutate of [x=>x.itinerary.legs[0].frequency.instanceStart++,x=>x.itinerary.legs[0].frequency.exactTimes=0,x=>x.itinerary.legs[0].frequency.stopOffsets[0].arrival++,x=>x.itinerary.legs[0].frequency.stopOffsets.pop()]){const x=structuredClone(p);mutate(x);assert.throws(()=>validateTransit({version:1,plans:[x]}),/frecuencia|intervalo/);}
 const edited=structuredClone(p);edited.title+=' modificado';await assert.rejects(()=>verifyTransit({version:1,plans:[edited]}),/alterado/);
 const original=feed(DEMO_TABLES),old=await makeTransitPlan(original.summary,{...q,departure:28800,maxTransfers:1,connectionMode:'documented'},searchTransit(original,{...q,departure:28800,maxTransfers:1,connectionMode:'documented'}).itineraries[0],'Anterior');assert.equal('frequency' in old.itinerary.legs[0],false);await verifyTransit({version:1,plans:[old,p]});
});
