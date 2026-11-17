import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, statSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const bytes=path=>readFileSync(new URL('../'+path,import.meta.url));
const html=read('site/index.html');
const css=read('site/assets/que-es.css');
const js=read('site/assets/que-es.mjs');
const start=html.indexOf('<section id="que-es"');
const end=html.indexOf('<aside class="guide-next"');
const section=html.slice(start,end);
const count=(text,pattern)=>(text.match(pattern)||[]).length;

test('la sección sustituye al alias y a la guía anterior y mantiene el orden de la página',()=>{
  assert.ok(start>0&&end>start);
  assert.equal(count(html,/id="que-es"/g),1);
  assert.equal(count(html,/anchor-alias/g),0);
  assert.equal(count(html,/elnino-ciudadano/g),0);
  assert.equal(count(section,/<section\b/g),count(section,/<\/section>/g));
  assert.ok(html.indexOf('id="ultimo"')<start);
  assert.ok(start<html.indexOf('id="guia-inicio"'));
  assert.match(section,/<h2 id="qe-title">Entiende El Niño:/);
  assert.match(html,/assets\/que-es\.css/);
  assert.match(html,/<script type="module" src="assets\/que-es\.mjs">/);
});

test('ids únicos, referencias aria y enlaces internos válidos',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  const duplicated=ids.filter((id,i)=>ids.indexOf(id)!==i);
  assert.deepEqual(duplicated,[]);
  for(const [,value] of section.matchAll(/aria-(?:labelledby|describedby)="([^"]+)"/g)){
    for(const id of value.split(/\s+/))assert.ok(ids.includes(id),'aria: '+id);
  }
  for(const [,target] of section.matchAll(/href="#([^"]+)"/g))assert.ok(ids.includes(target),'enlace #'+target);
  for(const [,target] of section.matchAll(/xlink:href|href="#(qe-[^"]+)"/g))if(target)assert.ok(ids.includes(target),'símbolo '+target);
});

test('el contenido completo está en el HTML y se lee sin JavaScript',()=>{
  for(const phrase of ['¿Cómo se origina El Niño?','Vientos débiles','Agua cálida acumulada','Lluvias intensas','Simulador de impacto',
    'Tres cosas clave que debes saber','¿Mito o verdad?','Guía rápida para compartir','¿Costero o del Pacífico central?'])assert.ok(section.includes(phrase),phrase);
  assert.equal(count(section,/class="qe-step[ "]/g),3);
  assert.equal(count(section,/class="qe-lvl"/g),8,'cuatro magnitudes en las dos zonas');
  assert.equal(count(section,/class="qe-key"/g),3);
  assert.equal(count(section,/class="qe-qi"/g),6);
  assert.equal(count(section,/data-answer="(?:mito|verdad)"/g),6);
  for(const level of ['Débil','Moderada','Fuerte','Extraordinaria'])assert.ok(section.includes('<b>'+level+'.</b>'),level);
  assert.equal(count(section,/data-c="normal" data-m="c"/g),3);
  assert.equal(count(section,/data-c="nino" data-m="e"/g),3);
  assert.equal(count(section,/class="qe-file"/g),3);
  assert.match(section,/<details><summary class="qe-q-stmt">/);
  assert.equal(count(section,/class="[^"]*qe-js-only/g)>=8,true,'los controles interactivos solo existen con JavaScript');
});

test('el simulador usa la escala ENFEN y no presenta un pronóstico',()=>{
  assert.match(section,/<input id="qe-level"[^>]*type="range"[^>]*min="0"[^>]*max="3"/);
  for(const range of ['+0,4 a +1,0','+1,0 a +1,7','+1,7 a +3,0','más de +3,0'])assert.ok(section.includes(range),range);
  assert.match(section,/No es un pronóstico/);
  assert.match(section,/patrones típicos observados en eventos pasados, no un pronóstico/);
  assert.match(section,/href="#estado-enfen"/);
  assert.doesNotMatch(section,/\b20\d\d-\d\d-\d\d\b/,'sin fechas de emisión fijas');
  assert.doesNotMatch(section,/Comunicado Oficial|Alerta de El Niño Costero/);
});

test('el mapa contiene los 25 departamentos con zonas didácticas y los recortes del sur',()=>{
  assert.equal(count(section,/class="qe-dep"/g),25);
  assert.equal(count(section,/data-zone="norte"/g),5);
  assert.equal(count(section,/data-zone="sur"/g),6);
  for(const id of ['arequipa','moquegua','tacna','puno','cusco','apurimac'])assert.match(section,new RegExp('<path id="qe-d-'+id+'" class="qe-dep" data-zone="sur"'),id);
  assert.match(section,/<!-- qe-map:start -->/);
  assert.ok(section.length<60000,'peso razonable del bloque');
});

test('enlaces externos seguros y materiales descargables válidos',()=>{
  for(const [tag] of section.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)){
    assert.match(tag,/rel="[^"]*noopener/,tag);
    assert.match(tag,/href="https:\/\//,tag);
  }
  const files=[...section.matchAll(/<a class="qe-file" href="(assets\/share\/[^"]+)" download>/g)].map(m=>m[1]);
  assert.deepEqual(files,['assets/share/infografia-el-nino-colegios.pdf','assets/share/guia-whatsapp-el-nino.png','assets/share/manual-prevencion-familiar.pdf']);
  for(const file of files){
    const path='site/'+file;
    assert.ok(existsSync(new URL('../'+path,import.meta.url)),path);
    assert.ok(statSync(new URL('../'+path,import.meta.url)).size<2_500_000,'tamaño de '+path);
    const head=bytes(path).subarray(0,8);
    if(file.endsWith('.pdf'))assert.equal(head.subarray(0,5).toString('latin1'),'%PDF-',path);
    else assert.deepEqual([...head],[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],path);
  }
  assert.match(section,/href="https:\/\/wa\.me\/\?text=/);
});

/* Todas las reglas de que-es.css deben quedar bajo #que-es para no alterar el resto de la página. */
function selectorsOf(source){
  const clean=source.replace(/\/\*[\s\S]*?\*\//g,'');
  const found=[];
  const stack=[];
  let buffer='';
  for(const char of clean){
    if(char==='{'){
      const prelude=buffer.trim();buffer='';
      const skip=stack.includes('skip')||/^@(?:keyframes|property|font-face)/.test(prelude);
      stack.push(skip?'skip':/^@/.test(prelude)?'wrapper':'rule');
      if(!skip&&!/^@/.test(prelude))found.push(prelude);
    }else if(char==='}'){stack.pop();buffer='';}
    else if(char===';'&&!stack.length)buffer='';
    else buffer+=char;
  }
  const topLevel=prelude=>{ // separa por comas fuera de paréntesis y corchetes (:is(), :not(), [attr="a,b"])
    const parts=[];let depth=0,current='';
    for(const char of prelude){
      if('([' .includes(char))depth++;
      if(')]'.includes(char))depth--;
      if(char===','&&depth===0){parts.push(current.trim());current='';}else current+=char;
    }
    return [...parts,current.trim()].filter(Boolean);
  };
  return found.flatMap(topLevel);
}
test('la hoja de estilos está aislada bajo #que-es y respeta el movimiento reducido',()=>{
  const selectors=selectorsOf(css);
  assert.ok(selectors.length>200);
  assert.deepEqual(selectors.filter(selector=>!selector.startsWith('#que-es')),[]);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
  assert.match(css,/@media \(min-width:640px\)/);
  assert.match(css,/@media \(min-width:1024px\)/);
  assert.match(css,/--qe-bg:#0a0e17/);
  assert.match(css,/backdrop-filter:blur\(12px\)/);
  assert.match(css,/font-variant-numeric|tabular-nums|--qe-head/);
  assert.ok(html.includes('family=Outfit:wght@')&&html.includes('family=Plus+Jakarta+Sans'));
  assert.match(css,/"Plus Jakarta Sans"/);
  assert.match(css,/"Outfit"/);
  assert.doesNotMatch(css,/#que-es[^{]*\{[^}]*\bposition:fixed/);
});

test('el módulo solo cambia estado y no usa evaluación dinámica ni red',()=>{
  assert.match(js,/document\.getElementById\('que-es'\)/);
  for(const forbidden of [/\beval\(/,/new Function/,/document\.write/,/\bfetch\(/,/XMLHttpRequest/,/\.outerHTML\s*=/])assert.doesNotMatch(js,forbidden,String(forbidden));
  for(const attribute of ['data-mode','data-climate','data-step','data-level'])assert.ok(js.includes(attribute.replace('data-','dataset.'))||js.includes(attribute),attribute);
  assert.match(js,/aria-checked/);
  assert.match(js,/aria-current/);
  assert.match(js,/aria-valuetext/);
  assert.match(js,/navigator\.share/);
  assert.match(js,/try \{ return localStorage/);
  assert.match(js,/IntersectionObserver/);
});
