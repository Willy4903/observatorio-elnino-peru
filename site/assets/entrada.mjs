// Mejoras de lectura de la portada. Todo es progresivo: sin JavaScript, los enlaces y el contenido siguen funcionando.
const $ = (id) => document.getElementById(id);

/* 1. Semáforo del estado oficial: solo refleja lo que ENFEN publica, leído del dato que ya carga la página. */
const ICONOS = {
  alerta: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v5M12 18h.01"/>',
  vigilancia: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  normal: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
  fin: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
  desconocido: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.6 2.6 0 0 1 5 1c0 1.7-2.6 2.2-2.6 3.7M12 17.5h.01"/>',
};
function clasificar(texto) {
  const t = (texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (!t || /consultando|no hay un comunicado/.test(t)) return { estado: "sin-dato", etiqueta: "sin dato", icono: "desconocido" };
  if (/fin de (la )?alerta/.test(t)) return { estado: "fin", etiqueta: "fin de alerta", icono: "fin" };
  if (/no activ/.test(t)) return { estado: "no-activo", etiqueta: "no activo", icono: "normal" };
  if (/vigilancia/.test(t)) return { estado: "vigilancia", etiqueta: "vigilancia", icono: "vigilancia" };
  if (/alerta/.test(t)) return { estado: "alerta", etiqueta: "alerta", icono: "alerta" };
  return { estado: "publicado", etiqueta: texto.trim(), icono: "desconocido" };
}
const publicado = $("enfen-publicado"), semaforo = $("enfen-semaforo");
if (publicado && semaforo) {
  const pintar = () => {
    const c = clasificar(publicado.textContent);
    semaforo.dataset.estado = c.estado;
    semaforo.querySelector(".sem-icon").innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">${ICONOS[c.icono]}</svg>`;
    semaforo.querySelector(".sem-text").textContent = c.estado === "publicado" ? `Estado publicado: ${c.etiqueta}` : `Estado: ${c.etiqueta}`;
  };
  new MutationObserver(pintar).observe(publicado, { childList: true, characterData: true, subtree: true });
  pintar();
}

/* 2. Abre los bloques plegados cuando alguien llega a una sección que está dentro de ellos. */
const abrirAncestros = (destino) => {
  let abierto = false;
  for (let d = destino?.closest("details"); d; d = d.parentElement?.closest("details")) {
    if (!d.open) { d.open = true; abierto = true; }
  }
  return abierto;
};
const irAlHash = (id) => {
  const destino = id && document.getElementById(id);
  if (destino && abrirAncestros(destino)) requestAnimationFrame(() => destino.scrollIntoView({ block: "start" }));
};
window.addEventListener("hashchange", () => irAlHash(decodeURIComponent(location.hash.slice(1))));
document.addEventListener("click", (e) => {
  const a = e.target.closest?.('a[href^="#"]');
  if (a && a.getAttribute("href").length > 1) irAlHash(a.getAttribute("href").slice(1));
  if (e.target.closest?.("[data-descargar]")) $("download")?.click();
});
const profundizar = $("detalle-tecnico");
profundizar?.addEventListener("toggle", () => { if (profundizar.open) setTimeout(() => window.dispatchEvent(new Event("resize")), 80); });
irAlHash(decodeURIComponent(location.hash.slice(1)));

/* 3. Resumen en palabras sencillas del departamento elegido en «Mi distrito». */
const selector = $("inspector-department"), tarjeta = $("mi-zona"), rejilla = $("territory-grid");
if (selector && tarjeta && rejilla) {
  const leer = (el) => {
    const nombre = el.querySelector(".territory-card-title span")?.textContent.trim() ?? "";
    const numeros = (el.querySelector(".territory-risk b")?.textContent ?? "").match(/[\d.,]+/g) ?? [];
    const alto = Number(String(numeros[0] ?? "").replace(/[.,\s]/g, "")), total = Number(String(numeros[1] ?? "").replace(/[.,\s]/g, ""));
    return { nombre, alto, total, valido: Number.isFinite(alto) && Number.isFinite(total) && total > 0 };
  };
  const resumir = () => {
    const el = [...rejilla.querySelectorAll("[data-department]")].find((x) => x.dataset.department === selector.value);
    if (!el) { tarjeta.hidden = true; return; }
    const d = leer(el), h3 = document.createElement("h3"), p = document.createElement("p"), nota = document.createElement("p");
    h3.textContent = d.nombre;
    nota.className = "mi-zona-nota";
    nota.textContent = "Es riesgo posible para planificar, no una emergencia de hoy. Los datos son de CENEPRED.";
    const partes = [h3, p];
    if (d.valido) {
      const pct = Math.round((d.alto / d.total) * 100), barra = document.createElement("div"), i = document.createElement("i");
      p.className = "mi-zona-frase";
      p.textContent = `${d.alto} de ${d.total} distritos (${pct} de cada 100) tienen riesgo alto o muy alto de inundaciones o huaicos.`;
      barra.className = "mi-zona-barra"; barra.setAttribute("role", "img"); barra.setAttribute("aria-label", `${pct} de cada 100 distritos con riesgo alto o muy alto`);
      i.style.width = `${Math.max(pct, 2)}%`; barra.append(i);
      partes.push(barra);
    } else {
      p.textContent = "Todavía no hay información de riesgo publicada para este departamento.";
    }
    const enlace = document.createElement("a");
    enlace.href = "#preparacion"; enlace.textContent = "Ver cómo prepararme";
    nota.append(" ", enlace);
    partes.push(nota);
    tarjeta.replaceChildren(...partes);
    tarjeta.hidden = false;
  };
  selector.addEventListener("change", resumir);
  new MutationObserver(resumir).observe(rejilla, { childList: true, subtree: true });
}

/* 4. Resalta en el menú la sección que se está leyendo, en el mismo orden que la página. */
const destinos = ["top", "que-es", "estado-enfen", "consulta", "preparacion", "fuentes"];
const enlaces = [...document.querySelectorAll('.radar-top-nav a, .mobile-nav a, .section-nav .nav-link')];
let pendiente = false;
const posicion = (id) => {
  let el = $(id);
  if (!el) return null;
  if (!el.getClientRects().length) el = el.closest("details") ?? el;
  return el.getBoundingClientRect().top;
};
const marcar = () => {
  pendiente = false;
  const sonda = 200;
  let activo = "top", mejor = -Infinity;
  for (const id of destinos) {
    const t = posicion(id);
    if (t !== null && t <= sonda && t > mejor) { mejor = t; activo = id; }
  }
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) activo = "fuentes";
  for (const a of enlaces) {
    const si = a.hash === `#${activo}`;
    a.classList.toggle("current", si && a.closest(".radar-top-nav") !== null);
    a.classList.toggle("active", si);
    if (si) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
  }
};
const pedir = () => { if (!pendiente) { pendiente = true; requestAnimationFrame(marcar); } };
window.addEventListener("scroll", pedir, { passive: true });
window.addEventListener("resize", pedir);
marcar();
