#!/usr/bin/env python3
"""Genera el mapa SVG del simulador de impacto (#que-es) a partir de los límites
departamentales oficiales que ya publica el observatorio (CENEPRED · SIGRID).

Uso:
    python design/peru_map.py            # reescribe el bloque entre los marcadores en site/index.html
    python design/peru_map.py --check    # falla si el HTML no coincide con lo que se generaría

No descarga nada: usa site/data/boundaries.json. La geometría solo se simplifica
(Douglas-Peucker) para reducir el peso; no se altera ni se inventa ningún contorno.
"""
from pathlib import Path
import json
import math
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
BOUNDARIES = ROOT / "site/data/boundaries.json"
INDEX = ROOT / "site/index.html"
START, END = "<!-- qe-map:start -->", "<!-- qe-map:end -->"

WIDTH = 300.0        # ancho del viewBox
TOLERANCE = 1.0      # unidades del viewBox; conserva la forma de la costa y mantiene el archivo liviano
LAT0 = -9.2          # latitud central para la corrección del eje horizontal

# Agrupación didáctica. No es una regionalización oficial: resume dónde suelen sentirse
# los efectos más citados por ENFEN e INDECI (costa y sierra norte; sur andino).
ZONES = {
    "norte": ["TUMBES", "PIURA", "LAMBAYEQUE", "LA LIBERTAD", "CAJAMARCA"],
    "sur": ["AREQUIPA", "MOQUEGUA", "TACNA", "PUNO", "CUSCO", "APURIMAC"],
}
LABELS = {
    "AMAZONAS": "Amazonas", "ANCASH": "Áncash", "APURIMAC": "Apurímac", "AREQUIPA": "Arequipa",
    "AYACUCHO": "Ayacucho", "CAJAMARCA": "Cajamarca", "CALLAO": "Callao", "CUSCO": "Cusco",
    "HUANCAVELICA": "Huancavelica", "HUANUCO": "Huánuco", "ICA": "Ica", "JUNIN": "Junín",
    "LA LIBERTAD": "La Libertad", "LAMBAYEQUE": "Lambayeque", "LIMA": "Lima", "LORETO": "Loreto",
    "MADRE DE DIOS": "Madre de Dios", "MOQUEGUA": "Moquegua", "PASCO": "Pasco", "PIURA": "Piura",
    "PUNO": "Puno", "SAN MARTIN": "San Martín", "TACNA": "Tacna", "TUMBES": "Tumbes", "UCAYALI": "Ucayali",
}


def zone_of(name):
    for zone, names in ZONES.items():
        if name in names:
            return zone
    return "otros"


def rings(geometry):
    polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    for polygon in polygons:
        for ring in polygon:
            yield ring


def simplify(points, tolerance):
    """Douglas-Peucker iterativo (los anillos de Loreto superan el límite de recursión)."""
    if len(points) < 4:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        (x1, y1), (x2, y2) = points[first], points[last]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy)
        far, index = 0.0, None
        for i in range(first + 1, last):
            x, y = points[i]
            d = math.hypot(x - x1, y - y1) if norm == 0 else abs(dy * (x - x1) - dx * (y - y1)) / norm
            if d > far:
                far, index = d, i
        if index is not None and far > tolerance:
            keep[index] = True
            stack += [(first, index), (index, last)]
    return [p for p, k in zip(points, keep) if k]


def build():
    features = json.loads(BOUNDARIES.read_text())["data"]["features"]
    k = math.cos(math.radians(LAT0))
    lons = [x for f in features for r in rings(f["geometry"]) for x, _ in r]
    lats = [y for f in features for r in rings(f["geometry"]) for _, y in r]
    lon_min, lat_max = min(lons), max(lats)
    scale = WIDTH / ((max(lons) - lon_min) * k)
    height = (lat_max - min(lats)) * scale

    def project(lon, lat):
        return ((lon - lon_min) * k * scale, (lat_max - lat) * scale)

    paths, boxes = [], {"norte": [1e9, 1e9, -1e9, -1e9], "sur": [1e9, 1e9, -1e9, -1e9]}
    vertices = 0
    for feature in sorted(features, key=lambda f: f["properties"]["name"]):
        name = feature["properties"]["name"]
        zone = zone_of(name)
        d = []
        for ring in rings(feature["geometry"]):
            pts = simplify([project(x, y) for x, y in ring], TOLERANCE)
            if len(pts) < 3:
                continue
            vertices += len(pts)
            d.append("M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + "Z")
            if zone in boxes:
                b = boxes[zone]
                for x, y in pts:
                    b[0], b[1], b[2], b[3] = min(b[0], x), min(b[1], y), max(b[2], x), max(b[3], y)
        slug = re.sub(r"[^a-z]+", "-", LABELS[name].lower().replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")).strip("-")
        paths.append(f'<path id="qe-d-{slug}" class="qe-dep" data-zone="{zone}" data-dep="{LABELS[name]}" d="{"".join(d)}"/>')
    centers = {z: ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2) for z, b in boxes.items()}
    return {
        "viewbox": f"0 0 {WIDTH:.0f} {height:.0f}",
        "markup": "\n".join(paths),
        "centers": centers,
        "boxes": boxes,
        "vertices": vertices,
    }


def render(info):
    return f"{START}\n{info['markup']}\n{END}"


def main():
    info = build()
    html = INDEX.read_text()
    if START not in html or END not in html:
        sys.exit("Faltan los marcadores qe-map en site/index.html")
    pattern = re.compile(re.escape(START) + r".*?" + re.escape(END), re.S)
    updated = pattern.sub(lambda _: render(info), html)
    if "--check" in sys.argv:
        if updated != html:
            sys.exit("El mapa de site/index.html no coincide con site/data/boundaries.json. Ejecuta python design/peru_map.py")
        print("Mapa al día.")
        return
    INDEX.write_text(updated)
    print("viewBox:", info["viewbox"], "· vértices:", info["vertices"], "· bytes:", len(info["markup"].encode()))
    for zone, (x, y) in info["centers"].items():
        print(f"centro {zone}: {x:.0f}, {y:.0f}  caja:", [round(v) for v in info["boxes"][zone]])


if __name__ == "__main__":
    main()
