import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('site/index.html');
const app=read('site/assets/app.mjs');
const latest=read('site/assets/latest.mjs');
const style=read('site/assets/visual.css');

test('ENFEN tiene una explicación dedicada para personas sin formación técnica',()=>{
  for(const id of ['estado-enfen','enfen-publicado','enfen-resumen','enfen-control','enfen-documento']){
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  }
  assert.match(html,/href="#estado-enfen"/);
  assert.match(html,/¿Qué significa una alerta\?/);
  assert.match(html,/No significa/);
  assert.match(style,/citizen-enfen-body/);
});

test('la referencia contrastada no se presenta como descarga automática',()=>{
  assert.match(app,/Comunicado Oficial ENFEN N\.º 19-2026/);
  assert.match(app,/published_date:'2026-10-30'/);
  assert.match(app,/expires_at:'2026-11-12'/);
  assert.match(app,/editorialFallback:true/);
  assert.match(app,/descarga automática/);
  assert.match(app,/renderOfficial\(\)/);
});

test('los pronósticos de hoy no reutilizan fechas ya pasadas',()=>{
  assert.match(app,/pastSelection=state\.to<limaDate\(\)/);
  assert.match(app,/state\.forecastRows\.filter\(r=>r\.valid_date>=limaDate\(\)\)/);
  assert.match(app,/PRONÓSTICO ARCHIVADO/);
  assert.match(app,/relevantForecasts\]\.filter/);
});

test('la lluvia se explica como cobertura de puntos, no como probabilidad',()=>{
  assert.match(latest,/puntos de \$\{fmt\(rainy\.size\)\} distritos/);
  assert.match(latest,/No es un porcentaje de probabilidad/);
  assert.doesNotMatch(latest,/Podría llover en el \$\{fmt\(100\*rainy\.size/);
});

test('los escenarios de riesgo no se declaran vencidos por una consulta fallida',()=>{
  assert.match(app,/risk_scenario','risk_inventory/);
  assert.match(app,/REVISIÓN PENDIENTE/);
  assert.match(app,/DATO NO VIGENTE/);
});
