# Observatorio de El Niño en Perú

Dashboard ejecutivo con observaciones NOAA, pronósticos SENAMHI, estado oficial ENFEN y escenarios e inventarios CENEPRED. Publicación estática en GitHub Pages y adquisición automatizada mediante GitHub Actions. No requiere claves, bases de datos ni servicios de pago.

Dashboard: https://Willy4903.github.io/observatorio-elnino-peru/

## Operación · Actualiza según cada fuente

| Fuente | Producto | Consulta | Frecuencia del producto |
|---|---|---|---|
| NOAA CPC | SST y anomalías Niño 1+2 y Niño 3.4, OISST | Diaria | Semanal y mensual |
| SENAMHI | Temperatura máxima/mínima y descripción de precipitación por localidad | Cada 6 h | Según publicación oficial; normalmente próximos 3 días |
| ENFEN | Último comunicado, fecha, estado de alerta y PDF | Cada 12 h | Al emitirse un comunicado |
| CENEPRED / SIGRID | Escenarios distritales por inundación y movimientos en masa; puntos críticos | Diaria | Según revisión del servicio |
| CENEPRED / SIGRID | Límites departamentales | Mensual | Según revisión del servicio |

El workflow se ejecuta a las 00:27, 06:27, 12:27 y 18:27 UTC: 19:27 del día anterior, 01:27, 07:27 y 13:27 de Lima. Cada fuente respeta su intervalo en ventanas UTC. También se ejecuta al cambiar código o manualmente en Actions → Actualizar y publicar observatorio → Run workflow.

GitHub puede retrasar ejecuciones programadas. No es streaming ni una garantía de tiempo real. La fecha del dato, la consulta y la actualización del contenido se conservan por separado. Los cambios reales se detectan mediante SHA-256; una consulta reciente no convierte un dato antiguo en vigente.

## Lectura · Distingue observaciones, pronósticos y escenarios

- Observaciones: se conservan las fechas y frecuencias oficiales. El filtro diario no interpola índices semanales. El mensual usa meses completos publicados. Niño 1+2 no es ICEN; Niño 3.4 no es ONI ni RONI. La alerta corresponde a ENFEN.
- Pronósticos: el calendario filtra la fecha de validez. La tabla SENAMHI no publica hora de emisión; `fetched_at` es la consulta. El año se infiere por proximidad y se valida contra una ventana operativa. Los textos se conservan; mm y probabilidades permanecen `null`.
- Archivo: empieza con la primera adquisición. Conserva versiones distintas y elige la última consulta anterior o igual al día de validez. No reconstruye pronósticos anteriores ni utiliza consultas posteriores a su día para rellenar el pasado.
- Escenario CENEPRED: las categorías oficiales son distritales. La coropleta departamental deriva el porcentaje de distritos en alto o muy alto entre aquellos con clasificación. No es probabilidad ni categoría oficial departamental. El servicio identifica 2025–2027, pero no informa vigencia diaria ni fecha de emisión; el calendario no crea una serie temporal.
- Puntos críticos: inventario documentado, no emergencias actuales. El calor representa densidad con peso unitario y depende del zoom. No representa lluvia o severidad. Una ficha puede tener varios puntos. El filtro opcional por fecha de ficha excluye registros sin fecha.
- Temperatura departamental: promedio de localidades y días disponibles, sin ponderación por área; no representa toda la superficie del departamento.
- Mención de precipitación: proporción de textos localidad/día con términos de lluvia, llovizna, chubascos o precipitación. No es probabilidad ni porcentaje del área. La interpretación conserva el texto oficial.

Los campos ausentes quedan vacíos. No se generan datos ficticios, imputaciones, interpolaciones ni modelos propios de pronóstico.

## Trazabilidad · Verifica antes de publicar

`site/data/manifest.json` expone estado, frecuencia, cantidad, consulta válida, fecha del último dato, hash y errores por fuente. Los archivos incluyen procedencia HTTP: URL exacta, hora de descarga, tamaño, ETag, Last-Modified y SHA-256 de la respuesta original.

`site/data/quality.json` registra resultados de cada adquisición. Se validan estructura, fechas futuras, duplicados, cobertura, temperaturas, mínima/máxima, UBIGEO, categorías, coordenadas y paginación ArcGIS contrastada con el conteo del servidor. Escritura atómica por fuente. Si falla una fuente se conserva su última versión válida y se informa el estado degradado. Una estructura corrupta o la ausencia total de datos válidos bloquea el despliegue.

Los archivos grandes usan gzip determinista. El navegador utiliza `DecompressionStream`, disponible en navegadores modernos. La capa ligera de puntos se deriva de la descarga completa validada. El inventario detallado se descarga al abrir su tabla o exportarlo. Leaflet y Chart.js están incluidos; el fondo OpenStreetMap es externo y conserva su atribución. Los límites SIGRID siguen disponibles aunque no carguen las teselas.

## Desarrollo · Ejecuta y verifica

Requisitos: Python 3.11+, Node.js para pruebas y `pdftotext` de Poppler para el comunicado ENFEN. Python utiliza solo la biblioteca estándar.

```bash
python pipeline/update.py --force
python pipeline/build.py
python -m unittest discover -s tests -v
node --test tests/selectors.test.mjs
python -m http.server 8000 --directory site
```

Abre `http://localhost:8000`. Para actualizar una fuente:

```bash
python pipeline/update.py --only senamhi_forecast --force
python pipeline/build.py
```

Publicación: repositorio público, Settings → Pages → Source: GitHub Actions. El workflow conserva los datos mediante `GITHUB_TOKEN` y publica el artefacto verificado. No usa secretos personales. Los permisos de escritura se limitan a los jobs necesarios; las acciones están fijadas a commits.

Pages y los runners estándar de Actions son gratuitos en repositorios públicos según las condiciones de GitHub. Los artefactos de despliegue se conservan un día. En repositorios públicos sin actividad, GitHub puede desactivar programaciones a los 60 días; el dashboard muestra la falta de actualización. El archivo y el historial git crecen con el tiempo y deben revisarse si se aproximan los límites del repositorio o de Pages.

## Referencias · Consulta el origen oficial

- [ENFEN: comunicados](https://enfen.imarpe.gob.pe/comunicados/)
- [SENAMHI: pronóstico por localidad](https://www.senamhi.gob.pe/?p=pronostico-meteorologico)
- [NOAA: índices semanales](https://www.cpc.ncep.noaa.gov/data/indices/wksst9120.for)
- [NOAA: índices mensuales](https://www.cpc.ncep.noaa.gov/data/indices/sstoi.indices)
- [CENEPRED: ER lluvias PM 2025–2027](https://sig.cenepred.gob.pe/sigrid/rest/services/ER_LLUVIAS_PM_2025_2027/MapServer)
- [CENEPRED: SIGRID](https://sigrid.cenepred.gob.pe/sigridv3/)
- [GitHub: Pages con Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [OpenStreetMap: política de teselas](https://operations.osmfoundation.org/policies/tiles/)

Las licencias de bibliotecas están en `site/assets/vendor/`. Los datos conservan su atribución institucional; su utilización no implica aval institucional del dashboard.
