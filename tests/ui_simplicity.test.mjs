import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../site/index.html', import.meta.url),'utf8');
const css=readFileSync(new URL('../site/assets/simple.css',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/monitor.yml',import.meta.url),'utf8');
const pipeline=readFileSync(new URL('../pipeline/update.py',import.meta.url),'utf8');

test('la portada muestra tres preguntas comprensibles y las fuentes',()=>{
  for(const phrase of ['¿Qué sabemos hoy?','¿Qué se espera en mi distrito?','¿Dónde existe mayor riesgo?','El estado oficial de El Niño lo comunica ENFEN'])assert.ok(html.includes(phrase),phrase);
  for(const id of ['ultimo','consulta','zonas','fuentes','insights'])assert.match(html,new RegExp('id="'+id+'"'));
});
test('los filtros complejos conservan sus identificadores y se muestran bajo demanda',()=>{
  assert.match(html,/<details class="simple-advanced-filters">[\s\S]*?<form id="filters"[\s\S]*?<\/form><\/details>/);
  assert.match(html,/<details class="simple-map-options">[\s\S]*?<div class="map-controls">[\s\S]*?<\/details>/);
  assert.equal((html.match(/id="filters"/g)||[]).length,1);
  assert.equal((html.match(/<details\b/g)||[]).length,(html.match(/<\/details>/g)||[]).length);
  assert.equal((html.match(/<section\b/g)||[]).length,(html.match(/<\/section>/g)||[]).length);
  assert.ok(html.includes('assets/simple.css'));
  assert.ok(html.includes('assets/visual.css'));
  assert.ok(html.includes('class="radar-stage visual-ocean"'));
  for (const file of ['visual-ocean.svg','visual-enfen.svg','visual-district.svg','visual-risk.svg']) {
    assert.ok(readFileSync(new URL('../site/assets/'+file,import.meta.url),'utf8').includes('<svg'));
  }

  assert.ok(css.includes('@media(max-width:800px)'));
});
test('se programan exactamente dos ventanas de actualización en hora de Lima',()=>{
  const crons=[...workflow.matchAll(/^\s*- cron:\s*'([^']+)'/gm)].map(m=>m[1]);
  assert.deepEqual(crons,['5 13 * * *','5 1 * * *']);
  assert.ok(pipeline.includes('08:05 y 20:05 de Lima'));
});
