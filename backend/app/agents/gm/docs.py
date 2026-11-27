"""gm_docs(서류 안내와 초안): 반출 한 건의 단계와 내용을 보고 어떤 서류가 필요한지 정하고, 앱 기록으로 채울 수 있는 칸은 채운다.
서류 목록과 칸은 공개 법령·고시·지침에서 확인한 것만 쓴다(대학창업대전/05_리서치/research_notes/그물마중 수거 구조 확인/2_절차_서식.md).
- 앱은 초안까지만 만든다. 제출·서명은 그 서류의 주인(시·군, 수협, 처리업체, 계량소)이 한다.
- 못 채운 칸은 비우고 '직접 입력' 목록에 올린다. 숫자는 반출 기록과 확인한 계량증명서에서만 가져온다."""
from __future__ import annotations

from app.agents._common import claim, ev
from app.contracts import AgentResult
from app.features.gm.circulation import circulation

ID = "gm_docs"
FORMS = ev("dataset", "mof-gear-circulation-2024", "해양수산부 어구 순환관리 자료")


def _kg(t) -> float | None:
    return round(t * 1000, 2) if isinstance(t, (int, float)) else None


def build(r: dict, scans: list[dict]) -> list[dict]:
    st, a = r.get("status"), r.get("actual") or {}
    scan = next((s for s in scans if s.get("status") == "confirmed"), None)
    sf = (scan or {}).get("fields") or {}
    day = (r.get("departure") or "")[:10]
    gear_deposit = any(w in str(r.get("kind")) for w in ("통발", "자망"))
    sold = [s for s in r.get("sales") or [] if s.get("status") == "sold"]
    docs = []

    def doc(key, name, basis, law, owner, when, fields, needed=True, note=""):
        missing = [k for k, v in fields.items() if v in (None, "")]
        status = ("해당 없음" if not needed else "초안 완성" if fields and not missing
                  else "일부 채움" if fields and len(missing) < len(fields) else "받아야 함" if not fields else "입력 필요")
        docs.append({"key": key, "name": name, "basis": basis, "law": law, "owner": owner, "when": when, "needed": needed,
                     "status": status, "fields": fields, "missing": missing, "note": note})

    doc("weigh", "계량증명서", "계량에 관한 법률 시행규칙 제4조(법정 서식 없음, 필수 5항목)", None, "공인 계량소(차량 단위)",
        "하선 뒤 육지 계량 때", {"요청자": sf.get("requester"), "계량 일자": sf.get("date"),
                               "품명 또는 차량번호": sf.get("item") or sf.get("vehicle_no"),
                               "실제중량(kg)": sf.get("net_kg"), "총중량(kg)": sf.get("gross_kg"), "계량증명업자": sf.get("issuer")},
        needed=st in ("confirmed", "settled"),
        note="사진을 올리면 AI가 읽어 칸을 채움" if not scan else f"확인한 스캔 {scan['id']}번에서 채움")
    doc("ledger", "폐어구 및 유실어구의 관리대장", "수산업법 시행규칙 별지 제73호", "fa-79", "시장, 군수(집하장 관리)",
        "집하장에서 반입, 반출할 때마다",
        {"연월일": day if st == "settled" else None, "종류": r.get("kind"), "재질": r.get("material"),
         "처리량(kg)": _kg(a.get("accepted")), "무게(kg)": _kg(a.get("total")),
         "미처리량(kg)": _kg(round(a["total"] - a["accepted"], 9)) if a else None,
         "비고(처리처)": r.get("facility"), "작성자": None, "결재자": None},
        needed=True, note="서식에 반출처 칸이 없어 비고에 처리업체를 적음")
    doc("handover", "어구등 인수인계 명세서(수집운반 및 재활용)", "어구 보증금 고시 별지 제6호", "fa-81",
        "회수관리자(시, 군 또는 수협)와 처리업자", "보증금 표식 어구를 처리업자에게 넘길 때, 다음 날까지 보증금 시스템에 제출",
        {"일자": day if st == "settled" else None, "인계자": "삽시도 집하장", "인수자": r.get("facility"), "어구 종류": r.get("kind"),
         "수량(개, 폭)": None, "중량(kg)": _kg(a.get("accepted")), "재질": r.get("material")},
        needed=gear_deposit, note="보증금 표식이 붙은 통발, 자망이 섞였을 때만. 수량은 개, 폭 단위로 직접 셈")
    doc("eticket", "전자인계서(올바로)", "폐기물관리법 제18조 제3항", "wma-18-3", "배출자, 운반자, 처리자", "사업장폐기물일 때",
        {}, needed=False, note="어민이 내놓은 폐어구는 보통 생활폐기물이라 대상이 아님. 사업장폐기물로 나가면 필요(보령시 확인)")
    doc("receipt", "처리확인서(인수확인서)", "용역 검측 서류(법정 서식 없음)", None, "처리업체", "검수 뒤",
        {}, needed=st == "settled", note="업체가 발급. 계량증명서와 무게가 맞는지 앱이 대조")
    if sold:
        c = circulation(r)
        doc("sale", "판매 거래명세서", "재활용 실적 증빙(계량증명서, 세금계산서와 함께)", None, "집하장(판매자)과 구매 업체", "판매 묶음을 넘길 때",
            {"품목": ", ".join(f"{s['kind']} {s['material']} {s['weight']:g}톤" for s in sold),
             "구매 업체": ", ".join(next(o["buyer"] for o in s["offers"] if o["id"] == s["acceptedOffer"]) for s in sold),
             "매각 대금(원)": c["revenue"], "세금계산서 번호": None},
            note="손으로 쓴 계량증명서는 재활용 실적으로 인정되지 않음")
    return docs


def run(ctx: dict, llm=None) -> AgentResult:
    r = ctx["shipment"]
    docs = build(r, ctx.get("scans") or [])
    need = [d for d in docs if d["needed"]]
    claims = [claim(ID, f"이 반출 단계에 필요한 서류 {len(need)}종: " + ", ".join(d["name"] for d in need), "fact",
                    ev("input", "shipment.status, kind, sales"), FORMS)]
    for d in need:
        evs = [ev("input", "shipment"), FORMS] + ([ev("law", d["law"], d["basis"])] if d["law"] else [])
        if d["status"] == "초안 완성":
            claims.append(claim(ID, f"{d['name']}: 앱 기록으로 초안 완성, {d['owner']} 확인 필요", "fact", *evs))
        elif d["missing"]:
            claims.append(claim(ID, f"{d['name']}: 직접 입력 필요한 칸 " + ", ".join(d["missing"]), "question", *evs))
        else:
            claims.append(claim(ID, f"{d['name']}: {d['owner']}에게서 받아야 함", "question", *evs))
    return AgentResult(agent_id=ID, claims=claims, data={"docs": docs})
