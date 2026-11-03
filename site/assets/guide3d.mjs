// Experiencia interactiva progresiva. Si falla JavaScript, los enlaces originales siguen operativos.
// Las síntesis son educativas y los valores se leen del observatorio; no se inventan datos ni se sustituyen fuentes.
const guideGrid = document.querySelector('#guia-inicio .simple-guide-grid');
const guideSection = document.getElementById('guia-inicio');
const subjects = [
  {
    key: 'enfen',
    subject: '¿Qué dice ENFEN?',
    tag: 'ALERTA OFICIAL',
    title: 'Una alerta no es una inundación',
    concept: 'ENFEN reúne a instituciones que vigilan El Niño y publican su situación oficial. Una alerta invita a informarnos y prepararnos.',
    takeaway: 'No significa que hoy vaya a llover en todas las ciudades.'
  },
  {
    key: 'pronostico',
    subject: '¿Qué se espera en mi distrito?',
    tag: 'PRONÓSTICO DEL TIEMPO',
    title: 'Un pronóstico no es una certeza',
    concept: 'Los modelos estiman la lluvia y la temperatura de los próximos días. Sus resultados pueden cambiar cuando reciben nuevos datos.',
    takeaway: 'Un punto del distrito no describe todas sus calles ni indica la probabilidad de lluvia.'
  },
  {
    key: 'riesgo',
    subject: '¿Dónde existe mayor riesgo?',
    tag: 'MAPAS DE RIESGO',
    title: 'Riesgo no significa desastre',
    concept: 'CENEPRED identifica distritos donde una inundación o un huaico podría causar daños. Sirve para planificar medidas preventivas.',
    takeaway: 'Un mapa de riesgo no confirma una emergencia en este momento.'
  }
];

const dossier = document.createElement('section');
dossier.id = 'guia-contenido';
dossier.className = 'guide-dossier';
dossier.setAttribute('aria-labelledby', 'guide-dossier-title');
dossier.innerHTML = `
  <div class="guide-dossier-head">
    <div><span class="citizen-kicker">APRENDE SIN SALIR DEL OBSERVATORIO</span>
      <h2 id="guide-dossier-title">Te explicamos lo importante</h2>
      <p>Selecciona un tema para leer una síntesis propia y sencilla. Primero verás qué significa y qué datos tenemos. Si deseas profundizar, podrás consultar la fuente original al final.</p>
    </div>
    <span class="guide-dossier-mark" aria-hidden="true">01 — 03</span>
  </div>
  <div class="guide-topic-tabs" role="tablist" aria-label="Tema que quieres aprender">
    <button type="button" role="tab" id="tab-tema-enfen" data-guide-tab="enfen" aria-selected="true" aria-controls="tema-enfen" tabindex="0">Alerta de ENFEN</button>
    <button type="button" role="tab" id="tab-tema-pronostico" data-guide-tab="pronostico" aria-selected="false" aria-controls="tema-pronostico" tabindex="-1">Lluvia y temperatura</button>
    <button type="button" role="tab" id="tab-tema-riesgo" data-guide-tab="riesgo" aria-selected="false" aria-controls="tema-riesgo" tabindex="-1">Zonas de riesgo</button>
  </div>
  <article id="tema-enfen" class="guide-topic-panel" role="tabpanel" tabindex="0" data-topic-panel="enfen" aria-labelledby="tab-tema-enfen">
    <div class="guide-topic-copy"><span class="guide-topic-eyebrow">1 / 3 · ESTADO OFICIAL</span>
      <h3>¿Por qué importa lo que dice ENFEN?</h3>
      <p>ENFEN analiza señales del océano y de la atmósfera para informar sobre El Niño Costero. Sus comunicados explican el estado del fenómeno y las perspectivas disponibles, pero no pronostican el tiempo de cada distrito para mañana.</p>
      <p>Una alerta invita a seguir los avisos oficiales y a prepararse. No quiere decir que todas las familias enfrenten una emergencia inmediata. Para conocer posibles lluvias consulta tu distrito; para identificar exposición a inundaciones revisa los mapas de riesgo.</p>
      <div class="guide-data-note"><span>Qué comunica actualmente el observatorio</span>
        <strong id="synth-enfen-state">Consultando la información…</strong>
        <p id="synth-enfen-meta">El estado y su fecha aparecerán cuando se carguen los datos.</p>
      </div>
      <div class="guide-topic-actions"><a class="guide-topic-primary" href="#estado-enfen">Ver la explicación del comunicado aquí</a>
        <a class="guide-topic-source" href="https://enfen.imarpe.gob.pe/comunicados/" target="_blank" rel="noopener noreferrer">Profundizar en la fuente oficial ↗</a></div>
    </div>
    <aside class="guide-topic-side"><span class="guide-topic-side-title">En una frase</span>
      <p>Una alerta del fenómeno es una señal para informarse y prepararse. Una emergencia local requiere evaluar las condiciones y los avisos correspondientes.</p>
      <span class="guide-topic-side-caption">ALERTA ≠ EMERGENCIA</span>
    </aside>
  </article>
  <article id="tema-pronostico" class="guide-topic-panel" role="tabpanel" tabindex="0" data-topic-panel="pronostico" aria-labelledby="tab-tema-pronostico" hidden>
    <div class="guide-topic-copy"><span class="guide-topic-eyebrow">2 / 3 · PRONÓSTICO</span>
      <h3>¿Cómo interpretar la lluvia y la temperatura previstas?</h3>
      <p>Un pronóstico es una estimación para un periodo futuro. Por ejemplo, 10 mm de lluvia equivale a 10 litros de agua por metro cuadrado durante el periodo indicado. No significa que exista un 10 % de probabilidad de lluvia.</p>
      <p>El modelo NOAA GFS calcula valores para puntos de referencia dentro de los distritos; eso no describe necesariamente todas sus calles. SENAMHI también publica pronósticos por localidad. Para comparar resultados debes mirar la fuente, el lugar y la fecha.</p>
      <div class="guide-data-note"><span>Pronósticos disponibles en este observatorio</span>
        <strong id="synth-pronostico-state">Revisando datos…</strong>
        <p id="synth-pronostico-meta">Aquí verás la cobertura y las fechas del pronóstico seleccionado.</p>
      </div>
      <div class="guide-topic-actions"><a class="guide-topic-primary" href="#consulta">Consultar mi distrito aquí</a>
        <a class="guide-topic-source" href="#fuentes">Ver las fuentes y su metodología →</a></div>
    </div>
    <aside class="guide-topic-side"><span class="guide-topic-side-title">Ejemplo fácil</span>
      <p>Si el pronóstico indica 25 mm para mañana, habla de lluvia estimada durante un periodo. No es una medición de lo que ya ocurrió ni una garantía de lluvia en tu calle.</p>
      <span class="guide-topic-side-caption">PRONÓSTICO ≠ MEDICIÓN</span>
    </aside>
  </article>
  <article id="tema-riesgo" class="guide-topic-panel" role="tabpanel" tabindex="0" data-topic-panel="riesgo" aria-labelledby="tab-tema-riesgo" hidden>
    <div class="guide-topic-copy"><span class="guide-topic-eyebrow">3 / 3 · PREVENCIÓN</span>
      <h3>¿Qué significa estar en una zona con riesgo?</h3>
      <p>Los escenarios de riesgo ayudan a identificar lugares donde los peligros, junto con la exposición y vulnerabilidad, podrían provocar daños. CENEPRED los elabora para orientar la prevención y la planificación.</p>
      <p>Que un distrito figure con riesgo alto no significa que hoy esté inundado ni que todos sus barrios tengan el mismo nivel. Ante una situación concreta, sigue los avisos de INDECI y de las autoridades locales.</p>
      <div class="guide-data-note"><span>Escenario de planificación CENEPRED 2025–2027</span>
        <strong id="synth-riesgo-state">Consultando clasificación…</strong>
        <p id="synth-riesgo-meta">Los distritos clasificados no equivalen a emergencias ocurridas.</p>
      </div>
      <div class="guide-topic-actions"><a class="guide-topic-primary" href="#zonas">Explorar las zonas aquí</a>
        <a class="guide-topic-source" href="#preparacion">Aprender cómo prepararme →</a></div>
    </div>
    <aside class="guide-topic-side"><span class="guide-topic-side-title">Lo más importante</span>
      <p>Identificar rutas seguras, organizar un plan familiar y evitar cruzar calles inundadas son acciones útiles de preparación.</p>
      <span class="guide-topic-side-caption">RIESGO ≠ DESASTRE ACTUAL</span>
    </aside>
  </article>
`;

if (guideGrid && guideSection) {
  const originals = [...guideGrid.querySelectorAll(':scope > a.simple-guide-card')];
  if (originals.length === subjects.length) {
    const fragment = document.createDocumentFragment();
    const flipCards = [];

    function flip(card, showBack, moveFocus = false) {
      const front = card.querySelector('.guide-front');
      const back = card.querySelector('.guide-back');
      card.classList.toggle('is-flipped', showBack);
      front.inert = showBack;
      back.inert = !showBack;
      card.querySelector('.guide-flip-trigger').setAttribute('aria-expanded', String(showBack));
      if (moveFocus) {
        const target = showBack ? back.querySelector('[data-guide-select]') : front.querySelector('.guide-flip-trigger');
        target?.focus({preventScroll:true});
      }
    }

    for (const [i, item] of subjects.entries()) {
      const original = originals[i];
      const card = document.createElement('article');
      card.className = original.className + ' guide-flip';
      card.dataset.guideCard = item.key;
      const inner = document.createElement('div');
      inner.className = 'guide-flip-inner';
      const faceFront = document.createElement('div');
      faceFront.className = 'guide-face guide-front';
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'guide-flip-trigger';
      trigger.setAttribute('aria-label', 'Mostrar explicación: ' + item.subject);
      trigger.setAttribute('aria-expanded','false');
      trigger.innerHTML = original.innerHTML;
      const hint = trigger.querySelector('.simple-action');
      if (hint) hint.textContent = 'Descubrir el concepto ↻';
      faceFront.append(trigger);
      const faceBack = document.createElement('div');
      faceBack.className = 'guide-face guide-back';
      faceBack.inert = true;
      faceBack.innerHTML = `<span class="guide-back-tag">${item.tag}</span>
        <h3>${item.title}</h3><p>${item.concept}</p>
        <p class="guide-back-insight">${item.takeaway}</p>
        <div class="guide-back-actions">
          <a href="#guia-contenido" data-guide-select="${item.key}">Leer síntesis aquí →</a>
          <button type="button" class="guide-back-return" aria-label="Mostrar imagen de ${item.subject}">Volver ↻</button>
        </div>`;
      inner.append(faceFront, faceBack); card.append(inner); fragment.append(card); flipCards.push(card);
      trigger.addEventListener('click', () => { card.classList.remove('is-returned'); flip(card, true, true); });
      faceBack.querySelector('.guide-back-return').addEventListener('click', () => {
        card.classList.add('is-returned');
        flip(card, false, true);
      });
      card.addEventListener('pointerenter', event => {
        if (event.pointerType === 'mouse') {
          card.classList.remove('is-returned');
          flip(card, true);
        }
      });
      card.addEventListener('pointerleave', event => {
        if (event.pointerType === 'mouse') {
          card.classList.remove('is-returned');
          if (!card.contains(document.activeElement)) flip(card, false);
        }
      });
      card.addEventListener('focusout', event => {
        if (!card.contains(event.relatedTarget) && !card.matches(':hover')) flip(card, false);
      });
    }

    guideGrid.replaceChildren(fragment);
    guideSection.insertAdjacentElement('afterend', dossier);

    const instruction = document.createElement('p');
    instruction.className = 'guide-instruction';
    instruction.textContent = 'Pasa el mouse sobre una tarjeta para darle la vuelta. En celulares, tócala. La explicación completa está aquí mismo.';
    guideGrid.before(instruction);

    const tabs = [...dossier.querySelectorAll('[data-guide-tab]')];
    const panels = [...dossier.querySelectorAll('[data-topic-panel]')];
    const selectTopic = (key, focusTab = false) => {
      const active = tabs.find(t => t.dataset.guideTab === key);
      if (!active) return;
      for (const tab of tabs) {
        const chosen = tab === active;
        tab.setAttribute('aria-selected',String(chosen));
        tab.tabIndex = chosen ? 0 : -1;
      }
      for (const panel of panels) panel.hidden = panel.dataset.topicPanel !== key;
      if (focusTab) active.focus({preventScroll:true});
    };
    for (const tab of tabs) {
      tab.addEventListener('click', () => selectTopic(tab.dataset.guideTab));
      tab.addEventListener('keydown', event => {
        if (!['ArrowRight','ArrowLeft','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const i = tabs.indexOf(tab);
        const target = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) :
          tabs[(i + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        selectTopic(target.dataset.guideTab, true);
      });
    }
    dossier.addEventListener('click', event => {
      // Los enlaces del propio dossier siguen siendo navegables sin redirecciones automáticas.
      const link = event.target.closest('[data-guide-select]');
      if (link) selectTopic(link.dataset.guideSelect);
    });
    guideGrid.addEventListener('click', event => {
      const link = event.target.closest('[data-guide-select]');
      if (link) selectTopic(link.dataset.guideSelect);
    });

    // Se leen los valores que ya publicó el observatorio, sin hacer consultas nuevas.
    const value = id => document.getElementById(id)?.textContent?.trim() || '';
    const loaded = text => text && !/consultando|verificando|revisando|sin datos|—/i.test(text);
    function syncFacts() {
      const alert = value('enfen-publicado');
      document.getElementById('synth-enfen-state').textContent = loaded(alert) ? alert : 'Estado oficial no confirmado en esta carga';
      document.getElementById('synth-enfen-meta').textContent = loaded(value('enfen-resumen')) ?
        value('enfen-resumen') + ' ' + value('enfen-control') :
        'Comprueba la fecha del comunicado y el estado de actualización en la ficha ENFEN.';

      const count = value('kpi-forecast');
      const date = value('forecast-kpi-detail');
      const provider = value('weather-kpi-provider');
      document.getElementById('synth-pronostico-state').textContent = loaded(count) ?
        count + ' puntos o localidades con datos en la selección' : 'Sin cobertura confirmada para esta selección';
      document.getElementById('synth-pronostico-meta').textContent =
        (loaded(date) ? date + '. ' : '') + (loaded(provider) ? 'Fuente: ' + provider + '. ' : '') +
        'Consulta el distrito y las fechas; la cobertura no equivale a una probabilidad.';

      const risk = value('kpi-risk');
      const scope = value('summary-scope');
      const riskDetail = value('risk-kpi-detail');
      document.getElementById('synth-riesgo-state').textContent = loaded(risk) ?
        risk + ' distritos con clasificación de riesgo alto o muy alto en la selección' :
        'No hay una clasificación confirmada en esta selección';
      document.getElementById('synth-riesgo-meta').textContent =
        (loaded(riskDetail) ? riskDetail + '. ' : '') +
        (loaded(scope) ? scope + '. ' : '') +
        'Es un escenario de planificación, no un registro de desastres actuales.';
    }
    // Actualizaciones del tablero se reflejan automáticamente en las síntesis.
    const targets = ['enfen-publicado','enfen-resumen','enfen-control','kpi-forecast',
      'forecast-kpi-detail','weather-kpi-provider','kpi-risk','summary-scope','risk-kpi-detail'];
    const observer = new MutationObserver(syncFacts);
    for (const id of targets) {
      const el = document.getElementById(id);
      if (el) observer.observe(el,{subtree:true,childList:true,characterData:true});
    }
    syncFacts();
    if (location.hash === '#guia-contenido') selectTopic('enfen');
  }
}
