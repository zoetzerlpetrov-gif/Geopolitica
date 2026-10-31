// Horarios comprimidos: solo exact_times=1 produce salidas puntuales.
const fail=message=>{throw Error(message);};
const integer=(v,min,max)=>/^\d+$/.test(String(v))&&Number(v)>=min&&Number(v)<=max?Number(v):fail('Entero de frequencies.txt inválido.');
export function normalizeFrequencies(rows,trips,time){
 if(rows.length>20000)fail('Máximo 20 000 intervalos de frequencies.txt.');
 const groups=new Map();
 for(const r of rows){
  if(!trips.has(r.trip_id))fail('Frecuencia con viaje inexistente.');
  const rule={startTime:time(r.start_time),endTime:time(r.end_time),headwaySeconds:integer(r.headway_secs,1,86400),exactTimes:r.exact_times===''||r.exact_times==null?0:integer(r.exact_times,0,1)};
  if(rule.startTime>=rule.endTime)fail('Intervalo de frecuencia vacío o invertido.');
  if(!groups.has(r.trip_id))groups.set(r.trip_id,[]);groups.get(r.trip_id).push(rule);
 }
 for(const rules of groups.values()){
  rules.sort((a,b)=>a.startTime-b.startTime);
  if(new Set(rules.map(r=>r.exactTimes)).size>1)fail('Un viaje no puede mezclar exact_times=0 y exact_times=1.');
  for(let i=1;i<rules.length;i++)if(rules[i].startTime<rules[i-1].endTime)fail('Intervalos de frecuencia duplicados o solapados.');
 }
 return groups;
}
export function expandFrequencies(templates,groups,excluded){
 const trips=new Map();let instances=0,stopCount=0;
 const add=(key,t)=>{if(trips.size>=20000||stopCount+t.stops.length>400000)fail('La expansión de frecuencias supera 20 000 viajes o 400 000 horarios. No se activó el feed; reduce su tamaño.');trips.set(key,t);stopCount+=t.stops.length;};
 for(const t of templates.values()){
  const rules=groups.get(t.id);
  if(!rules){add(t.id,t);continue;}
  if(rules[0].exactTimes===0){excluded.frequency++;add(t.id,{...t,excluded:t.excluded||'frecuencia sin salida fija'});continue;}
  if(t.excluded){add(t.id,t);continue;}
  if(t.stops[0].arrival!==t.stops[0].departure)fail('Plantilla exact_times=1 requiere llegada y salida iguales en la primera parada.');
  const templateDeparture=t.stops[0].departure;
  for(const rule of rules)for(let start=rule.startTime;start<rule.endTime;start+=rule.headwaySeconds){
   const shift=start-templateDeparture,stops=t.stops.map(s=>({...s,arrival:s.arrival+shift,departure:s.departure+shift}));
   if(stops.some(s=>s.arrival<0||s.departure>359999))fail('Una salida de frecuencia excede las horas admitidas por el planificador.');
   const frequency={...rule,instanceStart:start,templateDeparture};
   add(frequency,{...t,stops,frequency});instances++;
  }
 }
 return {templates:templates.size,instances,trips};
}
export function frequencyProof(t,i,j){return {...t.frequency,stopOffsets:t.stops.slice(i,j+1).map(s=>({arrival:s.arrival-t.frequency.instanceStart,departure:s.departure-t.frequency.instanceStart}))};}
export function validateFrequency(f,stops){
 if(!f||Object.keys(f).sort().join()!=='endTime,exactTimes,headwaySeconds,instanceStart,startTime,stopOffsets,templateDeparture')fail('Procedencia de frecuencia incompatible.');
 for(const k of ['startTime','endTime','instanceStart','templateDeparture'])if(!Number.isInteger(f[k])||f[k]<0||f[k]>359999)fail('Hora de frecuencia guardada inválida.');
 if(f.exactTimes!==1||!Number.isInteger(f.headwaySeconds)||f.headwaySeconds<1||f.headwaySeconds>86400||f.startTime>=f.endTime||f.instanceStart<f.startTime||f.instanceStart>=f.endTime||(f.instanceStart-f.startTime)%f.headwaySeconds!==0)fail('Salida fuera del intervalo de frecuencia exacta.');
 if(!Array.isArray(f.stopOffsets)||f.stopOffsets.length!==stops.length)fail('Desplazamientos de frecuencia incompatibles.');
 for(const [i,o]of f.stopOffsets.entries()){
  if(!o||Object.keys(o).sort().join()!=='arrival,departure'||!Number.isInteger(o.arrival)||!Number.isInteger(o.departure)||o.arrival<0||o.departure<o.arrival||o.departure>359999||stops[i].arrival!==f.instanceStart+o.arrival||stops[i].departure!==f.instanceStart+o.departure)fail('Horario inconsistente con su salida de frecuencia.');
 }
}
