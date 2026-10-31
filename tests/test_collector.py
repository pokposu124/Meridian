import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

path = Path(__file__).resolve().parents[1] / 'scripts' / 'update_market_data.py'
spec = importlib.util.spec_from_file_location('collector', path)
C = importlib.util.module_from_spec(spec)
spec.loader.exec_module(C)


def payload():
    return {'chart': {'error': None, 'result': [{'meta': {'symbol': 'TEST', 'currency': 'USD', 'exchangeTimezoneName': 'UTC', 'regularMarketPrice': 12, 'regularMarketTime': 1704326400, 'chartPreviousClose': 2}, 'timestamp': [1704067200, 1704153600, 1704240000], 'indicators': {'quote': [{'open': [9, 10, 11], 'high': [11, 12, 13], 'low': [8, 9, 10], 'close': [10, 11, 12], 'volume': [1, 2, 3]}]}}]}}


class CollectorTests(unittest.TestCase):
    def test_previous_close_is_previous_session_not_chart_window_start(self):
        data = C.parse_chart(payload(), '2024-01-04T00:00:00Z')
        self.assertEqual(data['quote']['change'], 0)
        self.assertEqual(data['series']['D'][-1]['close'], 12)

    def test_aggregation_uses_first_open_high_low_last_close_and_volume(self):
        data = C.parse_chart(payload(), '2024-01-04T00:00:00Z')
        bar = data['series']['W'][0]
        self.assertEqual((bar['open'], bar['high'], bar['low'], bar['close'], bar['volume']), (9, 13, 8, 12, 6))

    def test_null_price_rows_are_dropped(self):
        raw = payload()
        raw['chart']['result'][0]['indicators']['quote'][0]['close'][1] = None
        self.assertEqual(len(C.parse_chart(raw, 'now')['series']['D']), 2)

    def test_failed_refresh_preserves_valid_data_and_marks_stale(self):
        universe = {'instruments': [{'id': 'TEST:A', 'symbol': 'TEST', 'name': 'test'}]}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initial = C.collect(universe, root, fetcher=lambda symbol: payload(), delay=0)
            file = root / initial['instruments']['TEST:A']['file']
            before = file.read_bytes()
            def fail(symbol):
                raise ValueError('Unavailable')
            updated = C.collect(universe, root, fetcher=fail, delay=0)
            self.assertEqual(file.read_bytes(), before)
            self.assertEqual(updated['instruments']['TEST:A']['status'], 'stale')

    def test_no_data_does_not_publish_a_fake_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def fail(symbol):
                raise ValueError('Unavailable')
            with self.assertRaises(ValueError):
                C.collect({'instruments': [{'id': 'A', 'symbol': 'A', 'name': 'A'}]}, root, fetcher=fail, delay=0)
            self.assertFalse((root / 'manifest.json').exists())

    def test_rate_limit_stops_remaining_requests(self):
        calls = []
        def limited(symbol):
            calls.append(symbol)
            raise C.RateLimited('Limited')
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                C.collect({'instruments': [{'id': 'A', 'symbol': 'A', 'name': 'A'}, {'id': 'B', 'symbol': 'B', 'name': 'B'}]}, Path(directory), fetcher=limited, delay=0)
        self.assertEqual(calls, ['A'])


if __name__ == '__main__':
    unittest.main()
