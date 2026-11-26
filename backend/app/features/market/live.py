"""국제 원자재 실시간 시세. Yahoo Finance chart API(키 없음, 공식 계약 없는 공개 엔드포인트)를 서버에서 불러 짧게 캐시한다.

2026-11-05 확인: ALI=F(COMEX 알루미늄 선물, USD/톤)·HG=F(COMEX 구리, USD/파운드)·HRC=F(미국 열연강판, USD/숏톤)·KRW=X(원/달러)가
`/v8/finance/chart/{심볼}?range=&interval=` 로 응답한다. meta에 regularMarketPrice·chartPreviousClose·regularMarketDayHigh/Low·
fiftyTwoWeekHigh/Low·regularMarketTime, indicators.quote[0]에 open·close가 있다. 짧은 시간에 여러 번 부르면 빈 응답이 오므로
(같은 날 확인) 캐시하고, 실패하면 직전 값을 stale=true로 돌려준다. 거래소 시세라 수 분 지연될 수 있다.
국내 재활용 원료 가격(한국환경공단 월간, service.py)과는 다른 값이다: 이쪽은 국제 선물 가격을 참고 지표로 보여준다.
"""
import threading
import time
from datetime import datetime, timezone

import httpx


HOSTS = ("https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com")


# 심볼 → 화면 이름, 거래 단위, 단위당 kg(원/kg 환산용)
SYMBOLS = {
    "ALI=F": {"item": "알루미늄", "unit": "USD/t", "kg": 1000.0, "material": "알루미늄"},
    "HG=F": {"item": "구리", "unit": "USD/파운드", "kg": 0.45359237, "material": "구리"},
    "HRC=F": {"item": "열연강판(미국)", "unit": "USD/short t", "kg": 907.18474, "material": "철"},
}


FX = "KRW=X"


# 화면 기간 → Yahoo 간격
RANGES = {"1d": "5m", "5d": "30m", "1mo": "1d", "3mo": "1d", "6mo": "1d", "1y": "1d", "5y": "1wk"}


SHORT_TTL, LONG_TTL = 60, 15 * 60   # 1일·1주는 1분, 그 밖은 15분


COOLDOWN = 20   # 실패한 뒤 이 초 동안은 다시 부르지 않는다(막힌 상태에서 계속 두드리면 더 오래 막힘)


class LiveError(Exception):
    pass


_cache: dict[tuple[str, str], tuple[float, dict]] = {}
_failed: dict[tuple[str, str], float] = {}
_lock = threading.Lock()


def _get(symbol: str, range_: str) -> dict:
    """Yahoo 응답 JSON의 chart.result[0]. 테스트는 이 함수를 바꿔 끼운다."""
    last = ""
    for host in HOSTS:
        try:
            r = httpx.get(f"{host}/v8/finance/chart/{symbol}", params={"range": range_, "interval": RANGES[range_]},
                          headers={"User-Agent": "Mozilla/5.0"}, timeout=6)
            r.raise_for_status()
            return r.json()["chart"]["result"][0]
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as e:
            last = type(e).__name__
    raise LiveError(f"시세 서버 응답 없음({last})")


def _chart(symbol: str, range_: str) -> tuple[dict, bool]:
    """(chart.result[0], stale). 캐시가 살아 있으면 그대로, 실패하면 직전 값."""
    key, ttl = (symbol, range_), SHORT_TTL if range_ in ("1d", "5d") else LONG_TTL
    with _lock:
        hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1], False
    if time.time() - _failed.get(key, 0) < COOLDOWN:
        if hit:
            return hit[1], True
        raise LiveError("시세 서버가 잠시 응답하지 않음, 잠시 후 다시 불러옴")
    try:
        data = _get(symbol, range_)
    except LiveError:
        with _lock:
            _failed[key] = time.time()
        if hit:
            return hit[1], True
        raise
    with _lock:
        _cache[key] = (time.time(), data)
        _failed.pop(key, None)
    return data, False


def _iso(epoch: int | None) -> str | None:
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat() if epoch else None


def _quote(symbol: str, chart: dict, fx: float | None) -> dict:
    m, info = chart["meta"], SYMBOLS.get(symbol, {"item": symbol, "unit": "", "kg": None, "material": None})
    price, prev = m.get("regularMarketPrice"), m.get("chartPreviousClose") or m.get("previousClose")
    opens = [o for o in (chart.get("indicators", {}).get("quote") or [{}])[0].get("open") or [] if o is not None]
    change = round(price - prev, 4) if price is not None and prev else None
    return {
        "symbol": symbol, "item": info["item"], "material": info["material"], "unit": info["unit"],
        "name": m.get("shortName"), "exchange": m.get("fullExchangeName") or m.get("exchangeName"),
        "currency": m.get("currency"), "price": price, "prev_close": prev, "change": change,
        "change_pct": round(change / prev * 100, 2) if change is not None else None,
        "open": opens[0] if opens else None, "day_high": m.get("regularMarketDayHigh"), "day_low": m.get("regularMarketDayLow"),
        "week52_high": m.get("fiftyTwoWeekHigh"), "week52_low": m.get("fiftyTwoWeekLow"),
        "volume": m.get("regularMarketVolume"), "market_time": _iso(m.get("regularMarketTime")),
        "krw_per_kg": round(price * fx / info["kg"], 1) if price and fx and info["kg"] else None,
    }


def _fx() -> tuple[float | None, bool]:
    try:
        chart, stale = _chart(FX, "1d")
        return chart["meta"].get("regularMarketPrice"), stale
    except LiveError:
        return None, True


def live_quotes() -> dict:
    """품목별 현재가. 한 품목이 실패해도 나머지는 보여준다(error 칸)."""
    fx, fx_stale = _fx()
    out = []
    for symbol in SYMBOLS:
        try:
            chart, stale = _chart(symbol, "1d")
            out.append({**_quote(symbol, chart, fx), "stale": stale})
        except LiveError as e:
            out.append({"symbol": symbol, "item": SYMBOLS[symbol]["item"], "error": str(e)})
    if all("error" in q for q in out):
        raise LiveError("실시간 시세를 불러오지 못함")
    return {"fx": {"symbol": FX, "krw_per_usd": fx, "stale": fx_stale}, "quotes": out,
            "source": "Yahoo Finance(거래소 시세, 지연될 수 있음)"}


def live_chart(symbol: str, range_: str) -> dict:
    """기간별 종가 선. 1일 차트의 전일 종가는 기준선으로 쓴다."""
    chart, stale = _chart(symbol, range_)
    today, _ = _chart(symbol, "1d") if range_ != "1d" else (chart, stale)
    fx, _ = _fx()
    closes = (chart.get("indicators", {}).get("quote") or [{}])[0].get("close") or []
    points = [{"t": _iso(t), "price": round(c, 4)} for t, c in zip(chart.get("timestamp") or [], closes) if c is not None]
    q = _quote(symbol, today, fx)
    first = q["prev_close"] if range_ == "1d" else points[0]["price"] if points else None   # 1일은 전일 종가 기준(머리 등락과 같게)
    return {**q, "range": range_, "points": points, "stale": stale,
            "range_change_pct": round((q["price"] - first) / first * 100, 2) if first and q["price"] else None}
