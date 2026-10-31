// Datos ficticios para practicar una conexión entre dos plataformas de una estación.
import {crc32} from './fase5-gtfs-zip.js';
export const DEMO_SOURCE={name:'SIMULACIÓN · Conexión entre plataformas',url:'',license:'Datos ficticios de práctica; no representan un servicio real.',collectedAt:null};
export const DEMO_TABLES={
 'agency.txt':'agency_id,agency_name,agency_timezone\nQA,Operador ficticio Fase 5D,America/Mexico_City\n',
 'stops.txt':'stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\nA1,Origen ficticio,19,-99,0,\nST1,Estación ficticia,19.01,-99.01,1,\nP1,Plataforma ficticia A,19.01,-99.01,0,ST1\nQ1,Plataforma ficticia B,19.0105,-99.0105,0,ST1\nB1,Destino ficticio,19.02,-99.02,0,\n',
 'routes.txt':'route_id,agency_id,route_short_name,route_type\nBUS,QA,Bus de práctica,3\nRAIL,QA,Tren de práctica,2\n',
 'trips.txt':'route_id,service_id,trip_id\nBUS,S,T_BUS\nRAIL,S,T_TRAIN\n',
 'calendar.txt':'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nS,1,1,1,1,1,1,1,20200101,21001231\n',
 'stop_times.txt':'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT_BUS,08:00:00,08:00:00,A1,1\nT_BUS,08:20:00,08:20:00,P1,2\nT_TRAIN,08:30:00,08:30:00,Q1,1\nT_TRAIN,08:50:00,08:50:00,B1,2\n',
 'transfers.txt':'from_stop_id,to_stop_id,from_trip_id,to_trip_id,transfer_type,min_transfer_time\nST1,ST1,T_BUS,T_TRAIN,2,480\n'
};
export function demoGTFSZip(tables=DEMO_TABLES){const enc=new TextEncoder(),local=[],central=[];let offset=0;for(const [name,text]of Object.entries(tables)){const n=enc.encode(name),bytes=enc.encode(text),h=new Uint8Array(30),c=new Uint8Array(46),a=new DataView(h.buffer),b=new DataView(c.buffer),crc=crc32(bytes);a.setUint32(0,0x04034b50,true);a.setUint16(4,20,true);a.setUint32(14,crc,true);a.setUint32(18,bytes.length,true);a.setUint32(22,bytes.length,true);a.setUint16(26,n.length,true);b.setUint32(0,0x02014b50,true);b.setUint16(4,20,true);b.setUint16(6,20,true);b.setUint32(16,crc,true);b.setUint32(20,bytes.length,true);b.setUint32(24,bytes.length,true);b.setUint16(28,n.length,true);b.setUint32(42,offset,true);local.push(h,n,bytes);central.push(c,n);offset+=h.length+n.length+bytes.length;}const size=central.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),d=new DataView(end.buffer);d.setUint32(0,0x06054b50,true);d.setUint16(8,Object.keys(tables).length,true);d.setUint16(10,Object.keys(tables).length,true);d.setUint32(12,size,true);d.setUint32(16,offset,true);const all=[...local,...central,end],out=new Uint8Array(all.reduce((n,b)=>n+b.length,0));let p=0;for(const b of all){out.set(b,p);p+=b.length;}return out.buffer;}

export const FREQUENCY_DEMO_SOURCE={...DEMO_SOURCE,name:'SIMULACIÓN · Salidas exactas por intervalo'};
export const FREQUENCY_DEMO_TABLES={
 ...DEMO_TABLES,
 'trips.txt':'route_id,service_id,trip_id\nBUS,S,T_BUS\n',
 'stop_times.txt':'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT_BUS,00:00:00,00:00:00,A1,1\nT_BUS,00:10:00,00:10:00,P1,2\nT_BUS,00:25:00,00:25:00,B1,3\n',
 'transfers.txt':'from_stop_id,to_stop_id,transfer_type,min_transfer_time\n',
 'frequencies.txt':'trip_id,start_time,end_time,headway_secs,exact_times\nT_BUS,08:00:00,09:00:00,900,1\n'
};
