import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {buildLatest,coastalSea,ageLabel} from '../site/assets/latest.mjs';

const read=f=>JSON.parse(gunzipSync(readFileSync(new URL('../site/data/'+f,import.meta.url)))).data;
const fmt=(n,d=0)=>n==null?'—':n.toFixed(d),dateLabel=d=>d,titleCase=t=>String(t);

test('las tarjetas salen ordenadas por frescura y con datos reales',()=>{
  const sea=read('noaa_ocean_sst.json.gz'),forecast=read('district_forecast.json.gz');
  const news=JSON.parse(readFileSync(new URL('../site/data/indeci_news.json',import.meta.url))).data;
  const items=buildLatest({today:coastalSea(sea).date,sea,forecast,news,fmt,dateLabel,titleCase});
  assert.deepEqual(items.map(i=>i.id).sort(),['news','rain','sea','temp']);
  assert.ok(items.every(i=>i.title&&i.date&&i.source));
  const sea1=items.find(i=>i.id==='sea');assert.equal(sea1.date,coastalSea(sea).date);assert.equal(sea1.fresh,'fresh');
});
test('un dato viejo o con fuente caída se marca y pasa al final',()=>{
  const sea=read('noaa_ocean_sst.json.gz');
  // La fecha "de hoy" se calcula desde el dato del mar: así la prueba no caduca cuando el robot actualiza los datos.
  const later=new Date(coastalSea(sea).date+'T12:00:00Z');later.setUTCDate(later.getUTCDate()+5);
  const items=buildLatest({today:later.toISOString().slice(0,10),sea,status:{noaa_ocean_sst:'ok'},fmt,dateLabel,titleCase});
  assert.equal(items[0].fresh,'old');
  const degraded=buildLatest({today:'2026-10-26',sea,status:{noaa_ocean_sst:'degraded'},fmt,dateLabel,titleCase});
  assert.equal(degraded[0].fresh,'check');
});
test('sin datos no inventa tarjetas',()=>{
  assert.deepEqual(buildLatest({today:'2026-10-26',fmt,dateLabel,titleCase}),[]);
  assert.equal(coastalSea([]),null);assert.equal(ageLabel('2026-10-25','2026-10-26'),'de ayer');
});
