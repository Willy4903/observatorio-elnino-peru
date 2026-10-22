import datetime as dt
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import update as u


class AcquisitionIntegrity(unittest.TestCase):
    def test_weekly_negative_values_without_separator(self):
        text = " 02SEP1981     20.6-0.1     24.8-0.1     26.5-0.2     28.3-0.3"
        row = u.parse_weekly(text)[0]
        self.assertEqual(row["nino12_anomaly"], -0.1)
        self.assertEqual(row["nino34_anomaly"], -0.2)
        self.assertEqual(row["nino34_sst"], 26.5)

    def test_no_future_observations(self):
        with self.assertRaises(ValueError):
            u.parse_weekly(" 02SEP2099     20.6-0.1     24.8-0.1     26.5-0.2     28.3-0.3")

    def test_no_duplicates_in_series(self):
        line = " 02SEP1981     20.6-0.1     24.8-0.1     26.5-0.2     28.3-0.3"
        with self.assertRaises(ValueError):
            u.parse_weekly(line + "\n" + line)

    def test_partial_current_month_is_not_published_as_closed(self):
        text = "2026 9 25.27 4.69 29.0 3.0 29.0 0.1 29.60 2.84\n2026 10 26.0 5.0 29.0 3.0 29.0 0.1 30.0 3.3"
        rows = u.parse_monthly(text, dt.date(2026, 10, 22))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["period_end"], "2026-09-30")
        self.assertEqual(rows[0]["nino34_anomaly"], 2.84)

    def test_year_boundary_in_forecast_dates(self):
        self.assertEqual(u.spanish_date("jueves, 1 de enero", dt.date(2026, 12, 31)), dt.date(2027, 1, 1))

    def test_forecast_retains_qualitative_precipitation_and_null_amount(self):
        text = """<span class='nameCity'><a href='?p=pronostico-detalle&dp=20&localidad=0050'>PIURA - PIURA</a></span>
        <div class='row m-3'><div class='col-sm-3'>jueves, 22 de octubre</div>
        <div class='col-sm-1 text-danger'><strong>34&ordm;C</strong></div>
        <div class='col-sm-1 text-primary'><strong>24&ordm;C</strong></div>
        <div class='col-sm-6'>Cielo nublado con lluvia ligera.</div></div><div class='clearfix'></div>"""
        rows, rejected = u.parse_forecasts(text, dt.date(2026, 10, 22))
        self.assertEqual(rejected, [])
        self.assertEqual(rows[0]["tmax_c"], 34)
        self.assertIsNone(rows[0]["precipitation_mm"])
        self.assertIsNone(rows[0]["precipitation_probability"])
        self.assertEqual(rows[0]["description"], "Cielo nublado con lluvia ligera.")
        with self.assertRaises(ValueError):
            u.parse_forecasts(text.replace("34&ordm;C", "14&ordm;C"), dt.date(2026, 10, 22))

    def test_corrupt_source_does_not_overwrite_last_good(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(u, "DATA", Path(tmp)):
                path = u.source_path("noaa_weekly")
                u.write_atomic(path, {"meta": {"data_sha256": "retained"}, "data": [{"date": "2026-10-14"}]})
                before = path.read_bytes()
                previous = {"last_success": u.NOW, "records": 2355, "latest_date": "2026-10-14"}
                with patch.dict(u.COLLECTORS, {"noaa_weekly": lambda f: (_ for _ in ()).throw(ValueError("Invalid source"))}):
                    _, state, quality = u.update_source("noaa_weekly", previous)
                self.assertEqual(path.read_bytes(), before)
                self.assertEqual(state["status"], "degraded")
                self.assertTrue(quality["retained_previous"])

    def test_arcgis_rejects_incomplete_pagination(self):
        class Fake:
            def __init__(self): self.calls = 0
            def json(self, url):
                self.calls += 1
                return {"count": 2} if self.calls == 1 else {"features": [{"attributes": {"objectid": 1}}]} if self.calls == 2 else {"features": []}
        with self.assertRaisesRegex(ValueError, "Paginación"):
            u.arcgis_all(Fake(), 8)

    def test_arcgis_rejects_repeated_objects(self):
        class Fake:
            def __init__(self): self.calls = 0
            def json(self, url):
                self.calls += 1
                return {"count": 2} if self.calls == 1 else {"features": [{"attributes": {"objectid": 1}}, {"attributes": {"objectid": 1}}]}
        with self.assertRaisesRegex(ValueError, "repitió"):
            u.arcgis_all(Fake(), 8)

    def test_data_freshness_is_not_reset_by_recent_fetch(self):
        source = {"last_success": u.NOW, "latest_date": "2020-01-01"}
        self.assertEqual(u.freshness(source, u.SOURCES["noaa_weekly"]), "stale")

    def test_schedule_does_not_skip_a_window_for_runner_jitter(self):
        with patch.object(u, "NOW", "2026-10-23T00:27:05+00:00"):
            self.assertTrue(u.source_due({"last_success": "2026-10-22T18:27:10+00:00"}, 6))
            self.assertFalse(u.source_due({"last_success": "2026-10-23T00:05:00+00:00"}, 6))

    def test_sha_detects_changed_data(self):
        self.assertNotEqual(u.digest([{"value": 1}]), u.digest([{"value": 2}]))

    def test_archive_preserves_a_revision_that_reverts_to_previous_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(u, "DATA", Path(tmp)):
                for hour, value in [(10, 22), (11, 23), (12, 22)]:
                    moment = f"2026-10-22T{hour}:00:00+00:00"
                    rows = [{"valid_date": "2026-10-24", "tmax_c": value}]
                    envelope = {"meta": {"fetched_at": moment, "data_sha256": u.digest(rows)}, "data": rows}
                    with patch.object(u, "NOW", moment):
                        u.archive_forecast(envelope)
                index = u.load(Path(tmp) / "forecast_history.json")
                self.assertEqual(len(index["versions"]), 3)

    def test_actual_downloads_have_valid_integrity(self):
        if not (u.DATA / "manifest.json").exists():
            self.skipTest("Primera adquisición aún no ejecutada")
        self.assertGreaterEqual(u.validate_files(), 1)


if __name__ == "__main__":
    unittest.main()
