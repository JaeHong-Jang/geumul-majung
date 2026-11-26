"""지식 검색: 법·선례 문서는 글자 두 개 단위 BM25로, 공장 표는 지역·폐기물 조건으로 찾는다.
자료는 KNOWLEDGE_DIR(scripts/build_knowledge.py의 출력)에서 읽고, 폴더가 없으면 available()이 False다."""
from __future__ import annotations

import json
import math
import os
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.tools.data import plain_marks

K1, B = 1.5, 0.75
MIN_COVERAGE = 0.3      # 질문의 글자 묶음 무게(idf) 중 이만큼은 한 문서에 있어야 근거로 본다. 흔한 말은 가볍게 센다
STRONG_COVERAGE = 0.65  # 이만큼 맞으면 문서를 묻는 질문으로 보고 공장 표로 넘기지 않는다
FACTORY_INTENT = re.compile(r"공장|업체|회사|어디|어느|누가|배출|내는|근처|주변")
FILLER = re.compile(r"해야\s*할|알려\s*줘|알려\s*주세요|있어요?|있나요|있습니까|어때요?|뭐야|뭔가요|무엇|인가요|입니까|해줘|궁금|어떻게|얼마나")
# 사람들이 쓰는 말 → 자료에 적힌 말
ALIASES = {"플라스틱": "폐합성수지", "합성수지": "폐합성수지", "비닐": "폐합성수지", "고철": "폐금속", "철스크랩": "폐금속",
           "종이": "폐지", "골판지": "폐지", "나무": "폐목재", "슬러지": "오니", "기름": "폐유",
           "서류": "확인서 허가증 계약서"}
LIMIT_NOTE = ("공장 목록은 등록공장 22만여 곳 중 8.8%에 폐기물 기록을 연결한 탐색용 공공 기록, 앱 가입 업체가 아니며, "
              "실적 연도가 2022년 이후로 분류된 기록이 있는 공장은 연결 공장의 10.4%이고, 큰 공장과 공개에 동의한 사업장 쪽으로 쏠려 있음, "
              "지금도 배출하는지는 직접 확인 필요")


def _grams(text: str) -> list[str]:
    grams = []
    for word in re.findall(r"[0-9a-z가-힣-]+", text.lower()):
        grams += [word] if len(word) < 2 else [word[i:i + 2] for i in range(len(word) - 1)]
    return grams


def _expand(question: str) -> str:
    return " ".join([question, *(to for word, to in ALIASES.items() if word in question)])


@dataclass
class Index:
    docs: list[dict]
    postings: dict[str, list[tuple[int, int]]]
    lengths: list[int]
    average: float
    factories: list[dict]
    places: dict[str, list[str]]     # 질문에서 찾을 지역 이름 → 시군구 값
    wastes: list[str]


def _places(factories: list[dict]) -> dict[str, list[str]]:
    places = defaultdict(set)
    for f in factories:
        name = f["sigungu"]
        places[name].add(name)
        short = name[:-1] if name[-1:] in "시군구" else name
        if len(short) >= 2:
            places[short].add(name)
    return {k: sorted(v) for k, v in places.items()}


def _build(folder: Path) -> Index:
    docs = plain_marks(json.loads((folder / "docs.json").read_text(encoding="utf-8")))
    plants = plain_marks(json.loads((folder / "factories.json").read_text(encoding="utf-8")))
    postings, lengths = defaultdict(list), []
    for i, d in enumerate(docs):
        counts = Counter(_grams(f"{d['title']} {d['text']}"))
        lengths.append(sum(counts.values()))
        for gram, n in counts.items():
            postings[gram].append((i, n))
    wastes = sorted({w.strip() for f in plants for w in re.split(r"[;,]", f["wastes"]) if w.strip()}, key=len, reverse=True)
    return Index(docs, dict(postings), lengths, sum(lengths) / max(len(lengths), 1), plants, _places(plants), wastes)


@lru_cache(maxsize=1)
def _index(folder: str) -> Index:
    return _build(Path(folder))


def _folder() -> str:
    return os.environ.get("KNOWLEDGE_DIR", "").strip()


def available() -> bool:
    folder = _folder()
    return bool(folder) and (Path(folder) / "docs.json").is_file() and (Path(folder) / "factories.json").is_file()


def search_docs(question: str, k: int = 5, coverage: float = MIN_COVERAGE) -> list[dict]:
    idx = _index(_folder())
    query = {g for g in _grams(FILLER.sub(" ", _expand(question))) if len(g) > 1}
    scores, covered, total = Counter(), Counter(), 0.0
    for gram in query:
        hits = idx.postings.get(gram, [])
        idf = math.log(1 + (len(idx.docs) - len(hits) + 0.5) / (len(hits) + 0.5))
        total += idf
        for i, n in hits:
            scores[i] += idf * n * (K1 + 1) / (n + K1 * (1 - B + B * idx.lengths[i] / idx.average))
            covered[i] += idf
    ranked = sorted((i for i in scores if covered[i] >= total * coverage), key=lambda i: (-scores[i], i))
    return [idx.docs[i] for i in ranked[:k]]


def search_factories(question: str, k: int = 5) -> dict:
    """지역·폐기물 중 하나라도 질문에 있고 공장을 묻는 말일 때만 찾는다. {total, items}"""
    idx = _index(_folder())
    if not FACTORY_INTENT.search(question):
        return {"total": 0, "items": []}
    text = _expand(question)
    place = max((name for name in idx.places if name in text), key=len, default=None)
    waste = next((w for w in idx.wastes if w in text), None)
    if place is None and waste is None:
        return {"total": 0, "items": []}
    towns = set(idx.places[place]) if place else None
    found = [f for f in idx.factories
             if (towns is None or f["sigungu"] in towns) and (waste is None or waste in f["wastes"])]
    found.sort(key=lambda f: (f["completeness"], f["id"]))    # A 완전 → D 종류만
    return {"total": len(found), "place": place, "waste": waste, "items": found[:k]}
