import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('site/index.html');
const css=read('site/assets/visual.css');
const interaction=read('site/assets/guide3d.mjs');
const app=read('site/assets/app.mjs');

test('las tarjetas originales se mantienen si no carga JavaScript',()=>{
  assert.equal((html.match(/class="simple-guide-card /g)||[]).length,3);
  assert.match(html,/assets\/guide3d.mjs\?v=1/);
  assert.match(html,/assets\/visual.css\?v=4/);
  assert.match(interaction,/querySelectorAll\(':scope > a.simple-guide-card'\)/);
  assert.match(interaction,/original\.innerHTML/);
});

test('las tres tarjetas se voltean al pasar el cursor o tocarlas',()=>{
  for(const key of ['enfen','pronostico','riesgo']) {
    assert.match(interaction,new RegExp("key: '"+key+"'"));
  }
  assert.match(interaction,/pointerenter/);
  assert.match(interaction,/pointerleave/);
  assert.match(interaction,/guide-flip-trigger/);
  assert.match(interaction,/guide-back-return/);
  assert.match(interaction,/front\.inert = showBack/);
  assert.match(interaction,/back\.inert = !showBack/);
  assert.match(interaction,/aria-expanded/);
  assert.match(css,/perspective:1400px/);
  assert.match(css,/backface-visibility:hidden/);
  assert.match(css,/rotateY\(180deg\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});

test('síntesis propias se presentan antes de enlaces a fuentes',()=>{
  for(const id of ['guia-contenido','tema-enfen','tema-pronostico','tema-riesgo',
    'synth-enfen-state','synth-pronostico-state','synth-riesgo-state']) {
    assert.ok(interaction.includes(id),id);
  }
  assert.match(interaction,/role="tablist"/);
  assert.match(interaction,/role="tabpanel"/);
  assert.match(interaction,/aria-selected/);
  assert.match(interaction,/ArrowRight/);
  assert.match(interaction,/ArrowLeft/);
  assert.match(interaction,/MutationObserver\(syncFacts\)/);
  assert.match(interaction,/document\.getElementById\(id\)/);
  assert.match(interaction,/Leer síntesis aquí/);
  assert.match(interaction,/Profundizar en la fuente oficial/);
});

test('explicaciones de novedades y alerta ENFEN abren primero contenido interno',()=>{
  assert.match(app,/const LECTURA_ACTUAL/);
  assert.match(app,/latest-context/);
  assert.match(app,/Entender este dato aquí/);
  assert.match(app,/url:'#estado-enfen',action:'Comprender la alerta aquí',external:false/);
  assert.match(css,/\.latest-context>summary/);
});

test('el sitio mantiene fechas, matices y lenguaje no alarmista',()=>{
  for(const term of ['ALERTA ≠ EMERGENCIA','PRONÓSTICO ≠ MEDICIÓN','RIESGO ≠ DESASTRE ACTUAL',
    '2025–2027','la fecha','sin salir del observatorio']) {
    assert.ok(interaction.toLocaleLowerCase('es').includes(term.toLocaleLowerCase('es')),term);
  }
  assert.doesNotMatch(interaction,/api\.openai\.com|fetch\(/);
});
