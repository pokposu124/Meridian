#!/usr/bin/env python3
"""Collect unauthenticated public quotes for a personal delayed-data dashboard."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class RateLimited(Exception):
    pass


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if math.isfinite(value) else None


def aggregate(bars, interval):
    buckets = {}
    for bar in bars:
        date = datetime.strptime(bar['date'], '%Y-%m-%d').date()
        key = date.isocalendar()[:2] if interval == 'W' else (date.year, date.month)
        if key not in buckets:
            buckets[key] = dict(bar)
        else:
            target = buckets[key]
            target['high'] = max(target['high'], bar['high'])
            target['low'] = min(target['low'], bar['low'])
            target['close'] = bar['close']
            target['volume'] += bar['volume']
    return list(buckets.values())


def parse_chart(payload, fetched_at):
    chart = payload.get('chart', {})
    results = chart.get('result')
    if chart.get('error') or not results:
        raise ValueError('공개 데이터에서 종목을 찾지 못했습니다.')
    result = results[0]
    meta = result.get('meta', {})
    try:
        zone = ZoneInfo(meta.get('exchangeTimezoneName', 'UTC'))
    except (ZoneInfoNotFoundError, ValueError):
        zone = timezone.utc
    timestamps = result.get('timestamp', [])
    quotes = result.get('indicators', {}).get('quote', [])
    if not quotes:
        raise ValueError('가격 이력이 없습니다.')
    raw = quotes[0]
    bars = {}
    for i, timestamp in enumerate(timestamps):
        values = {key: number(raw.get(key, [])[i]) if i < len(raw.get(key, [])) else None for key in ['open', 'high', 'low', 'close', 'volume']}
        if number(timestamp) is None or any(values[key] is None for key in ['open', 'high', 'low', 'close']):
            continue
        if values['low'] <= 0 or values['high'] < max(values['open'], values['close']) or values['low'] > min(values['open'], values['close']):
            continue
        date = datetime.fromtimestamp(timestamp, zone).date().isoformat()
        bars[date] = {'date': date, 'time': int(datetime.strptime(date, '%Y-%m-%d').replace(tzinfo=timezone.utc).timestamp()*1000), **values}
        bars[date]['volume'] = max(0, values['volume'] or 0)
    ordered = [bars[key] for key in sorted(bars)]
    if not ordered:
        raise ValueError('유효한 가격 이력이 없습니다.')
    price, price_time = number(meta.get('regularMarketPrice')), number(meta.get('regularMarketTime'))
    if price is None or price <= 0 or price_time is None:
        price = ordered[-1]['close']
        price_time = ordered[-1]['time']/1000
        previous = ordered[-2]['close'] if len(ordered) > 1 else None
    else:
        price_date = datetime.fromtimestamp(price_time, zone).date().isoformat()
        prior = [bar for bar in ordered if bar['date'] < price_date]
        previous = prior[-1]['close'] if prior else None
    change = price - previous if previous else None
    return {
        'source': 'Yahoo Finance public chart endpoint',
        'feedSymbol': str(meta.get('symbol', '')),
        'exchange': str(meta.get('fullExchangeName') or meta.get('exchangeName', '')),
        'instrumentType': str(meta.get('instrumentType', '')),
        'currency': str(meta.get('currency', '')),
        'fetchedAt': fetched_at,
        'quote': {'price': price, 'change': change, 'percent': change/previous*100 if previous else None, 'currency': str(meta.get('currency', '')), 'timestamp': int(price_time), 'date': datetime.fromtimestamp(price_time, timezone.utc).strftime('%Y-%m-%d %H:%M UTC'), 'open': None},
        'series': {'D': ordered[-180:], 'W': aggregate(ordered, 'W')[-180:], 'M': aggregate(ordered, 'M')[-180:]},
    }


def fetch_chart(symbol):
    url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + quote(symbol, safe='') + '?' + urlencode({'interval': '1d', 'range': '10y', 'events': 'history'})
    request = Request(url, headers={'User-Agent': 'Meridian-Personal-Dashboard/1.0', 'Accept': 'application/json'})
    try:
        with urlopen(request, timeout=12) as response:
            return json.load(response)
    except HTTPError as error:
        if error.code == 429:
            raise RateLimited('데이터 제공처의 호출 한도로 수집을 중단했습니다.') from error
        raise ValueError(f'공개 시세 응답 오류 ({error.code})') from error
    except (URLError, TimeoutError, json.JSONDecodeError) as error:
        raise ValueError('공개 시세 서버에 연결하지 못했습니다.') from error


def collect(universe, output, fetcher=fetch_chart, delay=.4):
    output.mkdir(parents=True, exist_ok=True)
    manifest_path = output / 'manifest.json'
    old = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'instruments': {}}
    fetched_at = datetime.now(timezone.utc).isoformat(timespec='seconds')
    manifest = {'version': 1, 'generatedAt': fetched_at, 'source': 'Yahoo Finance public chart endpoint', 'refreshMinutes': 30, 'instruments': {}}
    successful, limited, by_symbol = 0, False, {}
    for item in universe['instruments']:
        identity, symbol = item['id'], item['symbol']
        filename = hashlib.sha256(identity.encode()).hexdigest()[:24] + '.json'
        target = output / filename
        previous = old.get('instruments', {}).get(identity)
        try:
            if limited:
                raise ValueError('호출 한도로 이번 갱신에서 제외되었습니다.')
            if symbol not in by_symbol:
                by_symbol[symbol] = parse_chart(fetcher(symbol), fetched_at)
                if delay:
                    time.sleep(delay)
            data = by_symbol[symbol]
            target.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False))
            manifest['instruments'][identity] = {'file': filename, 'name': item['name'], 'symbol': symbol, 'status': 'ok', 'fetchedAt': fetched_at, 'quoteTime': data['quote']['timestamp']}
            successful += 1
            print(f'OK {identity} ({symbol})')
        except (ValueError, RateLimited) as error:
            if isinstance(error, RateLimited):
                limited = True
            if previous and (output / previous.get('file', '')).is_file():
                manifest['instruments'][identity] = {**previous, 'status': 'stale', 'error': str(error), 'attemptedAt': fetched_at}
            else:
                manifest['instruments'][identity] = {'name': item['name'], 'symbol': symbol, 'status': 'unavailable', 'error': str(error), 'attemptedAt': fetched_at}
            print(f'UNAVAILABLE {identity}: {error}')
    manifest['successful'] = successful
    if successful == 0 and not any(item.get('file') for item in manifest['instruments'].values()):
        raise ValueError('공개 소스에서 데이터를 수집하지 못했습니다. 빈 가격 데이터를 배포하지 않습니다.')
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False)+'\n')
    print(f'Collected {successful}/{len(universe["instruments"])} instruments')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--universe', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    collect(json.loads(Path(args.universe).read_text()), Path(args.output))
