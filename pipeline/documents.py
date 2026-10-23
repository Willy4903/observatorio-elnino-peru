"""Catálogos oficiales: conserva enlaces y fechas explícitas, sin inferir eventos."""
from __future__ import annotations

import calendar
import datetime as dt
import html
import re
from urllib.parse import urljoin, urlparse

SPECS = {
    "senamhi_monitor": ("SENAMHI", "Monitoreo del Fenómeno El Niño", "https://www.senamhi.gob.pe/?p=fenomeno-el-nino", 12),
    "senamhi_bulletins": ("SENAMHI", "Boletines meteorológicos y climáticos", "https://www.senamhi.gob.pe/?p=boletines", 24),
    "enfen_technical": ("ENFEN", "Informes técnicos oficiales", "https://enfen.imarpe.gob.pe/", 12),
    "imarpe_gti": ("IMARPE · SIO-FEN", "Condiciones oceanográficas y biológico-pesqueras", "https://siofen.imarpe.gob.pe/boletines-e-informes/GTI", 24),
    "noaa_enso_discussion": ("NOAA CPC", "ENSO Diagnostic Discussion", "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml", 24),
    "noaa_psl": ("NOAA PSL", "ENSO: datos e índices de referencia", "https://psl.noaa.gov/enso/", 24),
    "coen_reports": ("COEN · INDECI", "Monitoreo y reportes de emergencias", "https://coen.indeci.gob.pe/", 6),
    "indeci_news": ("INDECI", "Comunicados y noticias institucionales", "https://www.gob.pe/institucion/indeci/noticias", 6),
}
MONTHS = {m: i + 1 for i, m in enumerate(["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"])}
MONTHS["setiembre"] = 9


def text(value):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]*>", " ", value))).strip()


def links(page, base):
    result = []
    for href, label in re.findall(r"<a\b[^>]*href\s*=\s*['\"]([^'\"]+)['\"][^>]*>(.*?)</a>", page, re.S | re.I):
        url = urljoin(base, html.unescape(href)).split("&refresh=")[0]
        if urlparse(url).scheme == "https" and text(label):
            result.append((url, text(label)))
    return result


def explicit_date(label):
    m = re.search(r"\b(\d{1,2})\s+(?:de\s+)?([a-z]+)\s*(?:-|de)?\s*(20\d{2})\b", label.lower())
    if m and m[2] in MONTHS:
        return dt.date(int(m[3]), MONTHS[m[2]], int(m[1])).isoformat()
    return None


def explicit_period(label):
    m = re.search(r"\b([a-z]+)\s*(?:-|de)?\s*(20\d{2})\b", label.lower())
    return f"{m[2]}-{MONTHS[m[1]]:02d}" if m and m[1] in MONTHS else None


def parse_catalog(source_id, page, today):
    provider, title, base, _ = SPECS[source_id]
    anchors = links(page, base)
    link_titles = {}
    for attributes in re.findall(r"<a\b([^>]+)>", page, re.S | re.I):
        href = re.search(r"\bhref=['\"]([^'\"]+)['\"]", attributes, re.I)
        label = re.search(r"\btitle=['\"]([^'\"]+)['\"]", attributes, re.I)
        if href and label:
            link_titles[urljoin(base, html.unescape(href[1])).split("&refresh=")[0]] = text(label[1])
    rows = []
    if source_id == "noaa_enso_discussion":
        plain = text(page)
        date_m = re.search(r"\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b", plain)
        status = re.search(r"ENSO Alert System Status:\s*(.*?)\s*Synopsis:", plain)
        synopsis = re.search(r"Synopsis:\s*</u>\s*(?:&nbsp;)?\s*<strong>(.*?)</strong>", page, re.S | re.I)
        if not all((date_m, status, synopsis)):
            raise ValueError("Discusión ENSO: fecha, estado o síntesis no verificables")
        month = list(calendar.month_name).index(date_m[2])
        date = dt.date(int(date_m[3]), month, int(date_m[1])).isoformat()
        rows = [{"title": "Diagnóstico ENSO del Pacífico", "url": base, "published_date": date, "status_original": status[1].strip(), "summary_original": text(synopsis[1]), "scope": "Diagnóstico y perspectiva mensual NOAA; no es un pronóstico distrital de Perú"}]
    elif source_id in ("senamhi_monitor", "senamhi_bulletins"):
        for url, label in anchors:
            if not re.search(r"/load/file/[^?]+\.pdf", url, re.I):
                continue
            date, period = explicit_date(label), explicit_period(label)
            if date or period:
                product = link_titles.get(url) or ("Monitoreo El Niño" if source_id == "senamhi_monitor" else "Boletín")
                rows.append({"title": product + " · " + label, "url": url, "published_date": date, "period": period, "scope": "Documento oficial; consultar su contenido, escala y vigencia"})
    elif source_id == "enfen_technical":
        for url, label in anchors:
            if "Informe Técnico ENFEN" in label:
                rows.append({"title": label, "url": url, "published_date": None, "reference_date": explicit_date(label), "scope": "Informe técnico; la fecha «al» corresponde al corte indicado en el título"})
    elif source_id == "imarpe_gti":
        for url, label in anchors:
            m = re.search(r"INF_IMARPE_GTI_(20\d{2})-(\d{2})\.pdf", url)
            if m:
                period = f"{m[1]}-{m[2]}"
                if not 1 <= int(m[2]) <= 12:
                    raise ValueError("Mes GTI inválido")
                rows.append({"title": "Informe IMARPE GTI · " + period, "url": url, "published_date": None, "period": period, "scope": "Mes identificado en el catálogo; fecha de emisión no expuesta"})
    elif source_id == "indeci_news":
        for block in re.findall(r"<li\b[^>]*>(.*?)</li>", page, re.S | re.I):
            date_m = re.search(r"<time[^>]+datetime=['\"](\d{4}-\d{2}-\d{2})", block)
            for url, label in links(block, base):
                if "/institucion/indeci/noticias/" in url and len(label) > 25 and re.search(r"lluv|precipit|temperatura|el ni[ñn]o|inunda|huaico|desliz", label, re.I):
                    rows.append({"title": label, "url": url, "published_date": date_m[1] if date_m else None, "scope": "Información institucional; una noticia, recomendación o simulación no acredita una emergencia en curso"})
    elif source_id == "coen_reports":
        rows = [{"title": label, "url": url, "published_date": None, "scope": "Portal oficial de consulta; no se extraen conteos ni se asignan emergencias al mapa"} for url, label in anchors if urlparse(url).hostname == "coen.indeci.gob.pe" and urlparse(url).path in ("/report", "/siscoen")]
    elif source_id == "noaa_psl":
        if "ENSO" not in text(page):
            raise ValueError("Referencia PSL no reconocida")
        rows = [{"title": title, "url": base, "published_date": None, "scope": "Referencia para datos e índices ENSO; no sustituye el diagnóstico oficial ENFEN"}]
    unique = {}
    for row in rows:
        date = row.get("published_date") or row.get("reference_date")
        if date and dt.date.fromisoformat(date) > today:
            raise ValueError("Documento con fecha futura")
        if row.get("period") and row["period"] > today.strftime("%Y-%m"):
            raise ValueError("Documento mensual futuro")
        unique.setdefault(row["url"], row)
    rows = sorted(unique.values(), key=lambda r: r.get("published_date") or r.get("reference_date") or r.get("period") or "", reverse=True)[:6]
    if not rows:
        raise ValueError("Catálogo sin enlaces y fechas reconocibles; se conserva la última versión válida")
    return rows


def collect(fetcher, source_id, today):
    rows = parse_catalog(source_id, fetcher.text(SPECS[source_id][2]), today)
    dates = [r["published_date"] for r in rows if r.get("published_date")]
    return rows, {"latest_date": max(dates) if dates else None, "units": None, "notes": ["Catálogo de documentos y referencias oficiales. Cada registro conserva fecha explícita, periodo o corte; consultar no equivale a actualizar su contenido.", "Los reportes, diagnósticos, boletines y noticias no se convierten en valores meteorológicos, emergencias geolocalizadas ni probabilidades distritales."]}, []
