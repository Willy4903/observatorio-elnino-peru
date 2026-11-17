/* Experiencia interactiva de #que-es sobre el sitio real, sin consultas externas.
   PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node tests/que-es.e2e.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
let pw;
try { pw = require('playwright'); } catch { pw = require('@playwright/test'); }

const ROOT = path.resolve(process.env.PANORAMA_SITE_DIR || path.join(__dirname, '../site'));
const MIME = {'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.gz':'application/gzip','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.pdf':'application/pdf'};
const server = http.createServer((request, response) => {
  let file;
  try {
    const url = new URL(request.url, 'http://localhost');
    file = path.resolve(ROOT, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
  } catch { response.writeHead(400); response.end('Solicitud inválida'); return; }
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end('No encontrado'); return; }
  response.writeHead(200, {'Content-Type':MIME[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
  fs.createReadStream(file).pipe(response);
});

let assertions = 0;
const equal = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const check = (actual, message) => { assertions++; assert.ok(actual, message); };
const match = (actual, expected, message) => { assertions++; assert.match(actual, expected, message); };
const luminance = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + .05) / (lo + .05); };
const parseColor = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);

async function open(browser, base, {width = 1440, height = 1000, javaScriptEnabled = true, reducedMotion = 'reduce', init} = {}) {
  const context = await browser.newContext({viewport:{width,height},javaScriptEnabled,isMobile:width < 600,hasTouch:width < 600,serviceWorkers:'block',reducedMotion});
  await context.route(url => !url.toString().startsWith(base), route => route.abort());
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '#que-es', {waitUntil:'load'});
  if (javaScriptEnabled) await page.waitForSelector('#que-es.is-enhanced');
  return {context, page, errors};
}

/* ---------- Estructura, diseño y accesibilidad ---------- */
async function structure(page, label, width) {
  const root = page.locator('#que-es');
  equal(await root.count(), 1, `${label} destino único`);
  equal(await root.getAttribute('aria-labelledby'), 'qe-title', `${label} sección con nombre`);
  equal(await root.locator('h2').count(), 1, `${label} un solo h2`);
  match(await page.locator('#qe-title').innerText(), /Entiende El Niño/, `${label} título`);
  const layout = await root.evaluate((element) => {
    const viewport = document.documentElement.clientWidth;
    const box = element.getBoundingClientRect();
    return {
      viewport, document:document.documentElement.scrollWidth, left:box.left, right:box.right,
      overflow:[...element.querySelectorAll('h2,h3,h4,p,li,a,button,label')].filter((child) => {
        if (!child.getClientRects().length) return false;
        const rect = child.getBoundingClientRect();
        return rect.left < -1 || rect.right > viewport + 1;
      }).map((child) => child.textContent.trim().slice(0, 50)),
      cards:[...element.querySelectorAll('.qe-card')].map((card) => card.id)
    };
  });
  check(layout.document <= layout.viewport + 1, `${label} sin desplazamiento horizontal (${layout.document}/${layout.viewport})`);
  check(layout.left >= -1 && layout.right <= layout.viewport + 1, `${label} dentro de la pantalla`);
  equal(layout.overflow, [], `${label} textos y controles dentro de la pantalla`);
  equal(layout.cards, ['qe-origen','qe-simulador','qe-claves','qe-trivia','qe-compartir'], `${label} orden de lectura`);

  const sizes = await root.evaluate((element) => {
    const fonts = (selector) => [...element.querySelectorAll(selector)].filter((node) => node.getClientRects().length).map((node) => parseFloat(getComputedStyle(node).fontSize));
    const heights = (selector) => [...element.querySelectorAll(selector)].filter((node) => node.getClientRects().length).map((node) => node.getBoundingClientRect().height);
    return {
      body:fonts('.qe-lead,.qe-step-text span:not([hidden]),.qe-key p,.qe-lvl'),
      targets:['.qe-switch','.qe-seg','.qe-step-btn','.qe-btn','.qe-choice','.qe-more','.qe-todo a','.qe-file'].map((selector) => [selector, Math.min(...heights(selector))])
    };
  });
  check(Math.min(...sizes.body) >= 15, `${label} cuerpo de lectura de al menos 15 px (${Math.min(...sizes.body)})`);
  for (const [selector, min] of sizes.targets) check(min >= 44, `${label} área táctil de ${selector} ≥ 44 px (${Math.round(min)})`);

  const unnamed = await root.evaluate((element) => [...element.querySelectorAll('button,a[href],input')].filter((node) => node.getClientRects().length)
    .filter((node) => !(node.getAttribute('aria-label') || node.innerText.trim() || node.labels?.length)).map((node) => node.outerHTML.slice(0, 80)));
  equal(unnamed, [], `${label} controles con nombre accesible`);

  const contrasts = await root.evaluate((element) => {
    const out = [];
    for (const selector of ['.qe-lead','.qe-card-sub','.qe-step-text span:not([hidden])','.qe-key p','.qe-lvl','.qe-zone-where','.qe-caption','.qe-note','.qe-more','.qe-foot p','.qe-slider-label']) {
      const node = [...element.querySelectorAll(selector)].find((candidate) => candidate.getClientRects().length && getComputedStyle(candidate).display !== 'none');
      if (node) out.push([selector, getComputedStyle(node).color]);
    }
    return out;
  });
  for (const [selector, color] of contrasts) check(ratio(parseColor(color), [38, 42, 58]) >= 4.5, `${label} contraste de ${selector} (${color})`);
}

async function targetsAndNavigation(page, base, label) {
  const headerBottom = await page.evaluate(() => document.querySelector('.radar-header')?.getBoundingClientRect().bottom || 0);
  await page.waitForTimeout(400);
  const top = await page.locator('#que-es').evaluate((element) => element.getBoundingClientRect().top);
  check(top >= headerBottom - 4, `${label} el encabezado fijo no cubre la sección (${Math.round(top)} ≥ ${Math.round(headerBottom)})`);
  await page.locator('.qe-more[href="#qe-simulador"]').click();
  await page.waitForURL(base + '#qe-simulador');
  check(await page.locator('#qe-simulador').isVisible(), `${label} enlace interno al simulador`);
}

/* ---------- Interacción ---------- */
async function modeAndOrigin(page, label) {
  const root = page.locator('#que-es');
  const stepText = () => page.locator('.qe-step[data-step="1"] .qe-step-text').innerText();
  equal(await root.getAttribute('data-mode'), 'ciudadano', `${label} modo inicial Ciudadano`);
  match(await stepText(), /alisios/, `${label} texto completo en modo Ciudadano`);
  const toggle = page.locator('#qe-mode-switch');
  equal(await toggle.getAttribute('role'), 'switch', `${label} el interruptor es un switch`);
  await toggle.click();
  equal(await root.getAttribute('data-mode'), 'escuelas', `${label} modo Escuelas`);
  equal(await toggle.getAttribute('aria-checked'), 'true', `${label} aria-checked en Escuelas`);
  match(await stepText(), /flojitos/, `${label} lenguaje simple en Escuelas`);
  doesNotMatch(await stepText(), /alisios/, `${label} oculta la variante de Ciudadano`);
  equal(await page.evaluate(() => localStorage.getItem('qe-modo')), 'escuelas', `${label} recuerda el modo`);
  // En Escuelas solo el paso activo muestra su texto y aparecen los botones de ritmo guiado.
  check(await page.locator('.qe-step[data-step="2"] .qe-step-text').isHidden(), `${label} Escuelas: un paso a la vez`);
  check(await page.locator('#qe-prev').isDisabled(), `${label} Anterior deshabilitado en el paso 1`);
  await page.locator('#qe-next').click();
  equal(await root.getAttribute('data-step'), '2', `${label} Siguiente avanza`);
  check(await page.locator('.qe-step[data-step="2"] .qe-step-text').isVisible(), `${label} el paso 2 muestra su texto`);
  await page.locator('#qe-next').click();
  check(await page.locator('#qe-next').isDisabled(), `${label} Siguiente deshabilitado en el paso 3`);
  await toggle.click();
  equal(await root.getAttribute('data-mode'), 'ciudadano', `${label} vuelve a Ciudadano`);

  // Pasos, escena y comparación normal / El Niño.
  await page.locator('.qe-step[data-step="1"] .qe-step-btn').click();
  equal(await root.getAttribute('data-step'), '1', `${label} el título del paso es un botón`);
  equal(await page.locator('.qe-step[data-step="1"] .qe-step-btn').getAttribute('aria-current'), 'step', `${label} aria-current en el paso activo`);
  await page.locator('.qe-g-sky').dispatchEvent('click');
  equal(await root.getAttribute('data-step'), '3', `${label} tocar la escena cambia de paso`);
  const opacity = (selector) => page.locator(selector).first().evaluate((node) => getComputedStyle(node).opacity);
  equal(await opacity('.qe-only-nino'), '1', `${label} El Niño visible por defecto`);
  equal(await opacity('.qe-only-normal'), '0', `${label} año normal oculto por defecto`);
  await page.locator('.qe-seg[data-climate="normal"]').click();
  equal(await root.getAttribute('data-climate'), 'normal', `${label} comparación: año normal`);
  equal(await page.locator('.qe-seg[data-climate="normal"]').getAttribute('aria-pressed'), 'true', `${label} aria-pressed normal`);
  equal(await opacity('.qe-only-nino'), '0', `${label} escena sin nubes de tormenta en año normal`);
  match(await page.locator('.qe-step[data-step="3"] .qe-step-text').innerText(), /muy seca/, `${label} el texto cambia a año normal`);
  match(await page.locator('.qe-scene-tag').innerText(), /año normal/i, `${label} etiqueta de la escena`);
  match(await page.locator('#qe-scene-live').textContent(), /Año normal\. Paso 3: Lluvias intensas/, `${label} región viva anuncia el cambio`);
  await page.locator('.qe-seg[data-climate="nino"]').click();
  equal(await root.getAttribute('data-climate'), 'nino', `${label} vuelve a El Niño`);
  equal(await page.evaluate(() => getComputedStyle(document.querySelector('.qe-wind path')).animationName), 'none', `${label} movimiento reducido respetado`);
}
const doesNotMatch = (actual, expected, message) => { assertions++; assert.doesNotMatch(actual, expected, message); };

async function simulator(page, label) {
  const root = page.locator('#que-es');
  const slider = page.locator('#qe-level');
  const fill = () => page.locator('.qe-dep[data-zone="norte"]').first().evaluate((node) => getComputedStyle(node).fill);
  const visibleLevels = () => page.locator('.qe-lvl').evaluateAll((nodes) => nodes.filter((node) => node.getClientRects().length).map((node) => node.innerText));
  equal(await slider.inputValue(), '1', `${label} intensidad inicial Moderada`);
  equal(await slider.getAttribute('aria-valuetext'), 'Moderada', `${label} aria-valuetext`);
  match(await page.locator('#qe-bubble').innerText(), /Prueba cambiar la intensidad/, `${label} el avatar invita a probar`);
  const moderate = await fill();
  await slider.focus();
  await page.keyboard.press('End');
  equal(await slider.inputValue(), '3', `${label} teclado: End`);
  equal(await root.getAttribute('data-level'), '3', `${label} data-level`);
  equal(await root.evaluate((node) => node.style.getPropertyValue('--lvl')), '3', `${label} variable --lvl`);
  equal(await page.locator('#qe-level-name').innerText(), 'Extraordinaria', `${label} nombre de la intensidad`);
  equal(await slider.getAttribute('aria-valuetext'), 'Extraordinaria', `${label} aria-valuetext actualizado`);
  const levels = await visibleLevels();
  equal(levels.length, 2, `${label} una descripción por zona`);
  match(levels[0], /1997-98/, `${label} norte: evento extraordinario`);
  match(levels[1], /sequías/, `${label} sur: sequías`);
  match(await page.locator('#qe-bubble').innerText(), /Extraordinario: es el nivel más alto/, `${label} mensaje del avatar`);
  equal(await page.locator('.qe-avatar').getAttribute('data-level'), '3', `${label} expresión del avatar`);
  check((await fill()) !== moderate, `${label} el norte cambia de color con la intensidad`);
  equal(await page.locator('.qe-mcloud').nth(3).evaluate((node) => getComputedStyle(node).opacity), '1', `${label} cuarta nube visible en Extraordinaria`);
  await page.keyboard.press('Home');
  equal(await page.locator('#qe-level-name').innerText(), 'Débil', `${label} teclado: Home`);
  equal(await page.locator('.qe-mcloud').nth(3).evaluate((node) => getComputedStyle(node).opacity), '0', `${label} cuarta nube oculta en Débil`);
  equal(await page.locator('.qe-crack-layer').evaluate((node) => getComputedStyle(node).opacity), '0', `${label} sin grietas en Débil`);
  await page.locator('.qe-ticks [data-level="2"]').click();
  equal(await slider.inputValue(), '2', `${label} las etiquetas también seleccionan`);
  match((await visibleLevels())[0], /2017/, `${label} norte: evento fuerte`);
  await page.locator('#qe-mode-switch').click();
  match(await page.locator('#qe-bubble').innerText(), /¡Fuerte!/, `${label} el avatar cambia de lenguaje en Escuelas`);
  await page.locator('#qe-mode-switch').click();
}

async function quiz(page, label) {
  const statements = await page.locator('.qe-qi').evaluateAll((items) => items.map((item) => [item.querySelector('.qe-q-stmt').textContent.trim(), item.dataset.answer]));
  const answerFor = Object.fromEntries(statements);
  equal(statements.length, 6, `${label} seis preguntas`);
  equal(await page.locator('.qe-quiz-list').isHidden(), true, `${label} la lista de respaldo se oculta con JavaScript`);
  match(await page.locator('#qe-q-progress').innerText(), /Pregunta 1 de 6/, `${label} progreso`);
  equal(await page.locator('#qe-q-feedback').getAttribute('class'), 'qe-feedback is-idle', `${label} estado de espera`);
  const statement = async () => (await page.locator('#qe-q-statement').innerText()).replace(/[“”]/g, '');
  equal(await statement(), statements[0][0], `${label} primera pregunta`);
  // Primera respuesta incorrecta a propósito.
  const wrong = answerFor[statements[0][0]] === 'mito' ? 'verdad' : 'mito';
  await page.locator(`.qe-choice[data-choice="${wrong}"]`).click();
  match(await page.locator('#qe-q-title').innerText(), /^Todavía no\. En realidad es un mito\./, `${label} corrige con ánimo`);
  check((await page.locator(`.qe-choice[data-choice="${wrong}"]`).getAttribute('class')).includes('is-wrong'), `${label} marca la respuesta errónea`);
  check((await page.locator(`.qe-choice[data-choice="mito"]`).getAttribute('class')).includes('is-dim') === false, `${label} la correcta queda a la vista`);
  check(await page.locator('.qe-choice[data-choice="mito"]').isDisabled(), `${label} no se puede responder dos veces`);
  match(await page.locator('#qe-q-exp').innerText(), /lagunas/, `${label} explicación científica`);
  check(await page.locator('#qe-q-next').evaluate((node) => node === document.activeElement), `${label} el foco pasa al botón Siguiente`);
  equal(await page.locator('#qe-q-bar').evaluate((node) => node.style.width), '16.6667%', `${label} barra de progreso`);
  for (let i = 1; i < 6; i++) {
    await page.locator('#qe-q-next').click();
    const current = await statement();
    check(current in answerFor, `${label} pregunta ${i + 1} conocida`);
    await page.locator(`.qe-choice[data-choice="${answerFor[current]}"]`).click();
    check((await page.locator('#qe-q-feedback').getAttribute('class')).includes('is-right'), `${label} acierto en la pregunta ${i + 1}`);
    match(await page.locator('#qe-q-title').innerText(), /^¡Correcto!/, `${label} felicita`);
  }
  equal(await page.locator('#qe-q-next').innerText(), 'Ver resultado', `${label} última pregunta`);
  await page.locator('#qe-q-next').click();
  match(await page.locator('#qe-q-final').innerText(), /5 de 6 aciertos/, `${label} resultado`);
  match(await page.locator('#qe-q-finalnote').innerText(), /Muy bien/, `${label} mensaje final`);
  equal(await page.locator('.qe-ring span').innerText(), '83%', `${label} anillo de aciertos`);
  await page.locator('#qe-q-restart').click();
  match(await page.locator('#qe-q-progress').innerText(), /Pregunta 1 de 6/, `${label} reinicia`);
  equal(await page.locator('#qe-q-score b').innerText(), '0', `${label} reinicia el puntaje`);
  check(await page.locator('#qe-q-end').isHidden(), `${label} oculta el resultado`);
}

async function sharing(page, base, label) {
  const whatsapp = await page.locator('#qe-wa').getAttribute('href');
  match(whatsapp, /^https:\/\/wa\.me\/\?text=/, `${label} enlace de WhatsApp`);
  match(decodeURIComponent(whatsapp), /#que-es/, `${label} el mensaje incluye el destino`);
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:async (text) => { window.__copied = text; }}}); });
  await page.locator('#qe-copy').click();
  match(await page.evaluate(() => window.__copied), /#que-es$/, `${label} copia el enlace`);
  equal(await page.locator('#qe-share-status').innerText(), 'Enlace copiado.', `${label} confirma la copia`);
  check(await page.locator('#qe-native').isHidden(), `${label} sin Web Share no se ofrece "Compartir"`);
  const files = await page.locator('.qe-file').evaluateAll((links) => links.map((link) => ({href:link.getAttribute('href'), download:link.hasAttribute('download'), text:link.innerText})));
  equal(files.length, 3, `${label} tres materiales`);
  for (const file of files) {
    check(file.download, `${label} descarga directa: ${file.href}`);
    const response = await page.evaluate(async (href) => { const r = await fetch(href); return {status:r.status, type:r.headers.get('content-type'), size:(await r.arrayBuffer()).byteLength}; }, file.href);
    equal(response.status, 200, `${label} ${file.href} responde`);
    check(response.size > 20_000, `${label} ${file.href} no está vacío`);
    check(file.href.endsWith('.png') ? response.type.includes('image/png') : response.type.includes('application/pdf'), `${label} tipo de ${file.href}`);
  }
}

async function noJavaScript(page, label) {
  const hiddenControls = await page.locator('#que-es .qe-js-only').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).display));
  check(hiddenControls.length >= 8 && hiddenControls.every((display) => display === 'none'), `${label} los controles interactivos no se muestran sin JavaScript`);
  equal(await page.locator('.qe-step-text [data-c]').evaluateAll((nodes) => nodes.filter((node) => node.getClientRects().length).length), 6, `${label} se leen ambas condiciones de los tres pasos`);
  equal(await page.locator('.qe-step[data-step="1"] [data-c="normal"][data-m="c"]').evaluate((node) => getComputedStyle(node, '::before').content), '"Año normal. "', `${label} cada condición está rotulada`);
  equal(await page.locator('.qe-lvl').evaluateAll((nodes) => nodes.filter((node) => node.getClientRects().length).length), 8, `${label} las cuatro magnitudes se leen en ambas zonas`);
  check(await page.locator('.qe-quiz-list').isVisible(), `${label} la trivia se lee como lista desplegable`);
  equal(await page.locator('.qe-quiz-list details').count(), 6, `${label} seis preguntas con explicación`);
  check(await page.locator('.qe-quiz-ui').isHidden(), `${label} la interfaz de juego espera a JavaScript`);
  equal(await page.locator('.qe-file:visible').count(), 3, `${label} los materiales se descargan`);
  check(await page.locator('#qe-wa').isVisible(), `${label} WhatsApp funciona como enlace`);
  check((await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)), `${label} sin desplazamiento horizontal`);
}

async function run(browser, base, width, height) {
  const label = `[${width}px]`;
  const js = await open(browser, base, {width, height});
  try {
    await structure(js.page, label, width);
    await targetsAndNavigation(js.page, base, label);
    await js.page.goto(base + '#que-es');
    await js.page.evaluate(() => localStorage.clear());
    await js.page.reload();
    await js.page.waitForSelector('#que-es.is-enhanced');
    await modeAndOrigin(js.page, label);
    await simulator(js.page, label);
    await quiz(js.page, label);
    await sharing(js.page, base, label);
    // El modo elegido se conserva al volver a cargar.
    await js.page.locator('#qe-mode-switch').click();
    await js.page.reload();
    await js.page.waitForSelector('#que-es.is-enhanced');
    equal(await js.page.locator('#que-es').getAttribute('data-mode'), 'escuelas', `${label} el modo Escuelas persiste`);
    equal(js.errors, [], `${label} sin errores de ejecución`);
    console.log(`Qué es ${label} con JavaScript: OK`);
  } catch (error) {
    await js.page.screenshot({path:`/tmp/que-es-failure-${width}.png`, fullPage:false}).catch(() => {});
    throw error;
  } finally { await js.context.close(); }

  const plain = await open(browser, base, {width, height, javaScriptEnabled:false});
  try {
    await noJavaScript(plain.page, label);
    console.log(`Qué es ${label} sin JavaScript: OK`);
  } catch (error) {
    await plain.page.screenshot({path:`/tmp/que-es-failure-${width}-html.png`, fullPage:false}).catch(() => {});
    throw error;
  } finally { await plain.context.close(); }
}

async function webShare(browser, base) {
  const shared = await open(browser, base, {init:() => { navigator.share = async (data) => { window.__shared = data; }; }});
  try {
    check(await shared.page.locator('#qe-native').isVisible(), 'Web Share: se ofrece "Compartir…"');
    await shared.page.locator('#qe-native').click();
    const data = await shared.page.evaluate(() => window.__shared);
    match(data.url, /#que-es$/, 'Web Share: comparte el destino');
    match(data.text, /Entiende El Niño/, 'Web Share: incluye un texto');
    console.log('Qué es Web Share: OK');
  } finally { await shared.context.close(); }
}

(async () => {
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${server.address().port}/`;
    browser = await pw.chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
    for (const [width, height] of [[390, 844], [1440, 1000], [320, 740], [768, 1024]]) await run(browser, base, width, height);
    await webShare(browser, base);
    console.log(`${assertions} comprobaciones de la experiencia #que-es aprobadas.`);
  } finally {
    if (browser) await browser.close();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
