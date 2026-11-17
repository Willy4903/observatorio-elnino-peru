// ¿Qué es El Niño? Experiencia interactiva de #que-es.
// Mejora progresiva: todo el contenido está en el HTML y se lee sin JavaScript. Este módulo solo
// cambia atributos de estado en la raíz (data-mode, data-climate, data-step, data-level); el CSS
// decide qué se muestra. No consulta datos ni inventa cifras: las explicaciones son educativas.
const root = document.getElementById('que-es');

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* modo privado: se ignora */ } }
};
const shuffle = (list) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

if (root) init(root);

function init(root) {
  const $ = (selector, scope = root) => scope.querySelector(selector);
  const $$ = (selector, scope = root) => [...scope.querySelectorAll(selector)];
  const state = { mode: 'ciudadano', climate: 'nino', step: 1, level: 1, touched: false };
  const LEVEL_NAMES = ['Débil', 'Moderada', 'Fuerte', 'Extraordinaria'];
  const modeKey = () => (state.mode === 'escuelas' ? 'e' : 'c');
  const visibleText = (scope) => (scope ? scope.textContent.replace(/\s+/g, ' ').trim() : '');
  const variant = (scope, extra = '') => $(`[data-m="${modeKey()}"]${extra}`, scope);

  root.classList.add('is-enhanced');

  /* ---------- Pausa de animaciones fuera de pantalla ---------- */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => root.classList.toggle('is-inview', entry.isIntersecting), { rootMargin: '120px 0px' }).observe(root);
  } else {
    root.classList.add('is-inview');
  }

  /* ---------- Modo Escuelas / Ciudadano ---------- */
  const modeSwitch = $('#qe-mode-switch');
  function setMode(mode, save = true) {
    state.mode = mode === 'escuelas' ? 'escuelas' : 'ciudadano';
    root.dataset.mode = state.mode;
    modeSwitch.setAttribute('aria-checked', String(state.mode === 'escuelas'));
    if (save) store.set('qe-modo', state.mode);
    announceScene();
    showBubble();
  }
  modeSwitch.addEventListener('click', () => setMode(state.mode === 'escuelas' ? 'ciudadano' : 'escuelas'));

  /* ---------- 1. Origen: pasos y comparación ---------- */
  const steps = $$('.qe-step');
  const live = $('#qe-scene-live');
  const prev = $('#qe-prev');
  const next = $('#qe-next');

  for (const step of steps) { // el título pasa a ser un botón; sin JavaScript sigue siendo un encabezado
    const title = $('.qe-step-title', step);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'qe-step-btn';
    button.append(...title.childNodes);
    title.append(button);
    button.addEventListener('click', () => setStep(Number(step.dataset.step)));
  }
  for (const group of $$('.qe-g[data-for]')) {
    group.addEventListener('click', () => setStep(Number(group.dataset.for)));
  }
  function announceScene() {
    if (!live) return;
    const step = steps[state.step - 1];
    const text = visibleText(variant($('.qe-step-text', step), `[data-c="${state.climate}"]`));
    const name = visibleText($('.qe-step-name', step));
    live.textContent = `${state.climate === 'nino' ? 'Año con El Niño' : 'Año normal'}. Paso ${state.step}: ${name}. ${text}`;
  }
  function setStep(n) {
    state.step = Math.min(steps.length, Math.max(1, n));
    root.dataset.step = String(state.step);
    steps.forEach((step, i) => {
      const active = i + 1 === state.step;
      step.classList.toggle('is-active', active);
      const button = $('.qe-step-btn', step);
      if (active) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    });
    prev.disabled = state.step === 1;
    next.disabled = state.step === steps.length;
    announceScene();
  }
  function setClimate(climate) {
    state.climate = climate === 'normal' ? 'normal' : 'nino';
    root.dataset.climate = state.climate;
    for (const button of $$('.qe-seg')) button.setAttribute('aria-pressed', String(button.dataset.climate === state.climate));
    announceScene();
  }
  for (const button of $$('.qe-seg')) button.addEventListener('click', () => setClimate(button.dataset.climate));
  prev.addEventListener('click', () => setStep(state.step - 1));
  next.addEventListener('click', () => setStep(state.step + 1));

  /* ---------- 2. Simulador de impacto ---------- */
  const slider = $('#qe-level');
  const levelName = $('#qe-level-name');
  const bubble = $('#qe-bubble');
  const avatar = $('.qe-avatar');
  const promptText = bubble ? bubble.textContent : '';

  function showBubble(animate = false) {
    if (!bubble) return;
    const message = state.touched ? visibleText(variant($(`.qe-msgs [data-lvl="${state.level}"]`))) : promptText;
    bubble.textContent = message;
    if (animate) { bubble.classList.remove('is-swap'); void bubble.offsetWidth; bubble.classList.add('is-swap'); }
  }
  function setLevel(level, byUser = false) {
    state.level = Math.min(LEVEL_NAMES.length - 1, Math.max(0, Number(level) || 0));
    if (byUser) { state.touched = true; root.classList.add('is-live'); }
    root.dataset.level = String(state.level);
    root.style.setProperty('--lvl', String(state.level));
    slider.value = String(state.level);
    slider.setAttribute('aria-valuetext', LEVEL_NAMES[state.level]);
    levelName.textContent = LEVEL_NAMES[state.level];
    avatar.dataset.level = String(state.level);
    if (byUser) { avatar.classList.remove('is-pop'); void avatar.getBoundingClientRect(); avatar.classList.add('is-pop'); }
    showBubble(byUser);
  }
  slider.addEventListener('input', () => setLevel(slider.value, true));
  for (const tick of $$('.qe-ticks button')) tick.addEventListener('click', () => setLevel(tick.dataset.level, true));

  /* ---------- 4. ¿Mito o verdad? ---------- */
  const quiz = $('.qe-quiz-ui');
  const items = $$('.qe-qi').map((li) => ({
    answer: li.dataset.answer,
    statement: visibleText($('.qe-q-stmt', li)),
    explanation: $$('.qe-q-exp [data-m]', li)
  }));
  const el = {
    progress: $('#qe-q-progress'), score: $('#qe-q-score'), bar: $('#qe-q-bar'), body: $('#qe-q-body'),
    statement: $('#qe-q-statement'), choices: $$('.qe-choice'), feedback: $('#qe-q-feedback'), title: $('#qe-q-title'),
    explain: $('#qe-q-exp'), next: $('#qe-q-next'), end: $('#qe-q-end'), final: $('#qe-q-final'), note: $('#qe-q-finalnote'),
    restart: $('#qe-q-restart')
  };
  let order = [...items.keys()], index = 0, score = 0, answered = false;

  function renderQuestion() {
    const item = items[order[index]];
    answered = false;
    el.progress.textContent = `Pregunta ${index + 1} de ${items.length}`;
    el.score.innerHTML = `Aciertos: <b>${score}</b>`;
    el.bar.style.width = `${(index / items.length) * 100}%`;
    el.statement.textContent = `“${item.statement}”`;
    el.statement.tabIndex = -1;
    for (const button of el.choices) {
      button.disabled = false;
      button.classList.remove('is-right', 'is-wrong', 'is-dim');
    }
    el.feedback.className = 'qe-feedback is-idle';
    el.end.hidden = true;
    el.body.hidden = false;
  }
  function choose(choice) {
    if (answered) return;
    answered = true;
    const item = items[order[index]];
    const right = choice === item.answer;
    if (right) score++;
    for (const button of el.choices) {
      button.disabled = true;
      const isAnswer = button.dataset.choice === item.answer;
      if (button.dataset.choice === choice) button.classList.add(right ? 'is-right' : 'is-wrong');
      else button.classList.add('is-dim');
      if (!right && isAnswer) button.classList.remove('is-dim');
    }
    const label = item.answer === 'mito' ? 'un mito' : 'una verdad';
    el.title.textContent = right ? `¡Correcto! Es ${label}.` : `Todavía no. En realidad es ${label}.`;
    el.feedback.className = `qe-feedback ${right ? 'is-right' : 'is-wrong'}`;
    el.explain.replaceChildren(...item.explanation.map((node) => node.cloneNode(true)));
    el.next.textContent = index === items.length - 1 ? 'Ver resultado' : 'Siguiente';
    el.score.innerHTML = `Aciertos: <b>${score}</b>`;
    el.bar.style.width = `${((index + 1) / items.length) * 100}%`;
    el.next.focus({ preventScroll: true });
  }
  function finish() {
    el.body.hidden = true;
    el.end.hidden = false;
    const total = items.length, percent = Math.round((score / total) * 100);
    el.final.textContent = `${score} de ${total} aciertos`;
    el.note.textContent = score === total ? '¡Eres un experto en El Niño!'
      : score >= total - 2 ? '¡Muy bien! Ya desmientes varios mitos.'
        : 'Buen comienzo. Repasa el esquema y vuelve a intentarlo.';
    let ring = $('.qe-ring', el.end);
    if (!ring) {
      ring = document.createElement('div');
      ring.className = 'qe-ring';
      ring.setAttribute('aria-hidden', 'true');
      ring.innerHTML = '<span></span>';
      el.end.prepend(ring);
    }
    $('span', ring).textContent = `${percent}%`;
    ring.style.setProperty('--p', '0');
    requestAnimationFrame(() => ring.style.setProperty('--p', String(percent)));
    el.bar.style.width = '100%';
    el.final.tabIndex = -1;
    el.final.focus({ preventScroll: true });
  }
  for (const button of el.choices) button.addEventListener('click', () => choose(button.dataset.choice));
  el.next.addEventListener('click', () => {
    if (index === items.length - 1) { finish(); return; }
    index++;
    renderQuestion();
    el.statement.focus({ preventScroll: true });
  });
  el.restart.addEventListener('click', () => {
    order = shuffle(order); index = 0; score = 0;
    renderQuestion();
    el.statement.focus({ preventScroll: true });
  });
  if (quiz && items.length) { quiz.hidden = false; renderQuestion(); }

  /* ---------- 5. Compartir ---------- */
  const pageUrl = () => `${location.origin}${location.pathname}#que-es`;
  const shareText = 'Entiende El Niño: guía rápida con fuentes oficiales';
  const status = $('#qe-share-status');
  const say = (message) => { if (status) { status.textContent = message; setTimeout(() => { if (status.textContent === message) status.textContent = ''; }, 3500); } };
  const whatsapp = $('#qe-wa');
  if (whatsapp && /^https?:$/.test(location.protocol)) whatsapp.href = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${pageUrl()}`)}`;

  $('#qe-copy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pageUrl());
      say('Enlace copiado.');
    } catch {
      const area = Object.assign(document.createElement('textarea'), { value: pageUrl(), readOnly: true });
      area.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.append(area);
      area.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch { /* sin portapapeles */ }
      area.remove();
      say(copied ? 'Enlace copiado.' : 'No se pudo copiar. Copia la dirección desde la barra del navegador.');
    }
  });
  const native = $('#qe-native');
  if (native && typeof navigator.share === 'function') {
    native.hidden = false;
    native.addEventListener('click', () => {
      navigator.share({ title: document.title, text: shareText, url: pageUrl() }).catch(() => { /* el usuario canceló */ });
    });
  }

  /* ---------- Estado inicial ---------- */
  const param = new URLSearchParams(location.search).get('modo');
  const saved = param === 'escuelas' || param === 'ciudadano' ? param : store.get('qe-modo');
  setMode(saved === 'escuelas' ? 'escuelas' : 'ciudadano', false);
  setClimate('nino');
  setStep(1);
  setLevel(1);
}
