/* Genera los materiales descargables de #que-es ("Guía rápida para compartir"):
     site/assets/share/infografia-el-nino-colegios.pdf   (A4, 2 páginas)
     site/assets/share/guia-whatsapp-el-nino.png         (1080 × 1350, alto contraste)
     site/assets/share/manual-prevencion-familiar.pdf    (A4, 2 páginas)

   El contenido se lee de site/index.html (la sección #que-es y #preparacion), de modo que los
   textos no se duplican ni se inventan: el manual familiar reproduce las recomendaciones de INDECI
   que ya publica el observatorio. Los archivos no contienen alertas ni fechas de emisión.

   Uso (desde la raíz del repositorio):
     npm install --no-save playwright qrcode
     npx playwright install chromium        # una sola vez
     node design/share/render.cjs

   Requiere acceso a Google Fonts para cargar Plus Jakarta Sans y Outfit; sin red usa fuentes de sustitución. */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const QRCode = require('qrcode');
const templates = require('./templates.cjs');

const ROOT = path.resolve(__dirname, '../..');
const SITE = path.join(ROOT, 'site');
const OUT = path.join(SITE, 'assets/share');
const PAGE_URL = 'https://willy4903.github.io/observatorio-elnino-peru/#que-es';
const MIME = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.gz': 'application/gzip' };

function serve() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const file = path.resolve(SITE, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(SITE + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/* Lee del DOM real de la página todo el texto que usan los materiales. */
const extract = () => {
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const text = (node) => (node ? node.textContent.replace(/\s+/g, ' ').trim() : '');
  const variants = (scope, extra = '') => ({ c: text($(`[data-m="c"]${extra}`, scope)), e: text($(`[data-m="e"]${extra}`, scope)) });
  return {
    steps: $$('#que-es .qe-step').map((li) => ({
      name: text($('.qe-step-name', li)),
      nino: variants($('.qe-step-text', li), '[data-c="nino"]'),
      normal: variants($('.qe-step-text', li), '[data-c="normal"]'),
      art: $('.qe-step-art', li).outerHTML
    })),
    keys: $$('#que-es .qe-key').map((li) => ({ title: text($('h4', li)), ...variants($('p', li)), icon: $('.qe-key-icon svg', li).outerHTML })),
    quiz: $$('#que-es .qe-qi').map((li) => ({ answer: li.dataset.answer, statement: text($('.qe-q-stmt', li)), ...variants($('.qe-q-exp', li)) })),
    callout: variants($('#que-es .qe-callout p')),
    scene: $('#que-es .qe-scene-svg').outerHTML,
    prep: {
      intro: text($('#preparacion .citizen-preparation-heading p')),
      note: text($('#preparacion .citizen-preparation-note')),
      cards: $$('#preparacion .prep-card').map((card) => ({ title: text($('h3', card)), icon: $('svg', card).outerHTML, items: $$('li', card).map(text) })),
      readings: $$('#preparacion .oc-source-list li').map((li) => ({ title: text($('a', li)), href: $('a', li).href, description: text($('p', li)) }))
    }
  };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const external = (url) => !url.toString().startsWith(base) && !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url.toString());
    await context.route(external, (route) => route.abort());
    const source = await context.newPage();
    await source.goto(base, { waitUntil: 'load' });
    await source.waitForSelector('#que-es.is-enhanced');
    const data = await source.evaluate(extract);
    data.css = fs.readFileSync(path.join(SITE, 'assets/que-es.css'), 'utf8');
    data.url = PAGE_URL;
    data.qr = await QRCode.toString(PAGE_URL, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
    await source.close();

    const jobs = [
      { name: 'infografia-el-nino-colegios.pdf', html: templates.colegios(data), pdf: true },
      { name: 'manual-prevencion-familiar.pdf', html: templates.manual(data), pdf: true },
      { name: 'guia-whatsapp-el-nino.png', html: templates.whatsapp(data), png: { width: 1080, height: 1350 } }
    ];
    for (const job of jobs) {
      const page = await context.newPage();
      if (job.png) await page.setViewportSize(job.png);
      await page.setContent(job.html, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const file = path.join(OUT, job.name);
      if (job.pdf) await page.pdf({ path: file, format: 'A4', printBackground: true, preferCSSPageSize: true });
      else await page.screenshot({ path: file, type: 'png', clip: { x: 0, y: 0, ...job.png } });
      console.log(`${job.name}: ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
