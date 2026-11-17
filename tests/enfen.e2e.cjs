/* Valida el contrato visual sin consultar ni alterar las fuentes científicas. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '../dist');
const types = {'.html':'text/html', '.css':'text/css', '.mjs':'text/javascript', '.js':'text/javascript', '.json':'application/json', '.svg':'image/svg+xml'};
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless:true, args:['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    const url = `http://127.0.0.1:${server.address().port}/#estado-enfen`;
    await page.goto(url);
    await page.waitForFunction(() => document.querySelectorAll('.cmc-kpi').length === 4 && document.querySelector('#enfen-publicado').textContent.includes('Costero'));
    assert.deepEqual(await page.locator('#estado-enfen').evaluate(el => { const s = getComputedStyle(el); return [s.display, s.backgroundColor]; }), ['grid', 'rgb(6, 11, 20)']);
    assert.match(await page.locator('#enfen-publicado').evaluate(el => getComputedStyle(el).fontFamily), /Plus Jakarta Sans/);
    const bulletin = JSON.parse(fs.readFileSync(path.join(root, 'data/enfen.json'))).data;
    assert.equal(await page.locator('#enfen-publicado').textContent(), bulletin.alert);
    assert.equal(await page.locator('#cmc-estado').getAttribute('data-nivel'), 'alerta');
    assert.equal(await page.locator('#cmc-prob-doc').getAttribute('href'), bulletin.document_url);
    assert.equal(await page.locator('#cmc-matriz li').count(), 8);
    assert.equal(await page.locator('.cmc-src-ref .cmc-pill').count(), 4);
    assert.equal(await page.locator('.cmc-prob-levels b').allTextContents().then(x => x.every(v => v === '—')), true);
    await page.locator('.cmc-n button').first().click();
    assert.equal(await page.locator('.cmc-n button').first().getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#cmc-d-neutro').isVisible(), true);
    const prior = await page.locator('#cmc-esc-nota').innerText();
    await page.locator('#cmc-trimestre').selectOption('1');
    assert.notEqual(await page.locator('#cmc-esc-nota').innerText(), prior);
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({width, height:1000});
      const overflow = await page.locator('#estado-enfen').evaluate(section => {
        const bounds = section.getBoundingClientRect();
        return [...section.querySelectorAll('*')].filter(e => {
          const b = e.getBoundingClientRect();
          return b.width && (b.right > bounds.right + 2 || b.left < bounds.left - 2);
        }).map(e => e.className?.baseVal || e.className);
      });
      assert.deepEqual(overflow, [], `Sin desbordamiento a ${width}px`);
      assert.equal(await page.locator('#cmc-trimestre').evaluate(el => el.getBoundingClientRect().height >= 44), true);
      if ([1440,390].includes(width)) await page.locator('#estado-enfen').screenshot({path:`/tmp/enfen-${width}.png`});
    }
    await page.locator('.cmc-nav a[href="#cmc-fuentes"]').click();
    assert.equal(new URL(page.url()).hash, '#cmc-fuentes');
    assert.deepEqual(errors, []);
    // La ausencia de una serie semanal no debe convertirse en «0 semanas».
    await page.route('**/data/noaa_weekly.json.gz', route => route.fulfill({status:503, body:'unavailable'}));
    await page.reload();
    await page.waitForSelector('.cmc-kpi');
    assert.equal(await page.locator('.cmc-kpi').nth(3).locator('.cmc-kpi-v').textContent(), 'Sin dato');
    console.log('ENFEN: comunicado y enlace reales, 8 fuentes, selector, detalle, hashes, 5 tamaños, ausencia de datos y JS sin errores: OK');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
