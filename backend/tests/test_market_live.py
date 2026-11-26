"""국제 실시간 시세(live.py). 바깥 호출(_get)은 가짜로 바꿔 끼운다."""
import pytest

from app.features.market import live
from tests.conftest import H


def chart(price, prev, closes=(1.0, None, 2.0), opens=(10.0,), stamps=(1793775600, 1793775900, 1793776200)):
    return {"meta": {"regularMarketPrice": price, "chartPreviousClose": prev, "regularMarketDayHigh": price + 1,
                     "regularMarketDayLow": prev - 1, "fiftyTwoWeekHigh": 9999, "fiftyTwoWeekLow": 1,
                     "regularMarketTime": 1793837960, "fullExchangeName": "COMEX", "currency": "USD"},
            "timestamp": list(stamps), "indicators": {"quote": [{"close": list(closes), "open": list(opens)}]}}


@pytest.fixture
def fake(monkeypatch):
    calls = []
    data = {"KRW=X": chart(1400.0, 1390.0), "ALI=F": chart(3000.0, 2900.0), "HG=F": chart(5.0, 5.0), "HRC=F": chart(1000.0, 1000.0)}

    def get(symbol, range_):
        calls.append((symbol, range_))
        if data.get(symbol) is None:
            raise live.LiveError("down")
        return data[symbol]

    live._cache.clear()
    live._failed.clear()
    monkeypatch.setattr(live, "_get", get)
    return data, calls


def company(client):
    return client.post("/v1/companies", json={"name": "구매", "role": "recycler", "biz_no": "1", "lat": 36.1, "lon": 128.4}).json()["id"]


def test_quotes_convert_to_won_per_kg_and_cache(client, fake):
    data, calls = fake
    cid = company(client)
    body = client.get("/v1/market/live", headers=H(cid)).json()
    alu = next(q for q in body["quotes"] if q["symbol"] == "ALI=F")
    assert alu["change"] == 100.0 and alu["change_pct"] == 3.45
    assert alu["krw_per_kg"] == 4200.0                       # 3000 USD/톤 × 1400원 ÷ 1000kg
    assert alu["open"] == 10.0 and alu["exchange"] == "COMEX"
    assert body["fx"]["krw_per_usd"] == 1400.0
    n = len(calls)
    client.get("/v1/market/live", headers=H(cid))
    assert len(calls) == n                                    # 1분 안에는 다시 부르지 않음


def test_failure_uses_last_value_then_503(client, fake, monkeypatch):
    data, _ = fake
    cid = company(client)
    client.get("/v1/market/live", headers=H(cid))
    monkeypatch.setattr(live, "SHORT_TTL", -1)                # 캐시 만료
    data["ALI=F"] = None
    alu = next(q for q in client.get("/v1/market/live", headers=H(cid)).json()["quotes"] if q["symbol"] == "ALI=F")
    assert alu["stale"] is True and alu["price"] == 3000.0    # 직전 값
    live._cache.clear()
    live._failed.clear()
    for s in list(data):
        data[s] = None
    assert client.get("/v1/market/live", headers=H(cid)).status_code == 503


def test_cooldown_after_failure(client, fake):
    data, calls = fake
    cid = company(client)
    data["HG=F"] = None
    client.get("/v1/market/live", headers=H(cid))
    n = calls.count(("HG=F", "1d"))
    data["HG=F"] = chart(5.0, 5.0)
    body = client.get("/v1/market/live", headers=H(cid)).json()
    assert calls.count(("HG=F", "1d")) == n                   # 실패 직후에는 다시 두드리지 않음
    assert "error" in next(q for q in body["quotes"] if q["symbol"] == "HG=F")


def test_chart_points_skip_gaps_and_validate(client, fake):
    cid = company(client)
    body = client.get("/v1/market/live/ALI=F?range=1mo", headers=H(cid)).json()
    assert [p["price"] for p in body["points"]] == [1.0, 2.0]   # 빈 값(None)은 뺀다
    assert body["range"] == "1mo" and body["range_change_pct"] == 299900.0
    assert client.get("/v1/market/live/BTC-USD", headers=H(cid)).status_code == 404
    assert client.get("/v1/market/live/ALI=F?range=2d", headers=H(cid)).status_code == 400


def test_one_day_change_uses_previous_close(client, fake):
    cid = company(client)
    body = client.get("/v1/market/live/ALI=F?range=1d", headers=H(cid)).json()
    assert body["range_change_pct"] == body["change_pct"] == 3.45   # 3000 vs 전일 2900
