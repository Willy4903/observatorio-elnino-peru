import {mean} from './selectors.mjs';

// Solo fuentes que se publican a diario o cada pocos días. Cada tarjeta declara hasta cuántos días de antigüedad se considera al día.
const COAST={latMin:-18,latMax:-3,lonMin:-86,lonMax:-78};
const short=label=>String(label).replace(/\.?\s\d{4}$/,'');
const dayDiff=(from,to)=>Math.round((Date.parse(to.slice(0,10)+'T12:00:00Z')-Date.parse(from.slice(0,10)+'T12:00:00Z'))/86400000);

export function ageText(date,today){
  const d=dayDiff(date,today);
  return d<=0?'hoy':d===1?'ayer':`hace ${d} días`;
}
export function ageLabel(date,today){
  const d=dayDiff(date,today);
  return d<=0?'de hoy':d===1?'de ayer':`de hace ${d} días`;
}
function freshness(date,today,maxDays,status){
  const age=dayDiff(date,today);
  if(['stale','unavailable'].includes(status)||age>maxDays)return 'old';
  return status==='degraded'?'check':'fresh';
}
const seaWords=value=>{
  const a=Math.abs(value);
  if(a<0.3)return {title:'El mar frente a Perú está en su temperatura habitual',tone:'cyan'};
  const degree=a<1?'algo más':a<2?'más':'mucho más';
  return value>0
    ?{title:`El mar frente a Perú está ${degree} caliente de lo habitual`,tone:a>=1?'red':'orange'}
    :{title:`El mar frente a Perú está ${degree} frío de lo habitual`,tone:'cyan'};
};

export function coastalSea(rows){
  const dates=rows.map(r=>r.date).filter(Boolean).sort();
  const date=dates.at(-1);
  if(!date)return null;
  const cells=rows.filter(r=>r.date===date&&Number.isFinite(r.anomaly_c)&&r.lat>=COAST.latMin&&r.lat<=COAST.latMax&&r.lon>=COAST.lonMin&&r.lon<=COAST.lonMax);
  if(!cells.length)return null;
  return {date,anomaly:mean(cells.map(r=>r.anomaly_c)),sst:mean(cells.filter(r=>Number.isFinite(r.sst_c)).map(r=>r.sst_c)),cells:cells.length};
}

// Devuelve las tarjetas de "Lo último" ordenadas de la información más reciente a la más antigua.
export function buildLatest({today,sea=[],forecast=[],news=[],status={},fmt,dateLabel,titleCase,newsMax=7}){
  const items=[];
  const st=id=>status[id]??'ok';

  const coast=coastalSea(sea);
  if(coast){
    const w=seaWords(coast.anomaly);
    items.push({id:'sea',tag:'MAR',title:w.title,text:`Frente a la costa peruana el mar marca en promedio ${fmt(coast.sst,1)} °C, es decir ${fmt(Math.abs(coast.anomaly),1)} °C ${coast.anomaly>=0?'por encima':'por debajo'} de lo normal para esta época. Dato del ${dateLabel(coast.date)}, ${ageText(coast.date,today)}.`,note:'No es la temperatura del aire en tu ciudad. Un día aislado no confirma El Niño: el aviso oficial lo da ENFEN.',date:coast.date,sort:coast.date+'T12',tone:w.tone,fresh:freshness(coast.date,today,3,st('noaa_ocean_sst')),url:'#panorama',action:'Ver el mapa del mar',source:'NOAA',about:'agencia de EE. UU. que mide el océano y el clima',term:'noaa'});
  }

  const rows=forecast.filter(r=>r.valid_date>=today);
  if(rows.length){
    const issued=rows.map(r=>r.issued_at).filter(Boolean).sort().at(-1)??today;
    const dates=[...new Set(rows.map(r=>r.valid_date))].sort();
    const withRain=rows.filter(r=>Number.isFinite(r.precipitation_mm));
    const wettest=[...withRain].sort((a,b)=>b.precipitation_mm-a.precipitation_mm)[0];
    const rainy=new Set(withRain.filter(r=>r.precipitation_mm>=1).map(r=>r.ubigeo));
    const total=new Set(withRain.map(r=>r.ubigeo));
    const d1=short(dateLabel(dates[0])),d2=short(dateLabel(dates.at(-1)));
    const range=dates.length>1?`entre el ${d1.split(' ')[1]===d2.split(' ')[1]?d1.split(' ')[0]:d1} y el ${d2}`:`para el ${d1}`;
    if(wettest&&wettest.precipitation_mm>=1){
      items.push({id:'rain',tag:'LLUVIA',title:`Podría llover en el ${fmt(100*rainy.size/total.size)} % de los distritos del país`,text:`Es decir, en ${fmt(rainy.size)} de ${fmt(total.size)} distritos, ${range}. Cuenta los que podrían recibir 1 mm o más de lluvia. La mayor cantidad prevista en un día es ${fmt(wettest.precipitation_mm,1)} mm en ${titleCase(wettest.district??wettest.locality)} (${titleCase(wettest.department)}), el ${short(dateLabel(wettest.valid_date))}.`,note:'1 mm equivale a 1 litro de agua por metro cuadrado. Es una estimación y puede cambiar en las próximas horas.',date:issued.slice(0,10),sort:issued,tone:'cyan',fresh:freshness(issued,today,1,st('district_forecast')),url:'#meteo',action:'Ver el pronóstico de mi zona',source:'NOAA GFS',about:'modelo de EE. UU. que calcula el tiempo de los próximos días',term:'gfs'});
    }else if(withRain.length){
      items.push({id:'rain',tag:'LLUVIA',title:`Sin lluvia apreciable prevista ${range}`,text:'En ningún distrito se estima 1 mm o más en 24 horas.',note:'Es una estimación y puede cambiar.',date:issued.slice(0,10),sort:issued,tone:'cyan',fresh:freshness(issued,today,1,st('district_forecast')),url:'#meteo',action:'Ver el pronóstico de mi zona',source:'NOAA GFS',about:'modelo de EE. UU. que calcula el tiempo de los próximos días',term:'gfs'});
    }
    const hot=rows.filter(r=>Number.isFinite(r.tmax_c)).sort((a,b)=>b.tmax_c-a.tmax_c)[0];
    const cold=rows.filter(r=>Number.isFinite(r.tmin_c)).sort((a,b)=>a.tmin_c-b.tmin_c)[0];
    if(hot){
      items.push({id:'temp',tag:'TEMPERATURA',title:`Hasta ${fmt(hot.tmax_c,1)} °C en ${titleCase(hot.district??hot.locality)}`,text:`Es el lugar más caluroso previsto (${titleCase(hot.department)}, ${short(dateLabel(hot.valid_date))}).${cold?` El más frío: ${fmt(cold.tmin_c,1)} °C en ${titleCase(cold.district??cold.locality)} (${titleCase(cold.department)}), el ${short(dateLabel(cold.valid_date))}.`:''}`,note:'Es la estimación para un punto del distrito; en zonas de relieve variado puede cambiar bastante.',date:issued.slice(0,10),sort:issued,tone:'orange',fresh:freshness(issued,today,1,st('district_forecast')),url:'#meteo',action:'Ver temperaturas por distrito',source:'NOAA GFS',about:'modelo de EE. UU. que calcula el tiempo de los próximos días',term:'gfs'});
    }
  }

  const recent=[...news].filter(n=>n.published_date).sort((a,b)=>b.published_date.localeCompare(a.published_date))[0];
  if(recent){
    items.push({id:'news',tag:'PREPARACIÓN',title:recent.title,text:`Publicado el ${dateLabel(recent.published_date)}, ${ageText(recent.published_date,today)}.`,note:'Una noticia o recomendación no confirma por sí sola una emergencia.',date:recent.published_date,sort:recent.published_date+'T12',tone:'amber',fresh:freshness(recent.published_date,today,newsMax,st('indeci_news')),url:recent.url,external:true,action:'Leer la noticia de INDECI',source:'INDECI',about:'Defensa Civil de Perú',term:'indeci'});
  }

  const order={fresh:0,check:1,old:2};
  return items.sort((a,b)=>order[a.fresh]-order[b.fresh]||b.sort.localeCompare(a.sort));
}
