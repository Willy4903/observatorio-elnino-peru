import datetime as dt
import gzip
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'pipeline'))
import gfs
import documents


class DistrictForecastIntegrity(unittest.TestCase):
    def test_reference_point_stays_inside_concave_polygon_and_outside_hole(self):
        outer = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]
        hole = [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]
        lat, lon = gfs.reference_point({'type': 'Polygon', 'coordinates': [outer, hole]})
        self.assertTrue(gfs.in_polygon(lon, lat, [outer, hole]))

    def test_all_real_reference_points_are_inside_their_district(self):
        env = json.loads(gzip.decompress((ROOT / 'site/data/district_boundaries.json.gz').read_bytes()))
        for feature in env['data']['features']:
            lat, lon = gfs.reference_point(feature['geometry'])
            geom = feature['geometry']
            polygons = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
            self.assertTrue(any(gfs.in_polygon(lon, lat, p) for p in polygons), feature['properties']['ubigeo'])

    def test_actual_grib_does_not_mix_cycles_or_double_count_duplicate_messages(self):
        body = (ROOT / 'tests/fixtures/gfs-20261023-f006.grib2').read_bytes()
        run = dt.datetime.fromisoformat('2026-10-23T00:00:00+00:00')
        point = [{'lat': -12.0, 'lon': -77.0}]
        fields, lat, lon, grid = gfs.decode_grib(body, run, 6, point)
        self.assertEqual(set(fields), {'tmax', 'tmin', 'tp'})
        self.assertTrue(-50 < fields['tmin'][0] <= fields['tmax'][0] < 55)
        self.assertGreaterEqual(fields['tp'][0], 0)
        self.assertEqual((lat[0], lon[0]), (-12, -77))
        with self.assertRaisesRegex(ValueError, 'ciclos'):
            gfs.decode_grib(body, run + dt.timedelta(hours=6), 6, point)
        with self.assertRaisesRegex(ValueError, 'incompleto'):
            gfs.decode_grib(body, run, 12, point)
        with self.assertRaisesRegex(ValueError, 'GRIB2 completo'):
            gfs.decode_grib(body[:-4], run, 6, point)

    def test_accumulation_is_24_hours_and_missing_interval_is_rejected(self):
        run = dt.datetime.fromisoformat('2026-10-23T00:00:00+00:00')
        location = {'ubigeo': '150132', 'district': 'SAN JUAN DE LURIGANCHO', 'department': 'LIMA', 'department_code': '15', 'province': 'LIMA', 'lat': -12, 'lon': -77}
        frames = {h: ({'tmax': [20 + h / 6], 'tmin': [10 - h / 6], 'tp': [2.5]}, [-12], [-77]) for h in range(6, 73, 6)}
        rows = gfs.aggregate_windows(run, [location], frames)
        self.assertEqual(len(rows), 3)
        self.assertEqual([r['precipitation_mm'] for r in rows], [10, 10, 10])
        self.assertTrue(all(dt.datetime.fromisoformat(r['valid_end']) - dt.datetime.fromisoformat(r['valid_start']) == dt.timedelta(hours=24) for r in rows))
        self.assertEqual(rows[0]['valid_date'], '2026-10-23')
        self.assertIsNone(rows[0]['precipitation_probability'])
        del frames[12]
        with self.assertRaisesRegex(ValueError, 'incompleta'):
            gfs.aggregate_windows(run, [location], frames)

    def test_published_model_keeps_ubigeo_windows_and_null_probabilities(self):
        file = ROOT / 'site/data/district_forecast.json.gz'
        if not file.exists():
            self.skipTest('Sin adquisición inicial')
        env = json.loads(gzip.decompress(file.read_bytes()))
        self.assertEqual(len(env['data']), 1891 * 3)
        self.assertEqual(len({(r['ubigeo'], r['valid_date']) for r in env['data']}), len(env['data']))
        for r in env['data']:
            self.assertLessEqual(r['tmin_c'], r['tmax_c'])
            self.assertGreaterEqual(r['precipitation_mm'], 0)
            self.assertIsNone(r['precipitation_probability'])
            self.assertEqual(r['ubigeo'][:2], r['department_code'])


class OfficialDocumentsIntegrity(unittest.TestCase):
    def test_catalog_month_and_report_cut_are_not_invented_issue_dates(self):
        page = '<a href="https://siofen-admin.imarpe.gob.pe/img/productoArchivo/GTI/2026/INF_IMARPE_GTI_2026-07.pdf">PDF</a>'
        row = documents.parse_catalog('imarpe_gti', page, dt.date(2026, 10, 23))[0]
        self.assertEqual(row['period'], '2026-07')
        self.assertIsNone(row['published_date'])
        page = '<a href="https://enfen.imarpe.gob.pe/download/informe/">Informe Técnico ENFEN al 13 de octubre de 2026</a>'
        row = documents.parse_catalog('enfen_technical', page, dt.date(2026, 10, 23))[0]
        self.assertEqual(row['reference_date'], '2026-10-13')
        self.assertIsNone(row['published_date'])

    def test_future_documents_and_unrecognizable_catalogs_are_rejected(self):
        page = '<a href="https://www.senamhi.gob.pe/load/file/a.pdf">23 Octubre - 2099</a>'
        with self.assertRaisesRegex(ValueError, 'futura'):
            documents.parse_catalog('senamhi_monitor', page, dt.date(2026, 10, 23))
        with self.assertRaisesRegex(ValueError, 'sin enlaces'):
            documents.parse_catalog('senamhi_monitor', '<html>Error de servicio</html>', dt.date(2026, 10, 23))


if __name__ == '__main__':
    unittest.main()
