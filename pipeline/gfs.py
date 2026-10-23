"""GFS oficial: subregión de Perú y muestreo de celda para cada distrito.

No hay interpolación, corrección altitudinal ni simulación propia. Los acumulados
de 24 horas conservan sus horas de inicio y fin; no son días civiles de Lima.
"""
from __future__ import annotations

import datetime as dt
import math
import tempfile
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

NOMADS = "https://nomads.ncep.noaa.gov/"
LIMA = ZoneInfo("America/Lima")


def in_ring(x, y, ring):
    inside = False
    for a, b in zip(ring, ring[1:] + ring[:1]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


def in_polygon(x, y, rings):
    return in_ring(x, y, rings[0]) and not any(in_ring(x, y, hole) for hole in rings[1:])


def signed_area(ring):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1])) / 2


def reference_point(geometry):
    """Centroide del polígono mayor si es interior; si no, punto interior por corte."""
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    rings = max(polygons, key=lambda p: abs(signed_area(p[0])))
    ring = rings[0]
    area = signed_area(ring)
    if abs(area) < 1e-12:
        raise ValueError("Polígono distrital sin área")
    cross = [(a, b, a[0] * b[1] - b[0] * a[1]) for a, b in zip(ring, ring[1:] + ring[:1])]
    x = sum((a[0] + b[0]) * c for a, b, c in cross) / (6 * area)
    y = sum((a[1] + b[1]) * c for a, b, c in cross) / (6 * area)
    if in_polygon(x, y, rings):
        return round(y, 6), round(x, 6)
    low, high = min(p[1] for p in ring), max(p[1] for p in ring)
    candidates = []
    for fraction in (.5, .25, .75, .1, .9):
        yy = low + (high - low) * fraction
        hits = sorted(a[0] + (yy - a[1]) * (b[0] - a[0]) / (b[1] - a[1]) for r in rings for a, b in zip(r, r[1:] + r[:1]) if (a[1] > yy) != (b[1] > yy))
        for left, right in zip(hits, hits[1:]):
            xx = (left + right) / 2
            if in_polygon(xx, yy, rings):
                candidates.append((right - left, yy, xx))
    if not candidates:
        raise ValueError("No se pudo determinar un punto interior del distrito")
    _, y, x = max(candidates)
    return round(y, 6), round(x, 6)


def district_locations(features):
    locations = []
    for feature in features:
        p = feature["properties"]
        lat, lon = reference_point(feature["geometry"])
        if not (-19 <= lat <= 1 and -83 <= lon <= -67):
            raise ValueError("Punto distrital fuera de Perú")
        locations.append({**p, "lat": lat, "lon": lon})
    if len({p["ubigeo"] for p in locations}) != len(locations) or len(locations) < 1800:
        raise ValueError("Cobertura distrital incompleta o duplicada")
    return sorted(locations, key=lambda p: p["ubigeo"])


def run_time(now):
    # Espera seis horas para que estén disponibles todos los plazos necesarios.
    ready = now.astimezone(dt.timezone.utc) - dt.timedelta(hours=6)
    return ready.replace(hour=ready.hour // 6 * 6, minute=0, second=0, microsecond=0)


def subset_url(run, lead):
    params = {"file": f"gfs.t{run.hour:02d}z.pgrb2.0p25.f{lead:03d}", "lev_2_m_above_ground": "on", "lev_surface": "on", "var_TMAX": "on", "var_TMIN": "on", "var_APCP": "on", "subregion": "", "leftlon": 277, "rightlon": 293, "toplat": 1, "bottomlat": -19, "dir": f"/gfs.{run:%Y%m%d}/{run.hour:02d}/atmos"}
    return NOMADS + "cgi-bin/filter_gfs_0p25.pl?" + urlencode(params)


def decode_grib(body, run, lead, locations, expected_grid=None):
    import eccodes as ec
    import numpy as np

    if not body.startswith(b"GRIB") or not body.endswith(b"7777"):
        raise ValueError("NOMADS no entregó GRIB2 completo")
    fields, grid, sampled = {}, None, None
    with tempfile.TemporaryFile() as stream:
        stream.write(body)
        stream.seek(0)
        while message := ec.codes_grib_new_from_file(stream):
            try:
                name = ec.codes_get(message, "shortName")
                if name not in ("tmax", "tmin", "tp"):
                    continue
                if ec.codes_get(message, "gridType") != "regular_ll" or any(abs(ec.codes_get(message, k) - .25) > 1e-7 for k in ("iDirectionIncrementInDegrees", "jDirectionIncrementInDegrees")):
                    raise ValueError("Resolución GFS distinta de 0,25 grados")
                if int(ec.codes_get(message, "stepUnits")) != 1:
                    raise ValueError("El plazo GRIB no está expresado en horas")
                if ec.codes_get(message, "dataDate") != int(run.strftime("%Y%m%d")) or ec.codes_get(message, "dataTime") != run.hour * 100:
                    raise ValueError("GRIB mezcla ciclos de emisión")
                start, end = int(ec.codes_get(message, "startStep")), int(ec.codes_get(message, "endStep"))
                if end != lead or start != lead - 6:
                    continue  # No sumar acumulados superpuestos de 0 a N horas.
                expected_type = "accum" if name == "tp" else "max" if name == "tmax" else "min"
                if ec.codes_get(message, "stepType") != expected_type:
                    raise ValueError("Estadístico GRIB inesperado")
                units = ec.codes_get(message, "units")
                if units != ("kg m**-2" if name == "tp" else "K"):
                    raise ValueError("Unidades GRIB inesperadas")
                if name != "tp" and (ec.codes_get(message, "typeOfLevel") != "heightAboveGround" or ec.codes_get(message, "level") != 2):
                    raise ValueError("La temperatura no corresponde a dos metros")
                lats = ec.codes_get_array(message, "latitudes")
                lons = (ec.codes_get_array(message, "longitudes") + 180) % 360 - 180
                current_grid = (len(lats), float(lats[0]), float(lats[-1]), float(lons[0]), float(lons[-1]))
                if (grid and grid != current_grid) or (expected_grid and expected_grid != current_grid):
                    raise ValueError("La malla GFS cambió entre variables/plazos")
                grid = current_grid
                if sampled is None:
                    indexes = [int(np.argmin((lats - p["lat"]) ** 2 + ((lons - p["lon"]) * math.cos(math.radians(p["lat"]))) ** 2)) for p in locations]
                    sampled = (indexes, lats[indexes], lons[indexes])
                    if any(abs(float(a) - p["lat"]) > .126 or abs(float(b) - p["lon"]) > .126 for p, a, b in zip(locations, sampled[1], sampled[2])):
                        raise ValueError("Distrito fuera de la celda GFS esperada")
                values = ec.codes_get_values(message)[sampled[0]]
                if name != "tp":
                    values = values - 273.15
                if not np.isfinite(values).all() or (name == "tp" and (values.min() < 0 or values.max() > 1500)) or (name != "tp" and (values.min() < -80 or values.max() > 65)):
                    raise ValueError("GFS presenta valores ausentes o fuera de rango")
                if name in fields and not np.array_equal(fields[name], values):
                    raise ValueError("Variable GRIB duplicada con valores distintos")
                fields[name] = values
            finally:
                ec.codes_release(message)
    if set(fields) != {"tmax", "tmin", "tp"}:
        raise ValueError(f"GRIB incompleto en f{lead:03d}; se requieren las tres variables en intervalos de seis horas")
    if (fields["tmin"] > fields["tmax"]).any():
        raise ValueError("Mínima GFS mayor que máxima")
    return fields, sampled[1], sampled[2], grid


def aggregate_windows(run, locations, frames):
    """Cada ventana suma cuatro acumulados consecutivos, sin solaparlos."""
    rows = []
    for first in (6, 30, 54):
        leads = list(range(first, first + 24, 6))
        if any(h not in frames for h in leads):
            raise ValueError("Ventana GFS de 24 horas incompleta")
        start, end = run + dt.timedelta(hours=first - 6), run + dt.timedelta(hours=first + 18)
        for i, p in enumerate(locations):
            rows.append({"ubigeo": p["ubigeo"], "locality_id": p["ubigeo"], "locality": p["district"], "district": p["district"], "department": p["department"], "department_code": p["department_code"], "province": p["province"], "lat": p["lat"], "lon": p["lon"], "grid_lat": round(float(frames[first][1][i]), 2), "grid_lon": round(float(frames[first][2][i]), 2), "valid_date": end.astimezone(LIMA).date().isoformat(), "valid_start": start.isoformat(), "valid_end": end.isoformat(), "issued_at": run.isoformat(), "tmax_c": round(max(float(frames[h][0]["tmax"][i]) for h in leads), 1), "tmin_c": round(min(float(frames[h][0]["tmin"][i]) for h in leads), 1), "precipitation_mm": round(sum(float(frames[h][0]["tp"][i]) for h in leads), 2), "precipitation_probability": None, "provider": "NOAA GFS", "source_url": NOMADS + "gribfilter.php?ds=gfs_0p25"})
    return rows


def collect(fetcher, features, now):
    locations = district_locations(features)
    run = run_time(now)
    frames, grid = {}, None
    # Doce recortes pequeños: tres variables, cuatro intervalos por día, tres días.
    for lead in range(6, 73, 6):
        fields, lats, lons, grid = decode_grib(fetcher.get(subset_url(run, lead)), run, lead, locations, grid)
        frames[lead] = (fields, lats, lons)
    rows = aggregate_windows(run, locations, frames)
    return rows, {"latest_date": max(r["valid_date"] for r in rows), "issued_at": run.isoformat(), "valid_from": rows[0]["valid_start"], "valid_to": rows[-1]["valid_end"], "grid_resolution_degrees": .25, "units": "°C y mm en 24 h", "notes": ["Modelo numérico oficial NOAA GFS, no observaciones ni pronóstico emitido por SENAMHI.", "Celda de 0,25° más próxima a un punto interior calculado de cada polígono CENEPRED 2025–2027. Varios distritos pueden compartir celda. No es una estación ni un promedio distrital; la topografía local puede no estar resuelta.", "TMAX/TMIN a 2 metros: extremos de cuatro intervalos contiguos de 6 h. Precipitación total: suma de cuatro acumulados de 6 h, sin superposición; kg/m² equivale a mm de agua.", "Cada ventana de 24 h conserva su inicio y fin en Lima; la fecha de filtro es la fecha local de cierre. No se presenta como día civil de 00 a 24 h."]}, []
