import {oceanScalarLayer, oceanVectorLayer} from './ocean.mjs';
import {GLOSSARY,GLOSSARY_CATEGORIES} from './glossary.mjs';
import {forecastDates,frameRows,weatherByDistrict,rainColor,weatherMotionLayer} from './weather.mjs';
import {normalize, inRange, highRisk, mean, limaDate, selectNoaa, selectForecasts, riskByDepartment, forecastByDepartment, forecastByDate, territorialCoverage, forecastSummary, districtOptions, pointMatchesDistrict, csv, hexbinPoints} from './selectors.mjs';

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
const STATUS = {ok:'Disponible',stale:'Dato antiguo',degraded:'Falló la revisión',unavailable:'Sin datos'};
const anomalyWords=(value,digits=1)=>value==null?'Sin dato para estas fechas':value===0?'Igual a lo habitual':`${fmt(Math.abs(value),digits)} °C más ${value>0?'caliente':'frío'} de lo habitual`;
const state = {kind:'observation',layer:'sst',vectors:true,oceanExtent:'national',inspectorDepartment:'all',inspectorDistrict:null,district:'all',hazard:'inundacion',frequency:'weekly',table:'districts',forecastPage:0,zonePage:0,from:'',to:'',department:'all',data:{},versions:[],forecastRows:[],zoneRows:[],history:[],map:null,mapLayers:[],territoryMarkers:[],polygons:null,noaaChart:null,forecastChart:null};
const networkCache = new Map();
Object.assign(state,{forecastProvider:'gfs',gridVersions:[],gridHistory:[],frameDate:'all',weatherMotion:!matchMedia('(prefers-reduced-motion: reduce)').matches,playing:false});
const modelWeather=()=>state.forecastProvider==='gfs';
const weatherProvider=()=>modelWeather()?'NOAA GFS':'SENAMHI';
const mapForecastRows=()=>frameRows(state.forecastRows,state.frameDate);
const contextForecastRows=()=>modelWeather()&&state.district!=='all'?frameRows(selectForecasts(state.gridVersions,{...state,district:'all'}),state.frameDate):mapForecastRows();
const windowLabel=row=>row?.valid_start?`${timestamp(row.valid_start)} → ${timestamp(row.valid_end)}`:row?dateLabel(row.valid_date):'Sin ventana disponible';
const compactScreen=()=>window.matchMedia('(max-width:767px), (max-width:1023px) and (max-height:600px)').matches;
const PAGE = compactScreen()?6:12;

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
  const maxHours = source.kind === 'reference' ? 1440 : 72;
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
  state.district='all';state.inspectorDistrict=null;
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
  if(state.department!==$('department').value){state.district='all';state.inspectorDistrict=null;}
  state.department=$('department').value;
  if (!state.from || !state.to || state.from>state.to) {
    $('filter-notice').textContent='Elige un periodo válido: la fecha inicial debe ser anterior o igual a la final.';
    $('filter-notice').closest('details').open=true;
    return false;
  }
  return true;
}

async function loadData() {
  const manifest=await getJson('./data/manifest.json'); state.manifest=manifest;
  const geometryHash=manifest.sources.find(s=>s.id==='district_boundaries')?.data_sha256;
  if(state.districtGeometryHash!==geometryHash){state.districtFeaturesByDepartment={};state.districtGeometryHash=geometryHash;delete state.data.district_boundaries;}
  const needed=manifest.sources.filter(s=>s.last_success && !['cenepred_points','district_boundaries'].includes(s.id));
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
    $('inspector-department').innerHTML='<option value="all">Todo el Perú</option>'+departments.map(f=>`<option value="${e(f.properties.code)}">${e(titleCase(f.properties.name))}</option>`).join('');
    state.departmentNames=Object.fromEntries(boundary.features.map(f=>[f.properties.code,normalize(f.properties.name)]));
  }
  state.oceanVersions=Object.fromEntries(['noaa_ocean_sst','noaa_ocean_currents'].map(id=>[id,state.data[id]?[state.data[id]]:[]]));
  try{state.oceanHistory=(await getJson('./data/ocean_history.json')).versions;}catch{state.oceanHistory=[];}
  if (state.data.senamhi_forecast) state.versions=[state.data.senamhi_forecast];
  state.gridVersions=state.data.district_forecast?[state.data.district_forecast]:[];
  try{state.gridHistory=(await getJson('./data/district_forecast_history.json')).versions;}catch{state.gridHistory=[];}
  try { state.history=(await getJson('./data/forecast_history.json')).versions; } catch {state.history=[];}
  const bulletin=state.data.enfen?.data;
  if (bulletin) {
    $('alert-strip').hidden=false; $('enfen-state').textContent=bulletin.alert;
    $('enfen-date').textContent=`${dateLabel(bulletin.published_date)} · último comunicado verificado`;
    $('enfen-link').href=safeUrl(bulletin.document_url,'https://enfen.imarpe.gob.pe/comunicados/');
  }
  $('updated').textContent=`Última ejecución: ${timestamp(manifest.generated_at)}`;
  renderHealth();
  $('history-note').textContent=manifest.history_start?`Guardamos pronósticos desde el ${dateLabel(limaDate(manifest.history_start))}. Solo puedes consultar pronósticos anteriores si quedaron guardados. Los datos del mar tienen series oficiales desde 1981/1982.`:'Aún no hay archivo histórico de pronósticos.';
  renderSources();
}

function renderHealth() {
  const operational=state.manifest.sources.filter(s=>s.kind!=='reference');
  const ok=operational.filter(s=>clientStatus(s)==='ok').length;
  $('global-status').innerHTML=`<i></i>${ok} de ${operational.length} fuentes al día`;
  $('global-status').classList.toggle('degraded',ok!==operational.length);
}

async function ensureGridHistory(){
  const choices=new Map();
  for(const v of state.gridHistory){
    if(v.valid_from>state.to||v.valid_to<state.from||limaDate(v.collected_at)>state.to)continue;
    for(let day=new Date(v.valid_from+'T12:00:00Z');day.toISOString().slice(0,10)<=v.valid_to;day.setUTCDate(day.getUTCDate()+1)){
      const date=day.toISOString().slice(0,10);if(inRange(date,state.from,state.to)&&limaDate(v.collected_at)<=date&&(!choices.has(date)||choices.get(date).collected_at<v.collected_at))choices.set(date,v);
    }
  }
  const known=new Set(state.gridVersions.map(v=>v.meta.data_sha256));
  await Promise.allSettled([...new Map([...choices.values()].map(v=>[v.path,v])).values()].filter(v=>!known.has(v.sha256)&&/^history\/grids\/\d{4}-\d{2}-\d{2}T\d{6}Z-[a-f0-9]+\.json\.gz$/.test(v.path)).map(async v=>{state.gridVersions.push(await getJson('./data/'+v.path));}));
}
function refreshWeatherRows(){
  state.forecastRows=selectForecasts(modelWeather()?state.gridVersions:state.versions,state);
  const dates=forecastDates(state.forecastRows);
  if(state.frameDate!=='all'&&!dates.includes(state.frameDate))state.frameDate=dates.find(d=>d>=limaDate())??dates.at(-1)??'all';
}
function renderTimeline(){
  const forecast=state.kind==='forecast';$('weather-controls').hidden=!forecast;$('map-layer-wrap').hidden=forecast;
  $('forecast-provider-wrap').hidden=!forecast;$('forecast-provider').value=state.forecastProvider;$('weather-provider').value=state.forecastProvider;
  const dates=forecastDates(state.forecastRows);
  $('forecast-frame').innerHTML='<option value="all">Resumen del periodo</option>'+dates.map(d=>`<option value="${d}">${e(dateLabel(d))}</option>`).join('');
  $('weather-metric').innerHTML=[['tmax','Temperatura máxima'],['tmin','Temperatura mínima'],['rain',modelWeather()?'Lluvia · mm / 24 h':'Textos que mencionan lluvia']].map(([v,label])=>`<option value="${v}">${label}</option>`).join('');$('weather-metric').value=['tmax','tmin','rain'].includes(state.layer)?state.layer:'tmax';
  $('forecast-frame').value=state.frameDate;$('forecast-frame').disabled=!dates.length;
  $('map-play').disabled=dates.length<2;$('map-play').textContent=state.playing?'Pausar fechas':'Reproducir fechas';$('map-play').setAttribute('aria-pressed',String(state.playing));
  $('weather-motion').textContent=state.weatherMotion?'Efectos activados':'Efectos pausados';$('weather-motion').setAttribute('aria-pressed',String(state.weatherMotion));
  $('weather-motion-note').textContent=modelWeather()?'Las gotas y los pulsos ayudan a ver la lluvia y el calor. No muestran hacia dónde se desplazan.':'Puedes recorrer las fechas disponibles del pronóstico SENAMHI.';
}
let playbackTimer;
function stopPlayback(){clearInterval(playbackTimer);state.playing=false;if($('map-play')){$('map-play').textContent='Reproducir fechas';$('map-play').setAttribute('aria-pressed','false');}}
function startPlayback(){
  const dates=forecastDates(state.forecastRows);if(dates.length<2)return;
  stopPlayback();state.playing=true;
  const advance=()=>{if(document.hidden)return;state.frameDate=dates[(dates.indexOf(state.frameDate)+1)%dates.length];renderMap();};
  advance();playbackTimer=setInterval(advance,2200);
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
    } else {renderHealth();renderSources();renderInsights();}
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
  const district=selectedDistrict();
  return allPoints().filter(r=>r.hazard===state.hazard && pointMatchesDepartment(r) && (state.district==='all'||pointMatchesDistrict(r,district)) && (!$('document-date').checked || inRange(r.document_date,state.from,state.to)));
}
function selectedRisks() {return (state.data.cenepred_risk?.data??[]).filter(r=>r.hazard===state.hazard && (state.department==='all'||r.department_code===state.department) && (state.district==='all'||r.ubigeo===state.district));}
function selectedDistrict(){
  if(state.district==='all')return null;
  const rows=state.data.cenepred_risk?.data??[],record=rows.find(r=>r.ubigeo===state.district&&r.hazard===state.hazard);
  if(record)return record;
  const metadata=rows.find(r=>r.ubigeo===state.district);return metadata?{...metadata,hazard:state.hazard,risk_level:null}:null;
}
async function ensureDistrictBoundaries(){
  if(state.department==='all'||state.districtFeaturesByDepartment?.[state.department])return;
  const code=state.department;
  const source=state.manifest.sources.find(s=>s.id==='district_boundaries');if(!source?.last_success)return;
  try{(state.districtFeaturesByDepartment??={})[code]=await getJson(`./data/districts/${code}.json.gz`);}catch{
    try{state.data.district_boundaries??=await getJson('./data/'+source.file);}catch{state.districtGeometryError=true;}
  }
}
function districtFeaturesForDepartment(){return state.districtFeaturesByDepartment?.[state.department]?.data.features??state.data.district_boundaries?.data.features.filter(f=>f.properties.department_code===state.department)??[];}

function renderKpis() {
  const key=state.frequency==='monthly'?'noaa_monthly':'noaa_weekly',all=state.data[key]?.data??[];
  const rows=selectNoaa(all,state,state.frequency==='monthly'),last=rows.at(-1);
  const prior=last?all.filter(r=>r.date<last.date).at(-1):null;
  for(const [id,field] of [['12','nino12_anomaly'],['34','nino34_anomaly']]){
    const val=last?.[field],delta=val!=null&&prior?val-prior[field]:null;
    $('kpi'+id).innerHTML=`${val==null?'—':(val>0?'+':'')+fmt(val,state.frequency==='weekly'?1:2)}<span>°C</span>`;
    $('meaning'+id).textContent=val==null?'Sin dato para estas fechas':val===0?'Igual a lo habitual':`${val>0?'Por encima':'Por debajo'} de lo habitual`;
    $('date'+id).textContent=last?`${state.frequency==='weekly'?'Dato semanal':'Dato mensual'} · ${dateLabel(last.date)}`:'Sin dato para estas fechas';
    $('delta'+id).textContent=delta==null?'No hay un dato anterior para comparar.':Math.abs(delta)<.005?'Sin cambio respecto al dato anterior.':`${delta>0?'Subió':'Bajó'} ${fmt(Math.abs(delta),2)} °C respecto al dato anterior.`;
    $('delta'+id).title='Variación respecto de la publicación anterior de NOAA CPC';
    $('bar'+id).style.width=val==null?'0%':Math.max(0,Math.min(100,(val+3)/9*100))+'%';
    $('bar'+id).parentNode.title='Escala de anomalía: −3 a +6 °C; no es una probabilidad';
  }
  $('inset34-value').textContent=last?`${last.nino34_anomaly>0?'+':''}${fmt(last.nino34_anomaly,2)} °C`:'— °C';
  $('inset34-date').textContent=last?`CPC · ${dateLabel(last.date)}`:'Sin observación en el periodo';
  const risks=selectedRisks(),high=risks.filter(r=>highRisk(r.risk_level)),classified=risks.filter(r=>r.risk_level);
  $('kpi-risk').textContent=state.data.cenepred_risk?fmt(high.length):'—';
  $('risk-kpi-meaning').textContent=classified.length?`Alto o muy alto · de ${fmt(classified.length)} evaluados`:'Sin distritos evaluados en la selección';
  $('risk-kpi-detail').textContent=`${HAZARDS[state.hazard]} · plan 2025–2027`;
  $('bar-risk').style.width=classified.length?100*high.length/classified.length+'%':'0%';
  $('bar-risk').parentNode.title='Porcentaje de distritos clasificados en alto o muy alto';
  const locations=new Set(state.forecastRows.map(r=>r.locality_id));
  $('kpi-forecast').textContent=state.data[modelWeather()?'district_forecast':'senamhi_forecast']?fmt(locations.size):'—';
  const dates=forecastDates(state.forecastRows);
  $('forecast-kpi-meaning').textContent=locations.size?'Con datos de temperatura y lluvia':'Sin datos para esta selección';
  $('forecast-kpi-detail').textContent=dates.length?`${dates.length} ${dates.length===1?'fecha disponible':'fechas disponibles'} en tu selección`:'Sin pronósticos para estas fechas';
  $('forecast-kpi-method').textContent=modelWeather()?`Se consulta un punto dentro de cada distrito. Hay ${fmt(state.forecastRows.length)} estimaciones de 24 horas en las fechas elegidas. El tiempo puede variar dentro del distrito, sobre todo en zonas de montaña.`:`SENAMHI publica temperaturas y una descripción del tiempo por localidad. Hay ${fmt(state.forecastRows.length)} pronósticos de localidad y día en las fechas elegidas. No todas las localidades tienen un distrito identificado en la fuente.`;
  $('weather-kpi-label').textContent=modelWeather()?'Distritos con pronóstico':'Localidades con pronóstico';$('weather-kpi-provider').textContent=weatherProvider();$('weather-kpi-footer').textContent=modelWeather()?'TIEMPO PREVISTO · NOAA GFS':'TIEMPO PREVISTO · SENAMHI';
  const coverage=new Set((state.data[modelWeather()?'district_forecast':'senamhi_forecast']?.data??[]).map(r=>r.locality_id)).size;
  $('bar-forecast').style.width=coverage?100*locations.size/coverage+'%':'0%';
  $('bar-forecast').parentNode.title='Puntos de la selección respecto de la cobertura de la fuente de pronóstico';
}

function initMap() {
  if (!window.L) { $('map').textContent='El componente del mapa no pudo cargarse.'; return; }
  state.map=L.map('map',{zoomControl:true,preferCanvas:true,dragging:true,touchZoom:true,doubleClickZoom:true,boxZoom:false,scrollWheelZoom:false,minZoom:2,maxZoom:15,zoomSnap:.25,zoomDelta:.5,zoomAnimation:true,fadeAnimation:false});
  state.map.createPane('borders');state.map.getPane('borders').style.zIndex=440;state.map.getPane('borders').style.pointerEvents='none';
  state.map.createPane('labels');state.map.getPane('labels').style.zIndex=460;state.map.getPane('labels').style.pointerEvents='none';
  state.map.createPane('districts');state.map.getPane('districts').style.zIndex=450;
  const observer=new ResizeObserver(()=>{requestAnimationFrame(()=>state.map.invalidateSize({pan:false}));});observer.observe($('map'));
  for(const [name,z] of [['ocean',250],['oceanVectors',350],['graticule',300]]){state.map.createPane(name);state.map.getPane(name).style.zIndex=z;state.map.getPane(name).style.pointerEvents='none';}
  state.map.createPane('weatherEffects');state.map.getPane('weatherEffects').style.zIndex=455;state.map.getPane('weatherEffects').style.pointerEvents='none';
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
  $('map-legend').innerHTML='<div class="legend-title">LUGARES DOCUMENTADOS · POR ZONA</div>'+DENSITY_STEPS.map(s=>`<div class="legend-step"><i style="background:${s.color}"></i><span>${s.label}</span></div>`).join('')+'<div class="legend-empty">Zonas de unos 30 km · fichas de riesgo<br>Sin color: no hay puntos registrados</div>';
}
function renderInspector(cell=null) {
  const code=state.department,national=code==='all',feature=state.data.boundaries?.data.features.find(f=>f.properties.code===code);
  const name=national?'Perú':titleCase(feature?.properties.name??code),district=selectedDistrict();
  const risks=selectedRisks(),classified=risks.filter(r=>r.risk_level),high=classified.filter(r=>highRisk(r.risk_level)),points=selectedPoints();
  const forecasts=mapForecastRows(),tmax=forecasts.length?Math.max(...forecasts.map(r=>r.tmax_c)):null,tmin=forecasts.length?Math.min(...forecasts.map(r=>r.tmin_c)):null;
  const locations=new Set(forecasts.map(r=>r.locality_id)).size,dates=forecastDates(forecasts),model=modelWeather(),first=forecasts[0];
  const rain=mean(forecasts.map(r=>r.precipitation_mm).filter(Number.isFinite));
  const badge=district?`<span class="level level-${district.risk_level?.toLowerCase().replaceAll(' ','-')??'none'}">${e(district.risk_level??'Sin categoría')}</span>`:'<span class="pill scenario">RIESGO POSIBLE</span>';
  const title=cell?`${fmt(cell.count)} lugares documentados`:district?titleCase(district.district):name;
  $('inspector-ubigeo').textContent=district?`UBIGEO ${district.ubigeo}`:national?'TODO EL PERÚ':name;
  $('inspector-department').value=code;renderDistrictPicker();
  document.querySelectorAll('[data-department]').forEach(b=>{b.classList.toggle('selected',b.dataset.department===code);b.setAttribute('aria-pressed',String(b.dataset.department===code));});
  const weatherScope=locations===1?'En el punto consultado':'Entre los puntos consultados';
  const reading=model?(first?`Pronóstico de NOAA GFS elaborado el ${timestamp(first.issued_at)}.`:'No hay un pronóstico disponible para estas fechas.'):forecasts.length?forecasts.find(r=>r.rain_mentioned)?.description??forecasts[0].description:'SENAMHI no identifica un distrito para estas localidades. Elige NOAA GFS para consultar tu distrito.';
  $('inspector-content').innerHTML=`<div class="inspector-title-row"><div><h3>${e(title)}</h3><p class="inspector-scope">${district?`${e(titleCase(district.province))}, ${e(name)}<br>`:''}Riesgo de ${e(HAZARDS[state.hazard].toLocaleLowerCase('es'))} · plan CENEPRED 2025–2027</p></div>${badge}</div>
    <div class="weather-source-label">TIEMPO PREVISTO · ${e(weatherProvider())}</div>
    <div class="inspector-metrics"><div class="inspector-metric"><span>EL MAYOR CALOR PREVISTO</span><b>${fmt(tmax,1)} °C</b><small>${e(weatherScope)}</small></div><div class="inspector-metric"><span>EL MAYOR FRÍO PREVISTO</span><b>${fmt(tmin,1)} °C</b><small>${e(weatherScope)}</small></div>${model?`<div class="inspector-metric inspector-rain"><span>LLUVIA ESTIMADA EN 24 HORAS</span><b>${fmt(rain,2)} mm</b><small>${dates.length>1||locations>1?'Promedio de los puntos y periodos elegidos':'Cantidad prevista para el periodo elegido'}</small></div>`:''}</div>
    <div class="inspector-facts"><h4>EN LA ZONA QUE ELEGISTE</h4><dl><div><dt>Distritos con riesgo alto o muy alto</dt><dd class="hot">${classified.length?`${fmt(high.length)} de ${fmt(classified.length)}`:'Sin datos'}</dd></div><div><dt>Lugares con ficha de riesgo</dt><dd>${fmt(points.length)}</dd></div><div><dt>${model?'Distritos con pronóstico':'Localidades con pronóstico'}</dt><dd class="cyan">${fmt(locations)}</dd></div><div><dt>Fechas disponibles</dt><dd>${dates.length?`${dateLabel(dates[0])} – ${dateLabel(dates.at(-1))}`:'Sin datos'}</dd></div></dl></div>
    <div class="inspector-weather">${e(reading)}<p>${model?'La estimación corresponde a un punto dentro de cada distrito. El tiempo puede variar en otras zonas del mismo distrito.':'El texto describe el tiempo que se espera en las localidades disponibles.'}</p><p>El riesgo indica dónde prepararse. No confirma una emergencia actual.</p></div>
    <details class="reading-details"><summary>Fechas y detalles del cálculo</summary><p>${model?(first?`Cada pronóstico cubre 24 horas. ${dates.length===1?'Periodo: '+e(windowLabel(first))+'.':'Las fechas indican cuándo termina cada periodo; abre el pronóstico para ver las horas exactas.'}`:'Sin periodos disponibles.'):'SENAMHI publica una descripción de la lluvia; esta fuente no aporta cantidades en mm ni probabilidades.'}</p><p>${model?'Se usa la celda GFS de 0,25° más próxima al punto interior del distrito, sin corrección por altitud. Varios distritos pueden compartir una celda. No es una estación ni un promedio de toda el área.':'Las localidades sin correspondencia distrital verificable no se asignan a un distrito.'}</p>${district?`<p>Código del distrito (UBIGEO): ${e(district.ubigeo)}.</p>`:''}${cell?`<p>Identificador de la celda del inventario: ${e(cell.id)}.</p>`:''}</details>`;
}
function renderWeatherCards(){
  const model=modelWeather(),dates=forecastDates(state.forecastRows).slice(-7),locations=new Set(state.forecastRows.map(r=>r.locality_id)).size;
  $('weather-provider-label').textContent=`TIEMPO PREVISTO · ${weatherProvider()}`;
  $('forecast-chart-note').textContent=model?`${locations>1?'Promedio de las estimaciones para los distritos elegidos.':'Estimación para un punto del distrito.'} Cada fecha indica el final de un periodo de 24 horas.`:'Promedio de las localidades SENAMHI disponibles. No representa toda la superficie del departamento.';
  $('weather-days').innerHTML=dates.map(date=>{const rows=frameRows(state.forecastRows,date),first=rows[0],rain=mean(rows.map(r=>r.precipitation_mm).filter(Number.isFinite));return `<button type="button" class="weather-day ${state.frameDate===date?'selected':''}" data-weather-date="${date}" aria-pressed="${state.frameDate===date}"><span>${model?'24 horas hasta el ':''}${e(dateLabel(date))}</span><strong><b><span>Más calor</span>${fmt(mean(rows.map(r=>r.tmax_c)),1)}°</b><i><span>Más frío</span>${fmt(mean(rows.map(r=>r.tmin_c)),1)}°</i></strong><small>${model?'Lluvia: '+fmt(rain,2)+' mm en 24 horas':rows.some(r=>r.rain_mentioned)?'Se menciona lluvia en el pronóstico':'Ver descripción del tiempo'}</small><em>${model?e(windowLabel(first)):fmt(new Set(rows.map(r=>r.locality_id)).size)+' localidades'}<br>${model&&rows.length>1?'Promedio de '+fmt(rows.length)+' puntos':model?'Estimación para un punto del distrito':''}</em></button>`;}).join('')||'<p class="weather-unavailable">No hay pronóstico disponible para estas fechas y esta zona. Prueba otras fechas o consulta la otra fuente.</p>';
  $('weather-issue').textContent=model?(state.data.district_forecast?`Estimación de NOAA GFS para un punto dentro de cada distrito. Puede cambiar y variar dentro de la zona. Último pronóstico elaborado: ${timestamp(state.data.district_forecast.meta.issued_at)}.`:'Aún no hay una descarga de NOAA GFS que haya pasado los controles. Revisa las fuentes y sus fechas.'):'Pronóstico de SENAMHI por localidad. Sus temperaturas y descripciones se conservan tal como las publica la fuente.';
}
function renderDistrictPicker(){
  const rows=districtOptions(state.data.cenepred_risk?.data??[],state.department),provinces=[...new Set(rows.map(r=>r.province))];
  $('inspector-district').innerHTML='<option value="all">Todos los distritos</option>'+provinces.map(province=>`<optgroup label="${e(titleCase(province))}">${rows.filter(r=>r.province===province).map(r=>`<option value="${e(r.ubigeo)}">${e(titleCase(r.district))}</option>`).join('')}</optgroup>`).join('');
  $('inspector-district').disabled=state.department==='all'||!rows.length;$('inspector-district').value=state.district;
  $('district-picker-label').textContent=state.department==='all'?'Luego, elige tu distrito':`Elige tu distrito · ${rows.length} disponibles`;
  $('clear-territory').disabled=state.department==='all'&&state.district==='all';
  $('district-scope-note').textContent=state.district!=='all'?(modelWeather()?'Estás viendo el riesgo del distrito y una estimación del tiempo para un punto dentro de él.':'Para ver el tiempo por distrito, elige NOAA GFS. SENAMHI publica aquí por localidad.'):state.department==='all'?'Puedes consultar los 24 departamentos y Callao. Elige uno para ver sus distritos.':'Elige un distrito para consultar su riesgo y el tiempo previsto. La lista usa el mapa CENEPRED 2025–2027.';
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
function territorialMarkers(){
  const features=state.data.boundaries?.data.features??[];
  const coverage=territorialCoverage(features,state.data.cenepred_risk?.data??[],selectForecasts(state.versions,{...state,department:'all',district:'all'}),state.hazard);
  state.territoryMarkers=[];
  for(const feature of features){
    const {code}=feature.properties;
    const points=allPoints().filter(p=>p.hazard===state.hazard&&normalize(p.department)===normalize(feature.properties.name));
    // Marcador de navegación: punto documentado próximo al centro o centro geométrico de referencia.
    const center=L.geoJSON(feature).getBounds().getCenter();
    const point=[...points].sort((a,b)=>(Math.abs(a.lat-center.lat)+Math.abs(a.lon-center.lng))-(Math.abs(b.lat-center.lat)+Math.abs(b.lon-center.lng)))[0]??{lat:center.lat,lon:center.lng};
    const summary=coverage.find(r=>r.code===code),risk=summary.risk;
    const name=titleCase(feature.properties.name),selected=state.department===code;
    const detail=state.kind==='forecast'?`${fmt(summary.localities)} localidades`:(risk?.total?`${fmt(risk.high)} distritos en alto / muy alto`:'Sin clasificación');
    const icon=L.divIcon({className:`coastal-marker territory-marker ${selected?'selected':''} ${code==='07'?'label-left':''}`,html:`<span class="signal-dot"></span><span class="signal-label">${e(name.toUpperCase())}</span>`,iconSize:[12,12],iconAnchor:[0,0]});
    const marker=L.marker([point.lat,point.lon],{icon,zIndexOffset:selected?1000:800,keyboard:true,title:`${name}: ${detail} · ${HAZARDS[state.hazard]}`,alt:`Seleccionar ${name}`});
    marker.bindTooltip(`<strong>${e(name)}</strong><br>${e(detail)}<br>Clic para filtrar e inspeccionar`,{direction:'top',className:'territory-tooltip'});
    marker.on('click',()=>selectTerritory(code));
    addMapLayer(marker);
    state.territoryMarkers.push({marker,code,selected,area:L.geoJSON(feature).getBounds().getNorthEast().distanceTo(L.geoJSON(feature).getBounds().getSouthWest())});
  }
  requestAnimationFrame(layoutTerritoryLabels);
}
function layoutTerritoryLabels(){
  const used=[];
  const mapRect=$('map').getBoundingClientRect();
  for(const id of ['nino34-inset','map-legend','map-overlay-note','ocean-readout']){const el=$(id);if(!el.hidden)used.push(el.getBoundingClientRect());}
  for(const {marker,selected} of [...state.territoryMarkers].sort((a,b)=>Number(b.selected)-Number(a.selected)||b.area-a.area)){
    const element=marker.getElement();if(!element)continue;
    element.classList.remove('label-muted');
    const rect=element.querySelector('.signal-label').getBoundingClientRect();
    const overlap=used.some(r=>rect.left<r.right+5&&rect.right>r.left-5&&rect.top<r.bottom+4&&rect.bottom>r.top-4);
    const outside=rect.left<mapRect.left+5||rect.right>mapRect.right-5||rect.top<mapRect.top+5||rect.bottom>mapRect.bottom-5;
    if(!selected&&(overlap||outside||state.oceanExtent==='pacific'))element.classList.add('label-muted');
    else used.push(rect);
  }
}
function selectTerritory(code){
  state.inspectorDepartment=code;state.inspectorDistrict=null;state.district='all';
  if(code==='all')state.oceanExtent='national';
  $('department').value=code;
  void applyFilters(true);
}
function selectDistrict(code){
  if(code!=='all'){
    const record=(state.data.cenepred_risk?.data??[]).find(r=>r.ubigeo===code);if(!record)return;
    state.department=record.department_code;$('department').value=record.department_code;state.inspectorDepartment=record.department_code;
    $('risk-level').value='all';
    state.forecastProvider='gfs';
  }
  state.district=code;state.inspectorDistrict=selectedDistrict();void applyFilters(true);
}
function renderCoverage(){
  const rows=territorialCoverage(state.data.boundaries?.data.features??[],state.data.cenepred_risk?.data??[],selectForecasts(state.versions,{...state,department:'all',district:'all'}),state.hazard);
  const riskCount=rows.filter(r=>r.risk?.total).length,weatherCount=rows.filter(r=>r.localities).length;
  $('coverage-summary').textContent=`24 departamentos y Callao. ${riskCount} de ${rows.length} tienen datos de riesgo de CENEPRED y ${weatherCount} tienen localidades con pronóstico SENAMHI en las fechas elegidas.`;
  $('territory-grid').innerHTML=rows.map(r=>`<button type="button" class="territory-card ${state.department===r.code?'selected':''}" data-department="${e(r.code)}" aria-pressed="${state.department===r.code}"><span class="territory-card-title"><span>${e(titleCase(r.name))}</span><small>${e(r.code)}</small></span><span class="territory-risk"><span>DISTRITOS CON MAYOR RIESGO</span><b>${r.risk?.total?`${fmt(r.risk.high)} <small>/ ${fmt(r.risk.total)}</small>`:'Sin clasificación'}</b></span><span class="territory-weather ${r.localities?'':'no-coverage'}">${r.localities?`${fmt(r.localities)} localidades · SENAMHI`:'Sin datos SENAMHI en estas fechas'}</span></button>`).join('');
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
  const district=districtFeaturesForDepartment().find(f=>f.properties.ubigeo===state.district);
  if(district){state.map.fitBounds(L.geoJSON(district).getBounds(),{padding:[35,45],maxZoom:11});return;}
  const feature=state.data.boundaries?.data.features.find(f=>f.properties.code===state.department);
  if (feature) state.map.fitBounds(L.geoJSON(feature).getBounds(),{padding:[30,30],maxZoom:9});
  else if(state.kind==='observation'&&state.oceanExtent!=='national')state.map.fitBounds(state.oceanExtent==='pacific'?[[-22,-174],[7,-66]]:[[-19.5,-99],[1,-69]],{padding:[20,35]});
  else if(state.data.boundaries?.data){const short=state.map.getSize().y<400;state.map.fitBounds(L.geoJSON(state.data.boundaries.data).getBounds(),{paddingTopLeft:[25,short?45:65],paddingBottomRight:[25,short?20:100]});}
  else state.map.fitBounds([[-18.5,-82.5],[0.3,-68.4]],{padding:[35,65]});
}
const DISTRICT_COLORS={Bajo:'#22b8cf',Medio:'#facc15',Alto:'#fb923c','Muy alto':'#f43f5e'};
function renderDistrictMap(){
  if(state.department==='all')return;
  const features=districtFeaturesForDepartment();
  if(!features.length){$('map-footnote').textContent+=' Cartografía distrital no disponible en esta publicación; se conserva el encuadre departamental.';return;}
  const levels=new Map((state.data.cenepred_risk?.data??[]).filter(r=>r.hazard===state.hazard).map(r=>[r.ubigeo,r.risk_level]));
  const risk=state.kind==='risk_scenario'&&state.layer==='risk',heat=state.kind==='risk_scenario'&&state.layer==='heat';
  const weather=state.kind==='forecast'&&modelWeather(),weatherValues=new Map(weatherByDistrict(contextForecastRows(),state.layer).map(r=>[r.ubigeo,r]));
  addMapLayer(L.geoJSON({type:'FeatureCollection',features},{pane:'districts',renderer:L.svg({pane:'districts'}),interactive:!heat,
    style:f=>{const selected=f.properties.ubigeo===state.district,active=state.district==='all'||selected,value=weatherValues.get(f.properties.ubigeo)?.value;return {color:selected?'#fef08a':'#80c7df',weight:selected?2.5:.65,opacity:selected?1:risk||weather?.7:.4,fill:!heat,fillColor:weather?(state.layer==='rain'?rainColor(value):colorFor(value,state.layer==='tmin'?-15:0,45)):risk?(DISTRICT_COLORS[levels.get(f.properties.ubigeo)]??'#334155'):'#0b1727',fillOpacity:risk||weather?(active?.8:.2):0};},
    onEachFeature:(feature,layer)=>{if(heat)return;const p=feature.properties,w=weatherValues.get(p.ubigeo);layer.bindTooltip(`<strong>${e(titleCase(p.district))}</strong><br>${e(titleCase(p.province))} · UBIGEO ${e(p.ubigeo)}<br>${weather?`NOAA GFS: ${w?fmt(w.value,1)+(state.layer==='rain'?' mm / 24 h':' °C'):'Sin pronóstico'}<br>Celda del modelo; no promedio del área`:`CENEPRED: ${e(levels.get(p.ubigeo)??'Sin categoría')}`}<br>Toca para filtrar el distrito`,{sticky:true,className:'territory-tooltip'});layer.on('click',()=>selectDistrict(p.ubigeo));}
  }));
  if(risk){
    $('map-title').textContent=state.district==='all'?'Riesgo oficial por distrito':`Riesgo distrital · ${titleCase(selectedDistrict()?.district??'Selección')}`;
    $('map-legend').innerHTML='<div class="legend-title">RIESGO DISTRITAL · CENEPRED</div>'+Object.entries(DISTRICT_COLORS).map(([name,color])=>`<div class="legend-step"><i style="background:${color}"></i><span>${name}</span></div>`).join('')+'<div class="legend-empty">Gris: sin categoría. Marco 2025–2027.</div>';
    $('map-overlay-note').textContent=`${features.length} distritos cartografiados · ${HAZARDS[state.hazard]}`;
    $('map-footnote').textContent='Categorías oficiales del escenario CENEPRED 2025–2027 en su cartografía distrital de referencia. No representan emergencias actuales ni probabilidad diaria. Selecciona un distrito para inspeccionarlo. La cartografía se consulta por UBIGEO y puede diferir de la demarcación administrativa más reciente.';
  }
  if(state.district!=='all'&&state.kind==='forecast')$('map-footnote').textContent+=modelWeather()?' El distrito muestra la celda GFS más próxima a su punto interior de referencia, no un promedio distrital ni una estación.':' SENAMHI: no se asignan localidades al distrito sin una correspondencia geográfica verificable; cambia a NOAA GFS para consultar el modelo distrital.';
  if(state.district!=='all'&&heat)$('map-footnote').textContent+=' Puntos del distrito vinculados por coincidencia exacta de departamento, provincia y distrito en la ficha; los registros sin correspondencia no se asignan.';
}
function addMapLayer(layer) {layer.addTo(state.map);state.mapLayers.push(layer);}

function renderMap() {
  if (!state.map) return;
  renderTimeline();
  state.mapLayers.forEach(l=>state.map.removeLayer(l));state.mapLayers=[];state.territoryMarkers=[];
  document.querySelectorAll('.map-no-data').forEach(el=>el.remove());
  const ocean=state.kind==='observation';$('nino34-inset').hidden=!ocean;$('ocean-readout').hidden=!ocean;$('pacific-view').hidden=!ocean;$('coast-view').hidden=!ocean;
  for(const [id,extent] of [['national-view','national'],['coast-view','coast'],['pacific-view','pacific']]){const selected=state.department==='all'&&state.oceanExtent===extent;$(id).classList.toggle('selected',selected);$(id).setAttribute('aria-pressed',String(selected));}
  document.querySelector('[data-map-mode="risk"]').innerHTML=`<i></i>Riesgo · ${HAZARDS[state.hazard]}`;
  document.querySelector('[data-map-mode="rain"]').innerHTML=`<i></i>Lluvia prevista · ${weatherProvider()}`;
  document.querySelectorAll('[data-map-mode]').forEach(b=>{const active=b.dataset.mapMode===(ocean?'sst':state.layer);b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
  $('vectors-toggle').classList.toggle('selected',state.vectors&&ocean);$('vectors-toggle').setAttribute('aria-pressed',String(state.vectors&&ocean));
  const labels={observation:'DATO DEL MAR',forecast:'PRONÓSTICO',risk_scenario:state.layer==='heat'?'LUGARES REGISTRADOS':'RIESGO POSIBLE'};
  $('map-title').textContent=state.kind==='observation'?'¿El mar está más caliente de lo habitual?':state.kind==='forecast'?'El tiempo que se espera en tu zona':state.layer==='heat'?'Lugares con fichas de riesgo':'Distritos en riesgo alto o muy alto';
  $('map-eyebrow').textContent=state.kind==='observation'?'ESTADO DEL MAR · NOAA':state.kind==='forecast'?`TIEMPO PREVISTO · ${weatherProvider()}`:'RIESGO POSIBLE · CENEPRED';
  $('map-kind').textContent=labels[state.kind]; $('map-kind').className='pill '+({observation:'observation',forecast:'forecast',risk_scenario:'scenario'}[state.kind]);
  const weatherRows=contextForecastRows(),model=state.kind==='forecast'&&modelWeather();
  $('map-legend').classList.toggle('rain-legend',model&&state.layer==='rain');
  if(model){const place=selectedDistrict()?.district??state.data.boundaries?.data.features.find(f=>f.properties.code===state.department)?.properties.name??'Perú';$('map-title').textContent=`${state.layer==='rain'?'Lluvia prevista · 24 h':state.layer==='tmin'?'Temperatura mínima':'Temperatura máxima'} · ${titleCase(place)}`;}
  const groups=state.kind==='forecast'?forecastByDepartment(weatherRows,state.layer):riskByDepartment(state.data.cenepred_risk?.data??[],state.hazard,state.department);
  const values=new Map(groups.map(g=>[g.code,g]));
  let min=0,max=100;
  if (state.kind==='forecast' && state.layer!=='rain') {min=state.layer==='tmin'?-15:0;max=45;}
  const boundary=state.data.boundaries?.data;
  if (boundary) {
    state.polygons=L.geoJSON(boundary,{
      style:f=>{ const value=values.get(f.properties.code)?.value; const active=state.department==='all'||f.properties.code===state.department;
        return {color:active?'#63bed5':'#274158',weight:active?.9:.6,fillColor:state.kind==='observation'||model&&state.department!=='all'?'#0c1423':(state.kind==='risk_scenario'&&state.layer==='heat')?'#102a3b':model&&state.layer==='rain'?rainColor(active?value:null):colorFor(active?value:null,min,max),fillOpacity:active ? (state.kind==='observation'?.98:state.layer==='heat'?.68:.78) : .23}; },
      onEachFeature:(feature,layer)=>{
        const g=values.get(feature.properties.code);
        let detail=state.kind==='observation'?'No se distribuye el índice oceánico sobre departamentos.':state.kind==='forecast'?(g?`${fmt(g.value,1)} ${state.layer==='rain'?'% con mención de precipitación':'°C · promedio de localidades'}<br>${fmt(g.count)} localidades disponibles`:'Sin pronósticos en el periodo'):(g?`${fmt(g.high)} de ${fmt(g.total)} distritos clasificados en alto o muy alto (${fmt(g.value,1)}%)`:'Sin clasificación disponible');
        if(model)detail=g?`${fmt(g.value,1)} ${state.layer==='rain'?'mm / 24 h':'°C'}<br>Promedio de ${fmt(g.count)} puntos de distrito; no promedio del área`:'Sin pronóstico de modelo para la selección';
        layer.bindTooltip(`<strong>${e(titleCase(feature.properties.name))}</strong><br>${detail}`,{sticky:true});
        layer.on('click',()=>selectTerritory(feature.properties.code));
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
    legend(state.layer==='rain'?(model?'Lluvia estimada · mm en 24 horas':'Pronósticos que mencionan lluvia'):`Temperatura ${state.layer==='tmin'?'mínima':'máxima'} prevista`,state.layer==='rain'?'0'+(model?' mm':'%'):min+' °C',state.layer==='rain'?(model?'50+ mm':'100%'):max+' °C','temperature');
    if(model&&state.layer==='rain')$('map-legend').innerHTML='<div class="legend-title">LLUVIA EN 24 HORAS · GFS</div>'+[[0,'0','#17374a'],[1,'>0–<2','#2e8ba3'],[2,'2–<10','#38bdf8'],[10,'10–<25','#6366f1'],[25,'25–<50','#a855f7'],[50,'50 o más','#ec4899']].map(([,label,color])=>`<div class="legend-step"><i style="background:${color}"></i><span>${label} mm</span></div>`).join('')+'<div class="legend-empty">Gris: sin dato · no es probabilidad</div>';
    const first=weatherRows[0];
    $('map-overlay-note').textContent=model?`NOAA GFS · ${first?'Emisión '+timestamp(first.issued_at):'sin cobertura'} · ${state.frameDate==='all'?'resumen del periodo':dateLabel(state.frameDate)+' · cierre de 24 h'}`:'SENAMHI · '+(state.frameDate==='all'?'Resumen del periodo':dateLabel(state.frameDate));
    $('map-footnote').textContent=model?'Modelo GFS 0,25°: celda más próxima al punto interior de referencia de cada distrito. Ventanas de 24 horas con inicio y fin explícitos; la fecha selecciona el cierre local. Al elegir un departamento aparecen sus distritos; el color departamental es el promedio de puntos, sin ponderar por superficie. Gotas y pulsos son símbolos gráficos, no desplazamiento meteorológico.':state.layer==='rain'?'Porcentaje de registros localidad/día cuyo texto menciona precipitación. No es probabilidad de lluvia, porcentaje del área ni milímetros. Consulte el texto oficial.':'Promedio de temperaturas previstas para localidades y días disponibles. No es un promedio de superficie ni una observación. Sin cobertura: gris.';
    if(model){
      const points=weatherByDistrict(weatherRows,state.layer);addMapLayer(weatherMotionLayer(points,{metric:state.layer,enabled:state.weatherMotion}));
      const selected=points.find(r=>r.ubigeo===state.district);
      if(selected)addMapLayer(L.marker([selected.lat,selected.lon],{pane:'labels',interactive:false,keyboard:false,icon:L.divIcon({className:'forecast-point-pin',html:`<span>${fmt(selected.value,state.layer==='rain'?2:1)} ${state.layer==='rain'?'mm':'°C'}</span><i></i>`,iconSize:[100,48],iconAnchor:[50,45]})}));
    }
    if (!weatherRows.length) showMapEmpty('Sin pronósticos disponibles o archivados para esta fecha y selección.');
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
    legend('Diferencia con lo habitual · °C','−3 °C','+6 °C o más','anomaly');
    $('map-legend').querySelector('.legend-empty').textContent='Sin color: no hay dato del mar';
    $('map-legend').innerHTML+='<div class="legend-empty">Rojo: más caliente · azul: más frío<br>Flechas: corrientes estimadas del mar</div>';
    $('ocean-date').textContent=sst?dateLabel(sst.meta.latest_date):'Sin campo para el periodo';
    $('current-date').textContent=currents?`${dateLabel(currents.meta.latest_date)}${(new Date(limaDate())-new Date(currents.meta.latest_date))/86400000>7?' · REZAGO':''}`:'Sin campo para el periodo';
    $('map-overlay-note').textContent=`TSM: ${sst?dateLabel(sst.meta.latest_date):'sin dato en periodo'} · Corrientes: ${currents&&state.vectors?dateLabel(currents.meta.latest_date)+((new Date(limaDate())-new Date(currents.meta.latest_date))/86400000>7?' · REZAGO':''):'ocultas / sin dato'}`;
    $('map-footnote').textContent='Cobertura: 24 departamentos y Callao. La TSM solo corresponde al océano; no se distribuye sobre tierra. Flechas: dirección geostrófica experimental en su fecha publicada, no deriva prevista. Recuadros Niño: índices CPC con fecha propia. Marcadores: selección de territorios, no estaciones ni emergencias. Consulte riesgo o pronósticos para la lectura terrestre.';
    if(!sst&&!latest)showMapEmpty('Sin campo oceánico ni índices publicados para el periodo seleccionado. Consulte otra fecha.');
  }
  if (boundary) {
    addMapLayer(L.geoJSON(boundary,{pane:'borders',interactive:false,style:f=>({color:state.department==='all'||f.properties.code===state.department?'#91d4e4':'#35546a',weight:state.department===f.properties.code?2:1,opacity:.8,fill:false})}));
    if (state.kind==='risk_scenario'&&state.layer==='heat') {
      for (const feature of boundary.features) {
        if (state.department!=='all' && feature.properties.code!==state.department) continue;
        const layer=L.geoJSON(feature),center=layer.getBounds().getCenter();
        addMapLayer(L.marker(center,{pane:'labels',interactive:false,keyboard:false,icon:L.divIcon({className:'department-label',html:e(titleCase(feature.properties.name)),iconSize:[100,16],iconAnchor:[50,8]})}));
      }
    }else territorialMarkers();
  }
  $('map-guide').textContent=state.kind==='observation'?'Rojo y naranja: mar más caliente de lo habitual. Azul: más frío. Para ver el tiempo en tierra, elige «Pronóstico del tiempo» y tu zona.':state.kind==='forecast'?(modelWeather()?(state.layer==='rain'?'Los colores muestran cuánta lluvia se estima en 24 horas. Consulta la leyenda y toca tu departamento para ver sus distritos.':'Los colores muestran la temperatura prevista. Elige tu departamento y distrito para consultar su estimación.'):(state.layer==='rain'?'El color indica cuántos pronósticos SENAMHI mencionan lluvia; no la probabilidad de que llueva. Abre los textos para saber qué se espera.':'Los colores resumen las temperaturas previstas en las localidades SENAMHI disponibles.')):state.layer==='heat'?'Los colores más intensos agrupan más lugares con fichas de riesgo. Son lugares documentados, no emergencias que estén ocurriendo ahora.':state.department==='all'?'El color muestra qué parte de los distritos evaluados tiene riesgo alto o muy alto. Toca un departamento para ver el riesgo de cada distrito.':'Cada color indica el nivel de riesgo de un distrito según CENEPRED para 2025–2027. Sirve para prepararse; no confirma una emergencia actual.';
  renderDistrictMap();
  renderInspector();
  renderWeatherCards();
  renderCoverage();
  renderInsights();
  renderRanking(groups);
}
function showMapEmpty(text) { const el=document.createElement('div');el.className='map-no-data';el.textContent=text;$('map').parentNode.append(el); }

function renderRanking(groups) {
  if (state.kind==='observation') {
    $('ranking-title').textContent='Cómo está el mar en las dos regiones';
    $('ranking-subtitle').textContent='Los números comparan el calor del mar con lo habitual. El estado oficial para Perú lo comunica ENFEN.';
    const rows=selectNoaa(state.data[state.frequency==='weekly'?'noaa_weekly':'noaa_monthly']?.data??[],state,state.frequency==='monthly');
    const last=rows.at(-1);
    $('ranking').innerHTML=[['Niño 1+2','nino12_anomaly'],['Niño 3.4','nino34_anomaly']].map(([label,field],i)=>rankRow(i,label,last?.[field],last?dateLabel(last.date):'Sin observación en el periodo','°C',null)).join('');
    $('executive-note').innerHTML='<span class="note-kicker">CÓMO LEERLO</span>Un valor positivo indica un mar más caliente de lo habitual; uno negativo, más frío. Estos números por sí solos no declaran un evento El Niño. Consulta el diagnóstico oficial de ENFEN.';
    return;
  }
  const district=selectedDistrict();
  if(district&&state.kind==='risk_scenario'){
    $('ranking-title').textContent=`${titleCase(district.district)} · escenario distrital`;
    $('ranking-subtitle').textContent=`${titleCase(district.province)}, ${titleCase(district.department)} · UBIGEO ${district.ubigeo}`;
    $('ranking').innerHTML=`<div class="district-ranking"><span class="kicker">${e(HAZARDS[state.hazard])}</span><h3>${e(district.risk_level??'Sin clasificación')}</h3><p>Categoría distrital oficial · marco 2025–2027</p></div>`;
    $('executive-note').innerHTML='<span class="note-kicker">PARA PREPARARSE</span>Esta categoría indica el riesgo posible según CENEPRED para 2025–2027. No confirma que esté ocurriendo una emergencia en el distrito.';return;
  }
  if(district&&state.kind==='forecast'&&modelWeather()){
    const rows=mapForecastRows();$('ranking-title').textContent=`${titleCase(district.district)} · tiempo previsto`;$('ranking-subtitle').textContent='Estimación para un punto del distrito en las fechas elegidas.';
    $('ranking').innerHTML=[['Máxima prevista',mean(rows.map(r=>r.tmax_c)),'°C'],['Mínima prevista',mean(rows.map(r=>r.tmin_c)),'°C'],['Lluvia prevista',mean(rows.map(r=>r.precipitation_mm).filter(Number.isFinite)),'mm / 24 h']].map(([name,value,unit],i)=>rankRow(i,name,value,state.frameDate==='all'?'Promedio de los periodos elegidos':dateLabel(state.frameDate),unit,null)).join('');
    $('executive-note').innerHTML='<span class="note-kicker">TEN EN CUENTA</span>Es una estimación para un punto dentro del distrito. El tiempo puede ser distinto en otras zonas, especialmente donde cambia la altitud.';return;
  }
  const forecast=state.kind==='forecast';
  $('ranking-title').textContent=forecast?'Compara el tiempo previsto por departamento':'Departamentos con más distritos en riesgo';
  $('ranking-subtitle').textContent=forecast?(modelWeather()?'Promedios de las estimaciones para puntos dentro de los distritos. No representan todo el territorio.':state.layer==='rain'?'Porcentaje de pronósticos que mencionan lluvia. No indica la probabilidad de que llueva.':'Promedio de las temperaturas previstas en las localidades disponibles.'):`${HAZARDS[state.hazard]}: porcentaje de distritos clasificados en riesgo alto o muy alto.`;
  const max=Math.max(1,...groups.map(g=>g.value??0));
  $('ranking').innerHTML=groups.slice(0,5).map((g,i)=>rankRow(i,titleCase(g.name),g.value,forecast?`${fmt(g.count)} ${modelWeather()?'puntos distritales':'localidades'}`:`${fmt(g.high)} de ${fmt(g.total)} distritos clasificados`,forecast?(state.layer==='rain'?(modelWeather()?'mm / 24 h':'%'):'°C'):'%',max)).join('')||'<p class="no-rank">Sin datos para la selección actual.</p>';
  $('executive-note').innerHTML=forecast&&modelWeather()?'<span class="note-kicker">QUÉ ESTÁS COMPARANDO</span>Estimaciones de NOAA GFS para puntos dentro de los distritos. La lluvia es una cantidad en 24 horas. Abre el pronóstico para ver el inicio y el fin de cada periodo.':forecast?'<span class="note-kicker">QUÉ PUBLICA SENAMHI</span>Esta fuente describe la lluvia con palabras. No publica aquí su cantidad en milímetros ni la probabilidad de que ocurra.':'<span class="note-kicker">PARA PREPARARSE</span>El riesgo usa el plan CENEPRED 2025–2027. Elegir otro día no cambia esas categorías. Los lugares documentados no son un conteo de emergencias actuales.';
}
function rankRow(i,label,value,detail,unit,max) {
  const width=max&&value!=null?Math.max(0,Math.min(100,100*value/max)):0;
  return `<div class="rank-row"><span class="rank-number">${String(i+1).padStart(2,'0')}</span><div class="rank-content"><div class="rank-label"><span>${e(label)}</span><span class="value">${fmt(value,1)} ${unit}</span></div>${max?`<div class="rank-track"><div class="rank-bar" style="width:${width}%"></div></div>`:''}<div class="rank-detail">${e(detail)}</div></div></div>`;
}

function chartConfig(labels,datasets) {
  const small=compactScreen();
  return {type:'line',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',align:'start',labels:{usePointStyle:true,pointStyle:'circle',boxWidth:6,boxHeight:6,padding:small?12:18,font:{size:small?11:10},color:'#9db7d3'}},tooltip:{backgroundColor:'#12273d',padding:10,titleFont:{size:small?12:10},bodyFont:{size:small?12:10}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:small?3:6,color:'#88a6c5',font:{size:small?11:9}},border:{display:false}},y:{grid:{color:'#26394d'},ticks:{color:'#88a6c5',font:{size:small?11:9},padding:8},border:{display:false},title:{display:true,text:'°C',font:{size:small?11:9},color:'#88a6c5'}}}}};
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
  const search=normalize($('forecast-search').value),model=modelWeather();
  const rows=state.forecastRows.filter(r=>normalize([r.locality,r.department,r.province,r.ubigeo].join(' ')).includes(search));
  state.forecastPage=Math.min(state.forecastPage,Math.max(0,Math.ceil(rows.length/PAGE)-1));
  const start=state.forecastPage*PAGE;
  $('forecast-place-heading').textContent=model?'Distrito':'Localidad';
  $('forecast-table-title').textContent=model?'El tiempo previsto en cada distrito':'El tiempo previsto por SENAMHI';
  $('forecast-body').innerHTML=rows.slice(start,start+PAGE).map(r=>`<tr><td>${e(titleCase(r.locality))}<span class="cell-sub">${model?e(titleCase(r.province))+', ':''}${e(titleCase(r.department))}</span></td><td>${model?'24 horas hasta el ':''}${dateLabel(r.valid_date)}${model?`<details class="reading-details table-details"><summary>Ver horas</summary><p>${e(windowLabel(r))}</p></details>`:`<span class="cell-sub">Revisado: ${dateLabel(limaDate(r.collected_at))}</span>`}</td><td class="temperature-max">${fmt(r.tmax_c,1)} °C</td><td class="temperature-min">${fmt(r.tmin_c,1)} °C</td><td>${model?`<b>${fmt(r.precipitation_mm,2)} mm en 24 horas</b><span class="cell-sub">Cantidad de lluvia estimada</span><details class="reading-details table-details"><summary>Ver cómo se estimó</summary><p>NOAA GFS · celda ${fmt(r.grid_lat,2)}, ${fmt(r.grid_lon,2)}. Pronóstico elaborado: ${e(timestamp(r.issued_at))}. Código del distrito (UBIGEO): ${e(r.ubigeo)}. Es una estimación para un punto dentro del distrito; no un promedio del área. Esta fuente no publica una probabilidad de lluvia.</p></details>`:e(r.description)+'<span class="cell-sub">Esta fuente describe la lluvia con palabras, sin cantidades ni probabilidades.</span>'}</td><td><a class="text-link" href="${e(safeUrl(r.source_url))}" target="_blank" rel="noopener" aria-label="Ver fuente de pronóstico de ${e(r.locality)}">${e(weatherProvider())} ↗</a></td></tr>`).join('')||'<tr><td colspan="6" class="empty-row">No hay pronóstico disponible para estas fechas y esta zona. Para consultar un distrito, elige NOAA GFS.</td></tr>';
  $('forecast-count').textContent=rows.length?`${fmt(start+1)}–${fmt(Math.min(start+PAGE,rows.length))} de ${fmt(rows.length)} pronósticos`:'Sin pronósticos';
  $('forecast-prev').disabled=state.forecastPage===0;$('forecast-next').disabled=start+PAGE>=rows.length;
  $('forecast-summary').textContent=model?'La lluvia se expresa en milímetros: 1 mm equivale a 1 litro de agua por metro cuadrado. Cada pronóstico cubre 24 horas; toca «Ver horas» para conocer el inicio y el fin.':'SENAMHI informa la temperatura y describe el tiempo por localidad. Si elegiste un distrito, puedes cambiar a NOAA GFS para consultar una estimación para ese distrito.';
  labelResponsiveTable('forecast-body');
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
  $('zone-body').innerHTML=rows.slice(start,start+PAGE).map(r=>points?`<tr><td>${e(r.place||r.id)}<span class="cell-sub">Lugar documentado · ${e(r.id)}</span></td><td>${e(titleCase(r.district))}<span class="cell-sub">${e(titleCase(r.province))}</span></td><td>${e(titleCase(r.department))}</td><td>${HAZARDS[r.hazard]}</td><td>${dateLabel(r.document_date)}</td><td><a class="text-link" href="${e(safeUrl(r.document_url))}" target="_blank" rel="noopener">${r.document_url?'Ficha':'SIGRID'} ↗</a></td></tr>`:`<tr data-ubigeo="${e(r.ubigeo)}" tabindex="0"><td>${e(titleCase(r.district))}<span class="cell-sub">${e(titleCase(r.province))}</span></td><td>${e(titleCase(r.department))}</td><td>${e(r.ubigeo)}</td><td>${HAZARDS[r.hazard]}</td><td><span class="level level-${r.risk_level?r.risk_level.toLowerCase().replaceAll(' ','-'):'none'}">${e(r.risk_level||'Sin categoría')}</span></td><td><a class="text-link" href="https://sig.cenepred.gob.pe/sigrid/rest/services/ER_LLUVIAS_PM_2025_2027/MapServer/${r.hazard==='inundacion'?9:8}" target="_blank" rel="noopener">SIGRID ↗</a></td></tr>`).join('')||'<tr><td colspan="6" class="empty-row">Sin registros para los filtros elegidos. La falta de datos no equivale a ausencia de riesgo.</td></tr>';
  $('zone-count').textContent=rows.length?`${fmt(start+1)}–${fmt(Math.min(start+PAGE,rows.length))} de ${fmt(rows.length)} ${points?'puntos documentados':'distritos'}`:'0 registros';
  $('zone-prev').disabled=state.zonePage===0; $('zone-next').disabled=start+PAGE>=rows.length;
  $('zone-context').textContent=points?'La fecha es la de la ficha que documenta el lugar; no confirma una emergencia actual. Puedes filtrar por fecha de ficha. Una ficha puede incluir varios lugares.':'Nivel de riesgo publicado por CENEPRED para planificar en 2025–2027. Elegir otro día no cambia estas categorías. Toca un distrito para consultar su detalle.';
  labelResponsiveTable('zone-body');
}
function labelResponsiveTable(id){
  const body=$(id),headers=[...body.closest('table').querySelectorAll('thead th')].map(th=>th.textContent);
  body.querySelectorAll('tr').forEach(row=>[...row.cells].forEach((cell,i)=>{if(cell.colSpan===1)cell.dataset.label=headers[i]??'';}));
}

function sourceDataLabel(s){
  if(s.id==='district_forecast'){const m=state.data.district_forecast?.meta;return m?.issued_at?`Elaborado: ${timestamp(m.issued_at)} · hasta ${dateLabel(s.latest_date)}`:'Sin pronóstico comprobado';}
  if(s.id==='senamhi_forecast'){
    const dates=[...new Set((state.data.senamhi_forecast?.data??[]).map(r=>r.valid_date))].sort();
    return dates.length?`Para: ${dateLabel(dates[0])} – ${dateLabel(dates.at(-1))}`:'Sin validez publicada disponible';
  }
  if(s.id==='enfen')return s.latest_date?`Comunicado: ${dateLabel(s.latest_date)}`:'Sin comunicado verificado';
  if(s.id==='cenepred_risk')return 'Plan 2025–2027 · sin fecha de publicación indicada';
  if(s.id==='cenepred_points')return 'Cada ficha tiene su fecha; no hay una fecha para todo el listado';
  if(s.id==='boundaries')return 'Mapa de referencia · sin fecha oficial de revisión';
  if(s.id==='district_boundaries')return 'Mapa del plan 2025–2027 · sin fecha oficial de revisión';
  return s.latest_date?`${s.id==='noaa_monthly'?'Cierre mensual':'Último dato'}: ${dateLabel(s.latest_date)}`:'Fecha no informada por la fuente';
}
const SOURCE_NAMES={enfen:'Estado oficial de El Niño en Perú',senamhi_forecast:'Tiempo previsto por localidad',noaa_weekly:'Calor del mar · datos semanales',noaa_monthly:'Calor del mar · datos mensuales',noaa_ocean_sst:'Mapa diario del calor del mar',noaa_ocean_currents:'Corrientes del mar · estimación experimental',district_forecast:'Tiempo previsto por distrito · NOAA GFS',cenepred_risk:'Distritos con riesgo de inundación o deslizamientos',cenepred_points:'Lugares con fichas de riesgo',boundaries:'Mapa de departamentos',district_boundaries:'Mapa de distritos'};
function renderSources() {
  const providers=[{name:'ENFEN',ids:['enfen'],url:'https://enfen.imarpe.gob.pe/comunicados/'},{name:'SENAMHI',ids:['senamhi_forecast'],url:'https://www.senamhi.gob.pe/?p=pronostico-meteorologico'},{name:'NOAA',ids:['noaa_weekly','noaa_monthly','noaa_ocean_sst','noaa_ocean_currents','district_forecast'],url:'https://www.cpc.ncep.noaa.gov/data/indices/'},{name:'CENEPRED',ids:['cenepred_risk','cenepred_points','boundaries','district_boundaries'],url:'https://sigrid.cenepred.gob.pe/sigridv3/'}];
  const order={ok:0,stale:1,degraded:2,unavailable:3};
  $('source-cards').innerHTML=providers.map(p=>{
    const sources=p.ids.map(id=>state.manifest.sources.find(s=>s.id===id)).filter(Boolean);
    const status=sources.map(clientStatus).sort((a,b)=>order[b]-order[a])[0]??'unavailable';
    return `<article class="source-card"><div class="source-card-header"><h3>${p.name}</h3><span class="source-state ${status}">${STATUS[status]}</span></div>${sources.map(s=>`<div class="source-item" id="source-${e(s.id)}"><div class="source-title">${e(SOURCE_NAMES[s.id]??s.title)}</div><div class="source-meta">${STATUS[clientStatus(s)]}</div><dl class="source-dates"><div><dt>Fecha del dato o del pronóstico</dt><dd>${e(sourceDataLabel(s))}</dd></div><div><dt>Última revisión correcta</dt><dd>${e(timestamp(s.last_success))}</dd></div></dl>${s.error?`<p class="source-error">Falló la última revisión.${s.last_success?' Conservamos los últimos datos que pasaron los controles.':' Aún no hay datos que hayan pasado los controles.'}</p>`:''}${clientStatus(s)==='stale'?'<p class="source-error">Estos datos son antiguos. Comprueba su fecha antes de usarlos para conocer la situación actual.</p>':''}<details class="source-technical reading-details"><summary>Más fechas y detalles técnicos</summary><p>Producto: ${e(s.title)}<br>Último intento de revisión: ${e(timestamp(s.checked_at))}<br>Último cambio detectado en esta página: ${e(timestamp(s.data_updated_at))}<br>${s.last_success?fmt(s.records??0)+' registros comprobados.':'Sin datos comprobados.'}<br>${e(s.cadence)}${s.id==='senamhi_forecast'?'<br>La fuente no informa aquí la hora en que elaboró el pronóstico.':''}</p><p>${s.data_sha256?'Código de integridad SHA-256: '+e(s.data_sha256):'Sin código de integridad disponible'}${s.error?'<br>Detalle del error: '+e(s.error):''}</p></details><div class="source-links"><a class="text-link" href="${e(safeUrl(s.url,p.url))}" target="_blank" rel="noopener">Abrir fuente ↗</a>${s.last_success?`<a class="text-link" href="data/${e(s.file??s.id+'.json')}" target="_blank" rel="noopener">Descargar datos ↗</a>`:''}</div></div>`).join('')}<a href="${p.url}" target="_blank" rel="noopener">Referencia oficial ↗</a></article>`;
  }).join('');
  $('data-freshness').innerHTML=[['district_forecast','Tiempo por distrito'],['enfen','Estado de El Niño'],['noaa_weekly','Calor del mar'],['noaa_ocean_sst','Mapa del mar'],['senamhi_forecast','Tiempo · SENAMHI'],['cenepred_risk','Riesgo · CENEPRED']].map(([id,label])=>{const s=state.manifest.sources.find(s=>s.id===id);return s?`<a href="#source-${id}" class="freshness-item ${clientStatus(s)}"><span>${label}<i>${STATUS[clientStatus(s)]}</i></span><b>${e(sourceDataLabel(s))}</b></a>`:'';}).join('');
  renderDocuments();
}

function renderDocuments(){
  $('official-documents').innerHTML=state.manifest.sources.filter(s=>s.category==='documents').map(s=>{
    const docs=state.data[s.id]?.data??[],status=clientStatus(s),label=row=>row.published_date?'Publicación: '+dateLabel(row.published_date):row.reference_date?'Corte del informe: '+dateLabel(row.reference_date):row.period?'Periodo: '+row.period+' · fecha de publicación no indicada':'La fuente no indica la fecha de publicación';
    const item=row=>`<li><a href="${e(safeUrl(row.url,s.url))}" target="_blank" rel="noopener">${e(row.title)} ↗</a><span>${e(label(row))}</span>${row.status_original?`<small>Estado original NOAA: ${e(row.status_original)}</small><details><summary>Síntesis original (inglés)</summary><p lang="en">${e(row.summary_original)}</p></details>`:''}<small>${e(row.scope)}</small></li>`;
    return `<article class="official-document-card" id="source-${e(s.id)}"><div class="source-card-header"><h3>${e(s.provider)}</h3><span class="source-state ${status}">${STATUS[status]}</span></div><h4>${e(s.title)}</h4><p>Última revisión correcta: ${e(timestamp(s.last_success))}</p>${s.error?'<p class="source-error">Falló la consulta. Se conserva el catálogo anterior cuando está disponible.</p>':''}<details class="reading-details"><summary>Más detalles de la revisión</summary><p>Último intento: ${e(timestamp(s.checked_at))}<br>${e(s.cadence)}</p></details><ul>${docs.slice(0,2).map(item).join('')}</ul>${docs.length>2?`<details><summary>Ver ${docs.length-2} documentos más</summary><ul>${docs.slice(2).map(item).join('')}</ul></details>`:''}<a class="text-link" href="${e(safeUrl(s.url))}" target="_blank" rel="noopener">Abrir fuente oficial ↗</a></article>`;
  }).join('');
}

function renderInsights(){
  if(!state.manifest)return;
  const scope=state.department==='all'?'Todo el Perú':titleCase(state.data.boundaries?.data.features.find(f=>f.properties.code===state.department)?.properties.name??state.department);
  const district=selectedDistrict(),riskScope=district?`${titleCase(district.district)}, ${titleCase(district.province)}, ${scope}`:scope;
  $('insight-scope').textContent=`${riskScope} · del ${dateLabel(state.from)} al ${dateLabel(state.to)}. Cada tarjeta indica si es un dato registrado, un pronóstico o un riesgo posible.`;
  const bulletin=state.data.enfen?.data;
  const key=state.frequency==='monthly'?'noaa_monthly':'noaa_weekly',all=state.data[key]?.data??[],index=selectNoaa(all,state,state.frequency==='monthly').at(-1);
  const risks=selectedRisks(),classified=risks.filter(r=>r.risk_level),high=classified.filter(r=>highRisk(r.risk_level));
  const forecasts=forecastSummary(state.forecastRows);
  const issues=state.manifest.sources.filter(s=>s.kind!=='reference'&&clientStatus(s)!=='ok');
  const source=id=>state.manifest.sources.find(s=>s.id===id);
  const incident=id=>{const s=source(id);return s&&clientStatus(s)!=='ok'?` Atención: ${STATUS[clientStatus(s)].toLowerCase()}. Consulta la fecha de esta fuente.`:'';};
  const range=forecasts.dates.length?`${dateLabel(forecasts.dates[0])} – ${dateLabel(forecasts.dates.at(-1))}`:'Sin fechas disponibles';
  const cards=[
    {type:'QUÉ DICE ENFEN · ESTADO OFICIAL',tone:'red',title:bulletin?.alert??'Sin comunicado disponible',text:bulletin?`Es el estado que ENFEN comunicó el ${dateLabel(bulletin.published_date)}. Puedes abrir el documento para conocer su explicación y lo que espera para los próximos meses.${incident('enfen')}`:'No hay un comunicado verificado disponible en esta página.',note:'La fecha del comunicado es importante. Cambiar los filtros no cambia la alerta oficial.',url:bulletin?safeUrl(bulletin.document_url):'#fuentes',action:'Leer el comunicado de ENFEN',external:Boolean(bulletin)},
    {type:'CÓMO ESTÁ EL MAR · DATO REGISTRADO',tone:'orange',title:index?`Cerca de Perú: ${anomalyWords(index.nino12_anomaly,state.frequency==='monthly'?2:1)}`:'Sin dato del mar para estas fechas',text:index?`En el Pacífico central está ${anomalyWords(index.nino34_anomaly,state.frequency==='monthly'?2:1).toLocaleLowerCase('es')}. Dato ${state.frequency==='monthly'?'mensual':'semanal'} del ${dateLabel(index.date)}.${incident(key)}`:'Prueba otro periodo para consultar los datos semanales o mensuales disponibles.',note:'Compara la temperatura del mar con lo habitual para esa época. No es la temperatura del aire en tu ciudad.',url:'#series',action:'Ver cómo ha cambiado el mar'},
    {type:'DÓNDE PREPARARSE · RIESGO POSIBLE',tone:'amber',title:district?`${titleCase(district.district)}: riesgo ${district.risk_level?.toLocaleLowerCase('es')??'sin clasificar'}`:classified.length?`${fmt(high.length)} distritos con riesgo alto o muy alto`:'Sin datos de riesgo para esta zona',text:classified.length?`De ${fmt(classified.length)} distritos evaluados en ${riskScope}, según CENEPRED para 2025–2027. Peligro: ${HAZARDS[state.hazard].toLocaleLowerCase('es')}.${incident('cenepred_risk')}`:'La falta de datos no significa que no exista riesgo.',note:'Sirve para identificar dónde prepararse. No es un conteo de distritos afectados hoy.',url:'#zonas',action:'Ver los distritos y sus fichas'},
    {type:'CUÁNTO CALOR SE ESPERA · PRONÓSTICO',tone:'cyan',title:forecasts.max?`Hasta ${fmt(forecasts.max.tmax_c,1)} °C en ${titleCase(forecasts.max.locality)}`:'Sin temperatura prevista para estas fechas',text:forecasts.max?`${titleCase(forecasts.max.department)} · ${dateLabel(forecasts.max.valid_date)}.${forecasts.min?` El valor más frío de la selección es ${fmt(forecasts.min.tmin_c,1)} °C en ${titleCase(forecasts.min.locality)}, para el ${dateLabel(forecasts.min.valid_date)}.`:''}${incident(modelWeather()?'district_forecast':'senamhi_forecast')}`:'Prueba otras fechas o consulta la otra fuente de pronóstico.',note:'Son los valores más altos y más bajos entre los pronósticos disponibles. Pueden cambiar.',url:'#meteo',action:'Consultar el pronóstico de mi zona'},
    {type:'QUÉ SE ESPERA DE LA LLUVIA · PRONÓSTICO',tone:'cyan',title:forecasts.records?`${fmt(forecasts.rainLocalities)} localidades con mención de lluvia`:'Sin descripción de la lluvia disponible',text:forecasts.records?`SENAMHI menciona lluvia en ${fmt(forecasts.rainRecords)} de ${fmt(forecasts.records)} pronósticos de localidad y día. Fechas: ${range}.${incident('senamhi_forecast')}`:'Prueba otras fechas o consulta la otra fuente de pronóstico.',note:'Este conteo no dice cuánto lloverá ni la probabilidad de que llueva. Lee la descripción de tu localidad.',url:'#meteo',action:'Leer lo que dice SENAMHI'},
    {type:'QUÉ TAN RECIENTES SON LOS DATOS',tone:'slate',title:issues.length?`${issues.length} ${issues.length===1?'fuente necesita':'fuentes necesitan'} revisión`:'Las fuentes están al día',text:issues.length?'Alguna fuente tiene datos antiguos, falló en la última descarga o todavía no está disponible. Puedes ver cuál es y de qué fecha es su información.':'Las fuentes disponibles pasaron los controles de descarga y de fecha definidos para cada producto.',note:'Revisa la fecha del dato antes de usarlo para conocer la situación actual.',url:'#fuentes',action:'Ver las fuentes y sus fechas'},
  ];
  if(modelWeather()){
    cards[3].type='CUÁNTO CALOR SE ESPERA · NOAA GFS';cards[3].note='Estimación para un punto del distrito en un periodo de 24 horas. El tiempo puede variar dentro del distrito.';
    const wettest=[...state.forecastRows].filter(r=>Number.isFinite(r.precipitation_mm)).sort((a,b)=>b.precipitation_mm-a.precipitation_mm)[0];
    cards[4]={type:'CUÁNTA LLUVIA SE ESPERA · NOAA GFS',tone:'cyan',title:wettest?`${fmt(wettest.precipitation_mm,1)} mm en 24 horas en ${titleCase(wettest.locality)}`:'Sin cantidad de lluvia estimada',text:wettest?`Es la mayor cantidad prevista entre los puntos y fechas de tu selección. Periodo: ${windowLabel(wettest)}.${incident('district_forecast')}`:'Prueba otras fechas o consulta la otra fuente de pronóstico.',note:'1 mm equivale a 1 litro de agua por metro cuadrado. Es una estimación para un punto del distrito, no una medición de lluvia ocurrida.',url:'#meteo',action:'Ver el pronóstico y sus horas'};
  }
  $('insight-cards').innerHTML=cards.map(c=>`<article class="insight-card insight-${c.tone}"><span class="insight-type">${e(c.type)}</span><h3>${e(c.title)}</h3><p>${e(c.text)}</p><div class="insight-reading">${e(c.note)}</div><a href="${e(c.url)}"${c.external?' target="_blank" rel="noopener"':''}>${e(c.action)} ↗</a></article>`).join('');
}
function renderGlossary(){
  const search=normalize($('glossary-search').value),category=$('glossary-category').value;
  const rows=GLOSSARY.filter(([,term,group,definition])=>(category==='all'||category===group)&&normalize(term+' '+definition).includes(search));
  $('glossary-count').textContent=`${rows.length} de ${GLOSSARY.length} términos`;
  $('glossary-empty').hidden=rows.length>0;
  $('glossary-entries').innerHTML=rows.map(([id,term,group,definition,url,reference])=>`<details id="term-${id}" class="glossary-entry" ${search?'open':''}><summary><span>${e(term)}</span><small>${e(GLOSSARY_CATEGORIES[group])}</small></summary><p>${e(definition)}</p><a href="${e(url)}"${url.startsWith('https://')?' target="_blank" rel="noopener"':''}>${e(reference)} ↗</a></details>`).join('');
}
function openGlossaryTerm(){
  if(!/^#term-[a-z0-9-]+$/.test(location.hash))return;
  if(!GLOSSARY.some(([id])=>'#term-'+id===location.hash))return;
  $('glossary-search').value='';$('glossary-category').value='all';renderGlossary();
  const target=document.getElementById(location.hash.slice(1));target.open=true;
  requestAnimationFrame(()=>target.scrollIntoView({block:'center',behavior:'smooth'}));
}

let rendering=0;
async function applyFilters(fit=false) {
  if (!readFilters()) return;
  stopPlayback();
  const turn=++rendering;
  state.forecastPage=0;state.zonePage=0;
  await Promise.all([ensureForecastHistory(),ensureGridHistory(),ensureOceanHistory(),ensureDistrictBoundaries()]);
  try {await ensurePoints();} catch (error) {$('filter-notice').textContent='No se pudo cargar el inventario geográfico. Las otras fuentes conservan su disponibilidad.';console.error(error);}
  if (turn!==rendering) return;
  refreshWeatherRows();
  $('filter-notice').textContent=`${dateLabel(state.from)} – ${dateLabel(state.to)}. Las fechas cambian los datos del mar y los pronósticos que consultas. El riesgo usa el plan CENEPRED 2025–2027 y no cambia al elegir otro día. ENFEN muestra su último comunicado verificado.`;
  renderKpis();renderMap();renderCharts();renderForecastTable();renderZones();
  if (fit) reframe();
}

function setKind(kind) {
  stopPlayback();
  state.kind=kind;
  document.querySelectorAll('[data-kind]').forEach(b=>{b.classList.toggle('selected',b.dataset.kind===kind);b.setAttribute('aria-pressed',String(b.dataset.kind===kind));});
  const options=kind==='risk_scenario'?[['heat','Lugares documentados por zona'],['risk','Distritos en riesgo alto o muy alto']]:kind==='forecast'?[['tmax','Temperatura máxima'],['tmin','Temperatura mínima'],['rain','Textos que mencionan lluvia']]:[['sst','Calor del mar respecto a lo habitual']];
  $('map-layer').innerHTML=options.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
  if(kind==='forecast'){options[2][1]=modelWeather()?'Lluvia · mm en 24 horas':'Textos que mencionan lluvia';const dates=forecastDates(state.forecastRows);if(state.frameDate==='all')state.frameDate=dates.find(d=>d>=limaDate())??dates.at(-1)??'all';$('map-layer').innerHTML=options.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');}
  state.layer=options[0][0];$('hazard-wrap').hidden=kind!=='risk_scenario';
  state.oceanExtent='national';renderMap();reframe();
}
async function exportData() {
  let rows,fields;
  if (state.kind==='forecast') {rows=state.forecastRows;fields=['provider','ubigeo','locality_id','locality','province','department','valid_date','valid_start','valid_end','issued_at','lat','lon','grid_lat','grid_lon','tmax_c','tmin_c','description','precipitation_mm','precipitation_probability','collected_at','source_url'];}
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
  const changeWeatherSource=event=>{stopPlayback();state.forecastProvider=event.target.value;state.forecastPage=0;state.frameDate='all';refreshWeatherRows();if(state.kind==='forecast'){const dates=forecastDates(state.forecastRows);state.frameDate=dates.find(d=>d>=limaDate())??dates.at(-1)??'all';const rain=$('map-layer').querySelector('option[value="rain"]');if(rain)rain.textContent=modelWeather()?'Lluvia · mm en 24 horas':'Textos que mencionan lluvia';}renderKpis();renderMap();renderCharts();renderForecastTable();};
  $('forecast-provider').addEventListener('change',changeWeatherSource);$('weather-provider').addEventListener('change',changeWeatherSource);
  $('forecast-frame').addEventListener('change',()=>{stopPlayback();state.frameDate=$('forecast-frame').value;renderMap();});
  $('weather-metric').addEventListener('change',()=>{state.layer=$('weather-metric').value;$('map-layer').value=state.layer;renderMap();});
  $('map-play').addEventListener('click',()=>state.playing?stopPlayback():startPlayback());
  $('weather-motion').addEventListener('click',()=>{state.weatherMotion=!state.weatherMotion;renderMap();});
  $('weather-days').addEventListener('click',event=>{const button=event.target.closest('[data-weather-date]');if(!button)return;stopPlayback();state.frameDate=button.dataset.weatherDate;if(state.kind!=='forecast')setKind('forecast');else renderMap();});
  $('map-touch').addEventListener('click',()=>{const active=$('map-touch').getAttribute('aria-pressed')!=='true';$('map-touch').setAttribute('aria-pressed',String(active));$('map-touch').textContent=active?'Pausar gestos':'Activar gestos';$('map').classList.toggle('gestures-paused',!active);state.map.dragging[active?'enable':'disable']();state.map.touchZoom[active?'enable':'disable']();state.map.doubleClickZoom[active?'enable':'disable']();$('map-gesture-hint').textContent=active?'Arrastra para mover el mapa y pellizca con dos dedos para acercar. Pausa los gestos para desplazar la página desde el mapa.':'Gestos pausados: desliza sobre el mapa para desplazar la página. Activa los gestos para mover y ampliar el mapa.';});
  $('glossary-search').addEventListener('input',renderGlossary);$('glossary-category').addEventListener('change',renderGlossary);
  $('glossary-clear').addEventListener('click',()=>{$('glossary-search').value='';$('glossary-category').value='all';renderGlossary();$('glossary-search').focus();});
  window.addEventListener('hashchange',openGlossaryTerm);
  $('filters').addEventListener('submit',event=>event.preventDefault());
  for (const id of ['from','to','month','department']) $(id).addEventListener('change',()=>void applyFilters(id==='department'));
  $('period').addEventListener('change',()=>{updatePeriodInputs();void applyFilters();});
  $('reset').addEventListener('click',()=>{setDefaults();$('forecast-search').value='';$('zone-search').value='';$('document-date').checked=false;void applyFilters(true);});
  document.querySelectorAll('[data-kind]').forEach(b=>b.addEventListener('click',()=>setKind(b.dataset.kind)));
  document.querySelectorAll('[data-map-mode]').forEach(b=>b.addEventListener('click',()=>{const mode=b.dataset.mapMode;setKind(mode==='sst'?'observation':mode==='rain'?'forecast':'risk_scenario');if(mode!=='sst'){state.layer=mode;$('map-layer').value=mode;renderMap();}}));
  $('vectors-toggle').addEventListener('click',()=>{if(state.kind!=='observation'){state.vectors=true;setKind('observation');}else{state.vectors=!state.vectors;renderMap();}});
  const showExtent=extent=>{state.oceanExtent=extent;$('department').value='all';state.district='all';state.inspectorDistrict=null;void applyFilters(true);};
  $('national-view').addEventListener('click',()=>showExtent('national'));$('coverage-all').addEventListener('click',()=>showExtent('national'));
  $('coast-view').addEventListener('click',()=>showExtent('coast'));
  $('pacific-view').addEventListener('click',()=>showExtent('pacific'));$('nino34-inset').addEventListener('click',()=>showExtent(state.oceanExtent==='pacific'?'national':'pacific'));
  $('inspector-department').addEventListener('change',()=>selectTerritory($('inspector-department').value));
  $('inspector-district').addEventListener('change',()=>selectDistrict($('inspector-district').value));
  $('clear-territory').addEventListener('click',()=>showExtent('national'));
  $('territory-grid').addEventListener('click',event=>{const button=event.target.closest('[data-department]');if(button)selectTerritory(button.dataset.department);});
  const inspectRow=event=>{if(event.target.closest('a'))return;const row=event.target.closest('tr[data-ubigeo]');if(row)selectDistrict(row.dataset.ubigeo);};
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
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)document.querySelectorAll('.nav-link,.mobile-nav a').forEach(a=>a.classList.toggle('active',a.hash==='#'+entry.target.id));},{rootMargin:'-10% 0px -65% 0px'});
  document.querySelectorAll('section[id]').forEach(s=>observer.observe(s));
  state.map?.on('zoomend',()=>{if(state.kind==='risk_scenario'&&state.layer==='heat')renderMap();});
  state.map?.on('moveend zoomend',()=>requestAnimationFrame(layoutTerritoryLabels));
}

try {
  setDefaults();renderGlossary();await loadData();initMap();bindEvents();await applyFilters(true);openGlossaryTerm();
  setInterval(()=>void refreshPublication(),15*60*1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshPublication();});
} catch(error) {
  $('load-message').hidden=false;$('load-message').classList.add('error');
  $('load-message').textContent='No se pudo cargar el conjunto de datos publicado. Revise la conexión y el estado de las ejecuciones en GitHub Actions.';
  console.error(error);
}
