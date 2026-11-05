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
  assert.match(html,/¿Qué es ENFEN y qué significa una alerta\?/);
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
  assert.match(app,/state\.to>=limaDate\(\)\?chosen\.filter\(r=>r\.valid_date>=limaDate\(\)\):chosen/);
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


test('el aprendizaje empieza por la definición y termina en acciones respaldadas por INDECI',()=>{
  for(const id of ['que-es','un-minuto-title','preparacion','preparation-title','detalle-tecnico']) {
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  }
  assert.ok(html.indexOf('id="estado-enfen"')<html.indexOf('id="un-minuto"'));
  assert.ok(html.indexOf('id="un-minuto"')<html.indexOf('id="ultimo"'));
  assert.ok(html.indexOf('id="ultimo"')<html.indexOf('id="que-es"'));
  assert.ok(html.indexOf('id="que-es"')<html.indexOf('id="guia-inicio"'));
  assert.ok(html.indexOf('id="guia-inicio"')<html.indexOf('id="consulta"'));
  assert.ok(html.indexOf('id="consulta"')<html.indexOf('id="preparacion"'));
  assert.ok(html.indexOf('id="ultimo"')<html.indexOf('id="preparacion"'));
  assert.ok(html.indexOf('id="preparacion"')<html.indexOf('id="insights"'));
  assert.match(html,/Una alerta sobre El Niño no es lo mismo que una orden de evacuación/);
  assert.match(html,/indeci\/campa%C3%B1as\/143492-preparados-ante-el-fenomeno-el-nino/);
  assert.match(html,/<details id="detalle-tecnico" class="citizen-depth">/);
  assert.match(style,/@media\(max-width:760px\)/);
  assert.match(style,/citizen-primer-steps/);
  assert.match(style,/citizen-actions/);
});

test('un enlace a la explicación profunda la vuelve visible sin perder la ruta',()=>{
  const appearance=read('site/assets/appearance.mjs');
  assert.match(appearance,/function revelarAncla/);
  assert.match(appearance,/ancestor\.tagName==='DETAILS'/);
  assert.match(appearance,/addEventListener\('hashchange'/);
  assert.match(html,/href="#insights"/);
});

test('una fecha de actualización de la página no se anuncia como fecha de cada dato',()=>{
  assert.match(app,/Página revisada:/);
  assert.match(app,/Cada noticia, medición y pronóstico tiene su propia fecha/);
  assert.match(html,/¿Por qué aparecen números diferentes sobre la temperatura del mar\?/);
});
