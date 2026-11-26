"""판매자 가입, 회사 정보의 '나오는 부산물'(돈이 되는 품목 추천의 바탕)."""
import pytest

from tests.test_signup_auth import _clean, bearer, body, signup  # noqa: F401  (가입 제한 초기화 fixture를 이 파일에도 적용)
from tests.test_app_features import _close_db_sessions  # noqa: F401

ROWS = [{"code": "51-03-01", "material": "PP", "monthly_kg": 3000},
        {"code": "51-29-01", "material": "철"},
        {"code": "51-03-01", "material": " pp ", "monthly_kg": 500}]


@pytest.fixture(autouse=True)
def _approve(monkeypatch):
    monkeypatch.setenv("AUTO_APPROVE_SIGNUP", "1")


def test_factory_signup_saves_byproducts_once_each(client):
    r = signup(client, role="factory", n=1, byproducts=ROWS)
    assert r.status_code == 201
    got = client.get("/v1/me/profile", headers=bearer(client)).json()["byproducts"]
    # 같은 품목, 재질(대소문자, 앞뒤 공백 무시)은 한 번만, 뒤에 온 발생량
    assert got == [{"code": "51-03-01", "material": "pp", "monthly_kg": 500}, {"code": "51-29-01", "material": "철", "monthly_kg": None}]


def test_signup_without_byproducts_is_fine(client):
    assert signup(client, role="factory", n=2).status_code == 201
    assert client.get("/v1/me/profile", headers=bearer(client, "user2@example.com")).json()["byproducts"] == []


def test_seller_only_needs_account_business_and_address(client):
    data = body(n=7, byproducts=ROWS[:2])
    data.pop("phone")
    data.pop("industry")
    assert client.post("/v1/signup", json=data).status_code == 201
    profile = client.get("/v1/me/profile", headers=bearer(client, "user7@example.com")).json()
    assert profile["phone"] is None
    assert [row["material"] for row in profile["byproducts"]] == ["PP", "철"]


def test_buyer_still_needs_phone(client):
    data = body(role="recycler", n=8)
    data.pop("phone")
    result = client.post("/v1/signup", json=data)
    assert result.status_code == 400
    assert "전화번호" in result.text


def test_id_only_signup_and_login_without_email_or_region(client):
    for n in (20, 21):
        data = body(n=n, login_id=f"factory_{n}", byproducts=ROWS[:2])
        for key in ("email", "phone", "industry"):
            data.pop(key)
        response = client.post("/v1/signup", json=data)
        assert response.status_code == 201, response.text
        profile = client.get("/v1/me/profile", headers=bearer(client, f"factory_{n}")).json()
        assert profile["region"] == "경북 구미"
        assert len(profile["byproducts"]) == 2
    data.update(login_id=" Factory_20 ", biz_no="222-22-22222")
    assert client.post("/v1/signup", json=data).status_code == 409


def test_signup_needs_an_account_identifier(client):
    data = body(n=22)
    data.pop("email")
    assert client.post("/v1/signup", json=data).status_code == 400


def test_home_recommendations_use_only_this_factory_and_follow_edits(client, monkeypatch):
    from app.features.seller import service
    monkeypatch.setattr(service, "latest_prices", lambda: (
        {"item": "PP 압축", "price": 300, "unit": "원/kg", "date": "2026-10", "change_pct": 5.0},
        {"item": "PE 압축", "price": 500, "unit": "원/kg", "date": "2026-10", "change_pct": 30.0},
        {"item": "철스크랩", "price": 200, "unit": "원/kg", "date": "2026-10", "change_pct": -2.0},
    ))
    rows = [{"code": "51-03-01", "material": "PP"}, {"code": "51-29-01", "material": "철"},
            {"code": "51-99-00", "material": "공정 부산물"}]
    assert signup(client, n=30, byproducts=rows).status_code == 201
    assert signup(client, n=31, byproducts=[{"code": "51-03-01", "material": "PE"}]).status_code == 201
    h = bearer(client, "user30@example.com")
    get = lambda headers: client.get("/v1/seller/home", headers=headers).json()["byproduct_recommendations"]
    got = get(h)
    # 발생량 없이 kg당 시세가 높은 순, 시세가 없으면 맨 뒤
    assert [row["material"] for row in got] == ["PP", "철", "공정 부산물"]
    assert got[0]["market"]["price"] == 300 and got[0]["top"] and "가장 비싼" in got[0]["reason"]
    assert got[1]["verdict"] == "sell" and not got[1].get("top")
    assert got[2]["market"] is None and got[2]["verdict"] == "quote" and "견적 확인 필요" in got[2]["reason"]
    assert [row["material"] for row in get(bearer(client, "user31@example.com"))] == ["PE"]
    assert client.patch("/v1/me/profile", headers=h, json={"byproducts": rows[1:2]}).status_code == 200
    assert [row["material"] for row in get(h)] == ["철"]
    client.patch("/v1/me/profile", headers=h, json={"byproducts": []})
    assert get(h) == []


def test_cheap_items_point_to_pooling_unless_someone_wants_them(client, monkeypatch):
    from app.features.seller import service
    from tests.conftest import H, mk_company
    monkeypatch.setattr(service, "latest_prices", lambda: (
        {"item": "폐골판지", "price": 92.9, "unit": "원/kg", "date": "2026-09", "change_pct": 1.9},
        {"item": "폐신문지", "price": 125.7, "unit": "원/kg", "date": "2026-09", "change_pct": -0.2},
        {"item": "철스크랩", "price": 358.9, "unit": "원/kg", "date": "2026-09", "change_pct": -4.7},
    ))
    rows = [{"code": "51-28-02", "material": "골판지"}, {"code": "51-28-02", "material": "신문지"}, {"code": "51-29-01", "material": "철"}]
    assert signup(client, n=33, byproducts=rows).status_code == 201
    get = lambda: {r["material"]: r for r in client.get("/v1/seller/home", headers=bearer(client, "user33@example.com")).json()["byproduct_recommendations"]}  # noqa: E731
    got = get()
    # 시세가 오른 골판지라도 단가가 낮고 사려는 곳이 없으면 판매 추천이 아니라 공동판매, 소각비 안내
    assert got["골판지"]["verdict"] == "bundle" and "공동판매" in got["골판지"]["reason"] and "소각하면 톤당" in got["골판지"]["reason"]
    assert got["철"]["verdict"] == "sell" and got["철"]["top"]
    op = mk_company(client, "운영", "operator")
    buyers = [mk_company(client, f"구매 회사 {i}", "recycler", permit_no=f"R{i}", permit_codes=["51-28-02"]) for i in range(2)]
    for b in buyers:
        assert client.post(f"/v1/admin/companies/{b}/verify", json={}, headers=H(op)).status_code == 200
    want = {"material": "골판지", "item": "압축 골판지", "waste_code": "51-28-02", "qty_kg": 1000}
    for b in buyers:
        assert client.post("/v1/buy-requests", headers=H(b), json=want).status_code == 201
    client.post("/v1/buy-requests", headers=H(buyers[0]), json=want)   # 같은 구매자는 한 번만 센다
    got = get()
    assert got["골판지"]["verdict"] == "sell" and got["골판지"]["wants"] == 2 and "구매 희망 2곳" in got["골판지"]["reason"]
    assert got["신문지"]["verdict"] == "bundle" and got["신문지"]["wants"] == 0


def test_nonferrous_metals_use_international_prices_without_inflating_alloys(client, monkeypatch):
    from app.features.seller import service
    from app.tools.data import load_json
    monkeypatch.setattr(service, "latest_prices", lambda: (
        {"item": "PP 압축", "price": 377.6, "unit": "원/kg", "date": "2026-09", "change_pct": 1.0},
    ))
    rows = [{"code": "51-03-01", "material": "PP"}, {"code": "51-29-02", "material": "스테인리스"},
            {"code": "51-29-02", "material": "황동"}, {"code": "51-29-02", "material": "구리"}]
    assert signup(client, n=34, byproducts=rows).status_code == 201
    got = client.get("/v1/seller/home", headers=bearer(client, "user34@example.com")).json()["byproduct_recommendations"]
    copper = max((r for r in load_json("metal_prices.json")["rows"] if r["metal"] == "구리"), key=lambda r: r["month"])
    # 구리는 국제 가격(원/kg)을 그대로, 합금은 숫자 없이 기준 금속만. 순서는 구리, 황동(구리 60%), 스테인리스(니켈 8%), PP
    assert [r["material"] for r in got] == ["구리", "황동", "스테인리스", "PP"]
    assert got[0]["market"]["intl"] and got[0]["market"]["price"] == round(copper["krw_per_kg"]) and got[0]["top"]
    assert got[0]["market"]["source_id"] == "D3-METAL" and "스크랩 매입가는" in got[0]["market"]["basis"]
    for r in got[1:3]:
        assert r["market"] is None and r["reference"]["alloy"] and r["verdict"] == "sell" and "가격 연동" in r["reason"]
    assert got[1]["reference"]["metal"] == "구리" and got[2]["reference"]["metal"] == "니켈"
    assert "크게 낮음" in got[2]["reference"]["basis"]


@pytest.mark.parametrize("change", [None, 0])
def test_home_recommendations_do_not_claim_an_increase_without_one(client, monkeypatch, change):
    from app.features.seller import service
    monkeypatch.setattr(service, "latest_prices", lambda: (
        {"item": "PP 압축", "price": 300, "unit": "원/kg", "date": "2026-10", "change_pct": change},
    ))
    signup(client, n=32, byproducts=ROWS[:1])
    rows = client.get("/v1/seller/home", headers=bearer(client, "user32@example.com")).json()["byproduct_recommendations"]
    assert len(rows) == 1 and "상승" not in rows[0]["reason"]


def test_recycler_byproducts_are_not_stored(client):
    assert signup(client, role="recycler", n=3, byproducts=ROWS[:1]).status_code == 201
    assert client.get("/v1/me/profile", headers=bearer(client, "user3@example.com")).json()["byproducts"] == []


@pytest.mark.parametrize("bad", [
    [{"code": "99-99-99", "material": "PP"}],            # 없는 폐기물 코드
    [{"code": "51-03-01", "material": ""}],              # 재질 빈칸
    [{"code": "51-03-01", "material": "PP", "monthly_kg": -1}],
    [{"code": "51-03-01", "material": f"M{i}"} for i in range(21)],   # 20개 넘음
])
def test_bad_byproducts_rejected(client, bad):
    assert client.post("/v1/signup", json=body(n=4, byproducts=bad)).status_code in (400, 422)


def test_seller_can_edit_and_clear_byproducts(client):
    signup(client, role="factory", n=5)
    h = bearer(client, "user5@example.com")
    r = client.patch("/v1/me/profile", json={"byproducts": [{"code": "51-28-02", "material": "골판지", "monthly_kg": 12000}]}, headers=h)
    assert r.status_code == 200 and r.json()["byproducts"][0]["material"] == "골판지"
    assert client.patch("/v1/me/profile", json={"byproducts": []}, headers=h).json()["byproducts"] == []


def test_buyer_cannot_set_byproducts(client):
    signup(client, role="recycler", n=6)
    h = bearer(client, "user6@example.com")
    assert client.patch("/v1/me/profile", json={"byproducts": ROWS[:1]}, headers=h).status_code == 403
