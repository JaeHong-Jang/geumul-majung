"""판매자 앱 전 기능(ARCHITECTURE §13): 증빙·승인, 공동판매, 재활용업체, 대화, 사진, 판매 수정."""
import base64
import datetime as dt
from concurrent.futures import ThreadPoolExecutor

import pytest

from app.db.models import Bag, Listing, Notification, Pool, PoolMember
from tests.conftest import PG_URL, H, mk_company
from tests.test_app_features import (CODE, PNG, _close_db_sessions, buy, db, deliver, sell, weights, world)  # noqa: F401
from tests.test_signup_auth import PW, bearer, signup

IRON = "51-29-01"
PDF = base64.b64encode(b"%PDF-1.4 test").decode()
FUTURE = (dt.date.today() + dt.timedelta(days=7)).isoformat()


# ── 13.1 증빙·승인 ──
def test_documents_approval_flow_and_unapproved_cannot_trade(client):
    signup(client, n=1)
    op = mk_company(client, "운영", "operator")
    me = bearer(client)
    assert client.get("/v1/me/approval", headers=me).json() == {"status": "pending", "note": None, "missing": []}
    up = client.put("/v1/me/documents", headers=me, json={"kind": "business_license", "content_type": "image/png", "data_base64": PNG})
    assert up.status_code == 200 and set(up.json()) == {"id", "kind", "created_at"}
    pdf = client.put("/v1/me/documents", headers=me, json={"kind": "emitter_report", "content_type": "application/pdf", "data_base64": PDF}).json()
    again = client.put("/v1/me/documents", headers=me, json={"kind": "business_license", "content_type": "image/png", "data_base64": PNG}).json()
    assert [d["kind"] for d in client.get("/v1/me/documents", headers=me).json()] == ["emitter_report", "business_license"]   # 같은 종류는 교체
    assert again["id"] != up.json()["id"]
    got = client.get(f"/v1/documents/{pdf['id']}", headers=me)
    assert got.headers["content-type"] == "application/pdf" and got.headers["x-content-type-options"] == "nosniff"
    assert "attachment" in got.headers["content-disposition"]                                 # PDF는 첨부로
    assert client.get(f"/v1/documents/{pdf['id']}", headers=H(op)).status_code == 200         # 운영자는 확인 가능
    other = mk_company(client, "남", "factory")
    assert client.get(f"/v1/documents/{pdf['id']}", headers=H(other)).status_code == 404
    bad = lambda **b: client.put("/v1/me/documents", headers=me, json={"kind": "business_license", **b}).status_code   # noqa: E731
    assert bad(content_type="image/gif", data_base64=PNG) == 400
    assert bad(content_type="image/png", data_base64=PDF) == 400                               # 형식 위장
    assert bad(content_type="image/png", data_base64="A" * 3_000_000) == 400
    assert client.put("/v1/me/documents", headers=me, json={"kind": "other", "content_type": "image/png", "data_base64": PNG}).status_code == 400
    # 운영자가 보완 요청 → 앱 상태 → 재제출 → 승인
    fid = client.get("/v1/me/profile", headers=me).json()["id"]
    assert client.post(f"/v1/admin/companies/{fid}/request-fix", headers=H(other), json={"note": "x"}).status_code == 403
    assert client.post(f"/v1/admin/companies/{fid}/request-fix", headers=H(op), json={"note": "사업자등록증이 흐립니다", "missing": ["business_license"]}).status_code == 200
    assert client.get("/v1/me/approval", headers=me).json() == {"status": "needs_fix", "note": "사업자등록증이 흐립니다", "missing": ["business_license"]}
    assert client.post("/v1/me/approval/resubmit", headers=me, json={"note": "다시 올렸습니다"}).json() == {"status": "pending"}
    assert client.get("/v1/me/approval", headers=me).json()["status"] == "pending"
    assert client.post("/v1/bags", headers=me, json={"waste_code": CODE, "target_material": "pp", "items": [{"material": "pp", "kg": 10}]}).status_code == 403
    assert client.post(f"/v1/admin/companies/{fid}/verify", headers=H(op), json={}).status_code == 200
    assert client.get("/v1/me/approval", headers=me).json()["status"] == "approved"
    assert client.post("/v1/bags", headers=me, json={"waste_code": CODE, "target_material": "pp", "items": [{"material": "pp", "kg": 10}]}).status_code == 201
    assert client.post(f"/v1/admin/companies/{fid}/request-fix", headers=H(op), json={"note": "x"}).status_code == 409   # 승인된 업체
    assert client.post("/v1/me/approval/resubmit", headers=me, json={}).status_code == 409


def test_profile_new_fields(client):
    w = world(client)
    got = client.patch("/v1/me/profile", headers=H(w["f1"]), json={"name": "새이름", "phone": "010-0000-0000", "industry": "금형",
                                                                "address_detail": "2층", "emitter_report": "대상"}).json()
    assert (got["name"], got["phone"], got["industry"], got["address_detail"], got["emitter_report"]) == ("새이름", "010-0000-0000", "금형", "2층", "대상")
    assert client.patch("/v1/me/profile", headers=H(w["f1"]), json={"terms": "x"}).status_code == 403
    ok = client.patch("/v1/me/profile", headers=H(w["r"]), json={"pickup_method": "방문 수거", "terms": "현금"}).json()
    assert (ok["pickup_method"], ok["terms"]) == ("방문 수거", "현금")


def test_regions_and_waste_codes_are_public(client):
    regions = client.get("/v1/regions").json()
    gumi = next(r for r in regions if r["name"] == "경북 구미")
    assert (gumi["lat"], gumi["lon"]) == (36.12, 128.34) and len(regions) > 20
    assert all(set(r) == {"name", "lat", "lon"} and 33 < r["lat"] < 39 for r in regions)
    codes = client.get("/v1/waste-codes").json()
    assert {"code": CODE, "name": codes[0]["name"]}.keys() == {"code", "name"} and any(c["code"] == CODE for c in codes)
    assert client.get("/v1/me/coupons").status_code == 401
    assert client.get("/v1/me/coupons", headers=H(mk_company(client, "공장", "factory"))).json() == []


# ── 13.2 공동판매 ──
def pool_world(client):
    w = world(client)
    w["f3"] = mk_company(client, "공장3", "factory", region="경북 구미", lat=36.105, lon=128.405)
    return w


def new_pool(client, w, kg=100, price=250.75, target=300, who="f1", **kw):
    _, lid = sell(client, w[who], kg=kg, price=price, mode="bundle")
    res = client.post("/v1/pools", headers=H(w[who]), json={"listing_id": lid, "target_kg": target, "deadline": FUTURE, **kw})
    assert res.status_code == 201, res.text
    return res.json(), lid


def join(client, w, pid, who, kg=100, price=301.25, **kw):
    _, lid = sell(client, w[who], kg=kg, price=price, mode=kw.pop("mode", "bundle"))
    return client.post(f"/v1/pools/{pid}/join", headers=H(w[who]), json={"listing_id": lid}), lid


def status_of(lid):
    return db().get(Listing, lid).status


def test_pool_unified_price_names_hidden_and_auto_post_on_target(client):
    w = pool_world(client)
    pool, l1 = new_pool(client, w, kg=100, price=250.75, target=300)
    assert pool["status"] == "open" and pool["current_kg"] == 100 and pool["factory_count"] == 1 and pool["target_kg"] == 300
    assert pool["applied_price_krw_per_kg"] == pool["min_price_krw_per_kg"] == 250.75 and pool["grade"] == "A" and pool["is_owner"] is True
    assert pool["members"] == [{"name": "공장1", "kg": 100.0, "price_krw_per_kg": 250.75, "mine": True}]
    res, l2 = join(client, w, pool["id"], "f2", kg=100, price=301.25)
    mine2 = res.json()
    assert res.status_code == 200 and mine2["current_kg"] == 200 and mine2["status"] == "open"
    text2 = str(mine2)
    assert "공장1" not in text2 and "공장3" not in text2                                          # 다른 공장 이름 비노출(응답 전체)
    assert [(m["name"], m["price_krw_per_kg"], m["mine"]) for m in mine2["members"]] == [("참여 공장 1", None, False), ("공장2", 301.25, True)]
    mine1 = client.get("/v1/pools?mine=1", headers=H(w["f1"])).json()[0]
    assert "공장2" not in str(mine1) and "301.25" not in str(mine1)                                # 다른 공장 단가 비노출
    assert [(m["name"], m["price_krw_per_kg"]) for m in mine1["members"]] == [("공장1", 250.75), ("참여 공장 1", None)]
    assert mine1["applied_price_krw_per_kg"] == 250.75                                             # 최저 단가로 통일
    assert status_of(l1) == status_of(l2) == "bundle_wait"
    res3, l3 = join(client, w, pool["id"], "f3", kg=120, price=280)                                # 목표(300) 도달
    done = res3.json()
    assert done["status"] == "sold" and done["current_kg"] == 320 and done["applied_price_krw_per_kg"] == 250.75
    for lid in (l1, l2, l3):
        l = db().get(Listing, lid)
        assert l.status == "posted" and l.price_krw_per_kg == 250.75                              # 단가 통일 + 자동 게시
    posted = {i["id"]: i for i in client.get("/v1/listings", headers=H(w["r"])).json()}
    assert {l1, l2, l3} <= set(posted) and {posted[i]["price_krw_per_kg"] for i in (l1, l2, l3)} == {250.75}
    bundle = client.get("/v1/buyer/bundles", headers=H(w["r"])).json()[0]                         # 구매자에게 묶음으로 보임
    assert {l1, l2, l3} <= set(bundle["listing_ids"]) and bundle["seller_count"] == 3
    assert join(client, w, pool["id"], "far")[0].status_code in (400, 409)                        # 끝난 공동판매에는 못 들어감
    late = client.post(f"/v1/pools/{pool['id']}/join", headers=H(w["f3"]), json={"listing_id": l3})
    assert late.status_code == 409


def test_pool_sell_now_and_extend_and_patch(client):
    w = pool_world(client)
    pool, l1 = new_pool(client, w, kg=100, price=260, target=500)
    pid = pool["id"]
    _, l2 = join(client, w, pid, "f2", kg=50, price=270)
    assert client.post(f"/v1/pools/{pid}/deadline", headers=H(w["f1"]), json={"action": "extend"}).status_code == 400   # new_deadline 필수
    assert client.post(f"/v1/pools/{pid}/deadline", headers=H(w["f1"]), json={"action": "extend", "new_deadline": "2020-01-01"}).status_code == 400
    later = (dt.date.today() + dt.timedelta(days=30)).isoformat()
    assert client.post(f"/v1/pools/{pid}/deadline", headers=H(w["f1"]), json={"action": "extend", "new_deadline": later}).json()["deadline"] == later
    assert client.patch(f"/v1/pools/{pid}", headers=H(w["f1"]), json={"target_kg": 200}).json()["target_kg"] == 200
    assert client.patch(f"/v1/pools/{pid}", headers=H(w["f1"]), json={"target_kg": 200}).status_code == 200
    assert client.patch(f"/v1/pools/{pid}", headers=H(w["f1"]), json={"target_kg": 100}).status_code == 400             # 현재 물량 이하
    assert client.patch(f"/v1/pools/{pid}", headers=H(w["f2"]), json={"target_kg": 400}).status_code == 403             # 참여만 한 공장
    assert client.patch(f"/v1/pools/{pid}", headers=H(w["f3"]), json={"target_kg": 400}).status_code == 404             # 관계없는 공장
    assert client.post(f"/v1/pools/{pid}/deadline", headers=H(w["f2"]), json={"action": "sell_now"}).status_code == 403
    sold = client.post(f"/v1/pools/{pid}/deadline", headers=H(w["f1"]), json={"action": "sell_now"}).json()
    assert sold["status"] == "sold" and sold["current_kg"] == 150 and sold["applied_price_krw_per_kg"] == 260
    assert all(db().get(Listing, l).status == "posted" and db().get(Listing, l).price_krw_per_kg == 260 for l in (l1, l2))
    assert client.post(f"/v1/pools/{pid}/deadline", headers=H(w["f1"]), json={"action": "sell_now"}).status_code == 409


def test_pool_cancel_returns_listing_to_posted_and_empty_pool_is_cancelled(client):
    w = pool_world(client)
    pool, l1 = new_pool(client, w, kg=100, price=260, target=500)
    pid = pool["id"]
    res, l2 = join(client, w, pid, "f2", kg=50, price=270)
    left = client.post(f"/v1/pools/{pid}/deadline", headers=H(w["f2"]), json={"action": "cancel"}).json()
    assert left["current_kg"] == 100 and left["status"] == "open" and left["applied_price_krw_per_kg"] == 260   # 최저 단가 재계산
    assert status_of(l2) == "posted"                                                                           # withdrawn이 아님
    assert db().query(PoolMember).filter_by(pool_id=pid).count() == 1
    assert client.post(f"/v1/pools/{pid}/deadline", headers=H(w["f2"]), json={"action": "cancel"}).status_code == 404   # 이미 빠짐
    gone = client.post(f"/v1/pools/{pid}/deadline", headers=H(w["f1"]), json={"action": "cancel"}).json()
    assert gone["status"] == "cancelled" and gone["current_kg"] == 0 and status_of(l1) == "posted"              # 참여자 0 → cancelled
    assert client.post(f"/v1/pools/{pid}/deadline", headers=H(w["f1"]), json={"action": "extend", "new_deadline": FUTURE}).status_code == 409
    assert client.get("/v1/pools", headers=H(w["f2"])).json() == []                                            # 취소된 것은 목록에 없음


def test_pool_join_rejections(client):
    w = pool_world(client)
    pool, l1 = new_pool(client, w, kg=100, price=260, target=500)
    pid = pool["id"]
    # 다른 등급
    _, b_lid = sell(client, w["f2"], kg=92, impure=8, price=200, mode="bundle")
    assert client.post(f"/v1/pools/{pid}/join", headers=H(w["f2"]), json={"listing_id": b_lid}).status_code == 400
    # 다른 폐기물 코드
    bag = client.post("/v1/bags", headers=H(w["f2"]), json={"waste_code": IRON, "target_material": "철", "items": [{"material": "철", "kg": 100}]}).json()["id"]
    client.post(f"/v1/bags/{bag}/grade", headers=H(w["f2"]), json={})
    iron = client.post("/v1/listings", headers=H(w["f2"]), json={"bag_ids": [bag], "mode": "bundle", "price_krw_per_kg": 300}).json()["id"]
    assert client.post(f"/v1/pools/{pid}/join", headers=H(w["f2"]), json={"listing_id": iron}).status_code == 400
    # 반경 밖
    res, far_lid = join(client, w, pid, "far", kg=100, price=300)
    assert res.status_code == 400 and status_of(far_lid) == "bundle_wait"
    ok, l2 = join(client, w, pid, "f2", kg=100, price=300)
    assert ok.status_code == 200
    # 이미 참여 중, 같은 판매 중복, 남의 판매, 없는 pool, 역할
    _, again = sell(client, w["f2"], kg=10, price=250, mode="bundle")
    assert client.post(f"/v1/pools/{pid}/join", headers=H(w["f2"]), json={"listing_id": again}).status_code == 409
    assert client.post(f"/v1/pools/{pid}/join", headers=H(w["f3"]), json={"listing_id": l2}).status_code == 404       # 남의 판매
    _, f3_lid = sell(client, w["f3"], kg=10, price=250, mode="bundle")
    assert client.post("/v1/pools/9999/join", headers=H(w["f3"]), json={"listing_id": f3_lid}).status_code == 404
    assert client.post(f"/v1/pools/{pid}/join", headers=H(w["r"]), json={"listing_id": f3_lid}).status_code == 403
    assert client.post(f"/v1/pools/{pid}/join", json={"listing_id": f3_lid}).status_code == 401
    # 다른 pool에 이미 들어간 판매
    other, _ = new_pool(client, w, kg=10, price=100, target=500, who="f3")
    assert client.post(f"/v1/pools/{other['id']}/join", headers=H(w["f1"]), json={"listing_id": l1}).status_code == 409
    # 만들기 규칙
    _, own = sell(client, w["f1"], kg=100, price=100)
    assert client.post("/v1/pools", headers=H(w["f1"]), json={"listing_id": own, "target_kg": 100, "deadline": FUTURE}).status_code == 400   # 목표 ≤ 내 물량
    assert client.post("/v1/pools", headers=H(w["f1"]), json={"listing_id": own, "target_kg": 500, "deadline": "2020-01-01"}).status_code == 400
    assert client.post("/v1/pools", headers=H(w["f2"]), json={"listing_id": own, "target_kg": 500, "deadline": FUTURE}).status_code == 404   # 남의 판매
    assert client.post("/v1/pools", headers=H(w["f1"]), json={"listing_id": l1, "target_kg": 500, "deadline": FUTURE}).status_code == 409   # 이미 pool 안


def test_pool_lists_radius_mine_and_deadline_closed(client):
    w = pool_world(client)
    pool, l1 = new_pool(client, w, kg=100, price=260, target=500)
    pid = pool["id"]
    shown = client.get("/v1/pools", headers=H(w["f2"])).json()
    assert [p["id"] for p in shown] == [pid] and "members" not in shown[0]                    # 목록(참여 전)에는 members 없음
    assert client.get("/v1/pools", headers=H(w["far"])).json() == []                           # 반경 밖은 안 보임
    assert client.get("/v1/pools", headers=H(w["f1"])).json() == []                            # 내가 만든 것은 '참여할' 목록이 아님
    assert client.get(f"/v1/pools?waste_code={IRON}", headers=H(w["f2"])).json() == []
    assert [p["id"] for p in client.get(f"/v1/pools?waste_code={CODE}", headers=H(w["f2"])).json()] == [pid]
    assert client.get("/v1/pools?mine=1", headers=H(w["f2"])).json() == []
    assert [p["id"] for p in client.get("/v1/pools?mine=1", headers=H(w["f1"])).json()] == [pid]
    assert client.get("/v1/pools", headers=H(w["r"])).status_code == 403
    s = db()
    s.get(Pool, pid).deadline = dt.date.today() - dt.timedelta(days=1)
    s.commit()
    assert client.get("/v1/pools", headers=H(w["f2"])).json() == []                            # 기한이 지나면 모집 목록에서 빠짐
    assert client.get("/v1/pools?mine=1", headers=H(w["f1"])).json()[0]["status"] == "closed"
    assert join(client, w, pid, "f2")[0].status_code == 409
    back = client.post(f"/v1/pools/{pid}/deadline", headers=H(w["f1"]), json={"action": "extend", "new_deadline": FUTURE}).json()
    assert back["status"] == "open"
    assert join(client, w, pid, "f2")[0].status_code == 200


def test_withdrawing_a_pooled_listing_removes_it_and_price_edit_is_blocked(client):
    w = pool_world(client)
    pool, l1 = new_pool(client, w, kg=100, price=260, target=500)
    res, l2 = join(client, w, pool["id"], "f2", kg=50, price=270)
    assert client.patch(f"/v1/listings/{l2}", headers=H(w["f2"]), json={"price_krw_per_kg": 100}).status_code == 409   # 공동 단가는 서버가 정함
    assert client.patch(f"/v1/listings/{l2}", headers=H(w["f2"]), json={"pickup_note": "후문"}).status_code == 200
    assert client.post(f"/v1/listings/{l2}/withdraw", headers=H(w["f2"])).status_code == 200
    view = client.get("/v1/pools?mine=1", headers=H(w["f1"])).json()[0]
    assert view["current_kg"] == 100 and view["applied_price_krw_per_kg"] == 260
    client.post(f"/v1/listings/{l1}/withdraw", headers=H(w["f1"]))
    assert client.get("/v1/pools?mine=1", headers=H(w["f1"])).json()[0]["status"] == "cancelled"


@pytest.mark.skipif(not PG_URL.startswith("postgresql"), reason="동시성은 PostgreSQL에서 확인")
def test_pool_concurrent_joins_never_exceed_or_duplicate(client):
    w = pool_world(client)
    pool, _ = new_pool(client, w, kg=100, price=260, target=200)          # 100kg가 더 들어오면 끝
    _, a = sell(client, w["f2"], kg=100, price=300, mode="bundle")
    _, b = sell(client, w["f3"], kg=100, price=300, mode="bundle")
    calls = [lambda: client.post(f"/v1/pools/{pool['id']}/join", headers=H(w["f2"]), json={"listing_id": a}),
             lambda: client.post(f"/v1/pools/{pool['id']}/join", headers=H(w["f3"]), json={"listing_id": b})]
    with ThreadPoolExecutor(2) as ex:
        res = [f.result() for f in [ex.submit(c) for c in calls]]
    assert sorted(r.status_code for r in res) == [200, 409]                  # 한 쪽만 들어가고 목표를 넘는 참여는 막힘
    assert db().query(PoolMember).filter_by(pool_id=pool["id"]).count() == 2
    assert db().get(Pool, pool["id"]).status == "sold"


@pytest.mark.skipif(not PG_URL.startswith("postgresql"), reason="동시성은 PostgreSQL에서 확인")
def test_pool_same_company_double_join_is_single(client):
    w = pool_world(client)
    pool, _ = new_pool(client, w, kg=100, price=260, target=900)
    _, a = sell(client, w["f2"], kg=10, price=300, mode="bundle")
    _, b = sell(client, w["f2"], kg=10, price=300, mode="bundle")
    calls = [lambda lid=lid: client.post(f"/v1/pools/{pool['id']}/join", headers=H(w["f2"]), json={"listing_id": lid}) for lid in (a, b)]
    with ThreadPoolExecutor(2) as ex:
        res = [f.result() for f in [ex.submit(c) for c in calls]]
    assert sorted(r.status_code for r in res) == [200, 409]
    assert db().query(PoolMember).filter_by(pool_id=pool["id"], company_id=w["f2"]).count() == 1


# ── 13.3 재활용업체 ──
def test_recyclers_search_detail_favorites_and_home_recommendation(client):
    w = world(client)
    client.patch("/v1/me/profile", headers=H(w["r"]), json={"pickup_method": "방문 수거", "terms": "현금 결제"})
    iron_only = mk_company(client, "철만", "recycler", permit_no="I", permit_codes=[IRON], lat=36.30, lon=128.50)
    client.post(f"/v1/admin/companies/{iron_only}/verify", headers=H(w["op"]), json={})
    hidden = mk_company(client, "미승인", "recycler", permit_no="U", permit_codes=[CODE])   # verified=false
    f = H(w["f1"])
    allr = client.get("/v1/recyclers", headers=f).json()
    assert {r["name"] for r in allr} == {"재활용", "재활용2", "철만"}
    assert hidden not in [r["id"] for r in allr]
    assert [r["distance_km"] for r in allr] == sorted(r["distance_km"] for r in allr)                   # 가까운 순
    assert {"id", "name", "region", "materials", "distance_km", "favorite"} == set(allr[0])
    by_code = client.get(f"/v1/recyclers?waste_code={IRON}", headers=f).json()
    assert {r["name"] for r in by_code} == {"철만"}
    assert {r["name"] for r in client.get("/v1/recyclers?q=%EC%B2%A0", headers=f).json()} == {"철만"}
    assert len(client.get("/v1/recyclers?q=&waste_code=", headers=f).json()) == 3                         # 빈 값은 없는 것
    detail = client.get(f"/v1/recyclers/{w['r']}", headers=f).json()
    assert detail["pickup_method"] == "방문 수거" and detail["terms"] == "현금 결제" and detail["permit_codes"] == [CODE]
    assert client.get(f"/v1/recyclers/{hidden}", headers=f).status_code == 404
    assert client.get(f"/v1/recyclers/{w['f2']}", headers=f).status_code == 404                           # recycler가 아님
    assert client.get("/v1/recyclers", headers=H(w["r"])).status_code == 403
    assert client.put(f"/v1/me/favorite-recyclers/{w['r']}", headers=f, json={}).json() == {"id": w["r"], "favorite": True}
    assert [r["id"] for r in client.get("/v1/me/favorite-recyclers", headers=f).json()] == [w["r"]]
    assert client.get(f"/v1/recyclers/{w['r']}", headers=f).json()["favorite"] is True
    assert client.get("/v1/me/favorite-recyclers", headers=H(w["f2"])).json() == []
    assert client.put(f"/v1/me/favorite-recyclers/{hidden}", headers=f, json={}).status_code == 404
    assert client.delete(f"/v1/me/favorite-recyclers/{w['r']}", headers=f).json()["favorite"] is False
    assert client.get("/v1/seller/home", headers=f).json()["recommended_recyclers"] == []                # 마대가 없으면 추천 없음
    sell(client, w["f1"])
    rec = client.get("/v1/seller/home", headers=f).json()["recommended_recyclers"]
    assert [r["name"] for r in rec] == ["재활용2", "재활용"] and "철만" not in str(rec)                    # 허가가 맞는 가까운 순, 최대 2


# ── 13.4 대화 ──
def test_order_messages_only_for_parties_and_notify_others(client):
    w = world(client)
    bag, lid = sell(client, w["f1"])
    oid = buy(client, w["r"], lid)["id"]
    path = f"/v1/orders/{oid}/messages"
    assert client.get(path, headers=H(w["f1"])).json() == []
    sent = client.post(path, headers=H(w["r"]), json={"body": "내일 가능해요?"})
    assert sent.status_code == 201 and sent.json()["sender_name"] == "재활용" and sent.json()["body"] == "내일 가능해요?"
    client.post(path, headers=H(w["f1"]), json={"body": "네"})
    assert [m["body"] for m in client.get(path, headers=H(w["f1"])).json()] == ["내일 가능해요?", "네"]      # 오래된 순
    for who in ("r2", "f2", "op"):
        assert client.get(path, headers=H(w[who])).status_code == 404, who
        assert client.post(path, headers=H(w[who]), json={"body": "x"}).status_code == 404, who
    assert client.post(path, headers=H(w["r"]), json={"body": ""}).status_code == 400
    assert client.post(path, headers=H(w["r"]), json={"body": "x" * 501}).status_code == 400
    assert client.get("/v1/orders/9999/messages", headers=H(w["r"])).status_code == 404
    assert client.get(path).status_code == 401
    titles = lambda cid: [n.title for n in db().query(Notification).filter_by(company_id=cid)]   # noqa: E731
    assert titles(w["f1"]).count("새 메시지") == 1 and titles(w["r"]).count("새 메시지") == 1   # 운송도 맡은 판매자에게 한 번만
    client.put("/v1/me/notification-settings", headers=H(w["f1"]), json={"orders": False, "market": True})
    client.post(path, headers=H(w["r"]), json={"body": "또"})
    assert titles(w["f1"]).count("새 메시지") == 1                                                        # 12.6 설정을 따름


# ── 13.5 사진·첨부·판매 수정 ──
def test_order_photos_by_stage_and_party(client):
    w = world(client)
    bag, lid = sell(client, w["f1"])
    oid = buy(client, w["r"], lid)["id"]
    path = f"/v1/orders/{oid}/photos"
    up = lambda who, **b: client.post(path, headers=H(w[who]), json=b)   # noqa: E731
    assert up("r", stage="inspect", content_type="image/png", data_base64=PNG).status_code == 409           # 아직 검사 전
    assert up("f1", stage="pickup", content_type="image/png", data_base64=PNG).status_code == 201           # 판매자 운송: 출고 사진은 판매자
    assert up("f1", stage="inspect", content_type="image/png", data_base64=PNG).status_code == 403          # 출고 사진은 배정 업체만, 검사는 구매 업체만
    assert up("r", stage="pickup", content_type="image/png", data_base64=PNG).status_code == 403
    assert up("f2", stage="pickup", content_type="image/png", data_base64=PNG).status_code == 404           # 당사자 아님
    assert up("f1", stage="pickup", content_type="image/gif", data_base64=PNG).status_code == 400
    assert up("f1", stage="pickup", content_type="image/jpeg", data_base64=PNG).status_code == 400
    assert up("f1", stage="pickup", content_type="image/png", data_base64="A" * 3_000_000).status_code == 400
    assert up("f1", stage="other", content_type="image/png", data_base64=PNG).status_code == 400
    deliver(client, w, oid, bag, 100, inspector=w["r"], passed=False)
    pid = up("r", stage="inspect", content_type="image/jpeg", data_base64=base64.b64encode(b"\xff\xd8\xff\xe0abc").decode()).json()["id"]
    listed = client.get(path, headers=H(w["f1"])).json()
    assert [(p["stage"], p["content_type"]) for p in listed] == [("pickup", "image/png"), ("inspect", "image/jpeg")]
    assert [p["stage"] for p in client.get(path + "?stage=pickup", headers=H(w["f1"])).json()] == ["pickup"]
    assert len(client.get(path + "?stage=", headers=H(w["f1"])).json()) == 2
    assert client.get(path + "?stage=bogus", headers=H(w["f1"])).status_code == 400
    got = client.get(f"{path}/{pid}", headers=H(w["f1"]))
    assert got.headers["content-type"] == "image/jpeg" and got.headers["x-content-type-options"] == "nosniff"
    assert client.get(f"{path}/{pid}", headers=H(w["r2"])).status_code == 404
    assert client.get(path, headers=H(w["f2"])).status_code == 404
    other_bag, other_lid = sell(client, w["f2"])
    other_oid = buy(client, w["r2"], other_lid)["id"]
    assert client.get(f"/v1/orders/{other_oid}/photos/{pid}", headers=H(w["f2"])).status_code == 404      # 다른 주문의 사진 번호


def test_ticket_attachments_owner_only_and_safe_headers(client):
    w = world(client)
    t = client.post("/v1/support/tickets", headers=H(w["f1"]), json={"subject": "문의", "body": "내용"}).json()
    path = f"/v1/support/tickets/{t['id']}/attachments"
    ok = client.post(path, headers=H(w["f1"]), json={"content_type": "image/png", "data_base64": PNG})
    assert ok.status_code == 201
    pdf = client.post(path, headers=H(w["f1"]), json={"content_type": "application/pdf", "data_base64": PDF}).json()
    assert client.post(path, headers=H(w["f2"]), json={"content_type": "image/png", "data_base64": PNG}).status_code == 404
    assert client.post(path, headers=H(w["f1"]), json={"content_type": "text/html", "data_base64": PNG}).status_code == 400
    assert client.post(path, headers=H(w["f1"]), json={"content_type": "image/png", "data_base64": PDF}).status_code == 400
    assert client.post("/v1/support/tickets/9999/attachments", headers=H(w["f1"]), json={"content_type": "image/png", "data_base64": PNG}).status_code == 404
    listed = client.get("/v1/support/tickets", headers=H(w["f1"])).json()[0]
    assert [a["content_type"] for a in listed["attachments"]] == ["image/png", "application/pdf"]
    got = client.get(f"{path}/{pdf['id']}", headers=H(w["f1"]))
    assert got.headers["x-content-type-options"] == "nosniff" and "attachment" in got.headers["content-disposition"]
    assert client.get(f"{path}/{pdf['id']}", headers=H(w["f2"])).status_code == 404
    for _ in range(3):
        client.post(path, headers=H(w["f1"]), json={"content_type": "image/png", "data_base64": PNG})
    assert client.post(path, headers=H(w["f1"]), json={"content_type": "image/png", "data_base64": PNG}).status_code == 409   # 5개까지


def test_patch_listing_rules(client):
    w = world(client)
    _, lid = sell(client, w["f1"], kg=100, price=300)
    path = f"/v1/listings/{lid}"
    got = client.patch(path, headers=H(w["f1"]), json={"price_krw_per_kg": 280.5, "available_from": "2026-12-24", "pickup_note": "후문"}).json()
    assert (got["price_krw_per_kg"], got["available_from"], got["pickup_note"], got["total_kg"]) == (280.5, "2026-12-24", "후문", 100.0)
    assert client.patch(path, headers=H(w["f1"]), json={}).status_code == 200
    assert client.patch(path, headers=H(w["f2"]), json={"price_krw_per_kg": 1}).status_code == 404         # 남의 판매
    assert client.patch(path, headers=H(w["r"]), json={"price_krw_per_kg": 1}).status_code == 403
    assert client.patch(path, headers=H(w["f1"]), json={"price_krw_per_kg": 0}).status_code == 400
    assert client.patch(path, headers=H(w["f1"]), json={"price_krw_per_kg": 100_000.5}).status_code == 400
    assert client.patch("/v1/listings/9999", headers=H(w["f1"]), json={}).status_code == 404
    assert client.patch(path, json={}).status_code == 401
    buy(client, w["r"], lid)
    assert client.patch(path, headers=H(w["f1"]), json={"pickup_note": "x"}).status_code == 409           # 이미 팔림
    _, wait = sell(client, w["f2"], mode="bundle")
    assert client.patch(f"/v1/listings/{wait}", headers=H(w["f2"]), json={"price_krw_per_kg": 150}).status_code == 200   # bundle_wait도 가능
