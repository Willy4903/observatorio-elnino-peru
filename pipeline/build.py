#!/usr/bin/env python3
"""Genera capas ligeras a partir de los datos oficiales ya validados."""
from pathlib import Path
import re
from update import DATA, ROOT, digest, load, source_path, validate_files, write_atomic


def build():
    validate_files()
    points = load(source_path("cenepred_points"))
    if points:
        fields = ("id", "lat", "lon", "hazard", "department", "document_date")
        data = [{key: row[key] for key in fields} for row in points["data"]]
        write_atomic(DATA / "map_points.json.gz", {"meta": {"derived_from": source_path("cenepred_points").name, "source_data_sha256": points["meta"]["data_sha256"], "data_sha256": digest(data), "records": len(data)}, "data": data})
    index = ROOT / "site" / "index.html"
    for path in [ROOT / "site" / url for url in re.findall(r'(?:src|href)="((?:assets/)[^"]+)"', index.read_text())]:
        if not path.is_file():
            raise ValueError("Recurso ausente: " + str(path))
    (ROOT / "site" / ".nojekyll").touch()
    print("Publicación estática verificada; capas ligeras generadas.")


if __name__ == "__main__":
    build()
