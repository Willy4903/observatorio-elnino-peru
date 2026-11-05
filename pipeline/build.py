#!/usr/bin/env python3
"""Genera capas ligeras a partir de los datos oficiales ya validados."""
from pathlib import Path
import hashlib
import html
import json
import re
import shutil
from urllib.parse import unquote_plus, urlsplit, urlunsplit
from update import ROOT, digest, load, source_path, validate_files, write_atomic


# The repository uses standard static imports and quoted dynamic imports. Keep
# their spelling and only replace the local module URL.
MODULE_IMPORT = re.compile(
    r"""(?P<prefix>\b(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?|\bimport\s*\(\s*)(?P<quote>['"])(?P<url>\.\.?/[^'"]+)(?P=quote)"""
)
ASSET_ATTRIBUTE = re.compile(
    r"""(?P<prefix>(?<![\w:-])(?:src|href)\s*=\s*)(?P<quote>['"])(?P<url>assets/[^'"]+)(?P=quote)""", re.IGNORECASE
)


def content_hash(content):
    return hashlib.sha256(content).hexdigest()[:12]


def version_url(url, version, path=None):
    parts = urlsplit(url)
    query = [part for part in parts.query.split("&")
             if part and unquote_plus(part.split("=", 1)[0]) != "v"]
    query.append("v=" + version)
    return urlunsplit((parts.scheme, parts.netloc, path or parts.path,
                       "&".join(query), parts.fragment))


def version_modules(assets):
    """Hash rewritten modules, so a dependency change also versions its parents."""
    versions = {}
    visiting = set()
    assets = assets.resolve()

    def version(path):
        path = path.resolve()
        if not path.is_relative_to(assets):
            raise ValueError("Importación fuera de assets: " + str(path))
        if path in versions:
            return versions[path]
        if path in visiting:
            raise ValueError("Importaciones circulares: " + str(path))
        visiting.add(path)

        def rewrite(match):
            url = match["url"]
            module_path = urlsplit(url).path
            if not module_path.endswith(".mjs"):
                return match[0]
            dependency = path.parent / module_path
            return (match["prefix"] + match["quote"] +
                    version_url(url, version(dependency)) + match["quote"])

        content = MODULE_IMPORT.sub(rewrite, path.read_text()).encode()
        path.write_bytes(content)
        versions[path] = content_hash(content)
        visiting.remove(path)
        return versions[path]

    for path in sorted(assets.rglob("*.mjs")):
        version(path)
    return versions


def prepare_frontend(source, target):
    versions = version_modules(target / "assets")
    entry = target / "assets/app.mjs"
    entry_name = "app-" + versions[entry.resolve()] + ".mjs"
    (target / "assets" / entry_name).write_bytes(entry.read_bytes())
    for old in (target / "assets").glob("app-*.mjs"):
        if old.name != entry_name:
            old.unlink()

    def version_asset(match):
        url = html.unescape(match["url"])
        path = urlsplit(url).path
        if path == "assets/app.mjs":
            path = "assets/" + entry_name
        asset = target / path
        if not asset.resolve().is_relative_to((target / "assets").resolve()):
            raise ValueError("Recurso fuera de assets: " + path)
        if not asset.is_file():
            raise ValueError("Recurso ausente: " + str(asset))
        url = version_url(url, content_hash(asset.read_bytes()), path)
        return match["prefix"] + match["quote"] + html.escape(url, quote=True) + match["quote"]

    page = ASSET_ATTRIBUTE.sub(version_asset, (source / "index.html").read_text())
    # Hash the canonical placeholder rather than the resulting version itself.
    # Only frontend bytes contribute: data refreshes keep this identity stable.
    interface = hashlib.sha256()
    interface.update(b"index.html\0" + page.encode() + b"\0")
    for asset in sorted((target / "assets").rglob("*")):
        if asset.is_file():
            interface.update(asset.relative_to(target).as_posix().encode() + b"\0")
            interface.update(asset.read_bytes() + b"\0")
    interface_version = interface.hexdigest()[:12]
    (target / "index.html").write_text(page.replace("__UI_VERSION__", interface_version))
    (target / "publication.json").write_text(
        json.dumps({"interface_version": interface_version}, separators=(",", ":")) + "\n")


def build():
    validate_files()
    source = ROOT / "site"
    target = ROOT / "dist"
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(source, target)
    target_data = target / "data"
    points = load(source_path("cenepred_points"))
    if points:
        fields = ("id", "lat", "lon", "hazard", "department", "province", "district", "document_date")
        data = [{key: row[key] for key in fields} for row in points["data"]]
        write_atomic(target_data / "map_points.json.gz", {"meta": {"derived_from": source_path("cenepred_points").name, "source_data_sha256": points["meta"]["data_sha256"], "data_sha256": digest(data), "records": len(data)}, "data": data})
    districts = load(source_path("district_boundaries"))
    if districts:
        for code in sorted({f["properties"]["department_code"] for f in districts["data"]["features"]}):
            data = {"type": "FeatureCollection", "features": [f for f in districts["data"]["features"] if f["properties"]["department_code"] == code]}
            write_atomic(target_data / "districts" / (code + ".json.gz"), {"meta": {"derived_from": source_path("district_boundaries").name, "source_data_sha256": districts["meta"]["data_sha256"], "data_sha256": digest(data), "records": len(data["features"])}, "data": data})
    prepare_frontend(source, target)
    (target / ".nojekyll").touch()
    print("Publicación estática verificada; capas ligeras generadas.")


if __name__ == "__main__":
    build()
