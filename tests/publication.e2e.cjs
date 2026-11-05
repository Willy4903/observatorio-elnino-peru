/* Avisos de nueva interfaz con HTML de prueba y el módulo real, sin datos oficiales.
   PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node tests/publication.e2e.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
let pw;
try { pw = require('playwright'); } catch { pw = require('@playwright/test'); }

const MODULE = path.join(__dirname, '../site/assets/publication.mjs');
const ORIGINAL = '0123456789ab';
const NEXT = 'abcdef012345';
let fixture;
let assertions = 0;
function equal(actual, expected, message) { assertions++; assert.deepEqual(actual, expected, message); }
function check(actual, message) { assertions++; assert.ok(actual, message); }

function descriptor(response) {
  response.writeHead(fixture.status, {'Content-Type':'application/json', 'Cache-Control':'no-store'});
  response.end(fixture.raw ?? JSON.stringify(fixture.remote));
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/observatorio/') {
    fixture.pageRequests++;
    response.writeHead(200, {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store'});
    response.end(`<!doctype html><html lang="es"><head><meta charset="utf-8">
      <meta name="observatorio-version" content="${fixture.loaded}"><title>Prueba de publicación</title>
      </head><body><main id="panorama"><label>Borrador <input id="draft"></label></main>
      <aside id="interface-update" role="status" aria-live="polite" hidden>
        <span>Hay una versión nueva del observatorio.</span>
        <button id="reload-interface" type="button">Actualizar vista</button>
      </aside><script type="module">import './assets/publication.mjs';window.__moduleReady=true;</script></body></html>`);
  } else if (url.pathname === '/observatorio/assets/publication.mjs') {
    response.writeHead(200, {'Content-Type':'text/javascript; charset=utf-8', 'Cache-Control':'no-store'});
    fs.createReadStream(MODULE).pipe(response);
  } else if (url.pathname === '/observatorio/publication.json') {
    fixture.descriptorRequests++;
    if (fixture.hold) fixture.waiting.push(response);
    else descriptor(response);
  } else {
    response.writeHead(404); response.end('No encontrado');
  }
});

async function openFixture(browser, base, options = {}) {
  const {query='theme=dark&station=piura&ui=old', ...overrides} = options;
  fixture = {loaded:ORIGINAL, remote:{interface_version:ORIGINAL}, status:200, raw:null,
    pageRequests:0, descriptorRequests:0, hold:false, waiting:[], ...overrides};
  const context = await browser.newContext({serviceWorkers:'block'});
  await context.addInitScript(() => {
    const fetchOriginal = window.fetch.bind(window);
    window.__publicationFetches = [];
    window.fetch = (input, options = {}) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
      const call = url.pathname.endsWith('/publication.json') ? {url:url.href, cache:options.cache, done:false} : null;
      if (call) window.__publicationFetches.push(call);
      return fetchOriginal(input, options).then(response => {
        if (call) call.done = true;
        return response;
      }, error => { if (call) call.done = true; throw error; });
    };
    // Capture the scheduled callback so polling can be exercised without a real minute of waiting.
    const intervalOriginal = window.setInterval.bind(window);
    window.__publicationIntervals = [];
    window.setInterval = (callback, delay, ...args) => {
      if (delay === 60000) {
        window.__publicationIntervals.push({callback,delay});
        return 9000 + window.__publicationIntervals.length;
      }
      return intervalOriginal(callback,delay,...args);
    };
    window.__testHidden = false;
    Object.defineProperty(document, 'hidden', {configurable:true,get:()=>window.__testHidden});
    Object.defineProperty(document, 'visibilityState', {configurable:true,get:()=>window.__testHidden ? 'hidden' : 'visible'});
    window.__visibility = hidden => {
      window.__testHidden = hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    };
    window.__pollPublication = () => window.__publicationIntervals.forEach(timer=>timer.callback());
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + 'observatorio/?' + query + '#panorama');
  await page.waitForFunction(()=>window.__moduleReady);
  return {context,page,errors};
}

async function settled(page, minimum = 1) {
  await page.waitForFunction(minimum => window.__publicationFetches.length >= minimum &&
    window.__publicationFetches.every(call=>call.done), minimum);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}

async function verifyNoCache(page) {
  const calls = await page.evaluate(()=>window.__publicationFetches.map(({url,cache})=>({url,cache})));
  check(calls.length > 0, 'se consultó el descriptor de interfaz');
  check(calls.every(call=>call.cache === 'no-store'), 'cada comprobación evita la caché HTTP');
  check(calls.every(call=>new URL(call.url).pathname === '/observatorio/publication.json'), 'descriptor relativo al sitio publicado');
}

async function ignoredMetadata(browser, base) {
  for (const loaded of ['__UI_VERSION__','version-invalida','']) {
    const {context,page,errors} = await openFixture(browser,base,{loaded,remote:{interface_version:NEXT}});
    try {
      await page.evaluate(()=>{window.__visibility(true);window.__visibility(false);window.__pollPublication();});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
      equal(fixture.descriptorRequests,0, `sin consulta para meta sin versión publicada: ${loaded || '(vacía)'}`);
      check(await page.locator('#interface-update').isHidden(), 'el desarrollo local no presenta aviso de publicación');
      equal(errors,[], 'sin errores para una meta sin versión publicada');
    } finally { await context.close(); }
  }
}

async function quietDescriptors(browser, base) {
  const cases = [
    {label:'misma versión', remote:{interface_version:ORIGINAL}},
    {label:'mayúsculas equivalentes', remote:{interface_version:ORIGINAL.toUpperCase()}},
    {label:'objeto vacío', remote:{}},
    {label:'descriptor nulo', remote:null},
    {label:'versión inválida', remote:{interface_version:'__UI_VERSION__'}},
    {label:'versión de otra longitud', remote:{interface_version:NEXT+'ff'}},
    {label:'versión no textual', remote:{interface_version:42}},
    {label:'error HTTP', status:503, remote:{interface_version:NEXT}},
    {label:'JSON inválido', raw:'{"interface_version":'},
  ];
  for (const item of cases) {
    const {context,page,errors} = await openFixture(browser,base,item);
    try {
      await settled(page);
      check(await page.locator('#interface-update').isHidden(), `sin aviso para ${item.label}`);
      equal(fixture.pageRequests,1, `sin recarga automática para ${item.label}`);
      equal(errors,[], `sin errores JavaScript para ${item.label}`);
      await verifyNoCache(page);
    } finally { await context.close(); }
  }
}

async function newInterface(browser, base) {
  const {context,page,errors} = await openFixture(browser,base);
  try {
    await settled(page);
    equal(await page.evaluate(()=>window.__publicationIntervals.map(timer=>timer.delay)),[60000], 'comprobación periódica cada sesenta segundos');
    await page.locator('#draft').fill('Piura: selección pendiente');
    await page.locator('#draft').focus();
    const originalUrl = page.url();
    fixture.remote = {interface_version:NEXT};
    await page.evaluate(()=>{window.__visibility(true);window.__pollPublication();});
    equal(fixture.descriptorRequests,1, 'una pestaña oculta no comprueba publicaciones');
    await page.evaluate(()=>window.__visibility(false));
    await settled(page,2);
    check(await page.locator('#interface-update').isVisible(), 'un cambio de interfaz sin cambiar datos se detecta al volver a la pestaña');
    check((await page.locator('#interface-update').innerText()).includes('Hay una versión nueva del observatorio.'), 'el aviso explica la nueva versión');
    equal(await page.locator('#reload-interface').innerText(),'Actualizar vista','actualización voluntaria identificada');
    equal(await page.locator('#draft').inputValue(),'Piura: selección pendiente','el aviso conserva el trabajo en curso');
    check(await page.locator('#draft').evaluate(element=>element===document.activeElement),'el aviso conserva el foco actual');
    equal(page.url(),originalUrl,'detectar una versión nueva no navega automáticamente');

    // A failed or invalid later check stays quiet and can recover on the next interval.
    fixture.remote = {interface_version:'invalida'};
    await page.evaluate(()=>window.__pollPublication());
    await settled(page,3);
    check(await page.locator('#interface-update').isHidden(),'descriptor inválido posterior oculta el aviso');
    fixture.status = 503;
    await page.evaluate(()=>window.__pollPublication());
    await settled(page,4);
    check(await page.locator('#interface-update').isHidden(),'fallo de comprobación no muestra un aviso de error');
    fixture.status = 200;
    fixture.remote = {interface_version:NEXT};
    await page.evaluate(()=>window.__pollPublication());
    await settled(page,5);
    check(await page.locator('#interface-update').isVisible(),'la comprobación periódica recupera el aviso de versión nueva');
    await verifyNoCache(page);

    // The next document is the new deployment; replace must retain location and history length.
    fixture.loaded = NEXT;
    const historyLength = await page.evaluate(()=>history.length);
    await Promise.all([
      page.waitForURL(url=>url.searchParams.get('ui')===NEXT && url.hash==='#panorama'),
      page.locator('#reload-interface').click(),
    ]);
    await page.waitForFunction(()=>window.__moduleReady);
    await settled(page);
    const updated = new URL(page.url());
    equal(updated.pathname,'/observatorio/','actualizar conserva la ruta');
    equal(updated.searchParams.get('theme'),'dark','actualizar conserva las opciones existentes');
    equal(updated.searchParams.get('station'),'piura','actualizar conserva la selección en la URL');
    equal(updated.searchParams.getAll('ui'),[NEXT],'actualizar sustituye el parámetro ui sin duplicarlo');
    equal(updated.hash,'#panorama','actualizar conserva el destino Panorama');
    equal(await page.evaluate(()=>history.length),historyLength,'la recarga reemplaza la entrada de historial');
    check(await page.locator('#interface-update').isHidden(),'la versión recién cargada no vuelve a ofrecer su propia actualización');
    await page.evaluate(()=>window.__visibility(false));
    await settled(page,2);
    await page.evaluate(()=>window.__pollPublication());
    await settled(page,3);
    equal(fixture.pageRequests,2,'sin bucle de navegación tras cargar la nueva versión');
    equal(errors,[],'sin errores JavaScript durante detección y actualización');
    await verifyNoCache(page);
  } finally { await context.close(); }
}

async function concurrentChecks(browser, base) {
  const {context,page,errors} = await openFixture(browser,base,{hold:true,remote:{interface_version:NEXT}});
  try {
    await page.waitForFunction(()=>window.__publicationFetches.length===1);
    await page.evaluate(()=>{
      for (let turn=0;turn<6;turn++) {window.__visibility(false);window.__pollPublication();}
    });
    equal(await page.evaluate(()=>window.__publicationFetches.length),1,'visibilidad y temporizador comparten una consulta pendiente');
    equal(fixture.descriptorRequests,1,'no hay solicitudes HTTP paralelas duplicadas');
    fixture.hold = false;
    for (const response of fixture.waiting.splice(0)) descriptor(response);
    await settled(page);
    check(await page.locator('#interface-update').isVisible(),'la consulta compartida resuelve el aviso');
    await page.evaluate(()=>window.__visibility(false));
    await settled(page,2);
    equal(fixture.descriptorRequests,2,'la consulta finalizada permite comprobar de nuevo');
    equal(errors,[],'sin errores al agrupar consultas');
    await verifyNoCache(page);
  } finally {
    for (const response of fixture.waiting.splice(0)) response.end();
    await context.close();
  }
}

async function staleDocumentWithCurrentUrl(browser, base) {
  const {context,page,errors} = await openFixture(browser,base,{
    remote:{interface_version:NEXT},query:`theme=dark&station=piura&ui=${NEXT}`,
  });
  try {
    await settled(page);
    check(await page.locator('#interface-update').isVisible(),'un documento antiguo se detecta aunque la URL ya tenga la versión remota');
    const previousUrl = page.url();
    const historyLength = await page.evaluate(()=>history.length);
    fixture.loaded = NEXT;
    await Promise.all([
      page.waitForNavigation({waitUntil:'load'}),
      page.locator('#reload-interface').click(),
    ]);
    await page.waitForFunction(()=>window.__moduleReady);
    await settled(page);
    equal(page.url(),previousUrl,'la recarga explícita de la misma URL conserva ruta, opciones y fragmento');
    equal(await page.evaluate(()=>history.length),historyLength,'recargar la misma URL conserva la longitud del historial');
    equal(fixture.pageRequests,2,'el botón recarga realmente un documento con ui ya actualizado');
    check(await page.locator('#interface-update').isHidden(),'el documento nuevo oculta el aviso tras recargar la misma URL');
    await page.evaluate(()=>window.__pollPublication());
    await settled(page,2);
    equal(fixture.pageRequests,2,'la recarga explícita tampoco produce un bucle');
    equal(errors,[],'sin errores al recargar la misma URL');
    await verifyNoCache(page);
  } finally { await context.close(); }
}

(async()=>{
  let browser;
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base = `http://127.0.0.1:${server.address().port}/`;
    browser = await pw.chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
    await ignoredMetadata(browser,base);
    await quietDescriptors(browser,base);
    await newInterface(browser,base);
    await concurrentChecks(browser,base);
    await staleDocumentWithCurrentUrl(browser,base);
    console.log(`${assertions} comprobaciones de actualización de interfaz aprobadas.`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
