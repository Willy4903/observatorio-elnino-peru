"""Contratos de los campos NOAA usando celdas reales de la descarga conservada."""
import csv
import datetime as dt
import io
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pipeline'))
import update as u


class OceanIntegrity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sst = u.load(u.source_path('noaa_ocean_sst'))
        cls.currents = u.load(u.source_path('noaa_ocean_currents'))
        if not cls.sst or not cls.currents:
            raise unittest.SkipTest('Aún no se dispone de la primera adquisición NOAA oceánica')

    def text(self, rows, currents=False):
        output = io.StringIO()
        fields = ['time', 'latitude', 'longitude', *(['ugos', 'vgos'] if currents else ['sst', 'anom'])]
        writer = csv.writer(output)
        writer.writerow(fields)
        writer.writerow(['UTC', 'degrees_north', 'degrees_east', *(['m s-1']*2 if currents else ['degree_C']*2)])
        for r in rows:
            writer.writerow([r['date']+'T12:00:00Z', r['lat'], r['lon'] if currents else r['lon']+360, r['u_ms'] if currents else r['sst_c'], r['v_ms'] if currents else r['anomaly_c']])
        return output.getvalue()

    def asof(self, rows):
        return max(dt.date.fromisoformat(r['date']) for r in rows)+dt.timedelta(days=1)

    def test_native_sst_values_and_coordinates_are_preserved(self):
        real = self.sst['data'][:600]
        rows, rejected = u.parse_ocean_csv(self.text(real), today=self.asof(real))
        self.assertEqual(rows, real)
        self.assertEqual(rejected, [])

    def test_current_components_and_units_are_preserved(self):
        real = self.currents['data'][:40]
        rows, rejected = u.parse_ocean_csv(self.text(real, True), True, self.asof(real))
        self.assertEqual(rows, real)
        self.assertEqual(rejected, [])
        with self.assertRaisesRegex(ValueError, 'Unidades'):
            u.parse_ocean_csv(self.text(real, True).replace('m s-1', 'km/h'), True, self.asof(real))

    def test_masks_are_not_replaced_with_zero(self):
        real = self.sst['data'][:601]
        masked = {**real[-1], 'sst_c': float('nan'), 'anomaly_c': float('nan')}
        rows, rejected = u.parse_ocean_csv(self.text(real[:-1]+[masked]), today=self.asof(real))
        self.assertEqual(rows, real[:-1])
        self.assertEqual(rejected, [])

    def test_duplicate_cells_and_mixed_dates_are_blocked(self):
        real = self.sst['data'][:600]
        with self.assertRaisesRegex(ValueError, 'duplicada'):
            u.parse_ocean_csv(self.text(real+[real[0]]), today=self.asof(real))
        changed = {**real[-1], 'date': (dt.date.fromisoformat(real[-1]['date'])-dt.timedelta(days=1)).isoformat()}
        with self.assertRaisesRegex(ValueError, 'mezcla fechas'):
            u.parse_ocean_csv(self.text(real[:-1]+[changed]), today=self.asof(real))

    def test_future_dates_and_lost_schema_are_blocked(self):
        real = self.sst['data'][:600]
        with self.assertRaisesRegex(ValueError, 'futura'):
            u.parse_ocean_csv(self.text(real), today=dt.date.fromisoformat(real[0]['date'])-dt.timedelta(days=1))
        with self.assertRaisesRegex(ValueError, 'Esquema'):
            u.parse_ocean_csv(self.text(real).replace('anom\r\n', 'temperature\r\n'), today=self.asof(real))


if __name__ == '__main__':
    unittest.main()
