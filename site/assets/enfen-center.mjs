// Centro de monitoreo del estado ENFEN (#estado-enfen).
// Solo usa datos publicados que ya descarga el observatorio: NOAA CPC (índices Niño mensuales y semanales),
// el último comunicado y el informe técnico ENFEN, y el manifiesto de fuentes. No genera probabilidades
// ni cifras propias: lo que no está publicado en forma de datos se enlaza a su documento oficial.
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
  { id: 'neutro', n: 'Neutro', r: 'menor a +0,4 °C', min: -Infinity, max: 0.4, d: 'El mar frente al Perú está dentro de lo normal para la época. No hay un evento El Niño costero.' },
  { id: 'debil', n: 'Cálido débil', r: '+0,4 a +1,0 °C', min: 0.4, max: 1.0, d: 'El mar está algo más caliente que lo normal. Puede haber cambios en la pesca y algunas lluvias fuera de temporada.' },
  { id: 'moderado', n: 'Moderado', r: '+1,0 a +1,7 °C', min: 1.0, max: 1.7, d: 'Calentamiento claro. Aumenta la posibilidad de lluvias por encima de lo normal en la costa norte.' },
  { id: 'fuerte', n: 'Fuerte', r: '+1,7 a +3,0 °C', min: 1.7, max: 3.0, d: 'Calentamiento intenso. En eventos fuertes, como 2017, hubo lluvias intensas, huaicos y desbordes en la costa norte y centro.' },
  { id: 'extra', n: 'Extraordinario', r: 'mayor a +3,0 °C', min: 3.0, max: Infinity, d: 'El nivel más alto de la escala, alcanzado en 1982-83 y 1997-98. Se asocia a lluvias muy intensas y daños extendidos.' },
];
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

/* Mini gráfico de tendencia con línea de umbral opcional. */
function spark(values, { umbral = null, label = '' } = {}) {
  const v = values.filter((x) => x != null);
  if (v.length < 2) return '';
  const w = 160, h = 44, p = 4, lo = Math.min(...v, umbral ?? Infinity, 0), hi = Math.max(...v, umbral ?? -Infinity), d = hi - lo || 1;
  const xy = v.map((y, i) => [p + (i * (w - 2 * p)) / (v.length - 1), h - p - ((y - lo) / d) * (h - 2 * p)]);
  const line = xy.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');
  const last = xy.at(-1), yU = umbral == null ? null : h - p - ((umbral - lo) / d) * (h - 2 * p);
  return `<svg class="cmc-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">` +
    (yU == null ? '' : `<line x1="0" x2="${w}" y1="${yU.toFixed(1)}" y2="${yU.toFixed(1)}" class="cmc-spark-u"/>`) +
    `<polygon points="${p},${h - p} ${line} ${w - p},${h - p}" class="cmc-spark-a"/><polyline points="${line}" class="cmc-spark-l"/>` +
    `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.2" class="cmc-spark-d"/></svg>`;
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
      alerta: 'En palabras simples: ENFEN considera que El Niño costero ya empezó y que seguirá en los próximos meses. Es momento de prepararse, no de alarmarse.',
      vigilancia: 'En palabras simples: ENFEN ve probable que se forme El Niño costero. Todavía no empieza; conviene informarse y revisar tu plan familiar.',
      'no-activo': 'En palabras simples: ENFEN no ve un evento El Niño costero en curso.',
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
    $('cmc-cambio').innerHTML = `<b>Qué cambió en el mar:</b> la anomalía mensual frente a la costa (Niño 1+2) pasó de ${signed(prev.nino12_anomaly, 2)} °C en ${esc(mes(prev.date))} a ${signed(ult.nino12_anomaly, 2)} °C en ${esc(mes(ult.date))}: ${Math.abs(d) < 0.1 ? 'se mantuvo' : d > 0 ? 'se calentó ' + num(d, 2) + ' °C más' : 'se enfrió ' + num(-d, 2) + ' °C'}. Fuente: NOAA CPC. El cambio en el diagnóstico oficial se explica en el comunicado.`;
  }

  /* Escala de magnitud con selector de trimestre observado (promedio de tres meses publicados). */
  const trimestres = [];
  for (let k = m.length; k >= 3 && trimestres.length < 6; k--) {
    const tri = m.slice(k - 3, k), prom = tri.reduce((a, r) => a + r.nino12_anomaly, 0) / 3;
    trimestres.push({ etiqueta: `${mesCorto(tri[0].date)}–${mesCorto(tri[2].date)} ${tri[2].date.slice(0, 4)}`, prom, meses: tri });
  }
  const sel = $('cmc-trimestre'), escala = $('cmc-escala');
  sel.innerHTML = trimestres.map((t, i) => `<option value="${i}">${esc(t.etiqueta)}${i === 0 ? ' (último)' : ''}</option>`).join('');
  const pintarEscala = () => {
    const t = trimestres[Number(sel.value) || 0];
    const actual = t ? nivelDe(t.prom) : null;
    escala.innerHTML = ESCALA.map((x) => {
      const on = actual && actual.id === x.id;
      const ancho = on ? Math.max(8, Math.min(100, (Math.min(t.prom, 6) / 6) * 100)) : 100;
      return `<li class="cmc-n cmc-n-${x.id}${on ? ' on' : ''}"><button type="button" aria-expanded="false" aria-controls="cmc-d-${x.id}">` +
        `<span class="cmc-n-top"><b>${x.n}</b><span>${x.r}</span>${on ? `<strong>${signed(t.prom, 2)} °C</strong>` : ''}</span>` +
        `<span class="cmc-bar-t"><span class="cmc-bar-f" style="width:${on ? ancho : 0}%"></span></span></button>` +
        `<p class="cmc-n-d" id="cmc-d-${x.id}" hidden>${x.d}</p></li>`;
    }).join('');
    $('cmc-esc-nota').innerHTML = t
      ? `Promedio de las anomalías mensuales Niño 1+2 de ${t.meses.map((r) => esc(mes(r.date))).join(', ')} (NOAA CPC, OISST): ${signed(t.prom, 2)} °C. Es una referencia orientativa: la magnitud oficial la define ENFEN con el ICEN, calculado con otra serie (ERSST).`
      : 'No hay meses publicados suficientes para calcular el trimestre.';
  };
  sel.addEventListener('change', pintarEscala);
  escala.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    const d = $(b.getAttribute('aria-controls')), open = b.getAttribute('aria-expanded') === 'true';
    b.setAttribute('aria-expanded', String(!open)); d.hidden = open;
  });
  pintarEscala();
  const doc = $('enfen-documento')?.href || 'https://enfen.imarpe.gob.pe/comunicados/';
  $('cmc-prob').innerHTML = `<p><b>Probabilidades por magnitud:</b> ENFEN las publica en la tabla de su comunicado para los próximos meses. Este observatorio aún no las convierte en datos porque vienen como imagen en el PDF; para no inventar cifras, consúltalas en el documento.</p><a class="cmc-link" href="${esc(doc)}" target="_blank" rel="noopener noreferrer">Ver la tabla en el comunicado oficial ↗</a>`;

  const u34 = (mensual?.data || []).filter((r) => r.nino34_anomaly != null).at(-1);
  $('cmc-mapa').innerHTML = mapa(ult?.nino12_anomaly ?? null, u34?.nino34_anomaly ?? null, ult ? mes(ult.date) : '');

  /* KPI 2x2 */
  const ult12 = m.slice(-12);
  const s = (semanal?.data || []).filter((r) => r.nino12_anomaly != null);
  let racha = 0; for (let k = s.length - 1; k >= 0 && s[k].nino12_anomaly >= 0.4; k--) racha++;
  const s16 = s.slice(-16), m34 = (mensual?.data || []).filter((r) => r.nino34_anomaly != null), p34 = m34.at(-2);
  const tec = (tecnico?.data || []).filter((x) => x.reference_date).sort((a, b) => b.reference_date.localeCompare(a.reference_date))[0];
  const kpi = (cls, k, v, sub, extra, pie) => `<article class="cmc-kpi ${cls}"><h4>${k}</h4><p class="cmc-kpi-v">${v}</p><p class="cmc-kpi-s">${sub}</p>${extra || ''}<p class="cmc-kpi-f">${pie}</p></article>`;
  const nivelCls = (v) => 'nv-' + (v == null ? 'sin' : nivelDe(v).id);
  $('cmc-kpis').innerHTML = [
    kpi(nivelCls(ult?.nino12_anomaly), 'Anomalía TSM Niño 1+2', ult ? signed(ult.nino12_anomaly, 2) + ' °C' : 'Sin dato',
      ult && prev ? `${signed(ult.nino12_anomaly - prev.nino12_anomaly, 2)} °C frente al mes anterior` : 'Sin variación mensual',
      spark(ult12.map((r) => r.nino12_anomaly), { umbral: 0.4, label: 'Últimos 12 meses Niño 1+2' }), ult ? `Mensual · ${esc(mes(ult.date))} · NOAA CPC` : 'NOAA CPC'),
    kpi(nivelCls(u34?.nino34_anomaly), 'Anomalía TSM Niño 3.4', u34 ? signed(u34.nino34_anomaly, 2) + ' °C' : 'Sin dato',
      u34 && p34 ? `${signed(u34.nino34_anomaly - p34.nino34_anomaly, 2)} °C frente al mes anterior` : 'Sin variación mensual',
      spark(m34.slice(-12).map((r) => r.nino34_anomaly), { umbral: 0.5, label: 'Últimos 12 meses Niño 3.4' }), u34 ? `Mensual · ${esc(mes(u34.date))} · NOAA CPC · Pacífico central` : 'NOAA CPC'),
    kpi('nv-info', 'Calor sub-superficial (ondas Kelvin)', 'Ver informe', tec ? `Informe técnico ENFEN al ${esc(fecha(tec.reference_date))}` : 'Informe técnico ENFEN',
      '<p class="cmc-kpi-x">Las ondas Kelvin llevan agua caliente bajo la superficie hacia la costa. ENFEN las analiza en su informe técnico; no hay una serie numérica descargable que este observatorio pueda graficar.</p>',
      `<a href="${esc(tec?.url || 'https://enfen.imarpe.gob.pe/')}" target="_blank" rel="noopener noreferrer">Abrir informe técnico ↗</a>`),
    kpi(racha >= 12 ? 'nv-extra' : racha >= 4 ? 'nv-moderado' : 'nv-neutro', 'Persistencia sobre el umbral', `${racha} ${racha === 1 ? 'semana' : 'semanas'}`,
      'seguidas con Niño 1+2 en +0,4 °C o más', spark(s16.map((r) => r.nino12_anomaly), { umbral: 0.4, label: 'Últimas 16 semanas Niño 1+2' }),
      s.at(-1) ? `Semanal · última: ${esc(fecha(s.at(-1).date))} (${signed(s.at(-1).nino12_anomaly, 1)} °C) · NOAA CPC` : 'NOAA CPC'),
  ].join('');

  /* Comparativo histórico con la misma serie mensual NOAA. */
  const pico = (desde, hasta) => {
    const rows = m.filter((r) => r.date >= desde && r.date <= hasta);
    return rows.length ? rows.reduce((a, r) => (r.nino12_anomaly > a.nino12_anomaly ? r : a)) : null;
  };
  const p97 = pico('1997-01-01', '1998-12-31'), p17 = pico('2016-11-01', '2017-12-31');
  const hoyD = new Date((ult?.date || '2026-01-01') + 'T12:00:00Z'); hoyD.setUTCMonth(hoyD.getUTCMonth() - 11);
  const pAct = pico(hoyD.toISOString().slice(0, 10), ult?.date || '');
  const ev = [
    { cls: 'ahora', k: 'Ahora', t: pAct ? `${pAct.date.slice(0, 4)}` : 'Evento actual', p: pAct, imp: [['Señal', `Mayor anomalía mensual de los últimos 12 meses: ${pAct ? esc(mes(pAct.date)) : 'sin dato'}.`], ['Qué vigilar', 'Lluvias en la costa norte y centro, quebradas activas y avisos de SENAMHI.'], ['Salud', 'Dengue y enfermedades por agua: elimina criaderos y sigue al Minsa.']] },
    { cls: 'e17', k: 'Niño costero 2017', t: 'Magnitud fuerte (ENFEN)', p: p17, imp: [['Lluvias', 'Lluvias intensas de enero a marzo en la costa norte y centro; desbordes del río Piura y huaicos que llegaron a Lima.'], ['Infraestructura', 'Daños en viviendas, carreteras y puentes, y cortes de agua potable.'], ['Salud', 'Brote de dengue en el norte, sobre todo en Piura.']] },
    { cls: 'e97', k: 'El Niño 1997-98', t: 'Magnitud extraordinaria (ENFEN)', p: p97, imp: [['Lluvias', 'Meses de lluvias extremas en Tumbes y Piura; ríos desbordados y lagunas temporales en el desierto.'], ['Infraestructura', 'Cientos de kilómetros de carreteras y numerosos puentes dañados; pérdidas en agricultura y pesca.'], ['Salud', 'Aumento de enfermedades transmitidas por agua y vectores, como la malaria en la costa norte.']] },
  ];
  const max = Math.max(...ev.map((x) => x.p?.nino12_anomaly ?? 0), 1);
  $('cmc-hist').innerHTML = ev.map((x) => `<article class="cmc-ev ${x.cls}"><header><span>${x.k}</span><b>${x.t}</b></header>` +
    `<p class="cmc-ev-v">${x.p ? signed(x.p.nino12_anomaly, 2) + ' °C' : 'Sin dato'}</p><p class="cmc-ev-s">${x.p ? 'Pico mensual Niño 1+2 · ' + esc(mes(x.p.date)) : 'Serie NOAA desde 1982'}</p>` +
    `<span class="cmc-ev-bar"><span style="width:${x.p ? Math.max(4, (x.p.nino12_anomaly / max) * 100) : 0}%"></span></span>` +
    `<dl>${x.imp.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl></article>`).join('');

  /* Matriz de fuentes: estado real de la última consulta automática (manifiesto). */
  const estado = (ids) => {
    const fs = fuentes.filter((f) => ids.includes(f.id));
    if (!fs.length) return { c: 'ref', t: 'Referencia', d: 'Portal de consulta; no se descarga automáticamente.' };
    const ok = fs.filter((f) => f.last_success && !f.error);
    const ultima = fs.map((f) => f.last_success).filter(Boolean).sort().at(-1);
    if (ok.length === fs.length) return { c: 'ok', t: 'Conectado', d: 'Última consulta válida: ' + hora(ultima) };
    if (ultima) return { c: 'warn', t: 'Dato conservado', d: 'La última consulta falló; se muestra el dato válido del ' + hora(ultima) };
    return { c: 'bad', t: 'Sin datos', d: 'No hay una consulta válida.' };
  };
  const portales = [
    ['ENFEN', 'Comunicados y estado oficial', 'https://enfen.imarpe.gob.pe/comunicados/', ['enfen', 'enfen_technical']],
    ['SENAMHI', 'Pronósticos y monitoreo de El Niño', 'https://www.senamhi.gob.pe/?p=fenomeno-el-nino', ['senamhi_forecast', 'senamhi_monitor', 'senamhi_bulletins']],
    ['IMARPE', 'Informes del mar peruano (SIO-FEN)', 'https://siofen.imarpe.gob.pe/boletines-e-informes/GTI', ['imarpe_gti']],
    ['IGP', 'Pronóstico y estudios del Instituto Geofísico', 'https://www.gob.pe/igp', []],
    ['NOAA', 'Índices Niño, campo del mar y diagnóstico ENSO', 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml', ['noaa_weekly', 'noaa_monthly', 'noaa_ocean_sst', 'noaa_enso_discussion']],
    ['NASA', 'Altimetría y observación satelital del océano', 'https://sealevel.nasa.gov/', []],
    ['OMM / WMO', 'Actualización mundial sobre El Niño y La Niña', 'https://wmo.int/es', []],
    ['OPS / PAHO', 'Salud pública ante El Niño', 'https://www.paho.org/es', []],
  ];
  const filas = portales.map(([n, d, u, ids]) => ({ n, d, u, e: estado(ids) }));
  const con = filas.filter((f) => f.e.c === 'ok').length, auto = filas.filter((f) => f.e.c !== 'ref').length;
  $('cmc-src-resumen').textContent = `${con} de ${auto} conectadas`;
  $('cmc-matriz').innerHTML = filas.map((f) => `<li class="cmc-src-${f.e.c}"><a href="${esc(f.u)}" target="_blank" rel="noopener noreferrer"><span class="cmc-src-n">${f.n}</span><span class="cmc-src-d">${f.d}</span></a>` +
    `<span class="cmc-pill" title="${esc(f.e.d)}">${f.e.t}</span><span class="cmc-src-t">${esc(f.e.d)}</span></li>`).join('');
  if (noaaDisc?.data?.[0]) {
    const x = noaaDisc.data[0];
    $('cmc-matriz').insertAdjacentHTML('afterend', `<p class="cmc-nota">Diagnóstico NOAA del ${esc(fecha(x.published_date))}: <span lang="en">${esc(x.status_original)}</span>. Es la perspectiva global; el estado para el Perú lo declara ENFEN.</p>`);
  }
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
