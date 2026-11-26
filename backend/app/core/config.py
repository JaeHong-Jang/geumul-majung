"""설정: 환경변수와 harness.yaml 읽기."""
import json
import os
from functools import lru_cache
from pathlib import Path

import yaml

from app.tools.data import plain_marks

ROOT = Path(__file__).resolve().parents[3]  # masdae-market/
HARNESS_YAML = ROOT / "harness" / "harness.yaml"
WASTE_CODES_JSON = ROOT / "data" / "waste_codes.json"


def is_production() -> bool:
    """APP_ENV가 production 또는 prod(앞뒤 공백·대소문자 무시)이면 운영."""
    return os.environ.get("APP_ENV", "").strip().lower() in ("production", "prod")


def database_url() -> str:
    return os.environ.get("DATABASE_URL", "sqlite:///./masdae.db")


@lru_cache
def harness_config() -> dict:
    return yaml.safe_load(HARNESS_YAML.read_text(encoding="utf-8"))


@lru_cache
def waste_names() -> dict:
    data = plain_marks(json.loads(WASTE_CODES_JSON.read_text(encoding="utf-8")))
    return {w["code"]: w["name"] for w in data}


def llm_info() -> dict:
    cfg = harness_config()["llm"]
    provider = os.environ.get("LLM_PROVIDER", cfg["provider"])
    model = (cfg.get(provider) or {}).get("model", "") if provider != "off" else ""
    return {"provider": provider, "model": model, "available": provider != "off"}


def check_production_settings() -> None:
    """운영에서 위험한 설정이면 시작하지 않는다(§17)."""
    if os.environ.get("AUTH_ALLOW_COMPANY_HEADER", "").strip() == "1":
        raise RuntimeError("배포에서는 AUTH_ALLOW_COMPANY_HEADER를 켤 수 없음")
    if os.environ.get("AUTO_APPROVE_SIGNUP", "").strip() == "1":
        raise RuntimeError("배포에서는 AUTO_APPROVE_SIGNUP을 켤 수 없음(가입 즉시 승인은 로컬 시연용)")
    if os.environ.get("MAIL_MODE", "log").strip().lower() != "smtp":
        raise RuntimeError("배포에서는 MAIL_MODE=smtp여야 함(log는 로컬 전용)")
    if not os.environ.get("PUBLIC_BASE_URL", "").strip().lower().startswith("https://"):
        raise RuntimeError("배포에서는 PUBLIC_BASE_URL이 https:// 주소여야 함")
    if os.environ.get("KAKAO_CLIENT_ID") or os.environ.get("GOOGLE_CLIENT_ID"):
        redirect = (os.environ.get("OAUTH_REDIRECT_BASE") or os.environ["PUBLIC_BASE_URL"]).strip().lower()
        if not redirect.startswith("https://"):
            raise RuntimeError("배포에서는 OAUTH_REDIRECT_BASE가 https:// 주소여야 함")
