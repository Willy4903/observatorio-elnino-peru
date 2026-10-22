#!/usr/bin/env python3
"""Genera capas ligeras a partir de los datos oficiales ya validados."""
from pathlib import Path
import hashlib
import re
import shutil
from update import DATA, ROOT, digest, load, source_path, validate_files, write_atomic


def build():
    validate_files()
    points = load(source_path("cenepred_points"))
    if points:
        fields = ("id", "lat", "lon", "hazard", "department", "document_date")
        data = [{key: row[key] for key in fields} for row in points["data"]]
        write_atomic(DATA / "map_points.json.gz", {"meta": {"derived_from": source_path("cenepred_points").name, "source_data_sha256": points["meta"]["data_sha256"], "data_sha256": digest(data), "records": len(data)}, "data": data})
    source = ROOT / "site"
    target = ROOT / "dist"
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(source, target)
    selectors_hash = hashlib.sha256((source / "assets/selectors.mjs").read_bytes()).hexdigest()[:12]
    entry = (source / "assets/app.mjs").read_text().replace("'./selectors.mjs'", f"'./selectors.mjs?v={selectors_hash}'")
    entry_hash = hashlib.sha256(entry.encode()).hexdigest()[:12]
    entry_name = f"app-{entry_hash}.mjs"
    (target / "assets" / entry_name).write_text(entry)
    for old in (target / "assets").glob("app-*.mjs"):
        if old.name != entry_name:
            old.unlink()
    index = target / "index.html"
    page = (source / "index.html").read_text().replace('assets/app.mjs', f'assets/{entry_name}')
    def version_asset(match):
        path = match[1]
        value = hashlib.sha256((target / path).read_bytes()).hexdigest()[:12]
        return f'"{path}?v={value}"'
    page = re.sub(r'"(assets/[^"?]+)"', version_asset, page)
    index.write_text(page)
    for path in [target / url.split('?', 1)[0] for url in re.findall(r'(?:src|href)="((?:assets/)[^"]+)"', page)]:
        if not path.is_file():
            raise ValueError("Recurso ausente: " + str(path))
    (target / ".nojekyll").touch()
    print("Publicación estática verificada; capas ligeras generadas.")


if __name__ == "__main__":
    build()
