"""gm_grade(판매 가능 판정): 떼어 놓은 폐어구 묶음이 '팔 수 있는 원료'인지 판정하고, 팔 수 있게 하려면 무엇을 해야 하는지,
누가 살 만한지를 낸다. LLM은 쓰지 않는다(규칙과 공개 자료로만 판단).

판정 근거(공개 자료, 대학창업대전/05_리서치/research_notes/그물마중 수거 구조 확인/3_타지역_전처리.md):
- 바다에서 건진 것(조업 중 인양·침적·해안)은 염분·뻘로 펠릿 원료가 못 되고 열 회수만 됨(KMI 2023)
- 섞여 나온 집하장 물량은 선별비 때문에 재활용업체가 다루지 않음(KMI 2023)
- 자른 그물은 성분비를 알 수 없어 받지 않는 업체가 있음(KMI 2023)
- 자망은 뜸줄만 떼도 나일론 비율이 50%에서 80%로 오름(KMI 2023)
- 납심·PET 피복 로프는 거절(KMI 2023)"""
from __future__ import annotations

import math
from functools import lru_cache

from app.agents._common import claim, ev
from app.contracts import AgentResult
from app.tools.data import load_json

ID = "gm_grade"
KMI = ev("dataset", "kmi-plastic-recycling-2023", "KMI 재활용업체 현장조사")
RECYCLERS = ev("dataset", "recycler-press-2022-2026", "재활용업체 공개 자료")
PORT = (36.329, 126.511)   # 대천항(하역 추정지). 업체까지 거리 계산의 기준
# 재질·어구 → 업체가 받는 품목 낱말
WANT = {"나일론": ("폐어망", "나일론", "PA6"), "폴리에틸렌": ("PE", "폐어망", "폐로프"), "폴리프로필렌": ("PP", "폐로프"),
        "폐로프": ("폐로프", "PP"), "폐부표": ("폐발포합성수지",)}


@lru_cache(maxsize=1)
def recyclers() -> list[dict]:
    return load_json("gear_recyclers.json")


def _km(lat: float, lng: float) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (*PORT, lat, lng))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return round(6371 * 2 * math.asin(math.sqrt(h)))


def judge(lot: dict) -> dict:
    """{grade: 판매 후보 | 조건부 | 처리 대상, blockers, fixes}."""
    blockers, fixes = [], []
    if lot["origin"] in ("조업 중 인양", "침적 수거", "해안 수거"):
        blockers.append("바다에서 건진 것은 염분과 뻘 때문에 재생 원료가 못 되고 열 회수만 가능")
    elif lot["origin"] == "모름":
        fixes.append("어디서 나온 것인지 기록 필요(쓰다가 배출한 것만 재생 원료 후보)")
    if not lot["separated"]:
        blockers.append("다른 어구와 섞여 있으면 재활용업체가 선별비 때문에 받지 않음")
        fixes.append("통발, 그물, 로프를 종류별로 떼어 놓기")
    if lot.get("intact") is False:
        fixes.append("잘린 그물은 받지 않는 업체가 있어 업체 확인 필요")
    att = lot.get("attachments") or []
    if lot["kind"] == "폐자망" and any(a in att for a in ("뜸줄", "발줄")):
        fixes.append("자망은 뜸줄, 발줄을 떼면 나일론 비율이 50%에서 80%로 오름")
    if "납 봉돌" in att:
        fixes.append("납 봉돌은 떼어 따로 팔기(납은 금속 재활용)")
    if lot["material"] in ("미확인", "혼합"):
        fixes.append("재질을 눈으로 가리기 어려워 업체 표본 확인 필요")
    grade = "처리 대상" if blockers else ("조건부" if fixes else "판매 후보")
    return {"grade": grade, "blockers": blockers, "fixes": fixes}


def buyers(lot: dict, limit: int = 4) -> list[dict]:
    words = WANT.get(lot["material"]) or WANT.get(lot["kind"]) or ("폐어망",)
    out = []
    for r in recyclers():
        hit = [a for a in r["accepts"] if any(w in a for w in words)]
        if hit:
            km = _km(r["lat"], r["lng"]) if r.get("lat") is not None and r.get("lng") is not None else None
            out.append({"name": r["name"], "region": r["region"], "km": km, "accepts": hit,
                        "conditions": r["conditions"], "verify": r["verify"]})
    return sorted(out, key=lambda b: (b["km"] is None, b["km"] or 0))[:limit]   # 좌표 없는 업체는 뒤로


def run(ctx: dict, llm=None) -> AgentResult:
    lot = ctx["lot"]
    j = judge(lot)
    cands = buyers(lot) if j["grade"] != "처리 대상" else []
    claims = [claim(ID, f"판정: {j['grade']}", "fact", ev("input", "lot"), ev("calc", "gm_grade 판정 규칙"), KMI)]
    for b in j["blockers"]:
        claims.append(claim(ID, b, "fact", KMI))
    for f in j["fixes"]:
        claims.append(claim(ID, f, "question" if "확인" in f else "fact", KMI))
    if cands:
        near = cands[0]
        far = f", 직선 약 {near['km']} km" if near["km"] is not None else ""
        claims.append(claim(ID, f"이 품목을 받는다고 공개한 업체 {len(cands)}곳, 대천항에서 가장 가까운 곳은 {near['name']}({near['region']}{far})",
                            "fact", RECYCLERS, ev("calc", "대천항 기준 직선거리(좌표는 추정)")))
        claims.append(claim(ID, "업체마다 반입 조건과 매입가를 공개하지 않아 견적 요청 필요", "question", RECYCLERS))
    return AgentResult(agent_id=ID, claims=claims, data={**j, "buyers": cands})
