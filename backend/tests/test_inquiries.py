"""주문 전 매물 문의(ARCHITECTURE §15)와 연락처 가림."""
import pytest

from app.core.security import inquiry_limiter
from app.db.models import InquiryMessage, Listing, SupportTicket
from app.features.inquiries.contact_mask import mask_contacts
from tests.conftest import H, mk_company
from tests.test_app_features import (CODE, _close_db_sessions, buy, db, sell, world)  # noqa: F401
from tests.test_signup_auth import signup


@pytest.fixture(autouse=True)
def _reset_limit():
    inquiry_limiter.clear()


# ── 연락처 가림 ──
@pytest.mark.parametrize("text", [
    "010-1234-5678", "010 1234 5678", "010.1234.5678", "01012345678", "+82 10 1234 5678", "+82-10-1234-5678",
    "02-123-4567", "031-1234-5678", "1588-1234", "a.b+c@example.co.kr", "ME@Example.COM",
    "110-123-456789", "1002 1234 5678 90", "123456-78-901234", "3333-12-3456789"])
def test_contacts_are_masked_in_all_variants(text):
    out, masked = mask_contacts(f"연락은 {text} 로 주세요")
    assert masked and out == "연락은 *** 로 주세요"


@pytest.mark.parametrize("text", [
    "750kg", "물량 750kg 입니다", "380원", "kg당 380.5원", "1,200,000원", "10 20 30 40 50",
    "사업자번호 000-00-00001 입니다", "2026-11-05 오전", "3500.5kg 가능", "A등급 순도 97.5%", "마대 12개, 주문 #345"])
def test_ordinary_numbers_are_not_masked(text):
    assert mask_contacts(text) == (text, False)


def test_mixed_sentence_masks_only_the_contact():
    out, masked = mask_contacts("750kg 380원 000-00-00001 번호는 010-1111-2222, 메일 x@y.kr")
    assert masked and out == "750kg 380원 000-00-00001 번호는 ***, 메일 ***"


# ── 흐름 ──
def start(client, who, lid, text="안녕하세요 750kg 맞나요?"):
    return client.post(f"/v1/listings/{lid}/inquiries", headers=H(who), json={"body": text})


def test_recycler_starts_factory_replies_and_same_pair_is_one_inquiry(client):
    w = world(client)
    _, lid = sell(client, w["f1"], kg=100, price=300)
    first = start(client, w["r"], lid)
    assert first.status_code == 201 and first.json()["message"]["masked"] is False
    qid = first.json()["id"]
    again = start(client, w["r"], lid, "한 가지 더요")
    assert again.json()["id"] == qid                                              # 있으면 같은 건에 이어 씀
    reply = client.post(f"/v1/inquiries/{qid}/messages", headers=H(w["f1"]), json={"body": "네 맞습니다"})
    assert reply.status_code == 201
    msgs = client.get(f"/v1/inquiries/{qid}/messages", headers=H(w["r"])).json()
    assert [m["body"] for m in msgs] == ["안녕하세요 750kg 맞나요?", "한 가지 더요", "네 맞습니다"]
    assert msgs[0]["sender_name"] == "재활용"
    other = start(client, w["r2"], lid, "저도 문의")
    assert other.json()["id"] != qid                                                # 구매 업체마다 별도 건


def test_factory_cannot_start_and_unapproved_or_wrong_listing_rejected(client):
    w = world(client)
    _, lid = sell(client, w["f1"])
    assert start(client, w["f1"], lid).status_code == 403
    assert start(client, w["f2"], lid).status_code == 403
    assert signup(client, role="recycler", n=7).status_code == 201
    pending = client.post("/v1/auth/login", json={"login_id": "user7@example.com", "password": "Str0ng-pass-1"}).json()["access_token"]
    assert client.post(f"/v1/listings/{lid}/inquiries", headers={"Authorization": "Bearer " + pending}, json={"body": "x"}).status_code == 403   # 미승인
    assert client.post(f"/v1/listings/{lid}/inquiries", json={"body": "x"}).status_code == 401
    assert start(client, w["r"], 9999).status_code == 404
    assert client.post(f"/v1/listings/{lid}/inquiries", headers=H(w["r"]), json={"body": ""}).status_code == 400
    assert client.post(f"/v1/listings/{lid}/inquiries", headers=H(w["r"]), json={"body": "x" * 501}).status_code == 400


def test_new_inquiry_only_on_open_listings_but_existing_continues(client):
    w = world(client)
    _, wait = sell(client, w["f1"], mode="bundle")
    assert start(client, w["r"], wait).status_code == 409                        # bundle_wait는 비공개(§17)
    _, gone = sell(client, w["f1"])
    _, sold = sell(client, w["f2"])
    qid = start(client, w["r"], sold).json()["id"]
    buy(client, w["r2"], sold)                                                      # 다른 구매 업체가 사 감
    client.post(f"/v1/listings/{gone}/withdraw", headers=H(w["f1"]))
    assert start(client, w["r2"], gone).status_code == 409                          # 내려간 매물에 새로 시작 불가
    assert start(client, w["r"], sold, "아쉽네요").json()["id"] == qid              # 이미 있던 건은 이어 씀


def test_third_parties_get_404_on_every_inquiry_path(client):
    w = world(client)
    _, lid = sell(client, w["f1"])
    qid = start(client, w["r"], lid).json()["id"]
    for who in ("r2", "f2", "op"):
        assert client.get(f"/v1/inquiries/{qid}/messages", headers=H(w[who])).status_code == 404, who
        assert client.post(f"/v1/inquiries/{qid}/messages", headers=H(w[who]), json={"body": "x"}).status_code == 404, who
        assert client.post(f"/v1/inquiries/{qid}/read", headers=H(w[who])).status_code == 404, who
        assert client.post(f"/v1/inquiries/{qid}/report", headers=H(w[who]), json={"reason": "x"}).status_code == 404, who
        assert client.get("/v1/inquiries", headers=H(w[who])).json() == [], who
    assert client.get("/v1/inquiries/9999/messages", headers=H(w["r"])).status_code == 404
    assert client.get(f"/v1/inquiries/{qid}/messages").status_code == 401


def test_list_unread_read_and_ordering(client):
    w = world(client)
    _, a = sell(client, w["f1"], kg=100)
    _, b = sell(client, w["f2"], kg=50, material="pe")
    qa = start(client, w["r"], a, "첫 문의").json()["id"]
    qb = start(client, w["r"], b, "두 번째").json()["id"]
    client.post(f"/v1/inquiries/{qa}/messages", headers=H(w["f1"]), json={"body": "답변1"})
    client.post(f"/v1/inquiries/{qa}/messages", headers=H(w["f1"]), json={"body": "답변2"})
    mine = client.get("/v1/inquiries", headers=H(w["r"])).json()
    assert [i["id"] for i in mine] == [qa, qb]                                       # 최신 활동순
    assert mine[0]["unread"] == 2 and mine[0]["last_message"] == "답변2" and mine[0]["other_name"] == "공장1"
    assert mine[0]["listing_name"].endswith("pp") and mine[0]["reported"] is False and mine[1]["unread"] == 0
    f1 = client.get("/v1/inquiries", headers=H(w["f1"])).json()
    assert len(f1) == 1 and f1[0]["unread"] == 0 and f1[0]["other_name"] == "재활용"   # 답을 쓰면 그때까지 읽은 것으로 본다
    f2 = client.get("/v1/inquiries", headers=H(w["f2"])).json()
    assert f2[0]["unread"] == 1                                                       # 아직 답하지 않은 공장은 안 읽음 1
    assert client.post(f"/v1/inquiries/{qa}/read", headers=H(w["r"])).json() == {"id": qa, "unread": 0}
    assert client.get("/v1/inquiries", headers=H(w["r"])).json()[0]["unread"] == 0
    assert client.get("/v1/inquiries", headers=H(w["f2"])).json()[0]["unread"] == 1   # 상대의 읽음은 영향 없음


def test_contact_info_is_masked_before_storage_and_original_never_kept(client):
    w = world(client)
    _, lid = sell(client, w["f1"])
    res = start(client, w["r"], lid, "전화는 010-1234-5678 / 메일 buyer@example.com / 계좌 110-123-456789, 물량 750kg 380원 000-00-00001")
    msg = res.json()["message"]
    assert msg["masked"] is True and msg["body"] == "전화는 *** / 메일 *** / 계좌 ***, 물량 750kg 380원 000-00-00001"
    stored = " ".join(m.body for m in db().query(InquiryMessage))
    assert "1234" not in stored and "buyer@example" not in stored and "456789" not in stored
    shown = client.get(f"/v1/inquiries/{res.json()['id']}/messages", headers=H(w["f1"])).json()[0]
    assert shown["body"] == msg["body"] and shown["masked"] is True
    assert client.get("/v1/inquiries", headers=H(w["f1"])).json()[0]["last_message"] == msg["body"]
    clean = client.post(f"/v1/inquiries/{res.json()['id']}/messages", headers=H(w["f1"]), json={"body": "750kg, 380원입니다"}).json()
    assert clean["masked"] is False and clean["body"] == "750kg, 380원입니다"


def test_report_makes_ticket_and_keeps_history(client):
    w = world(client)
    _, lid = sell(client, w["f1"])
    qid = start(client, w["r"], lid).json()["id"]
    res = client.post(f"/v1/inquiries/{qid}/report", headers=H(w["f1"]), json={"reason": "앱 밖 거래를 유도함"})
    assert res.status_code == 200 and res.json()["reported"] is True
    ticket = db().query(SupportTicket).get(res.json()["ticket_id"])
    assert ticket.company_id == w["f1"] and "앱 밖 거래" in ticket.body and ticket.status == "open"
    assert client.get("/v1/inquiries", headers=H(w["r"])).json()[0]["reported"] is True
    assert len(client.get(f"/v1/inquiries/{qid}/messages", headers=H(w["r"])).json()) == 1      # 기록은 그대로
    assert client.post(f"/v1/inquiries/{qid}/report", headers=H(w["f1"]), json={"reason": ""}).status_code == 400


def test_messages_notify_the_other_side_and_respect_settings(client):
    w = world(client)
    _, lid = sell(client, w["f1"])
    qid = start(client, w["r"], lid).json()["id"]
    assert client.get("/v1/notifications", headers=H(w["f1"])).json()["unread"] == 1
    assert client.get("/v1/notifications", headers=H(w["r"])).json()["unread"] == 0
    client.put("/v1/me/notification-settings", headers=H(w["r"]), json={"orders": False, "market": True})
    client.post(f"/v1/inquiries/{qid}/messages", headers=H(w["f1"]), json={"body": "답"})
    assert client.get("/v1/notifications", headers=H(w["r"])).json()["unread"] == 0


def test_inquiry_rate_limit_is_per_company(client):
    w = world(client)
    _, lid = sell(client, w["f1"])
    qid = start(client, w["r"], lid).json()["id"]
    codes = [client.post(f"/v1/inquiries/{qid}/messages", headers=H(w["r"]), json={"body": f"n{i}"}).status_code for i in range(20)]
    assert codes == [201] * 19 + [429]                                              # 첫 문의 포함 1분 20건
    assert client.post(f"/v1/inquiries/{qid}/messages", headers=H(w["f1"]), json={"body": "답"}).status_code == 201


# ── 주문 전환 ──
def test_inquiry_continues_into_order_chat(client):
    w = world(client)
    _, lid = sell(client, w["f1"])
    qid = start(client, w["r"], lid, "010-9999-8888 로 전화드릴게요 750kg").json()["id"]
    client.post(f"/v1/inquiries/{qid}/messages", headers=H(w["f1"]), json={"body": "앱에서 얘기해요"})
    _, other_lid = sell(client, w["f2"])
    start(client, w["r2"], lid, "다른 구매 업체의 문의")
    oid = buy(client, w["r"], lid)["id"]
    assert client.post(f"/v1/orders/{oid}/messages", headers=H(w["r"]), json={"body": "주문 후 첫 말"}).status_code == 201
    for who in ("r", "f1"):
        msgs = client.get(f"/v1/orders/{oid}/messages", headers=H(w[who])).json()
        assert [(m["body"], m["from_inquiry"]) for m in msgs] == [("*** 로 전화드릴게요 750kg", True), ("앱에서 얘기해요", True), ("주문 후 첫 말", False)]
        assert "다른 구매 업체" not in str(msgs)                                       # 다른 구매 업체의 문의는 섞이지 않음
    assert client.get(f"/v1/orders/{oid}/messages", headers=H(w["r2"])).status_code == 404
    assert client.get(f"/v1/orders/{oid}/messages", headers=H(w["f2"])).status_code == 404   # 주문 당사자가 아닌 공장도 불가
