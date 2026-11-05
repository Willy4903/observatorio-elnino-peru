/* Regresiones de Panorama con los datos oficiales incluidos; sin consultas externas.
   PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node tests/panorama.e2e.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {gunzipSync} = require('node:zlib');
let pw;
try { pw = require('playwright'); } catch { pw = require('@playwright/test'); }

const ROOT = path.resolve(process.env.PANORAMA_SITE_DIR || path.join(__dirname, '../site'));
const MIME = {'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.gz':'application/gzip','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'};
const forecast = JSON.parse(gunzipSync(fs.readFileSync(path.join(ROOT, 'data/district_forecast.json.gz')))).data;
const historical = JSON.parse(gunzipSync(fs.readFileSync(path.join(ROOT, 'data/senamhi_forecast.json.gz')))).data;
const forecastDates = [...new Set(forecast.map(row => row.valid_date))].sort();
const referenceDate = forecastDates[0];
assert.match(referenceDate || '', /^\d{4}-\d{2}-\d{2}$/, 'El GFS incluido debe contener fechas de pronóstico válidas');
const referenceYear = referenceDate.slice(0, 4);
const referenceTime = Date.parse(referenceDate + 'T17:00:00Z');
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const file = path.resolve(ROOT, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
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
const formatted = (number, digits) => new Intl.NumberFormat('es-PE', {maximumFractionDigits:digits, minimumFractionDigits:digits}).format(number);

async function contextFor(browser, base, width, height) {
  const context = await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route(url => !url.toString().startsWith(base), route => route.abort());
  await context.addInitScript(now => {
    // A clock, not a measurement fixture: current/archived classification stays reproducible.
    const ActualDate = Date;
    window.Date = class extends ActualDate {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    };
  }, referenceTime);
  return context;
}

async function load(page, base) {
  await page.goto(base + '#panorama');
  await page.waitForFunction(year => document.querySelector('#inspector-department')?.options.length === 26 &&
    document.querySelector('#panorama-period')?.textContent.includes(year) &&
    document.querySelector('#weather-days [data-weather-date]'), referenceYear);
  await page.locator('#panorama').evaluate(element => element.scrollIntoView());
}

async function noOverflow(page, width) {
  const sizes = await page.evaluate(() => ({viewport:document.documentElement.clientWidth,document:document.documentElement.scrollWidth,
    panorama:document.querySelector('#panorama').getBoundingClientRect().toJSON()}));
  check(sizes.document <= sizes.viewport + 1, `[${width}] no hay desplazamiento horizontal (${JSON.stringify(sizes)})`);
  check(sizes.panorama.left >= -1 && sizes.panorama.right <= width + 1, `[${width}] Panorama queda dentro de la pantalla`);
}

async function setDates(page, from, to) {
  await page.locator('#filters').evaluate(form => { form.closest('details').open = true; });
  // Change the range together so this helper can test the applied result independently
  // from the separate invalid-range regression below.
  await page.evaluate(({from,to}) => {
    document.querySelector('#period').value = 'range';
    document.querySelector('#from').value = from;
    document.querySelector('#to').value = to;
    document.querySelector('#from').dispatchEvent(new Event('change',{bubbles:true}));
  }, {from,to});
}

async function runInteractions(browser, base, width, height) {
  const context = await contextFor(browser, base, width, height);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::/.test(message.text())) errors.push(message.text());
  });
  try {
    await load(page, base);
    await noOverflow(page, width);
    equal(await page.locator('[data-kind]').count(), 3, `[${width}] tres tipos de información`);
    equal(await page.locator('#inspector-department option').count(), 26, `[${width}] se conservan los 25 territorios y el ámbito nacional`);
    match(await page.locator('#panorama-scope').innerText(), /Perú/i, `[${width}] ámbito aplicado legible`);
    check(await page.locator('#vectors-toggle').isVisible(), `[${width}] corrientes disponibles en estado del mar`);
    check(!(await page.locator('[data-map-mode="rain"]').isVisible()), `[${width}] no se mezclan capas de lluvia en mar`);
    check(!(await page.locator('[data-map-mode="risk"]').isVisible()), `[${width}] no se mezclan capas de riesgo en mar`);
    check(await page.locator('#map-expand').isVisible(), `[${width}] ampliar no requiere abrir opciones avanzadas`);
    check(await page.locator('#map-touch').isVisible(), `[${width}] control de gestos accesible`);

    // Risk starts with the official district scenario, not the point inventory.
    await page.locator('[data-kind="risk_scenario"]').click();
    equal(await page.locator('[data-map-mode="risk"]').getAttribute('aria-pressed'), 'true', `[${width}] riesgo distrital es la selección inicial`);
    check(await page.locator('[data-map-mode="heat"]').isVisible(), `[${width}] inventario de puntos es una opción diferenciada`);
    check(!(await page.locator('#vectors-toggle').isVisible()), `[${width}] corrientes se ocultan fuera del mar`);
    match(await page.locator('#map-kind').innerText(), /RIESGO/i, `[${width}] escenario identificado como riesgo posible`);

    await page.locator('[data-kind="forecast"]').click();
    check(await page.locator('#forecast-provider').isVisible(), `[${width}] fuente del tiempo visible`);
    check(await page.locator('#forecast-frame').isVisible(), `[${width}] fecha del pronóstico visible`);
    check(await page.locator('[data-map-mode="rain"]').isVisible(), `[${width}] capa de lluvia disponible en pronóstico`);
    check(!(await page.locator('[data-map-mode="heat"]').isVisible()), `[${width}] inventario oculto en pronóstico`);
    match(await page.locator('#panorama-scope').innerText(), /GFS/i, `[${width}] resumen identifica el modelo`);

    // Select real Piura metadata and compare the displayed values to the published rows.
    await page.locator('#inspector-department').selectOption('20');
    await page.waitForFunction(() => document.querySelector('#department').value === '20' &&
      !document.querySelector('#inspector-district').disabled && document.querySelector('#inspector-district').options.length > 1);
    equal(await page.locator('#department').inputValue(), '20', `[${width}] selector global sincronizado`);
    match(await page.locator('#panorama-scope').innerText(), /Piura/i, `[${width}] resumen territorial sincronizado`);
    const code = await page.locator('#inspector-district option').evaluateAll(options => options.find(option => option.value !== 'all').value);
    await page.locator('#inspector-district').selectOption(code);
    await page.waitForFunction(code => document.querySelector('#inspector-ubigeo').textContent.includes(code), code);
    equal(await page.locator('#inspector-district').inputValue(), code, `[${width}] distrito elegido se conserva`);
    equal(await page.locator('#inspector-department').inputValue(), '20', `[${width}] distrito mantiene su departamento`);
    const frame = await page.locator('#forecast-frame').inputValue();
    const published = forecast.filter(row => row.ubigeo === code && (frame === 'all' || row.valid_date === frame));
    check(published.length > 0, `[${width}] el distrito tiene un pronóstico oficial de referencia`);
    const metrics = await page.locator('#inspector-content .inspector-metric b').allTextContents();
    equal(metrics[0], formatted(Math.max(...published.map(row => row.tmax_c)),1) + ' °C', `[${width}] máxima coincide con el dato publicado`);
    equal(metrics[1], formatted(Math.min(...published.map(row => row.tmin_c)),1) + ' °C', `[${width}] mínima coincide con el dato publicado`);
    equal(metrics[2], formatted(published.reduce((sum,row)=>sum+row.precipitation_mm,0)/published.length,2) + ' mm', `[${width}] lluvia conserva los milímetros del modelo`);
    check(!/\d[\d.,]*\s*%/.test(await page.locator('#weather-days').innerText()), `[${width}] el modelo no publica una probabilidad de lluvia inventada`);

    // Forecast date buttons remain usable by keyboard after rerendering the map.
    const day = page.locator('#weather-days [data-weather-date]').last();
    const date = await day.getAttribute('data-weather-date');
    await day.focus(); await page.keyboard.press('Space');
    await page.waitForFunction(date => document.querySelector('#forecast-frame').value === date, date);
    check(await page.locator(`[data-weather-date="${date}"]`).evaluate(element => element === document.activeElement), `[${width}] foco conservado al elegir fecha de pronóstico`);

    // Territorial cards remain focused when the selected area changes the whole dashboard.
    const card = page.locator('#territory-grid [data-department="15"]');
    await card.focus(); await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelector('#inspector-department').value === '15');
    check(await page.locator('#territory-grid [data-department="15"]').evaluate(element => element === document.activeElement), `[${width}] foco conservado en tarjeta territorial`);

    // A rejected date range must not corrupt the last applied state.
    const appliedPeriod = await page.locator('#panorama-period').innerText();
    const appliedScope = await page.locator('#panorama-scope').innerText();
    const appliedMapKind = await page.locator('#map-kind').innerText();
    await setDates(page, `${Number(referenceYear) + 1}-01-01`, `${referenceYear}-01-01`);
    await page.waitForFunction(() => document.querySelector('#from').getAttribute('aria-invalid') === 'true' || document.querySelector('#to').getAttribute('aria-invalid') === 'true');
    equal(await page.locator('#panorama-period').innerText(), appliedPeriod, `[${width}] fechas inválidas no reemplazan el periodo aplicado`);
    equal(await page.locator('#panorama-scope').innerText(), appliedScope, `[${width}] fechas inválidas conservan la zona y la fuente del mapa`);
    equal(await page.locator('#map-kind').innerText(), appliedMapKind, `[${width}] fechas inválidas conservan el tipo de mapa`);
    equal(await page.locator('#panorama-status').getAttribute('data-state'), 'error', `[${width}] el rechazo de las fechas se anuncia`);
    await page.locator('[data-kind="observation"]').click();
    equal(await page.locator('#panorama-period').innerText(), appliedPeriod, `[${width}] cambiar capa después del error conserva el periodo válido`);
    await setDates(page, referenceDate, forecastDates.at(-1));
    await page.waitForFunction(() => document.querySelector('#from').getAttribute('aria-invalid') !== 'true' &&
      document.querySelector('#to').getAttribute('aria-invalid') !== 'true' &&
      document.querySelector('#panorama-status').dataset.state !== 'loading' &&
      document.querySelector('#panorama-status').dataset.state !== 'error');
    check(await page.locator('#panorama-period').innerText() !== appliedPeriod, `[${width}] corregir las fechas aplica el nuevo periodo`);
    await page.locator('#panorama-reset').click();
    await page.waitForFunction(() => document.querySelector('#inspector-department').value === 'all' && document.querySelector('[data-kind="observation"]').getAttribute('aria-pressed') === 'true' && document.querySelector('#from').getAttribute('aria-invalid') !== 'true');
    equal(await page.locator('#inspector-district').inputValue(), 'all', `[${width}] restablecer limpia distrito`);
    check(await page.locator('#inspector-district').isDisabled(), `[${width}] restablecer recupera selección nacional`);
    check(await page.locator('#from').inputValue() <= await page.locator('#to').inputValue(), `[${width}] restablecer recupera fechas válidas`);

    // SENAMHI's archived data must not masquerade as a current district forecast.
    await page.locator('[data-kind="forecast"]').click();
    await page.locator('#forecast-provider').selectOption('senamhi');
    await page.waitForFunction(() => document.querySelector('#weather-days .weather-unavailable'));
    match(await page.locator('.map-no-data').innerText(), /Sin pronósticos/i, `[${width}] falta de cobertura actual explícita`);
    match(await page.locator('#panorama-scope').innerText(), /SENAMHI/i, `[${width}] fuente alternativa identificada`);
    const oldDates = [...new Set(historical.map(row=>row.valid_date))].sort();
    await setDates(page, oldDates[0], oldDates.at(-1));
    await page.waitForFunction(() => document.querySelector('#weather-days [data-weather-date]'));
    const historicalDates = await page.locator('#forecast-frame option').evaluateAll(options=>options.map(option=>option.value).filter(value=>value!=='all'));
    equal(historicalDates, oldDates, `[${width}] archivo SENAMHI conserva las fechas publicadas`);
    check((await page.locator('#weather-days').innerText()).includes('localidades'), `[${width}] cobertura histórica se identifica por localidades`);
    check(!(await page.locator('#weather-days').innerText()).includes(' mm'), `[${width}] SENAMHI no inventa cantidades de lluvia`);
    check(!/\d[\d.,]*\s*%/.test(await page.locator('#weather-days').innerText()), `[${width}] SENAMHI no inventa probabilidades de lluvia`);
    await noOverflow(page, width);

    // The map can be explored without trapping users in page scroll or losing the keyboard.
    await page.locator('#map-touch').click();
    equal(await page.locator('#map-touch').getAttribute('aria-pressed'), 'false', `[${width}] gestos pausables`);
    check(await page.locator('#map').evaluate(element=>element.classList.contains('gestures-paused')), `[${width}] pausa se aplica al mapa`);
    await page.locator('#map-touch').click();
    equal(await page.locator('#map-touch').getAttribute('aria-pressed'), 'true', `[${width}] gestos recuperables`);
    await page.locator('#map-expand').click();
    const expanded = page.locator('.map-panel.expanded');
    equal(await expanded.getAttribute('role'), 'dialog', `[${width}] mapa ampliado identificado como diálogo`);
    equal(await expanded.getAttribute('aria-modal'), 'true', `[${width}] diálogo modal identificado`);
    check(await expanded.evaluate(element=>element.contains(document.activeElement)), `[${width}] foco dentro del mapa ampliado`);
    await page.keyboard.press('Shift+Tab');
    check(await expanded.evaluate(element=>element.contains(document.activeElement)), `[${width}] teclado permanece en el mapa ampliado`);
    await page.keyboard.press('Escape');
    equal(await page.locator('#map-expand').getAttribute('aria-expanded'), 'false', `[${width}] Escape cierra mapa ampliado`);
    check(await page.locator('#map-expand').evaluate(element=>element===document.activeElement), `[${width}] Escape devuelve foco al botón`);
    equal(errors, [], `[${width}] sin errores JavaScript`);
    console.log(`Panorama ${width}px: OK`);
  } catch (error) {
    await page.screenshot({path:`/tmp/panorama-failure-${width}.png`,fullPage:false}).catch(()=>{});
    throw error;
  } finally {
    await context.close();
  }
}

(async()=>{
  let browser;
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base = `http://127.0.0.1:${server.address().port}/`;
    browser = await pw.chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
    for (const [width,height] of [[390,844],[1440,1000]]) await runInteractions(browser,base,width,height);
    for (const [width,height] of [[320,740],[768,1024]]) {
      const context = await contextFor(browser,base,width,height);
      try { const page=await context.newPage(); await load(page,base); await noOverflow(page,width); }
      finally { await context.close(); }
    }
    console.log(`${assertions} comprobaciones de Panorama aprobadas.`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
