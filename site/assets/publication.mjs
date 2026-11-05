// La versión de la interfaz es independiente de las fechas de los datos oficiales.
const interfaceVersion = value => typeof value === 'string' && /^[a-f0-9]{12}$/i.test(value) ? value.toLowerCase() : null;
const loadedVersion = interfaceVersion(document.querySelector('meta[name="observatorio-version"]')?.content);
const updateNotice = document.getElementById('interface-update');
const reloadInterface = document.getElementById('reload-interface');

// El marcador del HTML fuente se sustituye únicamente al construir la publicación.
if (loadedVersion && updateNotice && reloadInterface) {
  let pendingCheck = null;
  let availableVersion = null;

  function hideUpdate() {
    availableVersion = null;
    updateNotice.hidden = true;
  }

  function checkInterface() {
    if (pendingCheck) return pendingCheck;
    pendingCheck = (async () => {
      try {
        const response = await fetch('./publication.json', {cache:'no-store'});
        if (!response.ok) { hideUpdate(); return; }
        const publication = await response.json();
        const nextVersion = interfaceVersion(publication?.interface_version);
        if (!nextVersion || nextVersion === loadedVersion) { hideUpdate(); return; }
        availableVersion = nextVersion;
        updateNotice.hidden = false;
      } catch {
        // Una consulta fallida de la interfaz no altera el estado de las fuentes.
        hideUpdate();
      }
    })().finally(() => { pendingCheck = null; });
    return pendingCheck;
  }

  reloadInterface.addEventListener('click', () => {
    if (!availableVersion) return;
    const nextUrl = new URL(location.href);
    nextUrl.searchParams.set('ui', availableVersion);
    if (nextUrl.href === location.href) location.reload();
    else location.replace(nextUrl.href);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void checkInterface();
  });
  setInterval(() => {
    if (!document.hidden) void checkInterface();
  }, 60 * 1000);
  void checkInterface();
}
