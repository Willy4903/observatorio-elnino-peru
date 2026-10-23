import {oceanScalarLayer, oceanVectorLayer} from './ocean.mjs';
import {normalize, inRange, highRisk, mean, limaDate, selectNoaa, selectForecasts, riskByDepartment, forecastByDepartment, forecastByDate, csv, hexbinPoints} from './selectors.mjs';

const $ = id => document.getElementById(id);
const fmt = (n, digits = 0) => n == null ? '—' : new Intl.NumberFormat('es-PE', {maximumFractionDigits: digits, minimumFractionDigits: digits}).format(n);
const dateLabel = date => date ? new Intl.DateTimeFormat('es-PE', {day:'2-digit', month:'short', year:'numeric', timeZone:'UTC'}).format(new Date(date.slice(0,10)+'T12:00:00Z')) : 'Sin fecha publicada';
const timestamp = value => value ? new Intl.DateTimeFormat('es-PE', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Lima',hour12:false}).format(new Date(value))+' · Lima' : 'Sin consulta válida';
const e = value => String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const titleCase = text => String(text ?? '').toLocaleLowerCase('es').replace(/(^|\s|-)\p{L}/gu, c => c.toLocaleUpperCase('es'));
function safeUrl(url, fallback = 'https://sigrid.cenepred.gob.pe/sigridv3/') {
  try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.href : fallback; } catch { return fallback; }
}
const HAZARDS = {inundacion:'Inundación',movimientos_masa:'Movimientos en masa'};
const STATUS = {ok:'Disponible',stale:'Desactualizado',degraded:'Consulta fallida',unavailable:'Sin datos'};
const state = {kind:'observation',layer:'sst',vectors:true,oceanExtent:'coast',inspectorDepartment:'20',inspectorDistrict:null,hazard:'inundacion',frequency:'weekly',table:'districts',forecastPage:0,zonePage:0,from:'',to:'',department:'all',data:{},versions:[],forecastRows:[],zoneRows:[],history:[],map:null,mapLayers:[],polygons:null,noaaChart:null,forecastChart:null};
const networkCache = new Map();
const PAGE = 12;

async function getJson(path) {
  if (!networkCache.has(path)) networkCache.set(path, fetch(path, {cache:'no-cache'}).then(async r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${path}`);
    if (path.endsWith('.gz')) {
      const bytes = new Uint8Array(await r.arrayBuffer());
      // Algunos hosts ya descomprimen por Content-Encoding; se verifica la cabecera gzip.
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
      return JSON.parse(new TextDecoder().decode(bytes));
    }
    return r.json();
  }).catch(error=>{networkCache.delete(path);throw error;}));
  return networkCache.get(path);
}

function clientStatus(source) {
  if (!source.last_success) return 'unavailable';
  if (source.error) return 'degraded';
  const age = (Date.now() - new Date(source.last_success)) / 3600000;
  const maxHours = source.id === 'boundaries' ? 1440 : 72;
  if (age > maxHours) return 'stale';
  if (source.latest_date && source.max_age_days != null && (new Date(limaDate())-new Date(source.latest_date))/86400000 > source.max_age_days) return 'stale';
  return source.status;
}

function setDefaults() {
  const today = limaDate();
  const start = new Date(today+'T12:00:00Z'); start.setUTCDate(start.getUTCDate()-210);
  const end = new Date(today+'T12:00:00Z'); end.setUTCDate(end.getUTCDate()+3);
  $('from').value=start.toISOString().slice(0,10); $('to').value=end.toISOString().slice(0,10); $('month').value=today.slice(0,7);
  $('period').value='range'; $('department').value='all';
  updatePeriodInputs();
}
function updatePeriodInputs() {
  const period=$('period').value;
  $('from-wrap').hidden=period==='month'; $('to-wrap').hidden=period!=='range'; $('month-wrap').hidden=period!=='month';
  $('from').required=period!=='month'; $('to').required=period==='range';
  $('from-wrap').firstChild.textContent=period==='day'?'Día':'Desde';
}
function readFilters() {
  const period=$('period').value;
  if (period==='month') {
    if (!$('month').value) return false;
    state.from=$('month').value+'-01';
    const [year,month]=$('month').value.split('-').map(Number);
    state.to=new Date(Date.UTC(year,month,0,12)).toISOString().slice(0,10);
  } else {
    state.from=$('from').value; state.to=period==='day'?state.from:$('to').value;
  }
  state.department=$('department').value;
  if (!state.from || !state.to || state.from>state.to) {
    $('filter-notice').textContent='Elige un periodo válido: la fecha inicial debe ser anterior o igual a la final.';
    return false;
  }
  return true;
}

async function loadData() {
  const manifest=await getJson('./data/manifest.json'); state.manifest=manifest;
  const needed=manifest.sources.filter(s=>s.last_success && s.id!=='cenepred_points');
  const loaded=await Promise.allSettled(needed.map(async s=>{state.data[s.id]=await getJson(`./data/${s.file??s.id+'.json'}`);}));
  const errors=loaded.filter(x=>x.status==='rejected');
  if (errors.length) { $('load-message').textContent=`${errors.length} conjunto(s) no pudieron cargarse. Consulte Fuentes y calidad.`; $('load-message').classList.add('error'); }
  else $('load-message').hidden=true;
  const boundary=state.data.boundaries?.data;
  if (boundary) {
    const departments=[...boundary.features].sort((a,b)=>a.properties.name.localeCompare(b.properties.name,'es'));
    const selectedDepartment=$('department').value;
    $('department').innerHTML='<option value="all">Todo el Perú</option>'+departments.map(f=>`<option value="${e(f.properties.code)}">${e(titleCase(f.properties.name))}</option>`).join('');
    $('department').value=departments.some(f=>f.properties.code===selectedDepartment)?selectedDepartment:'all';
    state.departmentNames=Object.fromEntries(boundary.features.map(f=>[f.properties.code,normalize(f.properties.name)]));
  }
  state.oceanVersions=Object.fromEntries(['noaa_ocean_sst','noaa_ocean_currents'].map(id=>[id,state.data[id]?[state.data[id]]:[]]));
  try{state.oceanHistory=(await getJson('./data/ocean_history.json')).versions;}catch{state.oceanHistory=[];}
  if (state.data.senamhi_forecast) state.versions=[state.data.senamhi_forecast];
  try { state.history=(await getJson('./data/forecast_history.json')).versions; } catch {state.history=[];}
  const bulletin=state.data.enfen?.data;
  if (bulletin) {
    $('alert-strip').hidden=false; $('enfen-state').textContent=bulletin.alert;
    $('enfen-date').textContent=`${dateLabel(bulletin.published_date)} · último comunicado verificado`;
    $('enfen-link').href=safeUrl(bulletin.document_url,'https://enfen.imarpe.gob.pe/comunicados/');
  }
  $('updated').textContent=`Última ejecución: ${timestamp(manifest.generated_at)}`;
  renderHealth();
  $('history-note').textContent=manifest.history_start?`El archivo de pronósticos comienza el ${dateLabel(limaDate(manifest.history_start))}. Las series oceánicas conservan su historia oficial desde 1981/1982; no se reconstruyen pronósticos anteriores al archivo.`:'Aún no hay archivo histórico de pronósticos.';
  renderSources();
}

function renderHealth() {
  const operational=state.manifest.sources.filter(s=>s.kind!=='reference');
  const ok=operational.filter(s=>clientStatus(s)==='ok').length;
  $('global-status').innerHTML=`<i></i>${ok}/${operational.length} conjuntos al día`;
  $('global-status').classList.toggle('degraded',ok!==operational.length);
}

let refreshingPublication=false;
async function refreshPublication() {
  if (document.hidden || refreshingPublication || !state.manifest) return;
  refreshingPublication=true;
  try {
    networkCache.delete('./data/manifest.json');
    const next=await getJson('./data/manifest.json');
    if (next.generated_at!==state.manifest.generated_at) {
      networkCache.clear();
      networkCache.set('./data/manifest.json',Promise.resolve(next));
      state.versions=[];state.pointLite=null;delete state.data.cenepred_points;
      await loadData();
      await applyFilters();
    } else {renderHealth();renderSources();}
  } catch {
    renderSources();
    $('global-status').classList.add('degraded');
    $('global-status').innerHTML='<i></i>Consulta de actualización pendiente';
  } finally {refreshingPublication=false;}
}

async function ensureForecastHistory() {
  const jobs=state.history.filter(v=>v.valid_from<=state.to && v.valid_to>=state.from && limaDate(v.collected_at)<=state.to && /^history\/forecasts\/\d{4}-\d{2}-\d{2}(?:T\d{6}Z)?-[a-f0-9]+\.json(?:\.gz)?$/.test(v.path));
  const known=new Set(state.versions.map(v=>v.meta.fetched_at+'|'+v.meta.data_sha256));
  await Promise.allSettled(jobs.filter(v=>!known.has(v.collected_at+'|'+v.sha256)).map(async v=>{
    const result=await getJson('./data/'+v.path);
    if (!state.versions.some(x=>x.meta.fetched_at===result.meta.fetched_at&&x.meta.data_sha256===result.meta.data_sha256)) state.versions.push(result);
  }));
}

async function ensurePoints() {
  if (state.data.cenepred_points) return;
  const source=state.manifest.sources.find(s=>s.id==='cenepred_points');
  if (!source?.last_success) return;
  // Primero se consulta la versión ligera del mapa; el detalle completo se carga al abrir su tabla.
  if (!state.pointLite) {
    try { state.pointLite=(await getJson('./data/map_points.json.gz')).data; } catch { /* Publicaciones anteriores pueden no incluir la derivación. */ }
  }
  if (!state.pointLite || state.table==='points') state.data.cenepred_points=await getJson('./data/'+(source.file??'cenepred_points.json'));
}

function allPoints() {
  return state.data.cenepred_points?.data ?? state.pointLite ?? [];
}
function pointMatchesDepartment(r) {return state.department==='all' || normalize(r.department)===state.departmentNames?.[state.department];}
function selectedPoints() {
  return allPoints().filter(r=>r.hazard===state.hazard && pointMatchesDepartment(r) && (!$('document-date').checked || inRange(r.document_date,state.from,state.to)));
}
function selectedRisks() {return (state.data.cenepred_risk?.data??[]).filter(r=>r.hazard===state.hazard && (state.department==='all'||r.department_code===state.department));}

function renderKpis() {
  const key=state.frequency==='monthly'?'noaa_monthly':'noaa_weekly',all=state.data[key]?.data??[];
  const rows=selectNoaa(all,state,state.frequency==='monthly'),last=rows.at(-1);
  const prior=last?all.filter(r=>r.date<last.date).at(-1):null;
  for(const [id,field] of [['12','nino12_anomaly'],['34','nino34_anomaly']]){
    const val=last?.[field],delta=val!=null&&prior?val-prior[field]:null;
    $('kpi'+id).innerHTML=`${val==null?'—':(val>0?'+':'')+fmt(val,state.frequency==='weekly'?1:2)}<span>°C</span>`;
    $('date'+id).textContent=last?`${state.frequency==='weekly'?'Semana':'Mes'} · ${dateLabel(last.date)}`:'Sin observación en el periodo';
    $('delta'+id).textContent=delta==null?'—':`${delta>0?'▲ ':delta<0?'▼ ':''}${delta>0?'+':''}${fmt(delta,2)} °C`;
    $('delta'+id).title='Variación respecto de la publicación anterior de NOAA CPC';
    $('bar'+id).style.width=val==null?'0%':Math.max(0,Math.min(100,(val+3)/9*100))+'%';
    $('bar'+id).parentNode.title='Escala de anomalía: −3 a +6 °C; no es una probabilidad';
  }
  $('inset34-value').textContent=last?`${last.nino34_anomaly>0?'+':''}${fmt(last.nino34_anomaly,2)} °C`:'— °C';
  $('inset34-date').textContent=last?`CPC · ${dateLabel(last.date)}`:'Sin observación en el periodo';
  const risks=selectedRisks(),high=risks.filter(r=>highRisk(r.risk_level)),classified=risks.filter(r=>r.risk_level);
  $('kpi-risk').textContent=state.data.cenepred_risk?fmt(high.length):'—';
  $('risk-kpi-detail').textContent=`${HAZARDS[state.hazard]} · escenario 2025–2027`;
  $('bar-risk').style.width=classified.length?100*high.length/classified.length+'%':'0%';
  $('bar-risk').parentNode.title='Porcentaje de distritos clasificados en alto o muy alto';
  const locations=new Set(state.forecastRows.map(r=>r.locality_id));
  $('kpi-forecast').textContent=state.data.senamhi_forecast?fmt(locations.size):'—';
  $('forecast-kpi-detail').textContent=state.forecastRows.length?`${fmt(state.forecastRows.length)} registros localidad / día`:'Sin pronósticos en el periodo';
  const coverage=new Set((state.data.senamhi_forecast?.data??[]).map(r=>r.locality_id)).size;
  $('bar-forecast').style.width=coverage?100*locations.size/coverage+'%':'0%';
  $('bar-forecast').parentNode.title='Localidades de la selección respecto del inventario de pronósticos disponible';
}

function initMap() {
  if (!window.L) { $('map').textContent='El componente del mapa no pudo cargarse.'; return; }
  state.map=L.map('map',{zoomControl:true,preferCanvas:true,scrollWheelZoom:false,minZoom:2,maxZoom:15,zoomSnap:.25,zoomDelta:.5,zoomAnimation:false,fadeAnimation:false});
  state.map.createPane('borders');state.map.getPane('borders').style.zIndex=440;state.map.getPane('borders').style.pointerEvents='none';
  state.map.createPane('labels');state.map.getPane('labels').style.zIndex=460;state.map.getPane('labels').style.pointerEvents='none';
  const observer=new ResizeObserver(()=>{requestAnimationFrame(()=>{state.map.invalidateSize({pan:false});reframe();});});observer.observe($('map'));
  for(const [name,z] of [['ocean',250],['oceanVectors',350],['graticule',300]]){state.map.createPane(name);state.map.getPane(name).style.zIndex=z;state.map.getPane(name).style.pointerEvents='none';}
  state.map.attributionControl.addAttribution('NOAA CoastWatch / CENEPRED SIGRID');
  state.map.fitBounds([[-18.5,-82.5],[0.3,-68.4]],{padding:[25,35]});
}

const colorSteps=['#38bdf8','#2dd4bf','#facc15','#fb923c','#f87171'];
const DENSITY_STEPS=[{min:1,label:'1–4',color:'#22b8cf'},{min:5,label:'5–19',color:'#2dd4bf'},{min:20,label:'20–49',color:'#facc15'},{min:50,label:'50–99',color:'#fb923c'},{min:100,label:'100 o más',color:'#f43f5e'}];
const densityColor=count=>DENSITY_STEPS.filter(s=>count>=s.min).at(-1)?.color??'#24364a';
function colorFor(value,min=0,max=100) {
  if (value==null || !Number.isFinite(value)) return '#26384b';
  return colorSteps[Math.min(4,Math.max(0,Math.floor(5*(value-min)/(max-min||1))))];
}
function legend(title,low,high,palette='warm') {
  const bg=palette==='temperature'?'linear-gradient(to right,#38bdf8,#2dd4bf,#facc15,#fb923c,#f87171)':palette==='anomaly'?'linear-gradient(to right,#1d4ed8 0%,#38bdf8 22.22%,#202f44 33.33%,#886c24 38.89%,#eab308 44.44%,#f97316 55.56%,#ef4444 66.67%,#ef332a 88.89%,#b91c1c 100%)':'linear-gradient(to right,#38bdf8,#2dd4bf,#facc15,#fb923c,#f87171)';
  $('map-legend').innerHTML=`<div class="legend-title">${e(title)}</div><div class="legend-gradient" style="background:${bg}"></div><div class="legend-ends"><span>${e(low)}</span><span>${e(high)}</span></div><div class="legend-empty">Gris: sin dato / sin clasificación</div>`;
}
function densityLegend() {
  $('map-legend').innerHTML='<div class="legend-title">PUNTOS POR CELDA · 30 KM</div>'+DENSITY_STEPS.map(s=>`<div class="legend-step"><i style="background:${s.color}"></i><span>${s.label}</span></div>`).join('')+'<div class="legend-empty">Malla fija · conteo de inventario<br>Sin celda: sin puntos registrados</div>';
}
function renderInspector(cell=null) {
  const code=state.department==='all'?state.inspectorDepartment:state.department;
  const feature=state.data.boundaries?.data.features.find(f=>f.properties.code===code);
  const name=titleCase(feature?.properties.name??'Piura');
  const district=state.inspectorDistrict?.department_code===code?state.inspectorDistrict:null;
  const risks=(state.data.cenepred_risk?.data??[]).filter(r=>r.department_code===code&&r.hazard===state.hazard),high=risks.filter(r=>highRisk(r.risk_level)),classified=risks.filter(r=>r.risk_level);
  const points=allPoints().filter(p=>p.hazard===state.hazard&&normalize(p.department)===normalize(feature?.properties.name));
  const forecasts=state.forecastRows.filter(r=>r.department_code===code),tmax=forecasts.length?Math.max(...forecasts.map(r=>r.tmax_c)):null,tmin=forecasts.length?Math.min(...forecasts.map(r=>r.tmin_c)):null;
  const locations=new Set(forecasts.map(r=>r.locality_id)).size,dates=[...new Set(forecasts.map(r=>r.valid_date))].sort();
  const badge=district?`<span class="level level-${district.risk_level?.toLowerCase().replaceAll(' ','-')??'none'}">${e(district.risk_level??'Sin categoría')}</span>`:'<span class="pill scenario">ESCENARIO</span>';
  const title=cell?`${fmt(cell.count)} puntos documentados`:district?`${name} — ${titleCase(district.district)}`:`${name} · lectura territorial`;
  $('inspector-ubigeo').textContent=district?`UBIGEO ${district.ubigeo}`:`DPTO. ${code}`;
  document.querySelectorAll('[data-department]').forEach(b=>{b.classList.toggle('selected',b.dataset.department===code);b.setAttribute('aria-pressed',String(b.dataset.department===code));});
  $('inspector-content').innerHTML=`<div class="inspector-title-row"><div><h3>${e(title)}</h3><p class="inspector-scope">${cell?`Celda ${e(cell.id)} · ${e(cell.departments.map(titleCase).join(' / '))}`:`${e(HAZARDS[state.hazard])} · CENEPRED, marco 2025–2027`}</p></div>${badge}</div><div class="inspector-metrics"><div class="inspector-metric"><span>TEMPERATURA MÁXIMA PREVISTA</span><b>${fmt(tmax,1)} °C</b><small>Mayor máxima publicada en localidades del departamento</small></div><div class="inspector-metric"><span>TEMPERATURA MÍNIMA PREVISTA</span><b>${fmt(tmin,1)} °C</b><small>Menor mínima publicada en localidades del departamento</small></div></div><div class="inspector-facts"><h4>COBERTURA Y ESCENARIO OFICIAL</h4><dl><div><dt>Distritos en alto o muy alto</dt><dd class="hot">${fmt(high.length)} / ${fmt(classified.length)}</dd></div><div><dt>Puntos documentados</dt><dd>${fmt(points.length)}</dd></div><div><dt>Localidades con pronóstico</dt><dd class="cyan">${fmt(locations)}</dd></div><div><dt>Validez de pronósticos</dt><dd>${dates.length?`${dateLabel(dates[0]).slice(0,7)} – ${dateLabel(dates.at(-1)).slice(0,7)}`:'Sin cobertura'}</dd></div></dl></div><div class="inspector-weather">${forecasts.length?e(forecasts.find(r=>r.rain_mentioned)?.description??forecasts[0].description):'Sin pronóstico archivado para esta selección.'}<br><span class="text-slate-500">Lluvia cualitativa SENAMHI · no se publican mm en esta tabla. El escenario no representa una emergencia en curso.</span></div>`;
}
function selectedOcean(id){return (state.oceanVersions?.[id]??[]).filter(env=>inRange(env.meta.latest_date,state.from,state.to)).sort((a,b)=>a.meta.latest_date.localeCompare(b.meta.latest_date)||a.meta.fetched_at.localeCompare(b.meta.fetched_at)).at(-1)??null;}
async function ensureOceanHistory(){
  const jobs=[];
  for(const id of ['noaa_ocean_sst','noaa_ocean_currents']){
    const version=(state.oceanHistory??[]).filter(v=>v.source_id===id&&inRange(v.date,state.from,state.to)).sort((a,b)=>a.date.localeCompare(b.date)||a.collected_at.localeCompare(b.collected_at)).at(-1);
    if(!version||(state.oceanVersions?.[id]??[]).some(e=>e.meta.data_sha256===version.sha256))continue;
    if(!/^history\/ocean\/noaa_ocean_(?:sst|currents)-\d{4}-\d{2}-\d{2}-[a-f0-9]+\.json\.gz$/.test(version.path))continue;
    jobs.push(getJson('./data/'+version.path).then(env=>{(state.oceanVersions[id]??=[]).push(env);}));
  }
  await Promise.allSettled(jobs);
}
function oceanIndex(rows,step){return new Map(rows.map(r=>[`${Math.round(r.lat/step)}:${Math.round(r.lon/step)}`,r]));}
function coastalMarkers(){
  for(const code of ['24','20','14','13','15']){
    const feature=state.data.boundaries?.data.features.find(f=>f.properties.code===code);if(!feature)continue;
    const points=allPoints().filter(p=>p.hazard==='inundacion'&&normalize(p.department)===normalize(feature.properties.name));
    if(!points.length)continue;
    // Coordenada real de un punto del inventario, elegido por proximidad al centro del departamento.
    const center=L.geoJSON(feature).getBounds().getCenter();
    const point=[...points].sort((a,b)=>(Math.abs(a.lat-center.lat)+Math.abs(a.lon-center.lng))-(Math.abs(b.lat-center.lat)+Math.abs(b.lon-center.lng)))[0];
    const risk=(state.data.cenepred_risk?.data??[]).filter(r=>r.department_code===code&&r.hazard==='inundacion'&&highRisk(r.risk_level));
    const name=titleCase(feature.properties.name),selected=(state.department==='all'?state.inspectorDepartment:state.department)===code;
    const icon=L.divIcon({className:`coastal-marker ${selected?'selected':''} ${code==='15'?'central':''}`,html:`<span class="signal-dot"></span><span class="signal-label">${e(name.toUpperCase())} · ${fmt(risk.length)} distritos</span>`,iconSize:[12,12],iconAnchor:[0,0]});
    const marker=L.marker([point.lat,point.lon],{icon,zIndexOffset:selected?900:800,keyboard:true,title:`${name}: ${risk.length} distritos en alto o muy alto`});
    marker.on('click',()=>{state.inspectorDepartment=code;state.inspectorDistrict=null;renderInspector();});
    addMapLayer(marker);
  }
}
function addGraticule(){
  for(const lat of [-20,-15,-10,-5,0,5]){
    addMapLayer(L.polyline([[lat,-180],[lat,-60]],{pane:'graticule',interactive:false,color:'#38bdf8',weight:.6,opacity:.2,dashArray:'3 4'}));
    addMapLayer(L.marker([lat,-103],{pane:'labels',interactive:false,keyboard:false,icon:L.divIcon({className:'graticule-label',html:`${Math.abs(lat)}°${lat<0?'S':lat>0?'N':' ECUADOR'}`,iconSize:[60,10]})}));
  }
  for(const lon of [-100,-90,-80,-70])addMapLayer(L.polyline([[-26,lon],[6,lon]],{pane:'graticule',interactive:false,color:'#38bdf8',weight:.6,opacity:.2,dashArray:'3 4'}));
}
function reframe() {
  if (!state.map) return;
  if (state.kind==='observation') {state.map.fitBounds(state.oceanExtent==='pacific'?[[-22,-174],[7,-66]]:[[-19.5,-99],[1,-69]],{padding:[12,12]});return;}
  const feature=state.data.boundaries?.data.features.find(f=>f.properties.code===state.department);
  if (feature) state.map.fitBounds(L.geoJSON(feature).getBounds(),{padding:[30,30],maxZoom:9});
  else state.map.fitBounds([[-18.5,-82.5],[0.3,-68.4]],{padding:[25,35]});
}
function addMapLayer(layer) {layer.addTo(state.map);state.mapLayers.push(layer);}

function renderMap() {
  if (!state.map) return;
  state.mapLayers.forEach(l=>state.map.removeLayer(l));state.mapLayers=[];
  document.querySelectorAll('.map-no-data').forEach(el=>el.remove());
  const ocean=state.kind==='observation';$('nino34-inset').hidden=!ocean;$('ocean-readout').hidden=!ocean;$('pacific-view').hidden=!ocean;
  $('pacific-view').textContent=state.oceanExtent==='pacific'?'Ver costa peruana':'Ver Pacífico';
  document.querySelector('[data-map-mode="risk"]').innerHTML=`<i></i>Riesgo · ${HAZARDS[state.hazard]}`;
  document.querySelectorAll('[data-map-mode]').forEach(b=>{const active=b.dataset.mapMode===(ocean?'sst':state.layer);b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
  $('vectors-toggle').classList.toggle('selected',state.vectors&&ocean);$('vectors-toggle').setAttribute('aria-pressed',String(state.vectors&&ocean));
  const labels={observation:'ANÁLISIS NOAA',forecast:'PRONÓSTICO',risk_scenario:state.layer==='heat'?'INVENTARIO':'ESCENARIO'};
  $('map-title').textContent=state.kind==='observation'?'Anomalía de temperatura superficial del mar y corrientes geostróficas':state.kind==='forecast'?'Perspectiva meteorológica territorial':state.layer==='heat'?'Concentración de puntos críticos':'Distritos en riesgo alto o muy alto';
  $('map-eyebrow').textContent=state.kind==='observation'?'DOMINIO OCEÁNICO-ATMOSFÉRICO':state.kind==='forecast'?'PRONÓSTICOS · SENAMHI':'DOMINIO TERRITORIAL · CENEPRED';
  $('map-kind').textContent=labels[state.kind]; $('map-kind').className='pill '+({observation:'observation',forecast:'forecast',risk_scenario:'scenario'}[state.kind]);
  const groups=state.kind==='forecast'?forecastByDepartment(state.forecastRows,state.layer):riskByDepartment(state.data.cenepred_risk?.data??[],state.hazard,state.department);
  const values=new Map(groups.map(g=>[g.code,g]));
  let min=0,max=100;
  if (state.kind==='forecast' && state.layer!=='rain') {min=state.layer==='tmin'?-15:0;max=45;}
  const boundary=state.data.boundaries?.data;
  if (boundary) {
    state.polygons=L.geoJSON(boundary,{
      style:f=>{ const value=values.get(f.properties.code)?.value; const active=state.department==='all'||f.properties.code===state.department;
        return {color:active?'#63bed5':'#274158',weight:active?.9:.6,fillColor:state.kind==='observation'?'#0c1423':(state.kind==='risk_scenario'&&state.layer==='heat')?'#102a3b':colorFor(active?value:null,min,max),fillOpacity:active ? (state.kind==='observation'?.98:state.layer==='heat'?.68:.78) : .23}; },
      onEachFeature:(feature,layer)=>{
        const g=values.get(feature.properties.code);
        let detail=state.kind==='observation'?'No se distribuye el índice oceánico sobre departamentos.':state.kind==='forecast'?(g?`${fmt(g.value,1)} ${state.layer==='rain'?'% con mención de precipitación':'°C · promedio de localidades'}<br>${fmt(g.count)} localidades disponibles`:'Sin pronósticos en el periodo'):(g?`${fmt(g.high)} de ${fmt(g.total)} distritos clasificados en alto o muy alto (${fmt(g.value,1)}%)`:'Sin clasificación disponible');
        layer.bindTooltip(`<strong>${e(titleCase(feature.properties.name))}</strong><br>${detail}`,{sticky:true});
        layer.on('click',()=>{$('department').value=feature.properties.code;void applyFilters(true);});
      }
    });addMapLayer(state.polygons);
  }
  if (state.kind==='risk_scenario' && state.layer==='heat') {
    const points=selectedPoints(),cells=hexbinPoints(points);
    const cellLayers=cells.map(cell=>{
      const color=densityColor(cell.count);
      const polygon=L.polygon(cell.polygon,{color,weight:.7,opacity:.95,fillColor:color,fillOpacity:.92});
      polygon.bindTooltip(`<strong>${fmt(cell.count)} puntos documentados</strong><br>${e(cell.departments.map(titleCase).join(' / '))}<br>Celda de 30 km · clic para inspeccionar`,{sticky:true,className:'cell-tooltip'});
      polygon.bindPopup(`<strong>${fmt(cell.count)} puntos documentados</strong><br>${e(cell.departments.map(titleCase).join(' / '))}<br>${HAZARDS[state.hazard]}<br>Malla de 30 km · EPSG:3857<br>Inventario CENEPRED; no eventos en curso.<br>Usa + para ver ubicaciones exactas.`);
      polygon.on('click',()=>renderInspector(cell));
      return polygon;
    });
    addMapLayer(L.layerGroup(cellLayers));
    if (state.map.getZoom()>=8) addMapLayer(L.layerGroup(points.map(p=>L.circleMarker([p.lat,p.lon],{radius:3.2,color:'#06121f',weight:.8,fillColor:'#e0f2fe',fillOpacity:.95}).bindPopup(`<strong>${e(p.place||p.id)}</strong><br>${e(titleCase(p.district||p.department))}<br>${HAZARDS[p.hazard]}<br>Ficha: ${dateLabel(p.document_date)}<br>Inventario; no evento actual`))));
    densityLegend();
    $('map-overlay-note').textContent=`SIGRID · ${fmt(points.length)} puntos · ${fmt(cells.length)} celdas`;
    $('map-footnote').textContent='Conteo real en celdas fijas de 30 km entre centros (EPSG:3857; tamaño sobre el terreno aproximado). La escala se conserva al cambiar el zoom o el departamento. Cada punto se cuenta una vez. Las celdas no delimitan el área de peligro ni representan lluvia, severidad o emergencias actuales. Al acercar aparecen las ubicaciones exactas.';
    if (!points.length) showMapEmpty('Sin puntos documentados para la selección. No equivale a ausencia de peligro.');
  } else if (state.kind==='risk_scenario') {
    legend('Distritos en alto o muy alto','0%','100%');
    $('map-overlay-note').textContent='CENEPRED · Escenario distrital, marco 2025–2027';
    $('map-footnote').textContent='Porcentaje derivado de distritos con riesgo alto o muy alto, entre distritos clasificados. La categoría oficial es distrital; este porcentaje no es probabilidad ni una categoría departamental. Sin evolución diaria publicada.';
  } else if (state.kind==='forecast') {
    legend(state.layer==='rain'?'Mención de precipitación en pronósticos':`Temperatura ${state.layer==='tmin'?'mínima':'máxima'} media`,state.layer==='rain'?'0%':min+' °C',state.layer==='rain'?'100%':max+' °C','temperature');
    $('map-overlay-note').textContent='SENAMHI · Pronóstico de localidades disponibles';
    $('map-footnote').textContent=state.layer==='rain'?'Porcentaje de registros localidad/día cuyo texto menciona precipitación, dentro del periodo. No es probabilidad de lluvia, porcentaje del área ni milímetros. Consulte el texto oficial en el detalle.':'Promedio de temperaturas previstas para localidades y días disponibles en el periodo. No representa un promedio de superficie ni observaciones. Departamentos sin cobertura se muestran en gris.';
    if (!state.forecastRows.length) showMapEmpty('Sin pronósticos disponibles o archivados para el periodo elegido.');
  } else {
    const sst=selectedOcean('noaa_ocean_sst'),currents=selectedOcean('noaa_ocean_currents');
    state.activeSst=sst;state.activeCurrents=currents;
    if(sst){addMapLayer(oceanScalarLayer(sst.data,sst.meta.resolution_degrees));state.sstLookup=oceanIndex(sst.data,.25);}
    if(currents&&state.vectors)addMapLayer(oceanVectorLayer(currents.data));
    addGraticule();
    const latest=selectNoaa(state.data[state.frequency==='weekly'?'noaa_weekly':'noaa_monthly']?.data??[],state,state.frequency==='monthly').at(-1);
    for(const r of [{name:'NIÑO 1+2',bounds:[[-10,-90],[0,-80]],field:'nino12_anomaly'},{name:'NIÑO 3.4',bounds:[[-5,-170],[5,-120]],field:'nino34_anomaly'}]){
      const region=L.rectangle(r.bounds,{color:r.name==='NIÑO 1+2'?'#f87171':'#38bdf8',weight:1.5,dashArray:'7 5',fillColor:r.name==='NIÑO 1+2'?'#ef4444':'#38bdf8',fillOpacity:.035});
      if(r.name==='NIÑO 1+2'||state.oceanExtent==='pacific')region.bindTooltip(`<span>REGIÓN ${r.name}</span><br><span>${r.name==='NIÑO 1+2'?'0°–10°S / 90°W–80°W':'5°N–5°S / 170°W–120°W'}</span><strong>${latest?(latest[r.field]>0?'+':'')+fmt(latest[r.field],2)+' °C':'Sin dato'}</strong><span class="region-date">CPC · ${latest?dateLabel(latest.date):'Sin observación'}</span>`,{permanent:true,direction:'center',className:'nino-region-label'});
      addMapLayer(region);
    }
    coastalMarkers();
    legend('ANOMALÍA TSM · OISST v2.1','−3 °C','+6 °C o más','anomaly');
    $('map-legend').querySelector('.legend-empty').textContent='Sin celda coloreada: máscara o sin dato NOAA';
    $('map-legend').innerHTML+='<div class="legend-empty">Campo diario preliminar NOAA · celdas 0,25°<br>Flechas: dirección geostrófica; no deriva prevista.</div>';
    $('ocean-date').textContent=sst?dateLabel(sst.meta.latest_date):'Sin campo para el periodo';
    $('current-date').textContent=currents?`${dateLabel(currents.meta.latest_date)}${(new Date(limaDate())-new Date(currents.meta.latest_date))/86400000>7?' · REZAGO':''}`:'Sin campo para el periodo';
    $('map-overlay-note').textContent=`TSM: ${sst?dateLabel(sst.meta.latest_date):'sin dato en periodo'} · Corrientes: ${currents&&state.vectors?dateLabel(currents.meta.latest_date):'ocultas / sin dato'}`;
    $('map-footnote').textContent='TSM y anomalía: análisis preliminar diario OISST de NOAA. Las flechas muestran direcciones del análisis geostrófico experimental en su fecha publicada; la animación no es un pronóstico de deriva. Los recuadros Niño usan índices CPC con fecha propia. Marcadores costeros: conteos de distritos CENEPRED, no anomalías de ciudades ni emergencias actuales.';
    if(!sst&&!latest)showMapEmpty('Sin campo oceánico ni índices publicados para el periodo seleccionado. Consulte otra fecha.');
  }
  if (boundary) {
    addMapLayer(L.geoJSON(boundary,{pane:'borders',interactive:false,style:f=>({color:state.department==='all'||f.properties.code===state.department?'#91d4e4':'#35546a',weight:state.department===f.properties.code?2:1,opacity:.8,fill:false})}));
    if (state.kind!=='observation') {
      const overviewLabels=new Set(['LORETO','PIURA','LA LIBERTAD','LIMA','CUSCO','AREQUIPA','PUNO']);
      for (const feature of boundary.features) {
        if (state.department!=='all' && feature.properties.code!==state.department) continue;
        if (state.department==='all' && state.map.getZoom()<7 && !overviewLabels.has(normalize(feature.properties.name))) continue;
        const layer=L.geoJSON(feature),center=layer.getBounds().getCenter();
        addMapLayer(L.marker(center,{pane:'labels',interactive:false,keyboard:false,icon:L.divIcon({className:'department-label',html:e(titleCase(feature.properties.name)),iconSize:[100,16],iconAnchor:[50,8]})}));
      }
    }
  }
  renderInspector();
  renderRanking(groups);
}
function showMapEmpty(text) { const el=document.createElement('div');el.className='map-no-data';el.textContent=text;$('map').parentNode.append(el); }

function renderRanking(groups) {
  if (state.kind==='observation') {
    $('ranking-title').textContent='La señal del Pacífico';
    $('ranking-subtitle').textContent='Índices oceánicos de NOAA CPC; estado oficial en el comunicado de ENFEN.';
    const rows=selectNoaa(state.data[state.frequency==='weekly'?'noaa_weekly':'noaa_monthly']?.data??[],state,state.frequency==='monthly');
    const last=rows.at(-1);
    $('ranking').innerHTML=[['Niño 1+2','nino12_anomaly'],['Niño 3.4','nino34_anomaly']].map(([label,field],i)=>rankRow(i,label,last?.[field],last?dateLabel(last.date):'Sin observación en el periodo','°C',null)).join('');
    $('executive-note').innerHTML='<span class="note-kicker">CRITERIO DE LECTURA</span>La anomalía de Niño 1+2 no equivale al ICEN. La de Niño 3.4 no equivale al ONI ni al RONI. El diagnóstico y la alerta se consultan en ENFEN.';
    return;
  }
  const forecast=state.kind==='forecast';
  $('ranking-title').textContent=forecast?'Perspectiva por departamento':'Dónde concentrar la mirada';
  $('ranking-subtitle').textContent=forecast?(state.layer==='rain'?'Mención de precipitación en registros de localidad y día. No es probabilidad.':'Departamentos ordenados por temperatura prevista media de localidades disponibles.'):`${HAZARDS[state.hazard]}: porcentaje de distritos clasificados en riesgo alto o muy alto.`;
  const max=Math.max(1,...groups.map(g=>g.value??0));
  $('ranking').innerHTML=groups.slice(0,5).map((g,i)=>rankRow(i,titleCase(g.name),g.value,forecast?`${fmt(g.count)} localidades`:`${fmt(g.high)} de ${fmt(g.total)} distritos clasificados`,forecast&&state.layer!=='rain'?'°C':'%',max)).join('')||'<p class="no-rank">Sin datos para la selección actual.</p>';
  $('executive-note').innerHTML=forecast?'<span class="note-kicker">ALCANCE DEL PRONÓSTICO</span>La lluvia se conserva como descripción oficial. SENAMHI no publica milímetros ni probabilidades en esta tabla. La cobertura varía por departamento.':'<span class="note-kicker">CONTEXTO DEL ESCENARIO</span>El calendario no cambia las categorías de este servicio 2025–2027. Los puntos críticos son un inventario documentado; su densidad no mide emergencias actuales.';
}
function rankRow(i,label,value,detail,unit,max) {
  const width=max&&value!=null?Math.max(0,Math.min(100,100*value/max)):0;
  return `<div class="rank-row"><span class="rank-number">${String(i+1).padStart(2,'0')}</span><div class="rank-content"><div class="rank-label"><span>${e(label)}</span><span class="value">${fmt(value,1)} ${unit}</span></div>${max?`<div class="rank-track"><div class="rank-bar" style="width:${width}%"></div></div>`:''}<div class="rank-detail">${e(detail)}</div></div></div>`;
}

function chartConfig(labels,datasets) {
  return {type:'line',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',align:'start',labels:{usePointStyle:true,pointStyle:'circle',boxWidth:6,boxHeight:6,padding:18,font:{size:10},color:'#9db7d3'}},tooltip:{backgroundColor:'#12273d',padding:10,titleFont:{size:10},bodyFont:{size:10}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:6,color:'#88a6c5',font:{size:9}},border:{display:false}},y:{grid:{color:'#26394d'},ticks:{color:'#88a6c5',font:{size:9},padding:8},border:{display:false},title:{display:true,text:'°C',font:{size:9},color:'#88a6c5'}}}}};
}
function renderCharts() {
  if (!window.Chart) return;
  const monthly=state.frequency==='monthly';
  const rows=selectNoaa(state.data[monthly?'noaa_monthly':'noaa_weekly']?.data??[],state,monthly);
  $('noaa-empty').hidden=rows.length>0;
  const labels=rows.map(r=>monthly?r.date.slice(0,7):dateLabel(r.date));
  const config=chartConfig(labels,[{label:'Niño 1+2',data:rows.map(r=>r.nino12_anomaly),borderColor:'#ef4444',backgroundColor:'#ef444418',fill:false,borderWidth:2,pointRadius:rows.length>100?0:2,tension:0,spanGaps:false},{label:'Niño 3.4',data:rows.map(r=>r.nino34_anomaly),borderColor:'#38bdf8',backgroundColor:'#38bdf812',fill:false,borderWidth:2,pointRadius:rows.length>100?0:2,tension:0,spanGaps:false}]);
  config.plugins=[{id:'numeric-anomaly-bands',beforeDraw(chart){const {ctx,chartArea:area,scales:{y}}=chart;if(!area)return;ctx.save();for(const [low,high,color] of [[-10,-.5,'#38bdf810'],[-.5,.5,'#94a3b808'],[.5,1,'#eab3080d'],[1,1.5,'#f59e0b10'],[1.5,2,'#f9731614'],[2,10,'#ef44441b']]){const top=Math.max(area.top,y.getPixelForValue(high)),bottom=Math.min(area.bottom,y.getPixelForValue(low));if(bottom>top){ctx.fillStyle=color;ctx.fillRect(area.left,top,area.right-area.left,bottom-top);}}ctx.restore();}}];
  if (state.noaaChart) {state.noaaChart.data=config.data;state.noaaChart.update();} else state.noaaChart=new Chart($('noaa-chart'),config);
  $('series-count').textContent=`${fmt(rows.length)} publicaciones oficiales en el periodo`;
  $('noaa-note').textContent=`Frecuencia ${monthly?'mensual oficial (mes completo)':'semanal (centro de semana)'}. Cada punto conserva su fecha original. Sin interpolación diaria. Los índices oceánicos no se filtran por departamento. Bandas de color: intervalos numéricos, sin declarar una categoría de evento.`;
  const forecasts=forecastByDate(state.forecastRows);
  $('forecast-empty').hidden=forecasts.length>0;
  const fc=chartConfig(forecasts.map(r=>dateLabel(r.date)),[{label:'Máxima prevista',data:forecasts.map(r=>r.tmax),borderColor:'#fb923c',backgroundColor:'#fb923c10',pointRadius:3,borderWidth:2,tension:0},{label:'Mínima prevista',data:forecasts.map(r=>r.tmin),borderColor:'#38bdf8',pointRadius:3,borderWidth:2,tension:0}]);
  if (state.forecastChart) {state.forecastChart.data=fc.data;state.forecastChart.update();} else state.forecastChart=new Chart($('forecast-chart'),fc);
}

function renderForecastTable() {
  const search=normalize($('forecast-search').value);
  const rows=state.forecastRows.filter(r=>normalize(r.locality+' '+r.department).includes(search));
  state.forecastPage=Math.min(state.forecastPage,Math.max(0,Math.ceil(rows.length/PAGE)-1));
  const start=state.forecastPage*PAGE;
  $('forecast-body').innerHTML=rows.slice(start,start+PAGE).map(r=>`<tr><td>${e(titleCase(r.locality))}<span class="cell-sub">${e(titleCase(r.department))}</span></td><td>${dateLabel(r.valid_date)}<span class="cell-sub">Consultado: ${dateLabel(limaDate(r.collected_at))}</span></td><td class="temperature-max">${fmt(r.tmax_c,1)} °C</td><td class="temperature-min">${fmt(r.tmin_c,1)} °C</td><td>${e(r.description)}<span class="cell-sub">Cantidad (mm) y probabilidad: no publicadas</span></td><td><a class="text-link" href="${e(safeUrl(r.source_url))}" target="_blank" rel="noopener" aria-label="Ver pronóstico oficial de ${e(r.locality)}">SENAMHI ↗</a></td></tr>`).join('')||'<tr><td colspan="6" class="empty-row">Sin pronósticos disponibles o archivados para este filtro. No se extrapolan días sin publicación.</td></tr>';
  $('forecast-count').textContent=rows.length?`${fmt(start+1)}–${fmt(Math.min(start+PAGE,rows.length))} de ${fmt(rows.length)} registros`:'0 registros';
  $('forecast-prev').disabled=state.forecastPage===0; $('forecast-next').disabled=start+PAGE>=rows.length;
  const dates=[...new Set(state.forecastRows.map(r=>r.valid_date))].sort();
  $('forecast-summary').textContent=dates.length?`Validez disponible: ${dateLabel(dates[0])} a ${dateLabel(dates.at(-1))}. Lluvia cualitativa; temperaturas en °C.`:'La tabla conserva únicamente lo publicado y archivado; los periodos sin cobertura permanecen vacíos.';
}

function renderZones() {
  const points=state.table==='points';
  $('risk-level').disabled=points; $('document-date-wrap').hidden=!points;
  const search=normalize($('zone-search').value),level=$('risk-level').value;
  const rows=(points?selectedPoints():selectedRisks().filter(r=>level==='all'||(level==='high'?highRisk(r.risk_level):r.risk_level===level))).filter(r=>normalize([r.department,r.province,r.district,r.place,r.ubigeo].filter(Boolean).join(' ')).includes(search));
  if (!points) rows.sort((a,b)=>({"Muy alto":0,Alto:1,Medio:2,Bajo:3}[a.risk_level]??4)-({"Muy alto":0,Alto:1,Medio:2,Bajo:3}[b.risk_level]??4)||a.department.localeCompare(b.department,'es')||a.district.localeCompare(b.district,'es'));
  else rows.sort((a,b)=>(b.document_date??'').localeCompare(a.document_date??'')||a.id.localeCompare(b.id));
  state.zoneRows=rows;
  state.zonePage=Math.min(state.zonePage,Math.max(0,Math.ceil(rows.length/PAGE)-1));
  const start=state.zonePage*PAGE;
  $('zone-head').innerHTML=points?'<tr><th>Sector / lugar</th><th>Distrito / provincia</th><th>Departamento</th><th>Peligro</th><th>Fecha de ficha</th><th>Referencia</th></tr>':'<tr><th>Distrito / provincia</th><th>Departamento</th><th>UBIGEO</th><th>Peligro</th><th>Riesgo oficial</th><th>Referencia</th></tr>';
  $('zone-body').innerHTML=rows.slice(start,start+PAGE).map(r=>points?`<tr><td>${e(r.place||r.id)}<span class="cell-sub">Inventario georreferenciado · ${e(r.id)}</span></td><td>${e(titleCase(r.district))}<span class="cell-sub">${e(titleCase(r.province))}</span></td><td>${e(titleCase(r.department))}</td><td>${HAZARDS[r.hazard]}</td><td>${dateLabel(r.document_date)}</td><td><a class="text-link" href="${e(safeUrl(r.document_url))}" target="_blank" rel="noopener">${r.document_url?'Ficha':'SIGRID'} ↗</a></td></tr>`:`<tr data-ubigeo="${e(r.ubigeo)}" tabindex="0"><td>${e(titleCase(r.district))}<span class="cell-sub">${e(titleCase(r.province))}</span></td><td>${e(titleCase(r.department))}</td><td>${e(r.ubigeo)}</td><td>${HAZARDS[r.hazard]}</td><td><span class="level level-${r.risk_level?r.risk_level.toLowerCase().replaceAll(' ','-'):'none'}">${e(r.risk_level||'Sin categoría')}</span></td><td><a class="text-link" href="https://sig.cenepred.gob.pe/sigrid/rest/services/ER_LLUVIAS_PM_2025_2027/MapServer/${r.hazard==='inundacion'?9:8}" target="_blank" rel="noopener">SIGRID ↗</a></td></tr>`).join('')||'<tr><td colspan="6" class="empty-row">Sin registros para los filtros elegidos. La falta de datos no equivale a ausencia de riesgo.</td></tr>';
  $('zone-count').textContent=rows.length?`${fmt(start+1)}–${fmt(Math.min(start+PAGE,rows.length))} de ${fmt(rows.length)} ${points?'puntos documentados':'distritos'}`:'0 registros';
  $('zone-prev').disabled=state.zonePage===0; $('zone-next').disabled=start+PAGE>=rows.length;
  $('zone-context').textContent=points?'La fecha corresponde al documento técnico, no a un evento actual. El filtro de fecha es opcional. Registros sin fecha quedan fuera al activarlo. Una ficha puede tener varios puntos.':'Categoría distrital publicada por CENEPRED. El servicio 2025–2027 no informa evolución diaria ni fecha de emisión individual. El calendario general no modifica este escenario.';
}

function renderSources() {
  const providers=[{name:'ENFEN',ids:['enfen'],url:'https://enfen.imarpe.gob.pe/comunicados/'},{name:'SENAMHI',ids:['senamhi_forecast'],url:'https://www.senamhi.gob.pe/?p=pronostico-meteorologico'},{name:'NOAA',ids:['noaa_weekly','noaa_monthly','noaa_ocean_sst','noaa_ocean_currents'],url:'https://www.cpc.ncep.noaa.gov/data/indices/'},{name:'CENEPRED',ids:['cenepred_risk','cenepred_points','boundaries'],url:'https://sigrid.cenepred.gob.pe/sigridv3/'}];
  const order={ok:0,stale:1,degraded:2,unavailable:3};
  $('source-cards').innerHTML=providers.map(p=>{
    const sources=p.ids.map(id=>state.manifest.sources.find(s=>s.id===id)).filter(Boolean);
    const status=sources.map(clientStatus).sort((a,b)=>order[b]-order[a])[0]??'unavailable';
    return `<article class="source-card"><div class="source-card-header"><h3>${p.name}</h3><span class="source-state ${status}">${STATUS[status]}</span></div>${sources.map(s=>`<div class="source-item"><div class="source-title">${e(s.title)}</div><div class="source-meta">${fmt(s.records??0)} registros · ${STATUS[clientStatus(s)]}<br>${s.latest_date?'Último dato: '+dateLabel(s.latest_date):'Fecha temporal: no informada en API'}<br>Consulta: ${timestamp(s.last_success)}<br>${e(s.cadence)}${s.data_sha256?`<br>SHA-256: ${e(s.data_sha256.slice(0,12))}…`:''}</div>${s.error?`<div class="source-error">${e(s.error)}${s.last_success?' · Se conserva la última versión válida.':''}</div>`:''}<div class="source-links"><a class="text-link" href="${e(safeUrl(s.url,p.url))}" target="_blank" rel="noopener">Origen ↗</a>${s.last_success?`<a class="text-link" href="data/${e(s.file??s.id+'.json')}" target="_blank" rel="noopener">Datos y trazabilidad ↗</a>`:''}</div></div>`).join('')}<a href="${p.url}" target="_blank" rel="noopener">Referencia oficial ↗</a></article>`;
  }).join('');
}

let rendering=0;
async function applyFilters(fit=false) {
  if (!readFilters()) return;
  const turn=++rendering;
  state.forecastPage=0;state.zonePage=0;
  await Promise.all([ensureForecastHistory(),ensureOceanHistory()]);
  try {await ensurePoints();} catch (error) {$('filter-notice').textContent='No se pudo cargar el inventario geográfico. Las otras fuentes conservan su disponibilidad.';console.error(error);}
  if (turn!==rendering) return;
  state.forecastRows=selectForecasts(state.versions,state);
  $('filter-notice').textContent=`${dateLabel(state.from)} – ${dateLabel(state.to)}. El calendario filtra fechas de observación y validez de pronósticos. CENEPRED conserva su marco 2025–2027; ENFEN muestra el último comunicado verificado.`;
  renderKpis();renderMap();renderCharts();renderForecastTable();renderZones();
  if (fit) reframe();
}

function setKind(kind) {
  state.kind=kind;
  document.querySelectorAll('[data-kind]').forEach(b=>{b.classList.toggle('selected',b.dataset.kind===kind);b.setAttribute('aria-pressed',String(b.dataset.kind===kind));});
  const options=kind==='risk_scenario'?[['heat','Concentración · celdas de 30 km'],['risk','Distritos en riesgo alto o muy alto']]:kind==='forecast'?[['tmax','Temperatura máxima'],['tmin','Temperatura mínima'],['rain','Mención de precipitación']]:[['sst','Anomalía diaria · OISST']];
  $('map-layer').innerHTML=options.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
  state.layer=options[0][0];$('hazard-wrap').hidden=kind!=='risk_scenario';
  state.oceanExtent='coast';renderMap();reframe();
}
async function exportData() {
  let rows,fields;
  if (state.kind==='forecast') {rows=state.forecastRows;fields=['locality_id','locality','department','valid_date','tmax_c','tmin_c','description','precipitation_mm','precipitation_probability','collected_at','source_url'];}
  else if (state.kind==='observation') {rows=selectNoaa(state.data[state.frequency==='monthly'?'noaa_monthly':'noaa_weekly']?.data??[],state,state.frequency==='monthly');fields=['date','period_end','nino12_sst','nino12_anomaly','nino34_sst','nino34_anomaly'];}
  else if (state.layer==='heat') {
    const source=state.manifest.sources.find(s=>s.id==='cenepred_points');
    if (!state.data.cenepred_points && source?.last_success) state.data.cenepred_points=await getJson('./data/'+source.file);
    rows=selectedPoints();fields=['id','department','province','district','place','hazard','lat','lon','document_date','document_url'];
  }
  else {rows=selectedRisks();fields=['ubigeo','department','province','district','hazard','risk_level'];}
  const url=URL.createObjectURL(new Blob([csv(rows,fields)],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`elnino_${state.kind}_${state.from}_${state.to}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function bindEvents() {
  $('filters').addEventListener('submit',event=>event.preventDefault());
  for (const id of ['from','to','month','department']) $(id).addEventListener('change',()=>void applyFilters(id==='department'));
  $('period').addEventListener('change',()=>{updatePeriodInputs();void applyFilters();});
  $('reset').addEventListener('click',()=>{setDefaults();$('forecast-search').value='';$('zone-search').value='';$('document-date').checked=false;void applyFilters(true);});
  document.querySelectorAll('[data-kind]').forEach(b=>b.addEventListener('click',()=>setKind(b.dataset.kind)));
  document.querySelectorAll('[data-map-mode]').forEach(b=>b.addEventListener('click',()=>{const mode=b.dataset.mapMode;setKind(mode==='sst'?'observation':mode==='rain'?'forecast':'risk_scenario');if(mode!=='sst'){state.layer=mode;$('map-layer').value=mode;renderMap();}}));
  $('vectors-toggle').addEventListener('click',()=>{if(state.kind!=='observation'){state.vectors=true;setKind('observation');}else{state.vectors=!state.vectors;renderMap();}});
  const pacific=()=>{state.oceanExtent=state.oceanExtent==='pacific'?'coast':'pacific';renderMap();reframe();};
  $('pacific-view').addEventListener('click',pacific);$('nino34-inset').addEventListener('click',pacific);
  document.querySelectorAll('[data-department]').forEach(b=>b.addEventListener('click',()=>{state.inspectorDepartment=b.dataset.department;state.inspectorDistrict=null;renderInspector();if(state.kind==='observation')renderMap();}));
  const inspectRow=event=>{const row=event.target.closest('tr[data-ubigeo]');if(!row)return;const record=selectedRisks().find(r=>r.ubigeo===row.dataset.ubigeo);if(!record)return;state.inspectorDepartment=record.department_code;state.inspectorDistrict=record;renderInspector();};
  $('zone-body').addEventListener('click',inspectRow);$('zone-body').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();inspectRow(event);}});
  $('map-layer').addEventListener('change',()=>{state.layer=$('map-layer').value;renderMap();});
  $('hazard').addEventListener('change',()=>{state.hazard=$('hazard').value;state.zonePage=0;renderKpis();renderMap();renderZones();});
  $('map-reset').addEventListener('click',reframe);
  const toggleMap=expanded=>{
    document.querySelector('.map-panel').classList.toggle('expanded',expanded);document.body.classList.toggle('map-expanded',expanded);
    $('map-expand').setAttribute('aria-expanded',String(expanded));$('map-expand').textContent=expanded?'Cerrar mapa':'Ampliar mapa';
    requestAnimationFrame(()=>{state.map.invalidateSize();reframe();});
  };
  $('map-expand').addEventListener('click',()=>toggleMap($('map-expand').getAttribute('aria-expanded')!=='true'));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('map-expand').getAttribute('aria-expanded')==='true'){toggleMap(false);$('map-expand').focus();}});
  $('frequency').addEventListener('change',()=>{state.frequency=$('frequency').value;renderKpis();renderCharts();if(state.kind==='observation')renderMap();});
  $('forecast-search').addEventListener('input',()=>{state.forecastPage=0;renderForecastTable();});
  $('forecast-prev').addEventListener('click',()=>{state.forecastPage--;renderForecastTable();});$('forecast-next').addEventListener('click',()=>{state.forecastPage++;renderForecastTable();});
  $('zone-search').addEventListener('input',()=>{state.zonePage=0;renderZones();});$('risk-level').addEventListener('change',()=>{state.zonePage=0;renderZones();});
  $('document-date').addEventListener('change',()=>{state.zonePage=0;renderZones();renderMap();});
  $('zone-prev').addEventListener('click',()=>{state.zonePage--;renderZones();});$('zone-next').addEventListener('click',()=>{state.zonePage++;renderZones();});
  document.querySelectorAll('[data-table]').forEach(b=>b.addEventListener('click',async()=>{
    state.table=b.dataset.table;state.zonePage=0;
    document.querySelectorAll('[data-table]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});
    if (state.table==='points' && !state.data.cenepred_points) {
      $('zone-body').innerHTML='<tr><td colspan="6" class="empty-row">Cargando fichas del inventario oficial…</td></tr>';
      try {await ensurePoints();} catch {$('zone-body').innerHTML='<tr><td colspan="6" class="empty-row">No se pudo descargar el detalle del inventario. Reintente más tarde.</td></tr>';return;}
    }
    renderZones();
  }));
  $('download').addEventListener('click',exportData);
  const tickClock=()=>{$('clockPET').textContent=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date())+' LIMA · UTC−5';};tickClock();setInterval(tickClock,30000);
  state.map?.on('mousemove',event=>{if(state.kind!=='observation'||!state.activeSst)return;const lat=Math.floor(event.latlng.lat/.25)*.25+.125,lon=Math.floor(event.latlng.lng/.25)*.25+.125,row=state.sstLookup?.get(`${Math.round(lat/.25)}:${Math.round(lon/.25)}`);$('ocean-date').textContent=row?`${fmt(row.sst_c,1)} °C · anom. ${row.anomaly_c>0?'+':''}${fmt(row.anomaly_c,1)} °C`:'Celda sin dato';});
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)document.querySelectorAll('.nav-link').forEach(a=>a.classList.toggle('active',a.hash==='#'+entry.target.id));},{rootMargin:'-10% 0px -65% 0px'});
  document.querySelectorAll('section[id]').forEach(s=>observer.observe(s));
  state.map?.on('zoomend',()=>{if(state.kind==='risk_scenario'&&state.layer==='heat')renderMap();});
}

try {
  setDefaults();await loadData();initMap();bindEvents();await applyFilters(true);
  setInterval(()=>void refreshPublication(),15*60*1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshPublication();});
} catch(error) {
  $('load-message').hidden=false;$('load-message').classList.add('error');
  $('load-message').textContent='No se pudo cargar el conjunto de datos publicado. Revise la conexión y el estado de las ejecuciones en GitHub Actions.';
  console.error(error);
}
