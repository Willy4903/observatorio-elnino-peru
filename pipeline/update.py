#!/usr/bin/env python3
"""Adquisición oficial, validación y publicación atómica. Python 3.11+, sin paquetes.

Los errores de una fuente conservan su última versión válida y quedan expuestos
en manifest.json. Los datos ausentes nunca se sustituyen por cero.
"""
from __future__ import annotations

import argparse
import calendar
import concurrent.futures
import datetime as dt
import hashlib
import gzip
import html
import json
import math
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "site" / "data"
LIMA = ZoneInfo("America/Lima")
UTC = dt.timezone.utc
TODAY = dt.datetime.now(LIMA).date()
NOW = dt.datetime.now(UTC).replace(microsecond=0).isoformat()
CPC = "https://www.cpc.ncep.noaa.gov/data/indices/"
SIG = "https://sig.cenepred.gob.pe/sigrid/rest/services/ER_LLUVIAS_PM_2025_2027/MapServer"
SEN = "https://www.senamhi.gob.pe/?p=pronostico-meteorologico"
ENF = "https://enfen.imarpe.gob.pe/comunicados/"
UA = "ObservatorioElNinoPeru/1.0 (+https://github.com/Willy4903/observatorio-elnino-peru)"
MONTHS = {m: i + 1 for i, m in enumerate([
    "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
    "septiembre", "octubre", "noviembre", "diciembre"])}
ENMONTHS = {m.upper(): i for i, m in enumerate(calendar.month_abbr) if m}
SOURCES = {
    "noaa_weekly": {"provider": "NOAA CPC", "title": "Niño 1+2 y Niño 3.4 · semanal", "kind": "observation", "url": CPC + "wksst9120.for", "hours": 24, "max_age_days": 15, "cadence": "Revisión diaria; publicación semanal"},
    "noaa_monthly": {"provider": "NOAA CPC", "title": "Niño 1+2 y Niño 3.4 · mensual", "kind": "observation", "url": CPC + "sstoi.indices", "hours": 24, "max_age_days": 65, "cadence": "Revisión diaria; publicación mensual"},
    "senamhi_forecast": {"provider": "SENAMHI", "title": "Pronóstico por localidad", "kind": "forecast", "url": SEN, "hours": 6, "max_age_days": 2, "cadence": "Consulta cada 6 horas; según actualización oficial"},
    "enfen": {"provider": "ENFEN", "title": "Último comunicado oficial", "kind": "bulletin", "url": ENF, "hours": 12, "max_age_days": 35, "cadence": "Consulta cada 12 horas; al emitirse un comunicado"},
    "cenepred_risk": {"provider": "CENEPRED · SIGRID", "title": "Escenarios distritales por lluvias", "kind": "risk_scenario", "url": SIG, "hours": 24, "max_age_days": None, "cadence": "Consulta diaria; según revisión de SIGRID"},
    "cenepred_points": {"provider": "CENEPRED · SIGRID", "title": "Inventario de puntos y zonas críticas", "kind": "risk_inventory", "url": SIG, "hours": 24, "max_age_days": None, "cadence": "Consulta diaria; según revisión de SIGRID"},
    "boundaries": {"provider": "CENEPRED · SIGRID", "title": "Límites departamentales", "kind": "reference", "url": SIG + "/0", "hours": 720, "max_age_days": None, "cadence": "Consulta mensual"},
}
COMPRESSED = {"noaa_weekly", "senamhi_forecast", "cenepred_risk", "cenepred_points"}


def source_path(source_id):
    return DATA / (source_id + (".json.gz" if source_id in COMPRESSED else ".json"))


def normalized(value):
    return "".join(c for c in unicodedata.normalize("NFD", str(value)) if unicodedata.category(c) != "Mn").upper().strip()


def clean(value):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", value))).strip()


def digest(value):
    if not isinstance(value, bytes):
        value = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    return hashlib.sha256(value).hexdigest()


def load(path, default=None):
    try:
        path = Path(path)
        return json.loads(gzip.decompress(path.read_bytes()) if path.suffix == ".gz" else path.read_text())
    except FileNotFoundError:
        return default


def write_atomic(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n"
    tmp = path.with_suffix(path.suffix + ".tmp")
    if path.suffix == ".gz":
        tmp.write_bytes(gzip.compress(text.encode(), compresslevel=9, mtime=0))
    else:
        tmp.write_text(text)
    os.replace(tmp, path)


class Fetcher:
    def __init__(self):
        self.provenance = []

    def get(self, url):
        allowed = ("senamhi.gob.pe", "imarpe.gob.pe", "noaa.gov", "cenepred.gob.pe")
        host = urlparse(url).hostname or ""
        if not any(host == suffix or host.endswith("." + suffix) for suffix in allowed):
            raise ValueError("Dominio no autorizado para adquisición oficial")
        for attempt in range(3):
            try:
                req = Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
                with urlopen(req, timeout=30) as response:
                    final_host = urlparse(response.url).hostname or ""
                    if not any(final_host == s or final_host.endswith("." + s) for s in allowed):
                        raise ValueError("Redirección fuera de los dominios oficiales")
                    body = response.read(20_000_001)
                    if len(body) > 20_000_000:
                        raise ValueError("Respuesta excede 20 MB")
                    self.provenance.append({"url": url, "retrieved_at": NOW, "sha256": digest(body), "bytes": len(body), "last_modified": response.headers.get("Last-Modified"), "etag": response.headers.get("ETag")})
                    return body
            except (HTTPError, URLError, TimeoutError, ConnectionError) as exc:
                if isinstance(exc, HTTPError) and exc.code not in (408, 429, 500, 502, 503, 504):
                    raise
                if attempt == 2:
                    raise
                time.sleep(1 + attempt * 2)
        raise RuntimeError("Adquisición incompleta")

    def text(self, url):
        return self.get(url).decode("utf-8-sig", errors="replace")

    def json(self, url):
        value = json.loads(self.text(url))
        if isinstance(value, dict) and value.get("error"):
            raise ValueError("ArcGIS devolvió error: " + str(value["error"])[:250])
        return value


def valid_number(value, lower, upper):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and lower <= value <= upper


def parse_weekly(text, today=TODAY):
    rows = []
    for line in text.splitlines():
        m = re.match(r"\s*(\d{2})([A-Z]{3})(\d{4})\s+(.+)", line)
        if not m:
            continue
        date = dt.date(int(m[3]), ENMONTHS[m[2]], int(m[1]))
        nums = [float(n) for n in re.findall(r"[-+]?\d+\.\d+", m[4])]
        if len(nums) != 8:
            raise ValueError("Formato NOAA semanal alterado")
        if date > today:
            raise ValueError("Observación NOAA con fecha futura")
        if not all(valid_number(n, -2 if i % 2 == 0 else -10, 40 if i % 2 == 0 else 10) for i, n in enumerate(nums)):
            raise ValueError("Valor NOAA fuera de límites físicos")
        rows.append({"date": date.isoformat(), "nino12_sst": nums[0], "nino12_anomaly": nums[1], "nino34_sst": nums[4], "nino34_anomaly": nums[5]})
    unique_dates(rows)
    if not rows:
        raise ValueError("NOAA semanal sin registros")
    return sorted(rows, key=lambda r: r["date"])


def parse_monthly(text, today=TODAY):
    rows = []
    for line in text.splitlines():
        cells = line.split()
        if not cells or not re.fullmatch(r"\d{4}", cells[0]):
            continue
        if len(cells) != 10:
            raise ValueError("Formato NOAA mensual alterado")
        year, month = map(int, cells[:2])
        date = dt.date(year, month, 1)
        period_end = dt.date(year, month, calendar.monthrange(year, month)[1])
        # No se presenta un mes en curso/incompleto como observación mensual cerrada.
        if period_end > today:
            continue
        nums = list(map(float, cells[2:]))
        if not all(valid_number(n, -2 if i % 2 == 0 else -10, 40 if i % 2 == 0 else 10) for i, n in enumerate(nums)):
            raise ValueError("NOAA mensual fuera de límites físicos")
        rows.append({"date": date.isoformat(), "period_end": period_end.isoformat(), "nino12_sst": nums[0], "nino12_anomaly": nums[1], "nino34_sst": nums[6], "nino34_anomaly": nums[7]})
    unique_dates(rows)
    if not rows:
        raise ValueError("NOAA mensual sin registros")
    return sorted(rows, key=lambda r: r["date"])


def unique_dates(rows):
    dates = [r["date"] for r in rows]
    if len(set(dates)) != len(dates):
        raise ValueError("Fechas duplicadas en serie NOAA")


def spanish_date(text, reference=TODAY):
    text = clean(text).lower()
    m = re.search(r"(\d{1,2})\s+(?:de\s+)?([a-z]+)(?:\s+(?:de\s+)?(20\d{2}))?", text)
    if not m or m[2] not in MONTHS:
        raise ValueError("Fecha oficial no reconocida: " + text[:80])
    if m[3]:
        return dt.date(int(m[3]), MONTHS[m[2]], int(m[1]))
    candidates = []
    for y in (reference.year - 1, reference.year, reference.year + 1):
        try:
            candidates.append(dt.date(y, MONTHS[m[2]], int(m[1])))
        except ValueError:
            pass
    return min(candidates, key=lambda d: abs((d - reference).days))


def parse_forecasts(text, reference=TODAY):
    parts = re.split(r"<span\s+class=['\"]nameCity['\"]\s*>", text, flags=re.I)[1:]
    if not parts:
        raise ValueError("SENAMHI sin localidades; posible caída o cambio del portal")
    rows, rejected, seen = [], [], set()
    for part in parts:
        head = re.search(r"<a\s+href=['\"]([^'\"]+)['\"][^>]*>(.*?)</a>", part, re.S)
        if not head:
            continue
        dp = re.search(r"(?:[?&]|&amp;)dp=(\d{2})", head[1])
        code = re.search(r"(?:[?&]|&amp;)localidad=(\d+)", head[1])
        if not dp or not code:
            continue
        label = clean(head[2])
        city, _, department = label.rpartition(" - ")
        blocks = re.findall(r"<div\s+class=['\"]row m-3['\"]\s*>(.*?)(?=<div\s+class=['\"]clearfix|$)", part, re.S)
        for block in blocks:
            date_m = re.search(r"<div\s+class=['\"]col-sm-3['\"]\s*>(.*?)</div>", block, re.S)
            max_m = re.search(r"class=['\"]col-sm-1 text-danger['\"][^>]*>(.*?)</div>", block, re.S)
            min_m = re.search(r"class=['\"]col-sm-1 text-primary['\"][^>]*>(.*?)</div>", block, re.S)
            desc_m = re.search(r"class=['\"]col-sm-6['\"][^>]*>(.*?)</div>", block, re.S)
            if not all([date_m, max_m, min_m, desc_m]):
                rejected.append({"locality": code[1], "reason": "Fila incompleta"})
                continue
            try:
                date = spanish_date(date_m[1], reference)
                if not -3 <= (date - reference).days <= 15:
                    raise ValueError("Fecha de pronóstico fuera de ventana operativa")
                def temperature(m):
                    number = re.search(r"-?\d+(?:[.,]\d+)?", clean(m[1]))
                    if not number:
                        raise ValueError("Temperatura ausente")
                    return float(number[0].replace(",", "."))
                tmax, tmin = temperature(max_m), temperature(min_m)
                if not valid_number(tmin, -45, 55) or not valid_number(tmax, -45, 55) or tmin > tmax:
                    raise ValueError("Temperaturas inconsistentes")
                desc = clean(desc_m[1])
                key = (code[1], date.isoformat())
                if key in seen:
                    raise ValueError("Localidad/fecha duplicada")
                seen.add(key)
                rows.append({"locality_id": code[1], "locality": city or label, "department": department or None, "department_code": dp[1], "valid_date": date.isoformat(), "tmax_c": tmax, "tmin_c": tmin, "description": desc, "precipitation_mm": None, "precipitation_probability": None, "rain_mentioned": bool(re.search(r"lluv|lloviz|chubasc|precipit", desc, re.I)), "source_url": urljoin(SEN, html.unescape(head[1]))})
            except ValueError as exc:
                rejected.append({"locality": code[1], "reason": str(exc)})
    if not rows or len(rejected) / max(1, len(rows) + len(rejected)) > .1:
        raise ValueError("Pronóstico SENAMHI vacío o con más de 10% de filas inválidas")
    return sorted(rows, key=lambda r: (r["valid_date"], r["department_code"], r["locality_id"])), rejected


def arcgis_all(fetcher, layer, fields="*", geometry=False, geojson=False, extra=None):
    """Paginación contrastada contra count; nunca acepta una respuesta truncada."""
    url = SIG + f"/{layer}/query?"
    count = fetcher.json(url + urlencode({"where": "1=1", "returnCountOnly": "true", "f": "json"})).get("count")
    if not isinstance(count, int) or count < 1:
        raise ValueError("Capa ArcGIS vacía o conteo inválido")
    rows = []
    offset = 0
    while offset < count:
        params = {"where": "1=1", "outFields": fields, "returnGeometry": str(geometry).lower(), "outSR": 4326, "resultOffset": offset, "resultRecordCount": 1000, "orderByFields": "objectid ASC", "f": "geojson" if geojson else "json"}
        params.update(extra or {})
        value = fetcher.json(url + urlencode(params))
        features = value.get("features", [])
        if not features:
            raise ValueError("Paginación ArcGIS interrumpida")
        rows.extend(features)
        offset += len(features)
        if len(rows) > count:
            raise ValueError("Conteo ArcGIS cambió durante la consulta")
    if len(rows) != count:
        raise ValueError("Descarga ArcGIS incompleta")
    ids = [(r.get("properties") or r.get("attributes") or {}).get("objectid") for r in rows]
    if None not in ids and len(set(ids)) != count:
        raise ValueError("ArcGIS repitió objetos durante paginación")
    return rows


def collect_noaa(fetcher, monthly=False):
    rows = (parse_monthly if monthly else parse_weekly)(fetcher.text(SOURCES["noaa_monthly" if monthly else "noaa_weekly"]["url"]))
    if len(rows) < 100:
        raise ValueError("Serie NOAA inesperadamente corta")
    return rows, {"latest_date": rows[-1].get("period_end", rows[-1]["date"]), "units": "°C", "notes": ["SST y anomalías OISST de NOAA CPC. El valor semanal se fecha por el centro de la semana.", "La anomalía Niño 1+2 no es el ICEN; la anomalía Niño 3.4 no es el ONI ni el RONI. No se declara un evento a partir de un umbral aislado."]}, []


def collect_forecast(fetcher):
    rows, rejected = parse_forecasts(fetcher.text(SEN))
    if len({r["locality_id"] for r in rows}) < 20:
        raise ValueError("Cobertura nacional SENAMHI insuficiente")
    return rows, {"latest_date": max(r["valid_date"] for r in rows), "units": "°C; precipitación cualitativa", "issued_at": None, "notes": ["SENAMHI publica temperaturas máximas/mínimas y descripción del tiempo por localidad. No publica mm ni probabilidades en esta tabla.", "El año de validez se infiere por proximidad al día de consulta; la hora de emisión no se informa. La consulta no equivale a la emisión.", "Los promedios por departamento representan únicamente las localidades disponibles; no son promedios de superficie."]}, rejected


def collect_enfen(fetcher):
    text = fetcher.text(ENF)
    card = re.search(r"class=[\"']enfen_ultimo_informe[\"']>(.*?)</div>", text, re.S)
    if not card:
        raise ValueError("ENFEN no informa último comunicado en el portal")
    link = re.search(r"href=[\"']([^\"']+)[\"']", card[1])
    date_m = re.search(r"<i>(.*?)</i>", card[1], re.S)
    title = re.search(r"Comunicado\s+Oficial\s+Enfen\s+N[^<]+", card[1], re.I)
    if not link or not date_m or not title:
        raise ValueError("Metadatos ENFEN incompletos")
    date = spanish_date(date_m[1])
    if date > TODAY:
        raise ValueError("Comunicado ENFEN con fecha futura")
    pdf_url = html.unescape(link[1]).split("&refresh=")[0]
    pdf = fetcher.get(pdf_url)
    if not pdf.startswith(b"%PDF"):
        raise ValueError("Comunicado ENFEN no es PDF")
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "comunicado.pdf"
        path.write_bytes(pdf)
        out = subprocess.run(["pdftotext", "-layout", str(path), "-"], check=True, capture_output=True, text=True, timeout=30).stdout
    first = clean(out[:6000])
    m = re.search(r"(?:Estado\s+(?:del?\s+)?sistema\s+de\s+alerta\s*:\s*)?(Alerta de (?:El Niño|La Niña) Coster[oa]|Vigilancia de (?:El Niño|La Niña) Coster[oa]|No Activo)", first, re.I)
    if not m:
        raise ValueError("Estado de alerta ENFEN no extraíble con certeza")
    result = {"title": clean(title[0]), "published_date": date.isoformat(), "alert": m[1], "document_url": pdf_url, "pdf_sha256": digest(pdf)}
    return result, {"latest_date": date.isoformat(), "units": None, "notes": ["Estado extraído del último comunicado PDF, no de entradas antiguas del portal. Consulte el documento para perspectivas y probabilidades.", "No se transforman imágenes de probabilidades del PDF en datos numéricos sin una extracción validada."]}, []


def collect_risk(fetcher):
    result = []
    levels = {"MUY ALTO": "Muy alto", "ALTO": "Alto", "MEDIO": "Medio", "BAJO": "Bajo"}
    for layer, hazard, field in [(8, "movimientos_masa", "nriesgo_mm"), (9, "inundacion", "nriesgo_in")]:
        rows = arcgis_all(fetcher, layer, "objectid,ubigeo,nombdep,nombprov,nombdist," + field)
        seen = set()
        for f in rows:
            p = f["attributes"]
            if not re.fullmatch(r"\d{6}", p.get("ubigeo") or "") or p["ubigeo"] in seen:
                raise ValueError("UBIGEO inválido/duplicado en escenario CENEPRED")
            seen.add(p["ubigeo"])
            level = levels.get(normalized(p[field])) if p[field] else None
            if p[field] and level is None:
                raise ValueError("Categoría de riesgo desconocida")
            result.append({"ubigeo": p["ubigeo"], "department_code": p["ubigeo"][:2], "department": p["nombdep"], "province": p["nombprov"], "district": p["nombdist"], "hazard": hazard, "risk_level": level})
    return sorted(result, key=lambda r: (r["hazard"], r["ubigeo"])), {"latest_date": None, "horizon_label": "Servicio ER lluvias PM 2025–2027", "units": "Categoría distrital oficial", "notes": ["Escenario de riesgo CENEPRED. No representa lluvias observadas, emergencias en curso ni probabilidad diaria.", "El servicio identifica el marco 2025–2027; no expone fecha de emisión, versión temporal ni vigencia diaria. El filtro calendario no modifica este escenario.", "La coropleta departamental muestra el porcentaje de distritos clasificados en riesgo alto o muy alto, calculado solo entre distritos con categoría. No constituye una categoría oficial departamental."]}, []


def document_date(value):
    if value is None:
        return None
    try:
        date = dt.datetime.fromtimestamp(value / 1000, UTC).date()
        if not dt.date(1950, 1, 1) <= date <= TODAY:
            return None
        return date.isoformat()
    except (ValueError, TypeError, OverflowError):
        return None


def collect_points(fetcher):
    result, rejected = [], []
    specs = [(6, "inundacion", "objectid,ubi_dist,nom_dpto,nom_prov,nom_dist,nom_sector,n_peligro,fecha_doc,fuente,url"), (7, "movimientos_masa", "objectid,nom_dep,nom_prov,nom_dist,nom_lugar,tipo_pel,fecha_doc,fuente,url")]
    for layer, hazard, fields in specs:
        rows = arcgis_all(fetcher, layer, fields, True, True)
        for f in rows:
            p = f["properties"]
            g = f.get("geometry")
            if not g or g.get("type") != "Point" or len(g.get("coordinates", [])) < 2:
                rejected.append({"id": p.get("objectid"), "reason": "Geometría no puntual"})
                continue
            lon, lat = g["coordinates"][:2]
            if not valid_number(lon, -82.5, -68) or not valid_number(lat, -19, 1):
                rejected.append({"id": p.get("objectid"), "reason": "Coordenadas fuera del ámbito Perú"})
                continue
            result.append({"id": f"{layer}-{p['objectid']}", "lat": round(lat, 6), "lon": round(lon, 6), "hazard": hazard, "department": p.get("nom_dpto", p.get("nom_dep")), "province": p.get("nom_prov"), "district": p.get("nom_dist"), "place": p.get("nom_sector", p.get("nom_lugar")), "hazard_level": p.get("n_peligro"), "document_date": document_date(p.get("fecha_doc")), "document_url": p.get("url"), "reference": p.get("fuente")})
    if not result or len(rejected) / (len(result) + len(rejected)) > .05:
        raise ValueError("Inventario crítico incompleto o coordenadas inválidas >5%")
    return result, {"latest_date": None, "units": "Puntos documentados; intensidad del mapa de calor = densidad de puntos", "notes": ["Inventario georreferenciado, no reporte de emergencia actual. La fecha corresponde a la ficha/documento.", "El mapa de calor representa concentración de puntos, no lluvia, daño, probabilidad ni severidad. Cada punto pesa uno.", "Dos coordenadas de una misma ficha pueden aparecer como dos puntos oficiales; no se interpretan como dos eventos."]}, rejected


def collect_boundaries(fetcher):
    rows = arcgis_all(fetcher, 0, "objectid,iddpto,nombdpto,fuente", True, True, {"maxAllowableOffset": 0.012, "geometryPrecision": 4})
    if not 24 <= len(rows) <= 30:
        raise ValueError("Número inesperado de departamentos")
    for f in rows:
        p = f["properties"]
        f["properties"] = {"code": p["iddpto"], "name": p["nombdpto"], "source": p.get("fuente")}
        if not f.get("geometry") or f["geometry"]["type"] not in ("Polygon", "MultiPolygon"):
            raise ValueError("Límite sin geometría válida")
    return {"type": "FeatureCollection", "features": rows}, {"latest_date": None, "units": "EPSG:4326", "notes": ["Límites de referencia publicados por SIGRID; geometría simplificada para visualización."]}, []


COLLECTORS = {"noaa_weekly": lambda f: collect_noaa(f), "noaa_monthly": lambda f: collect_noaa(f, True), "senamhi_forecast": collect_forecast, "enfen": collect_enfen, "cenepred_risk": collect_risk, "cenepred_points": collect_points, "boundaries": collect_boundaries}


def source_due(state, hours, force=False):
    if force or not state or not state.get("last_success"):
        return True
    # Ventanas UTC evitan saltarse una ejecución por segundos de diferencia del runner.
    window = hours * 3600
    return int(dt.datetime.fromisoformat(NOW).timestamp() // window) > int(dt.datetime.fromisoformat(state["last_success"]).timestamp() // window)


def freshness(state, spec):
    if not state.get("last_success"):
        return "unavailable"
    # Un intento fallido se muestra aunque existan datos válidos anteriores.
    if state.get("error"):
        return "degraded"
    last = state.get("latest_date")
    if last and spec.get("max_age_days") is not None:
        if (TODAY - dt.date.fromisoformat(last)).days > spec["max_age_days"]:
            return "stale"
    checked_age = (dt.datetime.fromisoformat(NOW) - dt.datetime.fromisoformat(state["last_success"])).total_seconds() / 3600
    return "stale" if checked_age > max(72, spec["hours"] * 2) else "ok"


def archive_forecast(envelope):
    stamp = dt.datetime.fromisoformat(NOW).strftime("%Y-%m-%dT%H%M%SZ")
    path = DATA / "history" / "forecasts" / (stamp + "-" + envelope["meta"]["data_sha256"][:12] + ".json.gz")
    if not path.exists():
        write_atomic(path, envelope)
    index = load(DATA / "forecast_history.json", {"versions": []})
    rel = str(path.relative_to(DATA))
    if not any(v["path"] == rel for v in index["versions"]):
        index["versions"].append({"path": rel, "collected_at": NOW, "valid_from": min(r["valid_date"] for r in envelope["data"]), "valid_to": max(r["valid_date"] for r in envelope["data"]), "sha256": envelope["meta"]["data_sha256"]})
    index["versions"].sort(key=lambda v: v["collected_at"])
    write_atomic(DATA / "forecast_history.json", index)


def update_source(source_id, previous):
    spec = SOURCES[source_id]
    fetcher = Fetcher()
    state = dict(previous or {})
    state.update({k: v for k, v in spec.items() if k != "hours"})
    state.update({"id": source_id, "checked_at": NOW, "error": None})
    try:
        rows, details, rejected = COLLECTORS[source_id](fetcher)
        count = len(rows.get("features", [])) if isinstance(rows, dict) and "features" in rows else len(rows) if isinstance(rows, list) else 1
        old_count = previous.get("records", 0) if previous else 0
        if old_count >= 100 and count < old_count * .5:
            raise ValueError("Caída de cobertura >50%; se conserva última versión válida")
        data_hash = digest(rows)
        old_file = load(source_path(source_id))
        changed = not old_file or old_file["meta"].get("data_sha256") != data_hash
        meta = {"source_id": source_id, "provider": spec["provider"], "kind": spec["kind"], "source_url": spec["url"], "fetched_at": NOW, "data_updated_at": NOW if changed else old_file["meta"]["data_updated_at"], "data_sha256": data_hash, "records": count, "provenance": fetcher.provenance, **details}
        envelope = {"meta": meta, "data": rows}
        write_atomic(source_path(source_id), envelope)
        if source_id == "senamhi_forecast" and changed:
            archive_forecast(envelope)
        state.update({"file": source_path(source_id).name, "last_success": NOW, "data_updated_at": meta["data_updated_at"], "data_sha256": data_hash, "records": count, "latest_date": details.get("latest_date"), "rejected_records": len(rejected), "changed": changed})
        quality = {"source_id": source_id, "result": "passed", "records": count, "rejected_records": len(rejected), "rejected_sample": rejected[:20], "requests": len(fetcher.provenance), "sha256": data_hash}
    except Exception as exc:
        state["error"] = f"{type(exc).__name__}: {str(exc)[:350]}"
        state["changed"] = False
        quality = {"source_id": source_id, "result": "failed", "error": state["error"], "retained_previous": bool(state.get("last_success"))}
    state["status"] = freshness(state, spec)
    return source_id, state, quality


def validate_files(directory=DATA):
    """Contrato de publicación; falla antes de desplegar una estructura corrupta."""
    manifest = load(directory / "manifest.json")
    if not manifest or manifest.get("schema_version") != 1:
        raise ValueError("Manifiesto inexistente/incompatible")
    successes = 0
    for source in manifest["sources"]:
        if source.get("last_success"):
            path = directory / source.get("file", source_path(source["id"]).name)
            env = load(path)
            if not env or digest(env["data"]) != env["meta"]["data_sha256"]:
                raise ValueError("Integridad inválida: " + source["id"])
            if env["meta"]["kind"] != SOURCES[source["id"]]["kind"]:
                raise ValueError("Mezcla de observación/pronóstico/escenario")
            successes += 1
    if successes == 0:
        raise ValueError("Ninguna fuente válida para publicar")
    return successes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--only", nargs="+", choices=list(SOURCES))
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()
    if args.validate_only:
        print(f"Integridad verificada: {validate_files()} fuentes válidas")
        return
    DATA.mkdir(parents=True, exist_ok=True)
    old = load(DATA / "manifest.json", {"sources": []})
    states = {s["id"]: s for s in old["sources"]}
    selected = args.only or list(SOURCES)
    jobs = [key for key in selected if source_due(states.get(key), SOURCES[key]["hours"], args.force) or not source_path(key).exists()]
    checks = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(update_source, key, states.get(key)) for key in jobs]
        for future in concurrent.futures.as_completed(futures):
            key, state, quality = future.result()
            states[key] = state
            checks.append(quality)
            print(key, state["status"], state.get("records", 0), state.get("error") or "", flush=True)
    for key, spec in SOURCES.items():
        if key not in states:
            states[key] = {"id": key, **{k: v for k, v in spec.items() if k != "hours"}, "last_success": None, "error": "Fuente aún no adquirida"}
        states[key]["status"] = freshness(states[key], spec)
    manifest = {"schema_version": 1, "generated_at": NOW, "timezone": "America/Lima", "schedule": "Cada 6 horas (UTC 00:27, 06:27, 12:27 y 18:27); cada fuente aplica su propia frecuencia de consulta", "sources": [states[k] for k in SOURCES], "history_start": load(DATA / "forecast_history.json", {"versions": []}).get("versions", [{}])[0].get("collected_at") if load(DATA / "forecast_history.json", {"versions": []}).get("versions") else None}
    write_atomic(DATA / "manifest.json", manifest)
    previous_checks = {c["source_id"]: c for c in load(DATA / "quality.json", {"checks": []})["checks"]}
    for c in checks:
        previous_checks[c["source_id"]] = {**c, "checked_at": NOW}
    for key, state in states.items():
        if key not in previous_checks:
            previous_checks[key] = {"source_id": key, "result": "passed" if state.get("last_success") and not state.get("error") else "failed", "checked_at": state.get("checked_at"), "records": state.get("records", 0), "sha256": state.get("data_sha256"), "rejected_records": state.get("rejected_records", 0), "error": state.get("error")}
    all_checks = [previous_checks[key] for key in SOURCES]
    quality = {"generated_at": NOW, "checks": all_checks, "failure_count": sum(c["result"] == "failed" for c in all_checks), "policy": "Última versión válida conservada; sin imputación, interpolación ni datos simulados"}
    write_atomic(DATA / "quality.json", quality)
    validate_files()
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as f:
            f.write("## Calidad de fuentes\n\n| Fuente | Estado | Registros | Último dato |\n|---|---|---:|---|\n")
            for s in manifest["sources"]:
                f.write(f"| {s['title']} | {s['status']} | {s.get('records', 0)} | {s.get('latest_date') or 'Sin fecha temporal en API'} |\n")
            for c in checks:
                if c["result"] == "failed":
                    f.write("\n- " + c["source_id"] + ": " + c["error"] + "\n")
    if quality["failure_count"]:
        print("::warning::Fuentes degradadas; revisar quality.json. Se publican solo versiones válidas.")


if __name__ == "__main__":
    main()
