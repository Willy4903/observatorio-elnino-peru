"""Build contract: fresh frontend URLs, stable publications, untouched sources."""
import hashlib
import html
import gzip
import json
from pathlib import Path
import re
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pipeline'))
import build as b


def snapshot(directory):
    return {p.relative_to(directory).as_posix(): p.read_bytes()
            for p in directory.rglob('*') if p.is_file()}


def hash12(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


class FrontendPublication(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.site = self.root / 'site'
        self.assets = self.site / 'assets'
        self.assets.mkdir(parents=True)
        (self.site / 'data').mkdir()
        (self.site / 'data/manifest.json').write_text('{"generation":1}')
        (self.site / 'index.html').write_text('''<!doctype html>
<meta name="observatorio-version" content="__UI_VERSION__">
<link href="assets/visual.css?v=4&amp;theme=ocean#colors" rel="stylesheet">
<link href='assets/icon.svg#sea' rel='icon'>
<script type="module" src="assets/app.mjs?mode=full&amp;v=old#boot"></script>
<script type="module" src='assets/appearance.mjs?v=1#appearance'></script>
<a href="https://example.com/assets/external.css?v=4">External</a>
<div data-href="assets/visual.css?v=4"></div>''')
        (self.assets / 'visual.css').write_text('body {color: navy;}\n')
        (self.assets / 'icon.svg').write_text('<svg></svg>')
        (self.assets / 'appearance.mjs').write_text('export const dark = true;\n')
        (self.assets / 'selectors.mjs').write_text('export const mean = values => values[0];\n')
        (self.assets / 'latest.mjs').write_text("import {mean} from './selectors.mjs?unit=c&v=old#mean';\nexport const latest = mean([1]);\n")
        for name in ('ocean', 'weather', 'glossary'):
            (self.assets / (name + '.mjs')).write_text('export const value = 1;\n')
        (self.assets / 'app.mjs').write_text(''.join(
            "import * as " + name + " from './" + name + ".mjs';\n"
            for name in ('ocean', 'glossary', 'latest', 'weather', 'selectors')))
        for name, value in (('ROOT', self.root), ('validate_files', lambda: 1),
                            ('load', lambda *_: None)):
            mocked = patch.object(b, name, value)
            mocked.start()
            self.addCleanup(mocked.stop)

    @property
    def dist(self):
        return self.root / 'dist'

    def urls(self):
        return [html.unescape(m['url']) for m in
                b.ASSET_ATTRIBUTE.finditer((self.dist / 'index.html').read_text())]

    def entry(self):
        return next(self.dist / urlsplit(url).path for url in self.urls()
                    if re.fullmatch(r'assets/app-[a-f0-9]{12}\.mjs', urlsplit(url).path))

    def publication(self):
        return json.loads((self.dist / 'publication.json').read_text())

    def test_all_asset_attributes_use_final_content_hash_and_keep_url_parts(self):
        b.build()
        urls = self.urls()
        self.assertEqual(len(urls), 4)
        for url in urls:
            parts = urlsplit(url)
            self.assertEqual(parse_qs(parts.query)['v'], [hash12(self.dist / parts.path)])
        style = urlsplit(next(url for url in urls if 'visual.css' in url))
        self.assertEqual(parse_qs(style.query)['theme'], ['ocean'])
        self.assertEqual(style.fragment, 'colors')
        entry = urlsplit(next(url for url in urls if 'app-' in url))
        self.assertEqual(parse_qs(entry.query)['mode'], ['full'])
        self.assertEqual(entry.fragment, 'boot')
        self.assertEqual(self.entry().stem, 'app-' + hash12(self.entry()))
        page = (self.dist / 'index.html').read_text()
        self.assertIn('https://example.com/assets/external.css?v=4', page)
        self.assertIn('data-href="assets/visual.css?v=4"', page)
        version = self.publication()['interface_version']
        self.assertRegex(version, r'^[a-f0-9]{12}$')
        self.assertIn('content="' + version + '"', page)
        self.assertNotIn('__UI_VERSION__', page)

    def test_all_five_imports_and_nested_latest_reference_final_module_hashes(self):
        b.build()
        entry_imports = list(b.MODULE_IMPORT.finditer(self.entry().read_text()))
        self.assertEqual(len(entry_imports), 5)
        for match in entry_imports:
            parts = urlsplit(match['url'])
            path = self.entry().parent / parts.path
            self.assertEqual(parse_qs(parts.query)['v'], [hash12(path)])
        latest = self.dist / 'assets/latest.mjs'
        nested = urlsplit(next(b.MODULE_IMPORT.finditer(latest.read_text()))['url'])
        self.assertEqual(parse_qs(nested.query), {
            'unit': ['c'], 'v': [hash12(self.dist / 'assets/selectors.mjs')]})
        self.assertEqual(nested.fragment, 'mean')

    def test_leaf_module_change_propagates_to_latest_and_main_entry(self):
        b.build()
        old_entry = self.entry().name
        old_latest = (self.dist / 'assets/latest.mjs').read_bytes()
        old_version = self.publication()['interface_version']
        (self.assets / 'selectors.mjs').write_text('export const mean = () => 2;\n')
        b.build()
        self.assertNotEqual(self.entry().name, old_entry)
        self.assertFalse((self.dist / 'assets' / old_entry).exists())
        self.assertNotEqual((self.dist / 'assets/latest.mjs').read_bytes(), old_latest)
        self.assertNotEqual(self.publication()['interface_version'], old_version)

    def test_css_change_updates_its_url_and_interface_version(self):
        b.build()
        old_style = next(url for url in self.urls() if 'visual.css' in url)
        old_version = self.publication()['interface_version']
        (self.assets / 'visual.css').write_text('body {color: coral;}\n')
        b.build()
        self.assertNotEqual(next(url for url in self.urls() if 'visual.css' in url), old_style)
        self.assertNotEqual(self.publication()['interface_version'], old_version)

    def test_data_only_refresh_keeps_frontend_identity(self):
        b.build()
        old_version = self.publication()
        old_page = (self.dist / 'index.html').read_bytes()
        (self.site / 'data/manifest.json').write_text('{"generation":2}')
        b.build()
        self.assertEqual(self.publication(), old_version)
        self.assertEqual((self.dist / 'index.html').read_bytes(), old_page)
        self.assertEqual(json.loads((self.dist / 'data/manifest.json').read_text()), {'generation': 2})

    def test_build_is_reproducible_and_does_not_rewrite_source(self):
        original = snapshot(self.site)
        b.build()
        first = snapshot(self.dist)
        b.build()
        self.assertEqual(snapshot(self.dist), first)
        self.assertEqual(snapshot(self.site), original)

    def test_derived_map_layers_are_written_only_to_dist(self):
        fields = ('id', 'lat', 'lon', 'hazard', 'department', 'province',
                  'district', 'document_date')
        points = {'meta': {'data_sha256': 'points'},
                  'data': [dict.fromkeys(fields, None)]}
        feature = {'properties': {'department_code': '15'}, 'geometry': None}
        districts = {'meta': {'data_sha256': 'districts'},
                     'data': {'features': [feature]}}
        def load_source(path):
            return districts if 'district_boundaries' in path.name else points
        b.build()
        old_version = self.publication()
        original = snapshot(self.site)
        with patch.object(b, 'load', load_source):
            b.build()
        self.assertEqual(snapshot(self.site), original)
        for path in ('map_points.json.gz', 'districts/15.json.gz'):
            envelope = json.loads(gzip.decompress((self.dist / 'data' / path).read_bytes()))
            self.assertEqual(envelope['meta']['records'], 1)
        self.assertEqual(self.publication(), old_version)

    def test_side_effect_reexport_and_dynamic_imports_are_versioned(self):
        (self.assets / 'appearance.mjs').write_text("""import './selectors.mjs';
export {latest} from './latest.mjs';
const loaded = import('./weather.mjs?mode=lazy#module');
""")
        b.build()
        path = self.dist / 'assets/appearance.mjs'
        imports = list(b.MODULE_IMPORT.finditer(path.read_text()))
        self.assertEqual(len(imports), 3)
        for match in imports:
            parts = urlsplit(match['url'])
            self.assertEqual(parse_qs(parts.query)['v'], [hash12(path.parent / parts.path)])
        lazy = urlsplit(imports[-1]['url'])
        self.assertEqual(parse_qs(lazy.query)['mode'], ['lazy'])
        self.assertEqual(lazy.fragment, 'module')


if __name__ == '__main__':
    unittest.main()
