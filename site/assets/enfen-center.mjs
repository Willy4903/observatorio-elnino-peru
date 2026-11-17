// Centro de monitoreo del estado ENFEN (#estado-enfen).
// Solo usa datos publicados que ya descarga el observatorio: NOAA CPC (índices Niño mensuales y semanales),
// el último comunicado y el informe técnico ENFEN, y el manifiesto de fuentes. No genera probabilidades
// ni cifras propias: lo que no está publicado en forma de datos se enlaza a su documento oficial.
import { anomalyColor } from './ocean.mjs';
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n, d = 1) => n == null || Number.isNaN(n) ? '—' : new Intl.NumberFormat('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const signed = (n, d = 1) => n == null ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + num(Math.abs(n), d);
const fecha = (iso) => iso ? new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso.slice(0, 10) + 'T12:00:00Z')) : 'sin fecha';
const mes = (iso) => new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso.slice(0, 10) + 'T12:00:00Z'));
const mesCorto = (iso) => new Intl.DateTimeFormat('es-PE', { month: 'short', timeZone: 'UTC' }).format(new Date(iso.slice(0, 10) + 'T12:00:00Z')).replace('.', '');
const hora = (iso) => iso ? new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' }).format(new Date(iso)) + ' (Lima)' : 'sin consulta';

/* Escala de magnitud de El Niño costero según el ICEN (ENFEN, nota técnica 01-2012). */
const ESCALA = [
  { id: 'neutro', n: 'Neutro', r: 'menor a +0,4 °C', min: -Infinity, max: 0.4, d: 'Este tramo resume valores por debajo del umbral cálido. También puede incluir condiciones frías: no permite declarar neutralidad ni descartar un evento. La clasificación oficial corresponde al ICEN de ENFEN.' },
  { id: 'debil', n: 'Cálido débil', r: '+0,4 a +1,0 °C', min: 0.4, max: 1.0, d: 'El mar está algo más caliente que lo normal. Puede haber cambios en la pesca y algunas lluvias fuera de temporada.' },
  { id: 'moderado', n: 'Moderado', r: '+1,0 a +1,7 °C', min: 1.0, max: 1.7, d: 'Calentamiento claro. Aumenta la posibilidad de lluvias por encima de lo normal en la costa norte.' },
  { id: 'fuerte', n: 'Fuerte', r: '+1,7 a +3,0 °C', min: 1.7, max: 3.0, d: 'Calentamiento intenso. En eventos fuertes, como 2017, hubo lluvias intensas, huaicos y desbordes en la costa norte y centro.' },
  { id: 'extra', n: 'Extraordinario', r: 'mayor a +3,0 °C', min: 3.0, max: Infinity, d: 'El nivel más alto de la escala, alcanzado en 1982-83 y 1997-98. Se asocia a lluvias muy intensas y daños extendidos.' },
];
const COLOR = { neutro: '#22d3ee', debil: '#f59e0b', moderado: '#f97316', fuerte: '#ef4444', extra: '#dc2626' };
const MAX_ESCALA = 6; // la longitud de las barras cubre de 0 a +6 °C
const nivelDe = (v) => ESCALA.find((x) => v >= x.min && v < x.max) || ESCALA[0];

async function json(path) {
  const r = await fetch(path, { cache: 'no-cache' });
  if (!r.ok) throw new Error(path);
  if (path.endsWith('.gz')) {
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  return r.json();
}

/* Mini gráfico de tendencia con área degradada, línea de umbral opcional y punto final. */
let sparkN = 0;
function spark(values, { umbral = null, label = '' } = {}) {
  const v = values.filter((x) => x != null);
  if (v.length < 2) return '';
  const id = 'cmx-sg' + (++sparkN);
  const w = 160, h = 48, p = 5, lo = Math.min(...v, umbral ?? Infinity, 0), hi = Math.max(...v, umbral ?? -Infinity), d = hi - lo || 1;
  const xy = v.map((y, i) => [p + (i * (w - 2 * p)) / (v.length - 1), h - p - ((y - lo) / d) * (h - 2 * p)]);
  const line = xy.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');
  const last = xy.at(-1), yU = umbral == null ? null : h - p - ((umbral - lo) / d) * (h - 2 * p);
  return `<svg class="cmc-spark cmx-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">` +
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".42"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>` +
    (yU == null ? '' : `<line x1="0" x2="${w}" y1="${yU.toFixed(1)}" y2="${yU.toFixed(1)}" class="cmc-spark-u"/>`) +
    `<polygon points="${p},${h - p} ${line} ${w - p},${h - p}" fill="url(#${id})"/><polyline points="${line}" class="cmc-spark-l"/>` +
    `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.4" class="cmc-spark-d"/></svg>`;
}

/* Flecha de tendencia: solo decorativa; el sentido se dice con palabras en la línea siguiente. */
const flecha = (d) => {
  const up = d != null && d > 0.005, down = d != null && d < -0.005;
  if (d == null) return '';
  return `<svg class="cmx-arrow ${up ? 'up' : down ? 'down' : 'flat'}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${up ? 'M7 17 17 7M9 7h8v8' : down ? 'M7 7l10 10M17 9v8H9' : 'M5 12h14M14 7l5 5-5 5'}"/></svg>`;
};

/* Esquema ilustrativo de una onda Kelvin (calor bajo la superficie) en perspectiva. No muestra datos. */
function kelvin() {
  const W = 200, H = 84, filas = 9, cols = 36, capas = [];
  for (let r = 0; r < filas; r++) {
    const t = r / (filas - 1), y0 = H - 12 - t * 40, dx = t * 28, pts = [];
    for (let c = 0; c <= cols; c++) {
      const u = c / cols, amp = 24 * Math.exp(-(((u - (0.64 - t * 0.14)) / 0.15) ** 2)) * (1 - t * 0.3);
      pts.push([10 + dx + u * (W - 52), y0 - amp]);
    }
    capas.push(pts);
  }
  const dibujo = capas.map((pts, r) => ({ pts, r })).reverse().map(({ pts, r }) => {
    const t = r / (filas - 1), linea = pts.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');
    return `<polygon points="${linea} ${pts.at(-1)[0].toFixed(1)},${H} ${pts[0][0].toFixed(1)},${H}" fill="#0c1730"/><polyline points="${linea}" fill="none" stroke="hsl(${198 + t * 84} 92% ${72 - t * 14}%)" stroke-width="1.4" stroke-linejoin="round"/>`;
  }).join('');
  return `<svg class="cmx-kelvin-art" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">${dibujo}</svg>`;
}

/* Mapa esquemático: Pacífico de 170° O a 70° O y de 10° N a 20° S (equirectangular). */
function mapa(a12, a34, fechaDato) {
  const X = (lon) => (lon + 175) * 4, Y = (lat) => (10 - lat) * 4;
  const costa = [[-78.8, 1.6], [-80.1, 0.0], [-80.9, -1.1], [-80.3, -2.6], [-80.5, -3.5], [-81.3, -4.7], [-80.9, -6.0], [-79.9, -6.8], [-79.0, -8.1], [-78.6, -9.1], [-77.6, -10.8], [-77.1, -12.0], [-76.2, -13.7], [-75.2, -15.3], [-73.6, -16.2], [-72.7, -16.6], [-71.3, -17.6], [-70.4, -18.3], [-70.2, -20]];
  const tierra = costa.map(([lon, lat]) => `${X(lon).toFixed(1)},${Y(lat).toFixed(1)}`).join(' ') + ` ${X(-70)},${Y(-20)} ${X(-70)},${Y(10)} ${X(-78.8)},${Y(10)}`;
  const caja = (lon1, lon2, lat1, lat2, v, nombre, cls) => {
    const n = nivelDe(v ?? -9);
    return `<g class="cmc-box ${cls}" data-nivel="${v == null ? 'sin' : n.id}"><rect x="${X(lon1)}" y="${Y(lat1)}" width="${X(lon2) - X(lon1)}" height="${Y(lat2) - Y(lat1)}" rx="3"/>` +
      `<text x="${(X(lon1) + X(lon2)) / 2}" y="${Y(lat1) + (Y(lat2) - Y(lat1)) / 2 - 2}" text-anchor="middle" class="cmc-box-n">${nombre}</text>` +
      `<text x="${(X(lon1) + X(lon2)) / 2}" y="${Y(lat1) + (Y(lat2) - Y(lat1)) / 2 + 13}" text-anchor="middle" class="cmc-box-v">${v == null ? 'sin dato' : signed(v, 2) + ' °C'}</text></g>`;
  };
  const meridianos = [-170, -150, -130, -110, -90, -70].map((lon) => `<line x1="${X(lon)}" x2="${X(lon)}" y1="0" y2="${Y(-20)}"/><text x="${X(lon) + 3}" y="${Y(-20) - 4}">${Math.abs(lon)}°O</text>`).join('');
  return `<svg viewBox="0 0 ${X(-70)} ${Y(-20)}" role="img" aria-label="Mapa esquemático: Niño 1+2 ${a12 == null ? 'sin dato' : signed(a12, 2) + ' grados'}; Niño 3.4 ${a34 == null ? 'sin dato' : signed(a34, 2) + ' grados'}, ${esc(fechaDato)}">` +
    `<defs><linearGradient id="cmc-mar" x1="0" x2="1"><stop offset="0" stop-color="#071a2e"/><stop offset="1" stop-color="#0b2540"/></linearGradient></defs>` +
    `<rect width="100%" height="100%" fill="url(#cmc-mar)"/><g class="cmc-grid-l">${meridianos}<line x1="0" x2="${X(-70)}" y1="${Y(0)}" y2="${Y(0)}" class="cmc-ecuador"/><text x="4" y="${Y(0) - 4}">Ecuador</text></g>` +
    caja(-170, -120, 5, -5, a34, 'Niño 3.4', 'n34') + caja(-90, -80, 0, -10, a12, 'Niño 1+2', 'n12') +
    `<polygon points="${tierra}" class="cmc-tierra"/><text x="${X(-75)}" y="${Y(-9)}" class="cmc-pais">PERÚ</text></svg>`;
}

function render({ manifest, mensual, semanal, tecnico, noaaDisc }) {
  const fuentes = manifest?.sources || [];
  $('cmc-updated').textContent = manifest?.generated_at ? 'Actualizado: ' + hora(manifest.generated_at) : 'Fecha de actualización no disponible';

  /* Hero: nivel según el estado publicado y qué cambió en el mar entre los dos últimos meses publicados. */
  const pintarNivel = () => {
    const t = ($('enfen-publicado')?.textContent || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const nivel = /fin de (la )?alerta/.test(t) ? 'fin' : /no activ/.test(t) ? 'no-activo' : /vigilancia/.test(t) ? 'vigilancia' : /alerta/.test(t) ? 'alerta' : 'sin-dato';
    $('cmc-estado').dataset.nivel = nivel;
    const sig = {
      alerta: 'ENFEN ha activado la alerta para el evento costero indicado arriba. Revisa los avisos para tu localidad y tu plan familiar: la alerta no significa que haya una inundación en tu distrito.',
      vigilancia: 'ENFEN mantiene en vigilancia el posible desarrollo del evento costero indicado arriba. Infórmate y revisa tu plan familiar; consulta el comunicado para conocer el horizonte previsto.',
      'no-activo': 'El sistema de alerta ENFEN está no activo según el comunicado publicado. Mantente al tanto de los avisos meteorológicos de tu localidad.',
      fin: 'En palabras simples: ENFEN da por terminado el evento. Pueden quedar efectos, como lluvias o daños por atender.',
      'sin-dato': '',
    }[nivel];
    $('cmc-significa').textContent = sig;
    document.querySelectorAll('.cmc-niveles li').forEach((li) => li.toggleAttribute('data-actual', li.dataset.n === nivel));
  };
  pintarNivel();
  const pub = $('enfen-publicado');
  if (pub) new MutationObserver(pintarNivel).observe(pub, { childList: true, characterData: true, subtree: true });

  const m = (mensual?.data || []).filter((r) => r.nino12_anomaly != null);
  const ult = m.at(-1), prev = m.at(-2);
  if (ult && prev) {
    const d = ult.nino12_anomaly - prev.nino12_anomaly;
    $('cmc-cambio').innerHTML = `<b>Respecto al informe anterior:</b> no hay un diagnóstico anterior estructurado para comparar. <b>En el mar:</b> la anomalía mensual frente a la costa (Niño 1+2) pasó de ${signed(prev.nino12_anomaly, 2)} °C en ${esc(mes(prev.date))} a ${signed(ult.nino12_anomaly, 2)} °C en ${esc(mes(ult.date))}: ${Math.abs(d) < 0.1 ? 'se mantuvo' : d > 0 ? 'se calentó ' + num(d, 2) + ' °C más' : 'se enfrió ' + num(-d, 2) + ' °C'}. Fuente: NOAA CPC. El cambio en el diagnóstico oficial se explica en el comunicado.`;
  }

  /* Magnitud observada por trimestre (promedio de tres meses publicados, Niño 1+2). */
  const trimestres = [];
  for (let k = m.length; k >= 3 && trimestres.length < 6; k--) {
    const tri = m.slice(k - 3, k), prom = tri.reduce((a, r) => a + r.nino12_anomaly, 0) / 3;
    trimestres.push({ etiqueta: `${mesCorto(tri[0].date)}–${mesCorto(tri[2].date)} ${tri[2].date.slice(0, 4)}`, prom, meses: tri });
  }
  const pct = (v) => Math.max(0, Math.min(100, (v / MAX_ESCALA) * 100));
  $('cmc-escala').innerHTML = trimestres.length ? trimestres.map((t, i) => {
    const nv = nivelDe(t.prom);
    return `<li class="cmx-row cmx-n-${nv.id}${i === 0 ? ' is-last' : ''}" style="--k:${COLOR[nv.id]}"><span class="cmx-per">${esc(t.etiqueta)}${i === 0 ? '<em>último</em>' : ''}</span>` +
      `<span class="cmx-track" role="img" aria-label="${esc(t.etiqueta)}: ${nv.n}, promedio ${signed(t.prom, 2)} grados sobre lo normal"><span class="cmx-fill" style="width:${pct(t.prom).toFixed(1)}%"></span>` +
      `<span class="cmx-lab"><b>${nv.n}</b> ${signed(t.prom, 2)} °C</span></span></li>`;
  }).join('') : '<li class="cmx-vacio">No hay meses publicados suficientes para calcular los trimestres.</li>';
  $('cmc-eje').innerHTML = [0, 1, 2, 3, 4, 5, 6].map((v) => `<li style="left:${pct(v)}%">${v ? '+' + v : '0'}</li>`).join('');
  $('cmc-clave').innerHTML = ESCALA.map((x) => `<li style="--k:${COLOR[x.id]}"><i aria-hidden="true"></i><b>${x.n}</b><span>${x.r}</span></li>`).join('');
  const t0 = trimestres[0];
  if (t0) {
    const nv0 = nivelDe(t0.prom);
    $('cmc-lectura').innerHTML = `<span class="cmx-read-k" style="--k:${COLOR[nv0.id]}">${nv0.n}</span><p><b>${esc(t0.etiqueta)}.</b> ${nv0.d}</p>`;
    $('cmc-esc-nota').innerHTML = `Promedio de las anomalías mensuales Niño 1+2 de ${t0.meses.map((r) => esc(mes(r.date))).join(', ')} (NOAA CPC, OISST): ${signed(t0.prom, 2)} °C. Longitud de barra: anomalía sobre una escala de 0 a +6 °C, no probabilidad. Es una referencia orientativa: la magnitud oficial la define ENFEN con el ICEN, calculado con otra serie (ERSST).`;
  } else $('cmc-esc-nota').textContent = 'No hay meses publicados suficientes para calcular el trimestre.';

  // El PDF no ofrece probabilidades estructuradas: nunca convertir ausencia en 0 %.
  $('cmc-prob').innerHTML = `<div class="cmx-prob"><span class="cmx-prob-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 20V10m7 10V4m7 16v-7"/></svg></span>` +
    `<div><span class="cmc-eyebrow">PERSPECTIVA OFICIAL</span><h4>¿Qué podría pasar en los próximos meses?</h4><p>Los horizontes y porcentajes por trimestre están en la tabla del comunicado ENFEN. No están disponibles como datos estructurados en esta aplicación, por eso aquí no se grafican ni se estiman.</p></div>` +
    `<a id="cmc-prob-doc" class="cmc-link cmx-btn" target="_blank" rel="noopener noreferrer">Ver probabilidades oficiales <span aria-hidden="true">↗</span></a></div>`;
  const enlace = $('enfen-documento');
  const syncDoc = () => { $('cmc-prob-doc').href = enlace?.href || 'https://enfen.imarpe.gob.pe/comunicados/'; };
  syncDoc();
  if (enlace) new MutationObserver(syncDoc).observe(enlace, { attributes: true, attributeFilter: ['href'] });

  const u34 = (mensual?.data || []).filter((r) => r.nino34_anomaly != null).at(-1);
  // El mapa del mar se pinta con el campo OISST publicado; si no está disponible, se conserva el esquema de regiones.
  $('cmc-mapa').innerHTML = mapa(ult?.nino12_anomaly ?? null, u34?.nino34_anomaly ?? null, ult ? mes(ult.date) : '');
  mapaMar({ manifest, a12: ult?.nino12_anomaly ?? null, mesA12: ult ? mes(ult.date) : '' }).catch(() => {});

  /* Indicadores */
  const ult12 = m.slice(-12);
  const s = (semanal?.data || []).filter((r) => r.nino12_anomaly != null);
  let racha = 0; for (let k = s.length - 1; k >= 0 && s[k].nino12_anomaly >= 0.4; k--) racha++;
  const s16 = s.slice(-16), m34 = (mensual?.data || []).filter((r) => r.nino34_anomaly != null), p34 = m34.at(-2);
  const tec = (tecnico?.data || []).filter((x) => x.reference_date).sort((a, b) => b.reference_date.localeCompare(a.reference_date))[0];
  const kpi = (cls, k, v, sub, extra, pie, { arrow = '', hot = false } = {}) =>
    `<article class="cmc-kpi cmx-kpi ${cls}${hot ? ' is-hot' : ''}"><h4>${k}</h4><p class="cmc-kpi-v cmx-v"><span>${v}</span>${arrow}</p><p class="cmc-kpi-s cmx-d">${sub}</p>${extra || ''}<p class="cmc-kpi-f cmx-f">${pie}</p></article>`;
  const nivelCls = (v) => 'nv-' + (v == null ? 'sin' : nivelDe(v).id);
  const d12 = ult && prev ? ult.nino12_anomaly - prev.nino12_anomaly : null, d34 = u34 && p34 ? u34.nino34_anomaly - p34.nino34_anomaly : null;
  $('cmc-kpis').innerHTML = [
    kpi(nivelCls(ult?.nino12_anomaly), 'Anomalía TSM Niño 1+2', ult ? signed(ult.nino12_anomaly, 2) + ' °C' : 'Sin dato',
      d12 != null ? `(${signed(d12, 2)} °C frente al mes anterior)` : 'Sin variación mensual',
      spark(ult12.map((r) => r.nino12_anomaly), { umbral: 0.4, label: 'Últimos 12 meses Niño 1+2' }), ult ? `Mensual · ${esc(mes(ult.date))} · NOAA CPC` : 'NOAA CPC', { arrow: flecha(d12) }),
    kpi(nivelCls(u34?.nino34_anomaly), 'Anomalía TSM Niño 3.4', u34 ? signed(u34.nino34_anomaly, 2) + ' °C' : 'Sin dato',
      d34 != null ? `(${signed(d34, 2)} °C frente al mes anterior)` : 'Sin variación mensual',
      spark(m34.slice(-12).map((r) => r.nino34_anomaly), { umbral: 0.5, label: 'Últimos 12 meses Niño 3.4' }), u34 ? `Mensual · ${esc(mes(u34.date))} · NOAA CPC · Pacífico central` : 'NOAA CPC', { arrow: flecha(d34) }),
    kpi('nv-info cmx-kelvin', 'Calor sub-superficial (ondas Kelvin)', 'Ver informe', tec ? `Informe técnico ENFEN al ${esc(fecha(tec.reference_date))}` : 'Informe técnico ENFEN',
      kelvin() + '<p class="cmc-kpi-x cmx-x">ENFEN analiza las ondas Kelvin en su informe técnico. Este observatorio no cuenta con una serie numérica descargable, por eso el dibujo es solo un esquema ilustrativo.</p>',
      `<a href="${esc(tec?.url || 'https://enfen.imarpe.gob.pe/')}" target="_blank" rel="noopener noreferrer">Abrir informe técnico ↗</a>`),
    kpi(racha >= 12 ? 'nv-extra' : racha >= 4 ? 'nv-moderado' : 'nv-neutro', 'Persistencia sobre el umbral', s.length ? `${racha} <small>${racha === 1 ? 'semana' : 'semanas'}</small>` : 'Sin dato',
      'seguidas con Niño 1+2 en +0,4 °C o más', spark(s16.map((r) => r.nino12_anomaly), { umbral: 0.4, label: 'Últimas 16 semanas Niño 1+2' }),
      s.at(-1) ? `Semanal · última: ${esc(fecha(s.at(-1).date))} (${signed(s.at(-1).nino12_anomaly, 1)} °C) · NOAA CPC` : 'NOAA CPC', { hot: racha >= 12 }),
  ].join('');

  /* Histórico comparativo: la misma serie mensual NOAA, con la misma escala vertical. */
  const ventana = (desde, hasta) => m.filter((r) => r.date >= desde && r.date <= hasta);
  const hoyD = new Date((ult?.date || '2026-01-01') + 'T12:00:00Z'); hoyD.setUTCMonth(hoyD.getUTCMonth() - 11);
  const ev = [
    { cls: 'ahora', k: 'Ahora · últimos 12 meses', t: 'Evento en curso', w: ventana(hoyD.toISOString().slice(0, 10), ult?.date || ''), imp: [['Señal', 'Mayor anomalía mensual de los últimos 12 meses.'], ['Qué vigilar', 'Lluvias en la costa norte y centro, quebradas activas y avisos de SENAMHI.'], ['Salud', 'Dengue y enfermedades por agua: elimina criaderos y sigue al Minsa.']] },
    { cls: 'e17', k: 'Niño costero 2017', t: 'Magnitud fuerte (ENFEN)', w: ventana('2016-11-01', '2017-12-31'), imp: [['Lluvias', 'Lluvias intensas de enero a marzo en la costa norte y centro; desbordes del río Piura y huaicos que llegaron a Lima.'], ['Infraestructura', 'Daños en viviendas, carreteras y puentes, y cortes de agua potable.'], ['Salud', 'Brote de dengue en el norte, sobre todo en Piura.']] },
    { cls: 'e97', k: 'El Niño 1997-98', t: 'Magnitud extraordinaria (ENFEN)', w: ventana('1997-01-01', '1998-12-31'), imp: [['Lluvias', 'Meses de lluvias extremas en Tumbes y Piura; ríos desbordados y lagunas temporales en el desierto.'], ['Infraestructura', 'Cientos de kilómetros de carreteras y numerosos puentes dañados; pérdidas en agricultura y pesca.'], ['Salud', 'Aumento de enfermedades transmitidas por agua y vectores, como la malaria en la costa norte.']] },
  ].map((x) => ({ ...x, p: x.w.length ? x.w.reduce((a, r) => (r.nino12_anomaly > a.nino12_anomaly ? r : a)) : null }));
  const techo = Math.max(...ev.map((x) => x.p?.nino12_anomaly ?? 0), 1), piso = Math.min(-1, ...ev.flatMap((x) => x.w.map((r) => r.nino12_anomaly)));
  const curva = (x) => {
    if (x.w.length < 2) return '<div class="cmx-curve cmx-curve-vacia">Sin serie</div>';
    const W = 220, H = 100, pad = 6, Y = (v) => H - pad - ((v - piso) / (techo - piso || 1)) * (H - 2 * pad), X = (i) => pad + (i * (W - 2 * pad)) / (x.w.length - 1);
    const pts = x.w.map((r, i) => `${X(i).toFixed(1)},${Y(r.nino12_anomaly).toFixed(1)}`).join(' ');
    const i = x.w.indexOf(x.p), id = 'cmx-cv-' + x.cls;
    return `<div class="cmx-curve" role="img" aria-label="${esc(x.k)}: anomalía mensual Niño 1+2 en ${x.w.length} meses; pico de ${signed(x.p.nino12_anomaly, 2)} grados en ${esc(mes(x.p.date))}">` +
      `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".5"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>` +
      `<line x1="0" x2="${W}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" class="cmx-cero"/><line x1="0" x2="${W}" y1="${Y(0.4).toFixed(1)}" y2="${Y(0.4).toFixed(1)}" class="cmx-umbral"/>` +
      `<polygon points="${X(0).toFixed(1)},${Y(0).toFixed(1)} ${pts} ${X(x.w.length - 1).toFixed(1)},${Y(0).toFixed(1)}" fill="url(#${id})"/><polyline points="${pts}" class="cmx-linea"/></svg>` +
      `<span class="cmx-pico" style="left:${(X(i) / W * 100).toFixed(1)}%;top:${(Y(x.p.nino12_anomaly) / H * 100).toFixed(1)}%"></span></div>`;
  };
  $('cmc-hist').innerHTML = ev.map((x) => {
    const nv = x.p ? nivelDe(x.p.nino12_anomaly) : null, sobre = x.w.filter((r) => r.nino12_anomaly >= 0.4).length;
    return `<article class="cmc-ev cmx-ev ${x.cls}" style="--k:${nv ? COLOR[nv.id] : '#64748b'}"><header><span>${x.k}</span><b>${x.t}</b></header>${curva(x)}` +
      `<p class="cmc-ev-v cmx-ev-v">${x.p ? signed(x.p.nino12_anomaly, 2) + ' °C' : 'Sin dato'}</p><p class="cmc-ev-s cmx-ev-s">${x.p ? 'Pico mensual Niño 1+2 · ' + esc(mes(x.p.date)) : 'Serie NOAA desde 1982'}</p>` +
      `<ul class="cmx-ev-stats"><li><b>${sobre}</b> ${sobre === 1 ? 'mes' : 'meses'} con +0,4 °C o más</li>${nv ? `<li>Pico en el tramo <b>${nv.n}</b></li>` : ''}</ul>` +
      `<details class="cmx-ev-d"><summary>Qué pasó</summary><dl>${x.imp.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl></details></article>`;
  }).join('');

  // En pantallas anchas los impactos de cada evento se muestran abiertos; en el celular quedan plegados.
  if (matchMedia('(min-width:900px)').matches) document.querySelectorAll('.cmx-ev-d').forEach((d) => { d.open = true; });

  /* Matriz de fuentes: estado real de la última consulta automática (manifiesto). */
  const estado = (ids) => {
    const fs = fuentes.filter((f) => ids.includes(f.id));
    if (!fs.length) return { c: 'ref', t: 'Referencia', d: 'Portal de consulta; no se descarga automáticamente.', f: 'No se descarga' };
    const ok = fs.filter((f) => f.last_success && !f.error);
    const ultima = fs.map((f) => f.last_success).filter(Boolean).sort().at(-1);
    if (ok.length === fs.length) return { c: 'ok', t: 'Consulta válida', d: 'Última consulta válida: ' + hora(ultima), f: hora(ultima) };
    if (ultima) return { c: 'warn', t: 'Dato conservado', d: 'La última consulta falló; se muestra el dato válido del ' + hora(ultima), f: 'Dato del ' + hora(ultima) };
    return { c: 'bad', t: 'Sin datos', d: 'No hay una consulta válida.', f: 'Sin consulta válida' };
  };
  const portales = [
    ['ENFEN', 'Comunicados y estado oficial', 'https://enfen.imarpe.gob.pe/comunicados/', ['enfen', 'enfen_technical'], 190],
    ['SENAMHI', 'Pronósticos y monitoreo de El Niño', 'https://www.senamhi.gob.pe/?p=fenomeno-el-nino', ['senamhi_forecast', 'senamhi_monitor', 'senamhi_bulletins'], 28],
    ['IMARPE', 'Informes del mar peruano (SIO-FEN)', 'https://siofen.imarpe.gob.pe/boletines-e-informes/GTI', ['imarpe_gti'], 215],
    ['IGP', 'Pronóstico y estudios del Instituto Geofísico', 'https://www.gob.pe/igp', [], 265],
    ['NOAA', 'Índices Niño, campo del mar y diagnóstico ENSO', 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml', ['noaa_weekly', 'noaa_monthly', 'noaa_ocean_sst', 'noaa_enso_discussion'], 205],
    ['NASA', 'Altimetría y observación satelital del océano', 'https://sealevel.nasa.gov/', [], 355],
    ['OMM / WMO', 'Actualización mundial sobre El Niño y La Niña', 'https://wmo.int/es', [], 145],
    ['OPS / PAHO', 'Salud pública ante El Niño', 'https://www.paho.org/es', [], 170],
  ];
  const filas = portales.map(([n, d, u, ids, h]) => ({ n, d, u, h, e: estado(ids) }));
  const con = filas.filter((f) => f.e.c === 'ok').length, auto = filas.filter((f) => f.e.c !== 'ref').length;
  $('cmc-src-resumen').textContent = `${con}/${auto} consultas válidas`;
  const sigla = (n) => n.split(/\s*\/\s*/)[0].slice(0, 3).toUpperCase();
  $('cmc-matriz').innerHTML = filas.map((f) => `<li class="cmc-src-${f.e.c}"><a class="cmx-tile" href="${esc(f.u)}" target="_blank" rel="noopener noreferrer"><span class="cmx-mono" style="--h:${f.h}" aria-hidden="true">${sigla(f.n)}</span>` +
    `<span class="cmx-tile-t"><b class="cmc-src-n">${f.n}</b><span class="cmc-src-d">${f.d}</span></span></a>` +
    `<span class="cmc-pill" title="${esc(f.e.d)}">${f.e.t}</span><span class="cmc-src-t" title="${esc(f.e.d)}">${esc(f.e.f)}</span></li>`).join('');
  if (noaaDisc?.data?.[0]) {
    const x = noaaDisc.data[0];
    $('cmc-matriz').insertAdjacentHTML('afterend', `<p class="cmc-nota">Diagnóstico NOAA del ${esc(fecha(x.published_date))}: <span lang="en">${esc(x.status_original)}</span>. Es la perspectiva global; el estado para el Perú lo declara ENFEN. Las siglas son solo iniciales, no logotipos oficiales.</p>`);
  }
}

/* Mapa del mar frente al Perú: anomalía diaria OISST (celdas publicadas por NOAA) bajo los límites departamentales
   de CENEPRED. No se interpola ni se rellena nada; lo que no tiene dato queda con el color de fondo. */
const GEO = { lon0: -94, lon1: -68, lat0: 2, lat1: -19.5, k: Math.cos((9 * Math.PI) / 180) };
async function mapaMar({ manifest, a12, mesA12 }) {
  const cont = $('cmc-mapa'), cap = $('cmc-mapa-cap');
  const archivo = (id, def) => (manifest?.sources || []).find((x) => x.id === id)?.file || def;
  const [sst, lim] = await Promise.all([json('./data/' + archivo('noaa_ocean_sst', 'noaa_ocean_sst.json.gz')).catch(() => null), json('./data/' + archivo('boundaries', 'boundaries.json')).catch(() => null)]);
  const celdas = (sst?.data || []).filter((r) => Number.isFinite(r.anomaly_c) && r.lon >= GEO.lon0 - 0.3 && r.lon <= GEO.lon1 + 0.3 && r.lat <= GEO.lat0 + 0.3 && r.lat >= GEO.lat1 - 0.3);
  if (!celdas.length) { cap.textContent = 'No se pudo cargar el campo de temperatura del mar. Se muestra el esquema de regiones Niño 1+2 y Niño 3.4 con la última anomalía mensual NOAA.'; return; }
  const fechaCampo = sst?.meta?.latest_date || celdas[0].date;
  cont.innerHTML = '<div class="cmx-lienzo"><canvas role="img"></canvas><div class="cmx-tip" hidden></div></div>' +
    `<div class="cmx-leyenda" aria-hidden="true"><span>0</span><i style="background:linear-gradient(90deg,${[0, 0.5, 1, 2, 3, 4, 5, 6].map((v) => anomalyColor(v)).join(',')})"></i><span>+6 °C</span></div>`;
  const canvas = cont.querySelector('canvas'), tip = cont.querySelector('.cmx-tip'), lienzo = cont.querySelector('.cmx-lienzo');
  canvas.setAttribute('aria-label', `Mapa de la anomalía diaria de la temperatura del mar frente al Perú, ${fecha(fechaCampo)}. Recuadro Niño 1+2: ${a12 == null ? 'sin dato' : signed(a12, 2) + ' grados en ' + mesA12}.`);
  cap.innerHTML = `Anomalía diaria de la temperatura del mar (NOAA OISST v2.1 preliminar, ${esc(fecha(fechaCampo))}) frente al Perú. Recuadro: región Niño 1+2${a12 == null ? '' : `, ${signed(a12, 2)} °C en ${esc(mesA12)} (promedio mensual NOAA CPC)`}. Pasa el cursor o toca el mapa para leer cada celda. Es una referencia visual: la declaración oficial corresponde a ENFEN.`;
  const indice = new Map(celdas.map((r) => [Math.round(r.lat * 8) + ',' + Math.round(r.lon * 8), r.anomaly_c]));
  let P = null;
  const pintar = () => {
    const W = Math.round(lienzo.clientWidth);
    if (!W) return;
    const S = W / ((GEO.lon1 - GEO.lon0) * GEO.k), H = Math.round((GEO.lat0 - GEO.lat1) * S), dpr = Math.min(window.devicePixelRatio || 1, 2);
    P = { S, X: (lon) => (lon - GEO.lon0) * GEO.k * S, Y: (lat) => (GEO.lat0 - lat) * S };
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.height = H + 'px';
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#071a2e'; g.fillRect(0, 0, W, H);
    for (const r of celdas) {
      const c = anomalyColor(r.anomaly_c); if (!c) continue;
      const x0 = P.X(r.lon - 0.125), y0 = P.Y(r.lat + 0.125);
      g.fillStyle = c; g.fillRect(x0, y0, P.X(r.lon + 0.125) - x0 + 0.6, P.Y(r.lat - 0.125) - y0 + 0.6);
    }
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.14)'; g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '600 10px Inter, system-ui, sans-serif';
    for (const lon of [-90, -85, -80, -75, -70]) { g.beginPath(); g.moveTo(P.X(lon), 0); g.lineTo(P.X(lon), H); g.stroke(); g.fillText(Math.abs(lon) + '°O', P.X(lon) + 3, H - 5); }
    for (const lat of [0, -5, -10, -15]) { g.beginPath(); g.moveTo(0, P.Y(lat)); g.lineTo(W, P.Y(lat)); g.stroke(); g.fillText(lat === 0 ? 'Ecuador' : Math.abs(lat) + '°S', 4, P.Y(lat) - 4); }
    const anillos = [];
    for (const f of lim?.data?.features || []) {
      const polys = f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : [];
      for (const poly of polys) anillos.push(poly);
    }
    g.fillStyle = '#17243a'; g.strokeStyle = 'rgba(255,255,255,.34)'; g.lineWidth = 0.7; g.lineJoin = 'round';
    for (const poly of anillos) {
      g.beginPath();
      for (const anillo of poly) anillo.forEach(([lon, lat], i) => (i ? g.lineTo(P.X(lon), P.Y(lat)) : g.moveTo(P.X(lon), P.Y(lat))));
      g.fill('evenodd'); g.stroke();
    }
    if (anillos.length) { g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '800 11px "Plus Jakarta Sans", Inter, sans-serif'; g.fillText('PERÚ', P.X(-75.6), P.Y(-9)); }
    g.setLineDash([5, 4]); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(P.X(-90), P.Y(0), P.X(-80) - P.X(-90), P.Y(-10) - P.Y(0)); g.setLineDash([]);
    const rotulo = 'Niño 1+2' + (a12 == null ? '' : ' ' + signed(a12, 2) + ' °C');
    g.font = '700 11px Inter, system-ui, sans-serif';
    const tw = g.measureText(rotulo).width + 12, bx = Math.max(2, P.X(-90)), by = P.Y(0) - 20;
    g.fillStyle = 'rgba(6,12,24,.86)'; g.fillRect(bx, by, tw, 18); g.fillStyle = '#fff'; g.fillText(rotulo, bx + 6, by + 13);
  };
  const celda = (ev) => {
    const caja = canvas.getBoundingClientRect(), x = ev.clientX - caja.left, y = ev.clientY - caja.top;
    const lon = GEO.lon0 + x / (P.S * GEO.k), lat = GEO.lat0 - y / P.S;
    const cl = Math.floor(lat / 0.25) * 0.25 + 0.125, co = Math.floor(lon / 0.25) * 0.25 + 0.125;
    const v = indice.get(Math.round(cl * 8) + ',' + Math.round(co * 8));
    if (v == null) { tip.hidden = true; return; }
    tip.textContent = `${num(Math.abs(cl), 1)}° ${cl < 0 ? 'S' : 'N'} · ${num(Math.abs(co), 1)}° O · ${signed(v, 1)} °C`;
    tip.hidden = false;
    tip.style.left = Math.min(Math.max(x, 60), caja.width - 60) + 'px'; tip.style.top = Math.max(y - 12, 14) + 'px';
  };
  canvas.addEventListener('pointermove', celda); canvas.addEventListener('pointerdown', celda);
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
  pintar();
  let marco = 0;
  if ('ResizeObserver' in window) new ResizeObserver(() => { cancelAnimationFrame(marco); marco = requestAnimationFrame(pintar); }).observe(lienzo);
}

async function iniciar() {
  if (!$('estado-enfen') || !$('cmc-kpis')) return;
  const cargar = (p) => json(p).catch(() => null);
  const manifest = await cargar('./data/manifest.json');
  const archivo = (id) => (manifest?.sources || []).find((s) => s.id === id)?.file || id + '.json';
  const [mensual, semanal, tecnico, noaaDisc] = await Promise.all(['noaa_monthly', 'noaa_weekly', 'enfen_technical', 'noaa_enso_discussion'].map((id) => cargar('./data/' + archivo(id))));
  render({ manifest, mensual, semanal, tecnico, noaaDisc });
}
iniciar();
