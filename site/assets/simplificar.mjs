// Abre automáticamente el bloque "más detalle" cuando alguien llega a una de sus secciones
// (por un enlace del menú o del mapa) y avisa a mapas y gráficos para que se redibujen al abrirlo.
const detalle = document.getElementById("detalle-tecnico");
if (detalle) {
  const abrirSiCorresponde = (id) => {
    const destino = id && document.getElementById(id);
    if (destino && detalle.contains(destino) && !detalle.open) {
      detalle.open = true;
      requestAnimationFrame(() => destino.scrollIntoView({ block: "start" }));
    }
  };
  const desdeHash = () => abrirSiCorresponde(decodeURIComponent(location.hash.slice(1)));
  window.addEventListener("hashchange", desdeHash);
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (a) abrirSiCorresponde(a.getAttribute("href").slice(1));
  });
  detalle.addEventListener("toggle", () => { if (detalle.open) setTimeout(() => window.dispatchEvent(new Event("resize")), 80); });
  desdeHash();
}

// "¿Cómo está mi departamento?": resume en una frase los datos de riesgo que ya carga la página.
const selector = document.getElementById("mi-zona-select");
const resultado = document.getElementById("mi-zona-resultado");
if (selector && resultado) {
  const grid = document.getElementById("territory-grid");
  const tarjetas = () => [...(grid?.querySelectorAll("[data-department]") ?? [])];
  const leer = (tarjeta) => {
    const nombre = tarjeta.querySelector(".territory-card-title span")?.textContent.trim() ?? "";
    const numeros = (tarjeta.querySelector(".territory-risk b")?.textContent ?? "").match(/[\d.,]+/g) ?? [];
    const alto = Number(String(numeros[0] ?? "").replace(/[.,\s]/g, ""));
    const total = Number(String(numeros[1] ?? "").replace(/[.,\s]/g, ""));
    return { nombre, alto, total, valido: Number.isFinite(alto) && Number.isFinite(total) && total > 0 };
  };
  const llenar = () => {
    const lista = tarjetas();
    if (!lista.length || selector.options.length > 1) return;
    lista.map((t) => ({ codigo: t.dataset.department, ...leer(t) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
      .forEach((d) => selector.add(new Option(d.nombre, d.codigo)));
  };
  const mostrar = () => {
    const tarjeta = tarjetas().find((t) => t.dataset.department === selector.value);
    if (!tarjeta) { resultado.hidden = true; return; }
    const d = leer(tarjeta);
    const nodo = document.createElement("div");
    if (!d.valido) {
      nodo.innerHTML = `<h3></h3><p>Todavía no hay información de riesgo publicada para este departamento. Mira los avisos oficiales y prepárate igual.</p>`;
      nodo.querySelector("h3").textContent = d.nombre;
    } else {
      const parte = Math.round((d.alto / d.total) * 100);
      nodo.innerHTML = `<h3></h3><p class="mi-zona-frase"></p><div class="mi-zona-barra" role="img"><i></i></div><p class="mi-zona-nota">Riesgo alto o muy alto significa que, si llueve mucho, ahí hay más probabilidad de inundaciones o huaicos. No quiere decir que vaya a pasar hoy. Datos del CENEPRED, el organismo del Estado que estudia estos riesgos.</p><ol class="mi-zona-pasos"><li>Averigua si tu casa está en una zona de riesgo.</li><li>Acuerda con tu familia un lugar seguro y cómo llegar.</li><li>Ten lista una mochila con agua, linterna, documentos y medicinas.</li></ol><p class="mi-zona-enlaces"><a href="#preparacion">Ver cómo prepararme</a> <a href="#consulta">Buscar mi distrito en el mapa</a></p>`;
      nodo.querySelector("h3").textContent = d.nombre;
      nodo.querySelector(".mi-zona-frase").textContent = `${d.alto} de ${d.total} distritos (${parte} de cada 100) tienen riesgo alto o muy alto de inundaciones o huaicos.`;
      const barra = nodo.querySelector(".mi-zona-barra");
      barra.setAttribute("aria-label", `${parte} de cada 100 distritos con riesgo alto`);
      barra.firstElementChild.style.width = `${Math.max(parte, 2)}%`;
    }
    resultado.replaceChildren(...nodo.childNodes);
    resultado.hidden = false;
    tarjeta.click(); // también acerca el mapa a ese departamento
  };
  selector.addEventListener("change", mostrar);
  if (grid) { new MutationObserver(llenar).observe(grid, { childList: true, subtree: true }); llenar(); }
}
