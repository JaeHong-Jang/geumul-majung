"""데이터 파일·harness.yaml 읽기 도구. 숫자 기준은 전부 여기서 읽어 쓴다."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[3]      # masdae-market/
DATA_DIR = ROOT / "data"
HARNESS_DIR = ROOT / "harness"


MID_DOT_RE = re.compile(r"\s*[·･・‧]\s*")


def plain_marks(value: Any) -> Any:
    """화면에 보이는 문자열 값의 중간점을 쉼표로 바꾼다(문구 규칙 §23.1). 딕셔너리 키는 그대로 둔다."""
    if isinstance(value, str):
        return MID_DOT_RE.sub(", ", value)
    if isinstance(value, list):
        return [plain_marks(v) for v in value]
    if isinstance(value, dict):
        return {k: plain_marks(v) for k, v in value.items()}
    return value


@lru_cache(maxsize=None)
def load_json(name: str) -> Any:
    return plain_marks(json.loads((DATA_DIR / name).read_text(encoding="utf-8")))


@lru_cache(maxsize=1)
def load_harness() -> dict:
    return yaml.safe_load((HARNESS_DIR / "harness.yaml").read_text(encoding="utf-8"))


def assumptions() -> dict:
    return load_harness()["assumptions"]


def law_ids() -> set[str]:
    return {a["id"] for a in load_json("law_articles.json")}


def source_ids() -> set[str]:
    return {s["id"] for s in load_json("sources.json")}


@lru_cache(maxsize=1)
def forbidden_phrases() -> list[str]:
    path = HARNESS_DIR / "policies" / "forbidden-phrases.json"
    return [p["phrase"] for p in json.loads(path.read_text(encoding="utf-8"))]


def law_plain() -> dict[str, dict]:
    """조문 id → 쉬운 문구(headline, body, keywords). 사람이 쓰고 원문과 대조한 고정 문구이며 LLM이 만들지 않는다."""
    return load_json("law_plain.json")


def waste_name(code: str) -> str | None:
    for w in load_json("waste_codes.json"):
        if w["code"] == code:
            return w["name"]
    return None
