import assert from 'node:assert/strict';
import test from 'node:test';
import {selectNoaa, selectForecasts, riskByDepartment, normalize, csv} from '../site/assets/selectors.mjs';

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
