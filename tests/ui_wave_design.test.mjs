import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../site/assets/visual.css',import.meta.url),'utf8');
const count=(text,term)=>text.split(term).length-1;

test('cabecera clara con menú real y navegación hacia secciones existentes',()=>{
  for(const label of ['Observatorio','El Niño Perú','Inicio','¿Qué es El Niño?','Alerta oficial','Mi distrito','Cómo prepararse']){
    assert.ok(html.includes(label),'Falta '+label);
  }
  for(const id of ['top','que-es','estado-enfen','ultimo','preparacion','panorama','consulta','zonas','fuentes','glosario']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  for(const route of ['#top','#que-es','#estado-enfen','#ultimo','#preparacion','#panorama','#consulta','#fuentes','#zonas']){
    assert.ok(html.includes('href="'+route+'"'),'Ruta '+route);
  }
  assert.equal(count(html,'id="open-navigation"'),1);
  assert.equal(count(html,'id="navigation-dialog"'),1);
  assert.equal(count(html,'assets/visual.css?v=4'),1);
});

test('ola panorámica local y texto editable',()=>{
  const bytes=readFileSync(new URL('../site/assets/hero-ola.jpg',import.meta.url));
  assert.ok(bytes.length>60_000&&bytes.length<1_000_000);
  assert.deepEqual([...bytes.subarray(0,3)],[255,216,255]);
  assert.deepEqual([...bytes.subarray(-2)],[255,217]);
  assert.ok(css.includes('url("hero-ola.jpg")'));
  assert.match(html,/<h1 id="hero-title">El Niño en el Perú:/);
  assert.ok(html.includes('lo que debes saber'));
  assert.equal(count(html,'id="updated"'),1);
  assert.ok(!html.includes('2025, 14:50 (Lima)'),'No incrustar fecha de maqueta');
});

test('tres tarjetas ilustradas y fuentes oficiales separadas',()=>{
  const assets=['card-enfen.jpg','card-distrito.jpg','card-riesgo.jpg'];
  for(const asset of assets){
    const data=readFileSync(new URL('../site/assets/'+asset,import.meta.url));
    assert.ok(data.length>15_000&&data.length<1_000_000,asset);
    assert.deepEqual([...data.subarray(0,3)],[255,216,255],asset);
    assert.ok(html.includes('src="assets/'+asset+'"'),asset);
  }
  assert.equal(count(html,'class="simple-guide-card '),3);
  assert.ok(html.includes('assets/guide3d.mjs?v=1'),'Falta la experiencia de tarjetas interactivas');
  assert.equal(count(html,'class="guide-art"'),3);
  assert.ok(html.includes('¿Qué dice ENFEN?'));
  assert.ok(html.includes('¿Qué se espera en mi distrito?'));
  assert.ok(html.includes('¿Dónde existe mayor riesgo?'));
  assert.ok(html.includes('Imágenes ilustrativas.'));
  assert.ok(html.includes('CENEPRED'));
  assert.equal(count(html,'id="alert-strip"'),1);
  assert.equal(count(html,'id="enfen-state"'),1);
  assert.equal(count(html,'id="enfen-link"'),1);
  assert.ok(html.includes('https://enfen.imarpe.gob.pe/comunicados/'));
});

test('responsive y dos actualizaciones programadas',()=>{
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(css,/grid-template-columns:1fr/);
  assert.match(css,/prefers-reduced-motion/);
  assert.ok(html.includes('id="stage-motion"'));
  assert.ok(html.includes('id="radar-sphere"'));
  const wf=readFileSync(new URL('../.github/workflows/monitor.yml',import.meta.url),'utf8');
  assert.ok(wf.includes("'5 13 * * *'"));
  assert.ok(wf.includes("'5 1 * * *'"));
});
