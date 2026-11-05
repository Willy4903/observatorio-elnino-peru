/* Lectura ciudadana y anclas nativas sobre el sitio real, sin consultas externas.
   PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node tests/ciudadano.e2e.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
let pw;
try { pw = require('playwright'); } catch { pw = require('@playwright/test'); }

const ROOT = path.resolve(process.env.PANORAMA_SITE_DIR || path.join(__dirname, '../site'));
const MIME = {'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.gz':'application/gzip','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2'};
const sectionIds = ['oc-s1','oc-s2','oc-s3','oc-s4'];
const destinationIds = ['estado-enfen','consulta','preparacion','glosario'];
const server = http.createServer((request, response) => {
  let file;
  try {
    const url = new URL(request.url, 'http://localhost');
    file = path.resolve(ROOT, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
  } catch { response.writeHead(400); response.end('Solicitud inválida'); return; }
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404); response.end('No encontrado'); return;
  }
  response.writeHead(200, {'Content-Type':MIME[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
  fs.createReadStream(file).pipe(response);
});

let assertions = 0;
function equal(actual, expected, message) { assertions++; assert.deepEqual(actual, expected, message); }
function check(actual, message) { assertions++; assert.ok(actual, message); }
function match(actual, expected, message) { assertions++; assert.match(actual, expected, message); }

async function readingAndLayout(page, label) {
  const guide = page.locator('#elnino-ciudadano');
  equal(await guide.count(), 1, `${label} la guía tiene un destino único`);
  equal(await guide.getAttribute('aria-labelledby'), 'oc-title', `${label} la guía anuncia su título`);
  equal(await guide.locator('h2').count(), 1, `${label} un título principal en la guía`);
  check(await page.locator('#oc-title').isVisible(), `${label} título visible`);
  equal(await guide.locator('.oc-section').evaluateAll(sections => sections.map(section => section.id)), sectionIds, `${label} cuatro apartados en orden de lectura`);
  equal(await guide.locator('h3').count(), 4, `${label} cada apartado usa un encabezado de nivel 3`);
  equal(await guide.locator('.oc-reading-nav a').evaluateAll(links => links.map(link => link.getAttribute('href'))), sectionIds.map(id => '#' + id), `${label} el índice contiene las cuatro anclas en orden`);
  const nav = guide.locator('.oc-reading-nav');
  equal(await nav.evaluate(element => element.tagName), 'NAV', `${label} índice identificado como navegación`);
  check(Boolean(await nav.getAttribute('aria-label')), `${label} índice con nombre accesible`);
  for (const [index, id] of sectionIds.entries()) {
    const section = page.locator('#' + id);
    check(await section.isVisible(), `${label} ${id} se lee sin cambiar de pestaña`);
    equal(await section.locator(':scope > h3').count(), 1, `${label} ${id} tiene encabezado directo`);
    match(await section.locator('h3').innerText(), new RegExp('^' + (index + 1) + '\\.'), `${label} numeración coherente en ${id}`);
    const labelled = await section.evaluate(element => element.getAttribute('aria-labelledby') === element.querySelector('h3')?.id);
    check(labelled, `${label} ${id} usa su encabezado como nombre`);
  }

  const text = await guide.innerText();
  const allText = await guide.textContent();
  const words = text.trim().split(/\s+/).length;
  check(words <= 650, `${label} lectura breve (${words} palabras)`);
  check(!/Fuerte\s+a\s+Muy\s+Fuerte|Casi\s+100|M[aá]s\s+de\s+83|tu hogar est[aá] preparado/i.test(allText), `${label} sin advertencia fija ni certificación de preparación`);
  check(!/\d[\d.,]*\s*(?:%|°\s*C)/i.test(allText), `${label} la guía no presenta probabilidades ni temperaturas sin actualización`);
  equal(await guide.locator('[role="tab"], [role="tablist"], [role="tabpanel"], .oc-tab-btn, .oc-tab-panel, input[type="checkbox"], progress, [role="progressbar"], img, svg, canvas, iframe').count(), 0, `${label} lectura sin pestañas, simuladores ni imágenes decorativas`);
  equal(await page.locator('script[src*="ciudadano.mjs"]').count(), 0, `${label} la lectura no requiere el antiguo controlador de pestañas`);

  const sources = await guide.locator('.oc-source-list a').evaluateAll(links => links.map(link => ({
    href:link.getAttribute('href'),target:link.target,rel:link.rel,text:link.textContent.trim(),
    description:link.closest('li')?.querySelector('p')?.textContent.trim()
  })));
  equal(sources.length, 4, `${label} cuatro lecturas oficiales seleccionadas`);
  for (const source of sources) {
    const url = new URL(source.href);
    equal(url.protocol, 'https:', `${label} fuente segura: ${source.text}`);
    check(['enfen.imarpe.gob.pe','www.cpc.ncep.noaa.gov','www.gob.pe'].includes(url.hostname), `${label} fuente oficial: ${source.text}`);
    equal(source.target, '_blank', `${label} lectura externa conserva la guía: ${source.text}`);
    check(source.rel.split(/\s+/).includes('noopener'), `${label} lectura externa aislada: ${source.text}`);
    check(source.text.length > 10 && source.description?.length > 25, `${label} fuente con nombre y propósito: ${source.text}`);
  }
  for (const id of destinationIds) {
    check(await guide.locator(`a[href="#${id}"]`).count() > 0, `${label} enlace para ampliar: ${id}`);
    equal(await page.locator('#' + id).count(), 1, `${label} destino existente y único: ${id}`);
  }

  const layout = await guide.evaluate(element => {
    const box = element.getBoundingClientRect();
    const paragraphs = [...element.querySelectorAll('.oc-section > p:not(.oc-reading-note), .oc-practical-list li')];
    return {
      viewport:document.documentElement.clientWidth, document:document.documentElement.scrollWidth,
      left:box.left, right:box.right,
      overflow:[...element.querySelectorAll('h2,h3,h4,p,li,a')].filter(child => {
        const rect = child.getBoundingClientRect();
        return rect.left < -1 || rect.right > document.documentElement.clientWidth + 1;
      }).map(child => child.textContent.trim().slice(0,60)),
      ordered:[...element.querySelectorAll('.oc-section')].map(section => section.getBoundingClientRect().top),
      smallestText:Math.min(...paragraphs.map(p => parseFloat(getComputedStyle(p).fontSize))),
      navTargets:[...element.querySelectorAll('.oc-reading-nav a')].map(link => link.getBoundingClientRect().height)
    };
  });
  check(layout.document <= layout.viewport + 1, `${label} página sin desplazamiento horizontal (${layout.document}/${layout.viewport})`);
  check(layout.left >= -1 && layout.right <= layout.viewport + 1, `${label} guía dentro de la pantalla`);
  equal(layout.overflow, [], `${label} texto y enlaces dentro de la pantalla`);
  check(layout.ordered.every((top, index, values) => index === 0 || top > values[index - 1]), `${label} los apartados se presentan uno después del otro`);
  check(layout.smallestText >= 16, `${label} cuerpo de lectura de al menos 16 px`);
  check(layout.navTargets.every(height => height >= 44), `${label} índice con áreas de toque de al menos 44 px`);
}

async function nativeNavigation(page, base, label) {
  for (const id of sectionIds) {
    const link = page.locator(`.oc-reading-nav a[href="#${id}"]`);
    await link.focus();
    check(await link.evaluate(element => element === document.activeElement), `${label} el teclado alcanza ${id}`);
    await page.keyboard.press('Enter');
    await page.waitForURL(base + '#' + id);
    equal(new URL(page.url()).hash, '#' + id, `${label} Enter usa el fragmento nativo ${id}`);
    await page.waitForFunction(id => {
      const heading = document.getElementById(id)?.querySelector('h3');
      const box = heading?.getBoundingClientRect();
      const headerBottom = document.querySelector('.radar-header')?.getBoundingClientRect().bottom || 0;
      return box && box.top >= headerBottom - 1 && box.bottom < innerHeight - 65;
    }, id);
    check(await page.locator('#' + id).isVisible(), `${label} ancla muestra el encabezado sin cubrirlo con la barra fija`);
    await page.goBack();
    await page.waitForURL(base + '#elnino-ciudadano');
    equal(new URL(page.url()).hash, '#elnino-ciudadano', `${label} Atrás recupera la guía desde ${id}`);
  }
  for (const id of destinationIds) {
    await page.locator(`#elnino-ciudadano a[href="#${id}"]`).first().click();
    await page.waitForURL(base + '#' + id);
    check(await page.locator('#' + id).isVisible(), `${label} ampliación visible: ${id}`);
    const closedAncestors = await page.locator('#' + id).evaluate(element => {
      let count = 0;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (parent.tagName === 'DETAILS' && !parent.open) count++;
      }
      return count;
    });
    equal(closedAncestors, 0, `${label} el destino ${id} no queda dentro de un apartado cerrado`);
    await page.goBack();
    await page.waitForURL(base + '#elnino-ciudadano');
    equal(new URL(page.url()).hash, '#elnino-ciudadano', `${label} Atrás vuelve desde ${id} sin redirección`);
  }
}

async function runReading(browser, base, width, height, javaScriptEnabled) {
  const label = `[${width}px ${javaScriptEnabled ? 'con' : 'sin'} JavaScript]`;
  const context = await browser.newContext({viewport:{width,height},javaScriptEnabled,isMobile:width<600,hasTouch:width<600,serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route(url => !url.toString().startsWith(base), route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base + '#elnino-ciudadano');
    if (javaScriptEnabled) {
      // El tablero puede cambiar de altura al cargar sus datos reales. La navegación
      // se prueba después de esa carga, sin sustituir mediciones ni fechas oficiales.
      await page.waitForFunction(() => ['ready','empty'].includes(document.querySelector('#panorama-status')?.dataset.state));
    }
    equal(new URL(page.url()).hash, '#elnino-ciudadano', `${label} el enlace compartido conserva su destino`);
    await readingAndLayout(page, label);
    if (width !== 320) await nativeNavigation(page, base, label);
    equal(errors, [], `${label} sin errores de ejecución`);
    console.log(`Guía ciudadana ${label}: OK`);
  } catch (error) {
    await page.screenshot({path:`/tmp/ciudadano-failure-${width}-${javaScriptEnabled ? 'js' : 'html'}.png`,fullPage:false}).catch(()=>{});
    throw error;
  } finally { await context.close(); }
}

(async()=>{
  let browser;
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const base = `http://127.0.0.1:${server.address().port}/`;
    browser = await pw.chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
    for (const javaScriptEnabled of [false,true]) {
      for (const [width,height] of [[390,844],[1440,1000],[320,740]]) await runReading(browser,base,width,height,javaScriptEnabled);
    }
    console.log(`${assertions} comprobaciones de lectura ciudadana aprobadas.`);
  } finally {
    if (browser) await browser.close();
    if (server.listening) await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
