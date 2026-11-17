/* Plantillas HTML de los materiales para compartir. Reciben los datos que render.cjs lee de la página. */
const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">';
const displayUrl = (url) => url.replace(/^https?:\/\//, '').replace(/#.*$/, '').replace(/\/$/, '');
const document = (title, css, body) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>${FONTS}<style>
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Outfit,system-ui,sans-serif;color:#14213d}
h1,h2,h3,h4{font-family:"Plus Jakarta Sans",Outfit,system-ui,sans-serif;letter-spacing:-.02em}
ul,ol{list-style:none}
svg{display:block}
${css}</style></head><body>${body}</body></html>`;

const qr = (data, size) => `<div class="qr" style="width:${size};height:${size}">${data.qr.replace('<svg', '<svg style="width:100%;height:100%"')}</div>`;

/* ---------- Infografía para colegios (A4, 2 páginas, para imprimir en color o en grises) ---------- */
function colegios(data) {
  const scene = (climate, label) => `<article class="scene-card scene-card--${climate}">
    <h3>${label}</h3>
    <div class="panel"><div id="que-es" class="qe qe-embed" data-climate="${climate}" data-step="0" data-mode="escuelas">${data.scene}</div></div>
    <ol class="mini">${data.steps.map((step, i) => `<li><b>${i + 1}</b><span>${esc(step[climate].e)}</span></li>`).join('')}</ol>
  </article>`;
  const css = `
${data.css}
#que-es.qe-embed{padding:0;margin:0;border:0;border-radius:0;background:none;box-shadow:none;overflow:visible;width:auto;max-width:none;isolation:auto;font:inherit;color:inherit}
#que-es.qe-embed .qe-g[data-for]{opacity:1}
#que-es.qe-embed *{animation:none!important;transition:none!important}
@page{size:A4;margin:0}
.page{position:relative;width:210mm;height:297mm;padding:11mm 12mm;overflow:hidden;page-break-after:always;background:#f6f8fe}
.page:last-child{page-break-after:auto}
.hero{position:relative;overflow:hidden;margin:-11mm -12mm 7mm;padding:11mm 12mm 9mm;color:#fff;background:radial-gradient(120% 140% at 0% 0%,#6d4aff 0%,rgba(109,74,255,0) 55%),radial-gradient(90% 120% at 100% 0%,#0fb5d8 0%,rgba(15,181,216,0) 60%),#0a0e17}
.hero-tag{font-weight:700;font-size:8.5pt;letter-spacing:.16em;text-transform:uppercase;color:#7be7f5}
.hero h1{margin:2mm 0 1mm;font-size:34pt;line-height:1;font-weight:800}
.hero-sub{font-size:13pt;color:#dfe9ff;max-width:130mm}
.hero-drop{position:absolute;right:12mm;top:7mm;width:30mm;height:30mm}
h2{font-size:15pt;font-weight:800;color:#0a0e17;margin-bottom:2mm}
.what{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-bottom:6mm}
.what p{font-size:11pt;line-height:1.5;color:#26344f}
.what .lead{font-size:13pt;font-weight:700;color:#0a0e17;line-height:1.35}
.scenes{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-bottom:6mm}
.scene-card{padding:3.5mm;border-radius:5mm;background:#fff;border:.4mm solid #dfe6f6;box-shadow:0 1mm 3mm rgba(20,33,61,.06)}
.scene-card h3{display:inline-block;margin-bottom:2.5mm;padding:1mm 3.5mm;border-radius:99mm;font-size:10pt;font-weight:800;color:#fff}
.scene-card--normal h3{background:linear-gradient(135deg,#0fb5d8,#6d4aff)}
.scene-card--nino h3{background:linear-gradient(135deg,#ff9f1c,#ff3d5a)}
.panel{padding:2mm;border-radius:4mm;background:radial-gradient(120% 90% at 50% 0,rgba(139,92,246,.35),transparent 60%),#0a0e17}
.panel svg{width:100%;height:auto}
.mini{display:grid;gap:2mm;margin-top:3mm}
.mini li{display:grid;grid-template-columns:6mm 1fr;gap:2mm;font-size:9.4pt;line-height:1.35;color:#26344f}
.mini b{display:grid;place-items:center;width:6mm;height:6mm;border-radius:50%;font:800 8.5pt "Plus Jakarta Sans";color:#fff;background:#6d4aff}
.keys{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}
.key{padding:4mm;border-radius:4.5mm;background:#fff;border:.4mm solid #dfe6f6}
.key svg{width:10mm;height:10mm;color:#6d4aff;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.key h4{margin:2mm 0 1mm;font-size:11.5pt;font-weight:800;color:#0a0e17}
.key p{font-size:9.6pt;line-height:1.4;color:#26344f}
.note{position:absolute;left:12mm;right:12mm;bottom:9mm;display:flex;justify-content:space-between;gap:6mm;font-size:8pt;color:#5a6a8a}
.quiz{width:100%;border-collapse:collapse;margin:1mm 0 4mm}
.quiz td{padding:1.8mm 2mm;border-bottom:.3mm solid #dfe6f6;font-size:10.4pt;vertical-align:middle}
.quiz td:first-child{width:7mm;font:800 10pt "Plus Jakarta Sans";color:#6d4aff}
.quiz td.pick{width:44mm;white-space:nowrap;font-size:9.5pt;color:#26344f}
.quiz i{display:inline-block;width:4.6mm;height:4.6mm;margin:0 1mm -1.2mm 2mm;border:.5mm solid #6d4aff;border-radius:50%}
.answers{padding:3mm 4mm;border-radius:4mm;background:#eef2ff;border:.3mm dashed #9aa8d6;margin-bottom:4mm}
.answers h3{font-size:10pt;font-weight:800;margin-bottom:1.5mm;color:#0a0e17}
.answers li{font-size:8.8pt;line-height:1.38;color:#26344f;margin-bottom:1.1mm}
.answers b{color:#6d4aff}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-bottom:4mm}
.talk li{display:grid;grid-template-columns:6mm 1fr;gap:2mm;margin-bottom:2mm;font-size:10pt;line-height:1.4;color:#26344f}
.talk b{display:grid;place-items:center;width:6mm;height:6mm;border-radius:50%;font:800 8.5pt "Plus Jakarta Sans";color:#fff;background:#ff3d5a}
.words dt{font:800 9.8pt "Plus Jakarta Sans";color:#0a0e17}
.words dd{margin:0 0 1.4mm;font-size:9.2pt;line-height:1.34;color:#26344f}
.deep{padding:3mm 4mm;border-radius:4mm;border-left:1.4mm solid #6d4aff;background:#fff;font-size:9.2pt;line-height:1.4;color:#26344f;margin-bottom:4mm}
.deep h3{font-size:10pt;font-weight:800;color:#0a0e17;margin-bottom:1mm}
.sources{display:grid;grid-template-columns:1fr 22mm;gap:5mm;align-items:center;padding:3.5mm 4mm;border-radius:4mm;background:#0a0e17;color:#dfe9ff}
.sources h3{font-size:10.5pt;color:#fff;margin-bottom:1mm}
.sources p{font-size:8.6pt;line-height:1.45;color:#c4d0ea}
.sources b{color:#7be7f5}
${'.fact{margin-top:6mm;display:grid;gap:1mm;padding:4mm 5mm;border-radius:4.5mm;background:linear-gradient(135deg,#6d4aff,#0fb5d8);color:#fff}'}
.fact h3{font-size:12pt;font-weight:800}
.fact p{font-size:10.6pt;line-height:1.45;color:#f0f6ff}
.draw{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-bottom:5mm}
.draw div{height:25mm;padding:2.5mm 3mm;border:.5mm dashed #9aa8d6;border-radius:4mm;background:#fff;font:800 9.5pt "Plus Jakarta Sans";color:#6d4aff}
.qr{background:#fff;padding:1.6mm;border-radius:2mm}`;
  const drop = `<svg class="hero-drop" viewBox="0 0 80 96" aria-hidden="true"><defs><linearGradient id="d" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#67e8f9"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs><path d="M40 6C40 6 10 40 10 62a30 30 0 0 0 60 0C70 40 40 6 40 6Z" fill="url(#d)"/><circle cx="30" cy="62" r="7.5" fill="#fff"/><circle cx="50" cy="62" r="7.5" fill="#fff"/><circle cx="31" cy="63" r="3.4" fill="#1a1440"/><circle cx="51" cy="63" r="3.4" fill="#1a1440"/><path d="M30 74q10 10 20 0" fill="none" stroke="#1a1440" stroke-width="2.4" stroke-linecap="round"/></svg>`;
  const body = `
<section class="page">
  <header class="hero">
    <p class="hero-tag">Infografía para colegios · Observatorio El Niño Perú</p>
    <h1>Entiende El Niño</h1>
    <p class="hero-sub">Cómo se origina y por qué cambia el clima del Perú</p>
    ${drop}
  </header>
  <div class="what">
    <div><h2>¿Qué es El Niño?</h2><p class="lead">${esc(data.keys[0].e)}</p></div>
    <p>Un mar más cálido cambia los vientos y puede cambiar las lluvias: más en unas zonas y menos en otras. No afecta igual a todos: depende de qué tan fuerte sea y de dónde vives.</p>
  </div>
  <div class="scenes">${scene('normal', 'Año normal')}${scene('nino', 'Año con El Niño')}</div>
  <h2>Tres cosas clave</h2>
  <div class="keys">${data.keys.map((key) => `<div class="key">${key.icon}<h4>${esc(key.title)}</h4><p>${esc(key.e)}</p></div>`).join('')}</div>
  <div class="fact"><h3>¿Por qué se llama El Niño?</h3><p>${esc(data.quiz[1].e)}</p></div>
  <p class="note"><span>Esquema ilustrativo: no muestra datos reales de una fecha ni de una zona.</span><span>${esc(displayUrl(data.url))}</span></p>
</section>
<section class="page">
  <h2>¿Mito o verdad? Marca tu respuesta</h2>
  <table class="quiz">${data.quiz.map((q, i) => `<tr><td>${i + 1}</td><td>${esc(q.statement)}</td><td class="pick"><i></i>Mito <i></i>Verdad</td></tr>`).join('')}</table>
  <div class="answers"><h3>Respuestas para quien enseña</h3><ol>${data.quiz.map((q, i) => `<li><b>${i + 1}. ${q.answer === 'mito' ? 'Mito' : 'Verdad'}.</b> ${esc(q.e)}</li>`).join('')}</ol></div>
  <div class="cols">
    <div class="talk"><h2>Conversemos en clase</h2><ol>
      <li><b>1</b><span>¿Qué cambia en el mar y en el cielo cuando hay un año con El Niño?</span></li>
      <li><b>2</b><span>¿Por qué en el norte puede llover más y en el sur menos?</span></li>
      <li><b>3</b><span>¿Qué podemos hacer en la escuela y en casa para estar preparados?</span></li>
    </ol></div>
    <div class="words"><h2>Palabras clave</h2><dl>
      <dt>Vientos alisios</dt><dd>Vientos que soplan de este a oeste sobre el Pacífico tropical.</dd>
      <dt>Afloramiento</dt><dd>Cuando sube agua fría desde el fondo del mar.</dd>
      <dt>ENFEN</dt><dd>Instituciones científicas que vigilan El Niño y publican su estado oficial.</dd>
      <dt>Huaico</dt><dd>Corriente de agua con lodo y piedras que baja por las quebradas.</dd>
    </dl></div>
  </div>
  <h2>Dibuja lo que aprendiste</h2>
  <div class="draw"><div>Un año normal</div><div>Un año con El Niño</div></div>
  <div class="deep"><h3>¿Costero o del Pacífico central?</h3>${esc(data.callout.e)}</div>
  <div class="sources">
    <div><h3>¿Qué pasa hoy? Consulta las fuentes oficiales</h3><p>Esta infografía explica el fenómeno; <b>no contiene alertas</b>. El estado vigente lo publican ENFEN (enfen.imarpe.gob.pe), SENAMHI (senamhi.gob.pe) e INDECI (gob.pe/indeci). Mapas, pronósticos y fechas en: <b>${esc(displayUrl(data.url))}</b></p></div>
    ${qr(data, '22mm')}
  </div>
</section>`;
  return document('Infografía El Niño para colegios', css, body);
}

/* ---------- Guía para WhatsApp (1080 × 1350, alto contraste) ---------- */
function whatsapp(data) {
  const accents = ['#ffd84d', '#5eead4', '#ff9bd0'];
  const css = `
body{width:1080px;height:1350px;overflow:hidden;background:#05070d;color:#fff;position:relative}
.bg{position:absolute;inset:0;background:radial-gradient(700px 420px at 0% 0%,rgba(139,92,246,.55),transparent 65%),radial-gradient(640px 420px at 100% 6%,rgba(34,211,238,.35),transparent 62%)}
main{position:relative;padding:64px 60px 0}
.tag{font:800 30px/1 "Plus Jakarta Sans";letter-spacing:.14em;text-transform:uppercase;color:#ffd84d}
h1{margin:20px 0 6px;font:800 104px/1 "Plus Jakarta Sans";letter-spacing:-.035em;white-space:nowrap}
.sub{font:700 44px/1.15 "Plus Jakarta Sans";color:#5eead4;margin-bottom:34px}
.cards{display:grid;gap:22px}
.card{display:grid;grid-template-columns:96px 1fr;gap:26px;align-items:center;padding:26px 34px;border-radius:30px;background:#0e1527;border:4px solid var(--c)}
.num{display:grid;place-items:center;width:96px;height:96px;border-radius:50%;background:var(--c);color:#05070d;font:800 58px "Plus Jakarta Sans"}
.card h2{font:800 52px/1.1 "Plus Jakarta Sans";color:var(--c);margin-bottom:6px}
.card p{font:600 40px/1.25 Outfit;color:#fff}
footer{position:absolute;left:0;right:0;bottom:0;display:grid;grid-template-columns:210px 1fr;gap:34px;align-items:center;padding:30px 60px;background:#fff;color:#05070d}
.qr{background:#fff}
footer h3{font:800 38px/1.15 "Plus Jakarta Sans";margin-bottom:6px}
footer p{font:600 29px/1.3 Outfit;color:#1b2540}
footer b{font-weight:800;color:#0b3fd1}
`;
  const body = `<div class="bg"></div><main>
  <p class="tag">Guía rápida · Observatorio El Niño Perú</p>
  <h1>Entiende El Niño</h1>
  <p class="sub">en 3 ideas, con fuentes oficiales</p>
  <div class="cards">${data.keys.map((key, i) => `<div class="card" style="--c:${accents[i]}"><div class="num">${i + 1}</div><div><h2>${esc(key.title)}</h2><p>${esc(key.e)}</p></div></div>`).join('')}</div>
</main>
<footer>
  ${qr(data, '210px')}
  <div><h3>Mapas, pronóstico y alerta oficial</h3><p><b>${esc(displayUrl(data.url))}</b><br>Esto no es una alerta: mira el aviso vigente de ENFEN y el pronóstico de SENAMHI.</p></div>
</footer>`;
  return document('Guía El Niño para WhatsApp', css, body);
}

/* ---------- Manual de prevención familiar (A4, 2 páginas) ---------- */
function manual(data) {
  const css = `
@page{size:A4;margin:0}
.page{position:relative;width:210mm;height:297mm;padding:12mm;overflow:hidden;page-break-after:always;background:#fff}
.page:last-child{page-break-after:auto}
.top{margin:-12mm -12mm 7mm;padding:12mm 12mm 9mm;color:#fff;background:radial-gradient(110% 150% at 0% 0%,#0f8f7a 0%,rgba(15,143,122,0) 60%),radial-gradient(90% 130% at 100% 0%,#6d4aff 0%,rgba(109,74,255,0) 60%),#0a0e17}
.top p.tag{font-weight:700;font-size:8.5pt;letter-spacing:.16em;text-transform:uppercase;color:#7be7f5}
.top h1{margin:2mm 0 2mm;font-size:29pt;line-height:1.02;font-weight:800}
.top p.intro{max-width:150mm;font-size:11pt;line-height:1.45;color:#e4ecff}
h2{font-size:14pt;font-weight:800;color:#0a0e17;margin:0 0 3mm}
.grid{display:grid;gap:4.5mm}
.area{padding:4.6mm 6mm;border-radius:4.5mm;border:.4mm solid #d7e0f2;background:#f7f9fe}
.area header{display:flex;align-items:center;gap:3mm;margin-bottom:2.5mm}
.area header svg{flex:none;width:10mm;height:10mm;padding:1.8mm;border-radius:3mm;color:#fff;background:#0f8f7a;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.area:nth-child(2) header svg{background:#6d4aff}
.area:nth-child(3) header svg{background:#e0457b}
.area h3{font-size:12.5pt;font-weight:800;color:#0a0e17}
.check li{display:grid;grid-template-columns:5.8mm 1fr;gap:3mm;margin-bottom:2.4mm;font-size:10.6pt;line-height:1.42;color:#1f2d4a}
.check i{display:block;width:5mm;height:5mm;margin-top:.5mm;border:.5mm solid #0a0e17;border-radius:1.2mm;background:#fff}
.alert{margin-top:5mm;padding:4mm 6mm;border-radius:4mm;border-left:1.6mm solid #e0457b;background:#fff1f6;font-size:10.4pt;line-height:1.45;color:#3a1020}
.plan .line{display:grid;grid-template-columns:56mm 1fr;gap:3mm;align-items:end;margin-bottom:5.4mm;font-size:11pt;color:#1f2d4a}
.plan .line span{font-weight:700}
.plan .line i{display:block;height:6mm;border-bottom:.35mm solid #7a89ad}
.plan .tall i{height:16mm}
.plan .notes i{height:9mm;margin-bottom:0}
.readings li{margin-bottom:3mm;font-size:10.2pt;line-height:1.42;color:#26344f}
.readings b{display:block;color:#0a0e17}
.readings a{color:#0b3fd1;text-decoration:none;overflow-wrap:anywhere}
.foot{position:absolute;left:12mm;right:12mm;bottom:9mm;display:flex;justify-content:space-between;gap:6mm;font-size:8pt;color:#5a6a8a}
.sources{display:grid;grid-template-columns:1fr 24mm;gap:5mm;align-items:center;margin-top:5mm;padding:4mm;border-radius:4mm;background:#0a0e17;color:#dfe9ff;font-size:9pt;line-height:1.45}
.sources b{color:#7be7f5}
.qr{background:#fff;padding:1.6mm;border-radius:2mm}`;
  const body = `
<section class="page">
  <header class="top">
    <p class="tag">Manual de prevención familiar · Observatorio El Niño Perú</p>
    <h1>Preparados ante El Niño</h1>
    <p class="intro">${esc(data.prep.intro)}</p>
  </header>
  <div class="grid">${data.prep.cards.map((card) => `<section class="area"><header>${card.icon}<h3>${esc(card.title)}</h3></header><ul class="check">${card.items.map((item) => `<li><i></i><span>${esc(item)}</span></li>`).join('')}</ul></section>`).join('')}</div>
  <p class="alert">${esc(data.prep.note)}</p>
  <p class="foot"><span>Medidas generales basadas en las recomendaciones de INDECI. No sustituyen los avisos de tu municipio.</span><span>${esc(displayUrl(data.url))}</span></p>
</section>
<section class="page">
  <h2>Nuestro plan familiar</h2>
  <div class="plan">
    <div class="line"><span>Punto de encuentro</span><i></i></div>
    <div class="line"><span>Ruta hacia la zona segura</span><i></i></div>
    <div class="line"><span>Quién ayuda a quién</span><i></i></div>
    <div class="line tall"><span>Números de emergencia de mi localidad</span><i></i></div>
    <div class="line"><span>Fecha en que revisamos el plan</span><i></i></div>
    <div class="line notes"><span>Notas</span><i></i></div>
    <div class="line notes"><span></span><i></i></div>
  </div>
  <h2 style="margin-top:7mm">Lecturas recomendadas</h2>
  <ul class="readings">${data.prep.readings.map((r) => `<li><b>${esc(r.title)}</b>${esc(r.description)}<br><a href="${esc(r.href)}">${esc(r.href)}</a></li>`).join('')}</ul>
  <div class="sources">
    <div><b>Antes de usar un reporte, revisa su fecha y el territorio que describe.</b> Este manual no contiene alertas ni pronósticos. Para saber qué ocurre hoy en tu distrito, consulta el observatorio: <b>${esc(displayUrl(data.url))}</b></div>
    ${qr(data, '24mm')}
  </div>
  <p class="foot"><span>Cada familia puede adaptar este plan. Imprímelo, complétalo y guárdalo en un lugar seguro.</span><span>${esc(displayUrl(data.url))}</span></p>
</section>`;
  return document('Manual de prevención familiar ante El Niño', css, body);
}

module.exports = { colegios, whatsapp, manual };
