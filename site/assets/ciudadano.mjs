// Observatorio ciudadano: interacción autónoma del bloque #elnino-ciudadano.
/* ---------- Iconos (estilo Lucide, SVG en línea) ---------- */
var root = document.getElementById('elnino-ciudadano');
if(root){
var $ = function(id){ return document.getElementById('oc-'+id); };
var ICONS = {
  waves:'<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
  wind:'<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>',
  rain:'<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/>',
  thermo:'<path d="M14 4v10.5a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
  globe:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  alert:'<path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  flame:'<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.500 2 1.600 3 3.500 3 5.500a7 7 0 1 1-14 0c0-1.200.4-2.300 1-3a2.500 2.500 0 0 0 2.500 2.500z"/>',
  heart:'<path d="M19 14c1.5-1.5 3-3.200 3-5.500A5.500 5.500 0 0 0 16.500 3c-1.800 0-3 .5-4.500 2-1.500-1.500-2.700-2-4.500-2A5.500 5.500 0 0 0 2 8.500c0 2.300 1.500 4 3 5.500l7 7Z"/>',
  home:'<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  activity:'<path d="M22 12h-2.500a2 2 0 0 0-1.900 1.500l-2.400 8.400a.25.25 0 0 1-.5 0L9.200 2.200a.25.25 0 0 0-.5 0l-2.300 8.400A2 2 0 0 1 4.500 12H2"/>',
  trend:'<path d="m22 17-8.500-8.500-5 5L2 7"/><path d="M16 17h6v-6"/>',
  check:'<path d="M20 6 9 17l-5-5"/>'
};
function paintIcons(scope){
  (scope||root).querySelectorAll('i[data-i]').forEach(function(el){
    var p = ICONS[el.getAttribute('data-i')] || '';
    var cls = el.getAttribute('class') || '';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" class="'+cls+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>';
    el.outerHTML = svg;
  });
}
paintIcons();

/* ---------- Imágenes con respaldo ---------- */
root.querySelectorAll('.oc-img-card img').forEach(function(img){
  function fail(){ img.style.display='none'; var f=img.parentNode.querySelector('.oc-img-fallback'); if(f) f.style.display='flex'; }
  img.addEventListener('error', fail);
  if(img.complete && img.naturalWidth===0) fail();
});

/* ---------- Pestañas ---------- */
var tabs = root.querySelectorAll('.oc-tab-btn');
function showTab(id, scroll){
  tabs.forEach(function(t){ t.setAttribute('aria-selected', t.getAttribute('aria-controls')===('oc-'+id) ? 'true':'false'); });
  root.querySelectorAll('.oc-tab-panel').forEach(function(p){ p.classList.toggle('active', p.id==='oc-'+id); });
  if(scroll){ root.scrollIntoView({behavior:'smooth'}); }
}
tabs.forEach(function(t){ t.addEventListener('click', function(){ showTab(t.getAttribute('aria-controls').slice(3), true); }); });
root.querySelectorAll('[data-go]').forEach(function(b){ b.addEventListener('click', function(){ showTab(b.getAttribute('data-go'), true); }); });

/* ---------- Comparador ---------- */
function setCmp(nino){
  $('svg-normal').classList.toggle('hidden', nino);
  $('svg-nino').classList.toggle('hidden', !nino);
  $('txt-normal').classList.toggle('hidden', nino);
  $('txt-nino').classList.toggle('hidden', !nino);
  var a=$('btn-normal'), b=$('btn-nino');
  a.setAttribute('aria-pressed', String(!nino)); b.setAttribute('aria-pressed', String(nino));
  a.style.cssText = !nino ? 'background:var(--verde);color:#fff' : 'color:#334155';
  b.style.cssText = nino ? 'background:var(--rojo);color:#fff' : 'color:#334155';
}
$('btn-normal').onclick=function(){setCmp(false)};
$('btn-nino').onclick=function(){setCmp(true)};
setCmp(false);

/* ---------- Selector Perú / Mundo ---------- */
function setScope(peru){
  $('impact-peru').classList.toggle('hidden', !peru);
  $('impact-mundo').classList.toggle('hidden', peru);
  var a=$('sel-peru'), b=$('sel-mundo');
  a.setAttribute('aria-pressed', String(peru)); b.setAttribute('aria-pressed', String(!peru));
  a.style.cssText = peru ? 'background:#0f172a;color:#fff' : 'color:#334155';
  b.style.cssText = !peru ? 'background:#0f172a;color:#fff' : 'color:#334155';
}
$('sel-peru').onclick=function(){setScope(true)};
$('sel-mundo').onclick=function(){setScope(false)};
setScope(true);

var ZONES = {
  norte:{lvl:'Peligro', color:'var(--rojo)', title:'Costa Norte', txt:'Alto riesgo de lluvias intensas, desbordes de ríos y activación de quebradas, sobre todo en el verano de diciembre 2026 a marzo 2027.'},
  occ:{lvl:'Alerta', color:'var(--naranja)', title:'Vertiente occidental', txt:'Las laderas que miran al Pacífico también tienen alto riesgo de lluvias intensas, desbordes y huaicos en el verano de diciembre 2026 a marzo 2027.'},
  sur:{lvl:'Alerta por sequía', color:'var(--naranja)', title:'Sierra Sur', txt:'Existe riesgo de déficit de lluvias: menos agua para cultivos, ganado y consumo. Conviene almacenar agua de forma segura y bien tapada.'}
};
function showZone(k){
  var z=ZONES[k], box=$('zone-info');
  box.style.borderColor=z.color;
  box.innerHTML='<p class="text-xs font-bold uppercase" style="color:'+z.color+'">'+z.lvl+'</p><h4 class="text-xl font-extrabold">'+z.title+'</h4><p class="mt-1">'+z.txt+'</p>';
}
root.querySelectorAll('.oc-zone').forEach(function(g){
  g.addEventListener('click', function(){ showZone(g.getAttribute('data-zone')); });
  g.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); showZone(g.getAttribute('data-zone')); } });
});

/* ---------- Checklist ---------- */
var CHECKS = {
  salud:[
    'Tapar todos los recipientes donde guardo agua (baldes, tinas, cilindros).',
    'Eliminar criaderos de dengue: vaciar y voltear llantas, botellas, floreros y platos de macetas.',
    'Cambiar el agua de floreros y bebederos de mascotas cada 2 o 3 días.',
    'Hervir el agua para beber (al menos 1 minuto desde que hierve) o desinfectarla.',
    'Lavar mis manos con agua y jabón antes de comer y después de ir al baño.',
    'Lavar bien y cocinar los alimentos; no consumir comida que estuvo en contacto con agua de inundación.',
    'Usar repelente y ropa que cubra brazos y piernas en horas de mayor actividad de zancudos.',
    'Acudir al establecimiento de salud ante fiebre alta, diarrea persistente o dolor intenso, sin automedicarme.'
  ],
  vivienda:[
    'Limpiar techos y canaletas para que la lluvia fluya sin acumularse.',
    'Revisar que el techo y las paredes no tengan goteras ni grietas.',
    'Identificar las rutas de evacuación ante huaicos y practicarlas con mi familia.',
    'Acordar un punto de encuentro seguro, lejos de quebradas y ríos.',
    'Armar la mochila de emergencia: agua, comida enlatada, linterna, radio a pilas, botiquín y medicinas.',
    'Guardar documentos importantes en una bolsa hermética dentro de la mochila.',
    'Tener a mano los números de emergencia y el celular cargado.',
    'Mantener libres de basura los desagües y canales cercanos a mi casa.'
  ]
};
var KEY='observatorio-elnino-checks';
function loadState(){ try{ return JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){ return {}; } }
function saveState(s){ try{ localStorage.setItem(KEY, JSON.stringify(s)); }catch(e){} }
var state = loadState();
function buildList(id, group){
  var ul=$(id);
  CHECKS[group].forEach(function(txt,i){
    var k=group+i, li=document.createElement('li');
    li.className='oc-check flex items-start gap-3 rounded-lg p-2 hover:bg-slate-50';
    var cb=document.createElement('input'); cb.type='checkbox'; cb.id='oc-c-'+k; cb.checked=!!state[k];
    var lab=document.createElement('label'); lab.htmlFor=cb.id; lab.className='cursor-pointer flex-1';
    var sp=document.createElement('span'); sp.className='label'; sp.textContent=txt; lab.appendChild(sp);
    li.appendChild(cb); li.appendChild(lab);
    li.classList.toggle('done', cb.checked);
    cb.addEventListener('change', function(){ state[k]=cb.checked; li.classList.toggle('done', cb.checked); saveState(state); updateProgress(); });
    ul.appendChild(li);
  });
}
function updateProgress(){
  var all=root.querySelectorAll('.oc-check input'), done=0;
  all.forEach(function(c){ if(c.checked) done++; });
  var pct = all.length ? Math.round(done/all.length*100) : 0;
  $('prog-text').textContent = done+' de '+all.length;
  var bar=$('prog-bar'); bar.style.width=pct+'%';
  bar.style.background = pct>=100 ? 'var(--verde)' : pct>=60 ? 'var(--amarillo)' : pct>=30 ? 'var(--naranja)' : 'var(--rojo)';
  $('prog-msg').textContent = pct>=100 ? 'Excelente: tu hogar está preparado.' : pct>=60 ? 'Vas bien, completa lo que falta antes del verano.' : pct>=30 ? 'Buen inicio. Sigue avanzando.' : 'Empieza hoy: cada acción reduce el riesgo para tu familia.';
}
buildList('list-salud','salud'); buildList('list-vivienda','vivienda'); updateProgress();
$('reset-check').onclick=function(){
  state={}; saveState(state);
  root.querySelectorAll('.oc-check').forEach(function(li){ li.classList.remove('done'); li.querySelector('input').checked=false; });
  updateProgress();
};
}
