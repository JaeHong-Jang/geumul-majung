"""말 입력(음성 인식 → 에이전트가 칸 채우기)을 쓰는 화면들이 함께 쓰는 조각: 입력 형식, 음성 인식 단계, 화면 'AI 작업' 단계."""
import base64
import binascii
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field, model_validator

from app.tools import stt
from app.tools.data import load_harness

MAX_AUDIO_BYTES = 2 * 1024 * 1024
AUDIO_TYPES = Literal["audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/mpeg"]


class IntakeIn(BaseModel):
    """말 입력: 녹음(base64) 또는 글 중 하나."""
    audio_base64: str | None = Field(default=None, min_length=1, max_length=(MAX_AUDIO_BYTES + 2) // 3 * 4)
    content_type: AUDIO_TYPES | None = None
    text: str | None = Field(default=None, min_length=1, max_length=300)

    @model_validator(mode="after")
    def one_input(self):
        if (self.audio_base64 is None) == (self.text is None):
            raise ValueError("녹음과 글 중 하나만 보내기 필요")
        if self.audio_base64 is not None and self.content_type is None:
            raise ValueError("녹음 형식(content_type) 필요")
        return self


def stt_status() -> dict:
    """음성 인식 사용 가능 여부. 가능하면 모델을 미리 올려 첫 녹음이 느리지 않게 한다."""
    ok = stt.available()
    if ok:
        stt.warm()
    return {"stt": ok}


def hear(body: IntakeIn) -> tuple[str, list[dict]]:
    """(말한 글, 음성 인식 단계). 글로 보냈으면 단계 없음."""
    if body.audio_base64 is None:
        return body.text.strip(), []
    if not stt.available():
        raise HTTPException(503, "음성 인식 사용 불가, 글로 입력 필요")
    try:
        raw = base64.b64decode(body.audio_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "녹음 내용이 올바르지 않음")
    if not raw or len(raw) > MAX_AUDIO_BYTES:
        raise HTTPException(400, "녹음은 2MB 이하만 가능")
    try:
        heard = stt.transcribe(raw)
    except stt.AudioError as e:
        raise HTTPException(400, str(e))
    if not heard["text"]:
        raise HTTPException(400, "인식된 말 없음, 다시 녹음 필요")
    step = {"id": "stt", "name": "음성 인식", "ok": True, "used_llm": False,
            "lines": [f"{heard['seconds']}초 음성을 글로 변환, 로컬 {heard['model']}"]}
    return heard["text"], [step]


def agent_name(agent_id: str) -> str:
    return next((a["name"] for a in load_harness()["agents"] if a["id"] == agent_id), agent_id)


def agent_steps(result) -> list[dict]:
    """화면 'AI 작업'에 보일 에이전트 단계. 문장은 게이트를 통과한 주장만."""
    return [{"id": r.agent_id, "name": agent_name(r.agent_id), "ok": r.ok, "used_llm": r.used_llm,
             "lines": [c.text for c in r.claims if not c.blocked]} for r in result.results]
