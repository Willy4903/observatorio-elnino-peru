import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('site/index.html');
const theme=read('site/assets/ocean-theme.css');
const experience=read('site/assets/ocean-experience.mjs');
const visual=read('site/assets/visual.css');

test('identidad oceánica uniforme y versionada en toda la web',()=>{
  assert.match(html,/name="theme-color" content="#061522"/);
  assert.match(html,/assets\/ocean-theme\.css\?v=1/);
  assert.match(html,/assets\/ocean-experience\.mjs\?v=1/);
  assert.ok(html.indexOf('visual.css?v=4')<html.indexOf('ocean-theme.css?v=1'));
  assert.match(theme,/--oceano-bg:#061522/);
  for(const selector of ['.radar-header','#main .visual-guide','#main #que-es',
    '#main #preparacion','#main #estado-enfen','#main #guia-contenido',
    '#main .citizen-questions','#main #detalle-tecnico','#main .latest-card',
    '#main .source-card','#main .radar-pathways>a','#main .tactical-deck .map-panel']){
    assert.ok(theme.includes(selector),selector);
  }
  assert.match(theme,/background:rgba\(6,22,36,\.94\)!important/);
  assert.match(visual,/background:#fff!important/); // Un estilo anterior que reemplaza el nuevo tema.
  assert.match(theme,/background:linear-gradient\(150deg,#102b3e,#091f30\)!important/);
});

test('ejemplos cotidianos e interacción de preparación con estado real',()=>{
  assert.match(experience,/\.citizen-primer-steps > li/);
  assert.match(experience,/Ver un ejemplo cotidiano/);
  assert.match(experience,/\.citizen-actions > li/);
  assert.match(experience,/Marcar como revisado/);
  assert.match(experience,/aria-pressed/);
  assert.match(experience,/Tu lista de preparación/);
  assert.match(experience,/no certifica/);
  assert.match(theme,/\.citizen-mini-detail/);
  assert.match(theme,/\.citizen-review-track/);
  assert.match(theme,/\.citizen-action-check\[aria-pressed=true\]/);
});

test('animaciones progresivas sin afectar accesibilidad',()=>{
  assert.match(experience,/ocean-reading-progress/);
  assert.match(experience,/requestAnimationFrame\(update\)/);
  assert.match(experience,/prefers-reduced-motion: reduce/);
  assert.match(experience,/IntersectionObserver/);
  assert.match(theme,/prefers-reduced-motion:reduce/);
  assert.match(theme,/\.ocean-reveal\.ocean-visible/);
  assert.match(theme,/#main button:focus-visible/);
});

test('estructura intacta y sintaxis de CSS válida a nivel de delimitadores',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,ids.length,'No debe duplicar identificadores');
  for(const [left,right] of [['{','}'],['(',')']]){
    assert.equal(theme.split(left).length-1,theme.split(right).length-1,left+' / '+right);
  }
  assert.ok(theme.length<80000);
  assert.ok(!experience.includes('fetch('),'La interacción no debe consultar nuevos datos');
});
