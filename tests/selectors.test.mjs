import assert from 'node:assert/strict';
import test from 'node:test';
import {selectNoaa, selectForecasts, riskByDepartment, territorialCoverage, forecastSummary, districtOptions, pointMatchesDistrict, normalize, csv} from '../site/assets/selectors.mjs';
import {forecastDates,frameRows,weatherByDistrict,rainColor} from '../site/assets/weather.mjs';

test('el filtro distrital conserva celdas reales y no hereda el pronóstico departamental',()=>{
  const env=JSON.parse(gunzipSync(readFileSync(new URL('../site/data/district_forecast.json.gz',import.meta.url))));
  const rows=selectForecasts([env],{from:'2026-01-01',to:'2099-12-31',department:'15',district:'150132'});
  assert.equal(rows.length,3);assert.ok(rows.every(r=>r.ubigeo==='150132'));
  const dates=forecastDates(rows);assert.equal(dates.length,3);assert.equal(frameRows(rows,dates[0]).length,1);
  const grouped=weatherByDistrict(frameRows(rows,dates[0]),'rain');assert.equal(grouped[0].value,rows.find(r=>r.valid_date===dates[0]).precipitation_mm);
  const sen=readOfficial('senamhi_forecast.json.gz');
  assert.equal(selectForecasts([{meta:env.meta,data:sen}],{from:'2026-01-01',to:'2099-12-31',district:'150132'}).length,0);
});
test('el color de lluvia diferencia cero, dato ausente y cantidades positivas',()=>{
  assert.notEqual(rainColor(null),rainColor(0));assert.notEqual(rainColor(0),rainColor(.01));assert.notEqual(rainColor(2),rainColor(50));
});

test('el día no interpola índices semanales',()=>{
  assert.equal(selectNoaa([{date:'2026-10-14'}],{from:'2026-10-15',to:'2026-10-15'}).length,0);
});
test('el mes usa la intersección con el periodo oficial',()=>{
  assert.equal(selectNoaa([{date:'2026-09-01',period_end:'2026-09-30'}],{from:'2026-09-22',to:'2026-10-25'},true).length,1);
});
test('un pronóstico histórico no usa consultas posteriores a su validez',()=>{
  const row={locality_id:'0012',valid_date:'2026-10-22',department_code:'01',locality:'CHACHAPOYAS',tmax_c:22};
  const versions=[{meta:{fetched_at:'2026-10-22T14:00:00Z'},data:[row]},{meta:{fetched_at:'2026-10-23T14:00:00Z'},data:[{...row,tmax_c:30}]}];
  const result=selectForecasts(versions,{from:'2026-10-22',to:'2026-10-22',department:'01'});
  assert.equal(result.length,1);assert.equal(result[0].tmax_c,22);
});
test('las revisiones se deduplican por localidad y validez',()=>{
  const row={locality_id:'0012',valid_date:'2026-10-24',department_code:'01',locality:'CHACHAPOYAS',tmax_c:22};
  const versions=[{meta:{fetched_at:'2026-10-22T14:00:00Z'},data:[row]},{meta:{fetched_at:'2026-10-22T20:00:00Z'},data:[{...row,tmax_c:23}]}];
  const result=selectForecasts(versions,{from:'2026-10-24',to:'2026-10-24'});
  assert.equal(result.length,1);assert.equal(result[0].tmax_c,23);
});
test('el denominador del riesgo excluye distritos sin clasificación',()=>{
  const rows=['Alto',null,'Bajo','Muy alto'].map(risk_level=>({department_code:'20',department:'PIURA',hazard:'inundacion',risk_level}));
  const result=riskByDepartment(rows,'inundacion')[0];
  assert.equal(result.total,3);assert.equal(result.high,2);assert.equal(result.unknown,1);assert.equal(result.value,200/3);
});
test('el ámbito territorial no mezcla peligros',()=>{
  const rows=[{department_code:'20',department:'PIURA',hazard:'inundacion',risk_level:'Alto'},{department_code:'20',department:'PIURA',hazard:'movimientos_masa',risk_level:'Bajo'}];
  assert.equal(riskByDepartment(rows,'inundacion','20')[0].value,100);
});
test('el CSV conserva nulos y protege fórmulas de texto',()=>{
  assert.match(csv([{name:'=A1',value:null,anomaly:-0.2}],['name','value','anomaly']),/"'=A1","","-0.2"/);
  assert.equal(normalize('Áncash'),'ANCASH');
});

import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {hexbinPoints} from '../site/assets/selectors.mjs';
const inventory=JSON.parse(gunzipSync(readFileSync(new URL('../site/data/map_points.json.gz',import.meta.url)))).data;

const readOfficial=id=>{const file=new URL(`../site/data/${id}`,import.meta.url),bytes=readFileSync(file);return JSON.parse(id.endsWith('.gz')?gunzipSync(bytes):bytes).data;};
test('la cobertura conserva los 24 departamentos y Callao aunque falte un pronóstico',()=>{
  const boundaries=readOfficial('boundaries.json').features,risks=readOfficial('cenepred_risk.json.gz'),forecast=readOfficial('senamhi_forecast.json.gz');
  const rows=territorialCoverage(boundaries,risks,forecast,'inundacion');
  assert.equal(rows.length,25);assert.equal(new Set(rows.map(r=>r.code)).size,25);
  assert.equal(rows.filter(r=>r.risk?.total).length,25);
  for(const row of rows){
    const published=risks.filter(r=>r.department_code===row.code&&r.hazard==='inundacion'&&r.risk_level);
    assert.equal(row.risk.total,published.length);
    assert.equal(row.risk.high,published.filter(r=>['Alto','Muy alto'].includes(r.risk_level)).length);
    assert.equal(row.localities,new Set(forecast.filter(r=>r.department_code===row.code).map(r=>r.locality_id)).size);
  }
  const withoutForecast=territorialCoverage(boundaries,risks,[],'inundacion');
  assert.equal(withoutForecast.length,25);assert.ok(withoutForecast.every(r=>r.localities===0));
});
test('un cambio de peligro conserva territorios y no sustituye la ausencia de clasificación por cero',()=>{
  const boundaries=readOfficial('boundaries.json').features,risks=readOfficial('cenepred_risk.json.gz');
  const rows=territorialCoverage(boundaries,risks,[],'movimientos_masa');
  assert.equal(rows.length,25);
  for(const row of rows)assert.equal(row.risk?.high??0,risks.filter(r=>r.department_code===row.code&&r.hazard==='movimientos_masa'&&['Alto','Muy alto'].includes(r.risk_level)).length);
  assert.ok(territorialCoverage(boundaries,[],[],'inundacion').every(r=>r.risk===null));
});
test('los insights de pronóstico conservan localidades, fechas y conteos de los registros oficiales',()=>{
  const rows=readOfficial('senamhi_forecast.json.gz'),summary=forecastSummary(rows);
  assert.equal(summary.records,rows.length);
  assert.equal(summary.max.tmax_c,Math.max(...rows.map(r=>r.tmax_c)));
  assert.equal(summary.min.tmin_c,Math.min(...rows.map(r=>r.tmin_c)));
  assert.ok(rows.includes(summary.max)&&rows.includes(summary.min));
  assert.equal(summary.rainRecords,rows.filter(r=>r.rain_mentioned===true).length);
  assert.equal(summary.rainLocalities,new Set(rows.filter(r=>r.rain_mentioned===true).map(r=>r.locality_id)).size);
  assert.deepEqual(summary.dates,[...new Set(rows.map(r=>r.valid_date))].sort());
});
test('un periodo sin pronósticos conserva extremos nulos y ninguna fecha ni localidad ficticia',()=>{
  assert.deepEqual(forecastSummary([]),{records:0,localities:0,rainRecords:0,rainLocalities:0,dates:[],max:null,min:null});
});
test('el selector distrital conserva UBIGEO únicos por departamento y no duplica peligros',()=>{
  const risks=readOfficial('cenepred_risk.json.gz'),features=readOfficial('district_boundaries.json.gz').features;
  const chosen=Array.from({length:25},(_,i)=>String(i+1).padStart(2,'0')).flatMap(code=>{
    const rows=districtOptions(risks,code);assert.ok(rows.every(r=>r.department_code===code));return rows.map(r=>r.ubigeo);
  });
  assert.equal(chosen.length,new Set(chosen).size);
  assert.deepEqual([...chosen].sort(),features.map(f=>f.properties.ubigeo).sort());
  assert.deepEqual(districtOptions(risks,'all'),[]);
});
test('los puntos distritales requieren coincidencia de departamento, provincia y distrito',()=>{
  const points=readOfficial('cenepred_points.json.gz'),risks=readOfficial('cenepred_risk.json.gz'),point=points.find(p=>p.department&&p.province&&p.district);
  const district=risks.find(r=>normalize(r.department)===normalize(point.department)&&normalize(r.province)===normalize(point.province)&&normalize(r.district)===normalize(point.district));
  assert.ok(district);assert.equal(pointMatchesDistrict(point,district),true);
  assert.equal(pointMatchesDistrict({...point,province:null},district),false);
  assert.equal(pointMatchesDistrict({...point,department:'OTRO DEPARTAMENTO'},district),false);
  assert.equal(pointMatchesDistrict(point,null),false);
});

test('la malla conserva cada punto oficial una sola vez, sin depender del orden',()=>{
  const points=inventory.filter(p=>p.hazard==='inundacion');
  const cells=hexbinPoints(points),reverse=hexbinPoints([...points].reverse());
  assert.equal(cells.reduce((n,c)=>n+c.count,0),points.length);
  assert.equal(new Set(cells.flatMap(c=>c.points.map(p=>p.id))).size,points.length);
  assert.deepEqual(cells.map(c=>[c.id,c.count]),reverse.map(c=>[c.id,c.count]));
});
test('cada punto geográfico cae dentro de su hexágono, incluso en límites de celda',()=>{
  const project=([lat,lon])=>[6378137*lon*Math.PI/180,6378137*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];
  for(const cell of hexbinPoints(inventory)) {
    const ring=cell.polygon.map(project);
    for(const p of cell.points){
      const [x,y]=project([p.lat,p.lon]);
      const cross=ring.map(([ax,ay],i)=>{const [bx,by]=ring[(i+1)%6];return (bx-ax)*(y-ay)-(by-ay)*(x-ax);});
      assert.ok(cross.every(v=>v>=-0.01)||cross.every(v=>v<=0.01),`Punto ${p.id} fuera de ${cell.id}`);
    }
  }
});
test('los conteos territoriales se pueden comparar con una escala y malla comunes',()=>{
  const points=inventory.filter(p=>p.hazard==='inundacion');
  const all=new Map(hexbinPoints(points).map(c=>[c.id,c.count]));
  const piura=hexbinPoints(points.filter(p=>normalize(p.department)==='PIURA'));
  assert.ok(piura.length>0);
  for(const cell of piura) assert.ok(cell.count<=all.get(cell.id));
  assert.deepEqual(hexbinPoints([]),[]);
});
